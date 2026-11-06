require('dotenv').config();
const express  = require('express');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Redis    = require('ioredis');
const { body, validationResult } = require('express-validator');
const winston  = require('winston');
const client   = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

client.collectDefaultMetrics({ prefix: 'shopwave_user_' });
const registrationsTotal = new client.Counter({ name: 'shopwave_user_registrations_total', help: 'Total registrations' });
const loginTotal = new client.Counter({ name: 'shopwave_user_logins_total', help: 'Total logins', labelNames: ['result'] });

const db = new Pool({
  host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shopwave_users',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD, max: 10
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost', port: +process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (t) => Math.min(t * 500, 5000)
});

const initDB = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(255) UNIQUE NOT NULL,
      password   VARCHAR(255) NOT NULL,
      role       VARCHAR(20) DEFAULT 'customer',
      phone      VARCHAR(15),
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS addresses (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      label      VARCHAR(50) DEFAULT 'Home',
      street     TEXT NOT NULL,
      city       VARCHAR(100) NOT NULL,
      state      VARCHAR(100),
      pincode    VARCHAR(10),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  logger.info('User DB initialized');
};

const generateTokens = (user) => ({
  accessToken:  jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' }),
  refreshToken: jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' })
});

// POST /api/users/register
app.post('/api/users/register', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, phone } = req.body;
  try {
    const exists = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const r = await db.query(
      'INSERT INTO users (name,email,password,phone) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,created_at',
      [name, email, hashed, phone]
    );
    registrationsTotal.inc();
    logger.info('User registered', { userId: r.rows[0].id });
    res.status(201).json({ message: 'Registration successful', user: r.rows[0] });
  } catch (err) {
    logger.error('Register error', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/users/login
app.post('/api/users/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const r = await db.query('SELECT id,name,email,password,role,is_active FROM users WHERE email=$1', [email]);
    const user = r.rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password))) {
      loginTotal.inc({ result: 'failed' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const { accessToken, refreshToken } = generateTokens(user);
    await redis.set(`refresh:${user.id}`, refreshToken, 'EX', 7 * 24 * 3600);
    loginTotal.inc({ result: 'success' });
    logger.info('User logged in', { userId: user.id });
    res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/users/refresh
app.post('/api/users/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored  = await redis.get(`refresh:${decoded.id}`);
    if (stored !== refreshToken) return res.status(401).json({ error: 'Token revoked' });
    const ur = await db.query('SELECT id,email,role FROM users WHERE id=$1', [decoded.id]);
    if (!ur.rows.length) return res.status(401).json({ error: 'User not found' });
    const tokens = generateTokens(ur.rows[0]);
    await redis.set(`refresh:${decoded.id}`, tokens.refreshToken, 'EX', 7 * 24 * 3600);
    res.json(tokens);
  } catch { res.status(401).json({ error: 'Invalid refresh token' }); }
});

// POST /api/users/logout
app.post('/api/users/logout', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (userId) await redis.del(`refresh:${userId}`);
  res.json({ message: 'Logged out' });
});

// GET /api/users/profile
app.get('/api/users/profile', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const r = await db.query('SELECT id,name,email,role,phone,created_at FROM users WHERE id=$1', [userId]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(r.rows[0]);
});

// PUT /api/users/profile
app.put('/api/users/profile', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { name, phone } = req.body;
  const r = await db.query(
    'UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone), updated_at=NOW() WHERE id=$3 RETURNING id,name,email,phone',
    [name, phone, userId]
  );
  res.json(r.rows[0]);
});

// POST /api/users/addresses
app.post('/api/users/addresses', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const { label, street, city, state, pincode, is_default } = req.body;
  if (is_default) await db.query('UPDATE addresses SET is_default=false WHERE user_id=$1', [userId]);
  const r = await db.query(
    'INSERT INTO addresses (user_id,label,street,city,state,pincode,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [userId, label || 'Home', street, city, state, pincode, is_default || false]
  );
  res.status(201).json(r.rows[0]);
});

// GET /api/users/addresses
app.get('/api/users/addresses', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const r = await db.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC', [userId]);
  res.json(r.rows);
});

// Internal endpoint: order-service user validate kare
app.get('/api/users/internal/:id', async (req, res) => {
  const r = await db.query('SELECT id,name,email,phone FROM users WHERE id=$1 AND is_active=true', [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(r.rows[0]);
});

app.get('/health',       (req, res) => res.json({ status: 'ok', service: 'user-service' }));
app.get('/health/live',  (req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ready', db: 'ok' }); }
  catch { res.status(503).json({ status: 'not ready', db: 'down' }); }
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

const start = async () => {
  try { await initDB(); app.listen(PORT, () => logger.info(`User Service on port ${PORT}`)); }
  catch (err) { logger.error('Startup failed', { error: err.message }); process.exit(1); }
};
start();
module.exports = app;
