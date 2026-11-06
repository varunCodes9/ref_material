require('dotenv').config();
const express  = require('express');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');
const axios    = require('axios');
const { body, validationResult } = require('express-validator');
const winston  = require('winston');
const client   = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3003;
app.use(express.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()),
  transports: [new winston.transports.Console()]
});

client.collectDefaultMetrics({ prefix: 'shopwave_order_' });
const ordersTotal     = new client.Counter({ name: 'shopwave_orders_created_total',   help: 'Orders created', labelNames: ['status'] });
const ordersDuration  = new client.Histogram({ name: 'shopwave_order_processing_seconds', help: 'Order processing time', buckets: [0.1, 0.5, 1, 2, 5] });

const db = new Pool({
  host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shopwave_orders',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD, max: 10
});

// Kafka producer setup
const kafka    = new Kafka({ clientId: 'order-service', brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',') });
const producer = kafka.producer();

const initDB = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
      status          VARCHAR(50) DEFAULT 'pending',
      total_amount    DECIMAL(10,2) NOT NULL,
      delivery_address JSONB,
      payment_method  VARCHAR(50) DEFAULT 'cod',
      payment_status  VARCHAR(50) DEFAULT 'pending',
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
      product_id  UUID NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity    INTEGER NOT NULL,
      unit_price  DECIMAL(10,2) NOT NULL,
      total_price DECIMAL(10,2) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
  `);
  logger.info('Order DB initialized');
};

const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

// POST /api/orders
app.post('/api/orders', [
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('delivery_address').notEmpty()
], async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { items, delivery_address, payment_method = 'cod', notes } = req.body;
  const timer = ordersDuration.startTimer();

  try {
    // Validate products and calculate total
    let totalAmount = 0;
    const enrichedItems = [];

    for (const item of items) {
      const productRes = await axios.get(`${PRODUCT_SERVICE}/api/products/${item.product_id}`);
      const product    = productRes.data;
      if (product.stock < item.quantity)
        return res.status(400).json({ error: `Insufficient stock for: ${product.name}` });

      const totalPrice = product.price * item.quantity;
      totalAmount += totalPrice;
      enrichedItems.push({ ...item, product_name: product.name, unit_price: product.price, total_price: totalPrice });
    }

    // Create order in transaction
    const orderResult = await db.query(
      'INSERT INTO orders (user_id,total_amount,delivery_address,payment_method,notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [userId, totalAmount, JSON.stringify(delivery_address), payment_method, notes]
    );
    const order = orderResult.rows[0];

    // Insert order items
    for (const item of enrichedItems) {
      await db.query(
        'INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,total_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [order.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price]
      );
      // Decrement stock
      await axios.patch(`${PRODUCT_SERVICE}/api/products/${item.product_id}/stock`, { quantity: item.quantity, operation: 'decrement' });
    }

    // Publish event to Kafka
    await producer.send({
      topic: 'order-events',
      messages: [{
        key: order.id,
        value: JSON.stringify({
          event:     'ORDER_CREATED',
          orderId:   order.id,
          userId:    userId,
          amount:    totalAmount,
          items:     enrichedItems,
          timestamp: new Date().toISOString()
        })
      }]
    });

    ordersTotal.inc({ status: 'created' });
    timer();
    logger.info('Order created', { orderId: order.id, userId, amount: totalAmount });
    res.status(201).json({ order: { ...order, items: enrichedItems } });

  } catch (err) {
    ordersTotal.inc({ status: 'failed' });
    timer();
    logger.error('Order creation failed', { error: err.message });
    res.status(500).json({ error: 'Order creation failed' });
  }
});

// GET /api/orders — user's orders
app.get('/api/orders', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const r = await db.query(
    'SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, parseInt(limit), offset]
  );
  res.json({ orders: r.rows, pagination: { page: +page, limit: +limit } });
});

// GET /api/orders/:id
app.get('/api/orders/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const orderR = await db.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [req.params.id, userId]);
  if (!orderR.rows.length) return res.status(404).json({ error: 'Order not found' });

  const itemsR = await db.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
  res.json({ ...orderR.rows[0], items: itemsR.rows });
});

// PATCH /api/orders/:id/status — admin/internal use
app.patch('/api/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const VALID = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const r = await db.query(
    'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
    [status, req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Order not found' });

  // Notify about status change
  await producer.send({
    topic: 'order-events',
    messages: [{
      key: req.params.id,
      value: JSON.stringify({ event: 'ORDER_STATUS_UPDATED', orderId: req.params.id, status, timestamp: new Date().toISOString() })
    }]
  });

  logger.info('Order status updated', { orderId: req.params.id, status });
  res.json(r.rows[0]);
});

app.get('/health',       (req, res) => res.json({ status: 'ok', service: 'order-service' }));
app.get('/health/live',  (req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ready', db: 'ok' }); }
  catch { res.status(503).json({ status: 'not ready' }); }
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const start = async () => {
  try {
    await producer.connect();
    logger.info('Kafka producer connected');
    await initDB();
    app.listen(PORT, () => logger.info(`Order Service on port ${PORT}`));
  } catch (err) { logger.error('Startup failed', { error: err.message }); process.exit(1); }
};
start();
module.exports = app;
