require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const Redis   = require('ioredis');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
const client  = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3002;
app.use(express.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()),
  transports: [new winston.transports.Console()]
});

client.collectDefaultMetrics({ prefix: 'shopwave_product_' });
const cacheHits   = new client.Counter({ name: 'shopwave_product_cache_hits_total',   help: 'Cache hits'   });
const cacheMisses = new client.Counter({ name: 'shopwave_product_cache_misses_total', help: 'Cache misses' });

const db = new Pool({
  host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shopwave_products',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD, max: 10
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost', port: +process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (t) => Math.min(t * 500, 5000)
});

const CACHE_TTL = +process.env.CACHE_TTL_SECONDS || 300;

const initDB = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) UNIQUE NOT NULL,
      slug        VARCHAR(100) UNIQUE NOT NULL,
      description TEXT, image_url TEXT, is_active BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(255) NOT NULL,
      slug          VARCHAR(255) UNIQUE NOT NULL,
      description   TEXT,
      price         DECIMAL(10,2) NOT NULL,
      compare_price DECIMAL(10,2),
      category_id   UUID REFERENCES categories(id),
      brand         VARCHAR(100),
      sku           VARCHAR(100) UNIQUE,
      stock         INTEGER DEFAULT 0,
      images        TEXT[],
      tags          TEXT[],
      rating        DECIMAL(3,2) DEFAULT 0,
      review_count  INTEGER DEFAULT 0,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);

    INSERT INTO categories (name, slug, description) VALUES
      ('Electronics', 'electronics', 'Phones, Laptops, Gadgets'),
      ('Fashion',     'fashion',     'Clothing and Accessories'),
      ('Groceries',   'groceries',   'Daily essentials'),
      ('Home & Kitchen', 'home-kitchen', 'Appliances and Decor')
    ON CONFLICT (slug) DO NOTHING;
  `);
  logger.info('Product DB initialized');
};

const cacheGet = async (key) => {
  try { const v = await redis.get(key); if (v) { cacheHits.inc(); return JSON.parse(v); } cacheMisses.inc(); return null; }
  catch { return null; }
};
const cacheSet = async (key, val, ttl = CACHE_TTL) => {
  try { await redis.set(key, JSON.stringify(val), 'EX', ttl); } catch {}
};
const cacheDelPattern = async (pattern) => {
  try { const keys = await redis.keys(pattern); if (keys.length) await redis.del(...keys); } catch {}
};

// GET /api/products
app.get('/api/products', async (req, res) => {
  const { category, search, min_price, max_price, sort = 'created_at', page = 1, limit = 20 } = req.query;
  const cacheKey = `products:list:${JSON.stringify(req.query)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const wheres = ['p.is_active = true']; const params = []; let i = 1;
    if (category)  { wheres.push(`c.slug=$${i++}`);                              params.push(category); }
    if (search)    { wheres.push(`(p.name ILIKE $${i} OR p.tags::text ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (min_price) { wheres.push(`p.price>=$${i++}`); params.push(min_price); }
    if (max_price) { wheres.push(`p.price<=$${i++}`); params.push(max_price); }

    const where   = wheres.join(' AND ');
    const orderBy = { price_asc: 'p.price ASC', price_desc: 'p.price DESC', rating: 'p.rating DESC', created_at: 'p.created_at DESC' }[sort] || 'p.created_at DESC';
    const offset  = (parseInt(page) - 1) * parseInt(limit);

    const total = parseInt((await db.query(`SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE ${where}`, params)).rows[0].count);
    params.push(parseInt(limit), offset);
    const products = (await db.query(
      `SELECT p.*,c.name as category_name,c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE ${where} ORDER BY ${orderBy} LIMIT $${i++} OFFSET $${i}`,
      params
    )).rows;

    const response = { products, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / limit) } };
    await cacheSet(cacheKey, response);
    res.json(response);
  } catch (err) { logger.error('List error', { error: err.message }); res.status(500).json({ error: 'Failed to fetch products' }); }
});

// GET /api/products/:id
app.get('/api/products/:id', async (req, res) => {
  const cached = await cacheGet(`products:${req.params.id}`);
  if (cached) return res.json(cached);
  const r = await db.query(`SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.id=$1 AND p.is_active=true`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Product not found' });
  await cacheSet(`products:${req.params.id}`, r.rows[0]);
  res.json(r.rows[0]);
});

// POST /api/products
app.post('/api/products', [body('name').notEmpty(), body('price').isFloat({ min: 0 }), body('stock').isInt({ min: 0 })], async (req, res) => {
  if (!['admin', 'seller'].includes(req.headers['x-user-role'])) return res.status(403).json({ error: 'Forbidden' });
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, description, price, compare_price, category_id, brand, sku, stock, images, tags } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  try {
    const r = await db.query(
      `INSERT INTO products (name,slug,description,price,compare_price,category_id,brand,sku,stock,images,tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, slug, description, price, compare_price, category_id, brand, sku, stock, images || [], tags || []]
    );
    await cacheDelPattern('products:list:*');
    logger.info('Product created', { productId: r.rows[0].id });
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create product' }); }
});

// PATCH /api/products/:id/stock — called by order-service
app.patch('/api/products/:id/stock', async (req, res) => {
  const { quantity, operation = 'decrement' } = req.body;
  const op = operation === 'increment' ? `stock + ${quantity}` : `GREATEST(stock - ${quantity}, 0)`;
  const r = await db.query(
    `UPDATE products SET stock=${op}, updated_at=NOW() WHERE id=$1 AND (${operation === 'decrement' ? `stock >= ${quantity}` : 'true'}) RETURNING id,name,stock`,
    [req.params.id]
  );
  if (!r.rows.length) return res.status(400).json({ error: 'Insufficient stock' });
  await cacheDelPattern(`products:${req.params.id}`);
  res.json(r.rows[0]);
});

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  const cached = await cacheGet('categories:all');
  if (cached) return res.json(cached);
  const r = await db.query('SELECT * FROM categories WHERE is_active=true ORDER BY name');
  await cacheSet('categories:all', r.rows, 600);
  res.json(r.rows);
});

app.get('/health',       (req, res) => res.json({ status: 'ok', service: 'product-service' }));
app.get('/health/live',  (req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ready', db: 'ok' }); }
  catch { res.status(503).json({ status: 'not ready' }); }
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const start = async () => { await initDB(); app.listen(PORT, () => logger.info(`Product Service on port ${PORT}`)); };
start();
module.exports = app;
