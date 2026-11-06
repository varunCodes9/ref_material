// ================================================================
// ShopWave API Gateway
// ================================================================
// Yeh poore system ka "main darwaza" hai.
// Sab bahar se aane wali requests pehle yahan aati hain.
//
// Kaam:
//  1. JWT verify karo (ek hi jagah authentication)
//  2. Sahi service pe route karo (/api/users -> user-service)
//  3. Rate limiting (spam block karo)
//  4. Security headers (helmet)
//  5. Centralized logging & metrics
// ================================================================

require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');
const jwt      = require('jsonwebtoken');
const client   = require('prom-client');
const winston  = require('winston');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Logger ────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.simple()
  ),
  transports: [new winston.transports.Console()]
});

// ── Prometheus Metrics ────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'shopwave_gateway_' });

const httpRequestsTotal = new client.Counter({
  name:       'shopwave_gateway_requests_total',
  help:       'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpDuration = new client.Histogram({
  name:       'shopwave_gateway_request_duration_seconds',
  help:       'Request duration',
  labelNames: ['method', 'route'],
  buckets:    [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// ── Middlewares ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.info(m.trim()) } }));

app.use((req, res, next) => {
  const end = httpDuration.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => {
    end();
    httpRequestsTotal.inc({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

// ── Rate Limiting ─────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Too many requests' }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, try after 15 minutes' }
});

// ── JWT Verification ──────────────────────────────────────────
const PUBLIC_ROUTES = [
  '/api/users/register',
  '/api/users/login',
  '/api/users/refresh',
  '/api/products',
  '/health',
  '/metrics'
];

const verifyToken = (req, res, next) => {
  const isPublic = PUBLIC_ROUTES.some(r => req.path.startsWith(r) && (req.method === 'GET' || r.includes('register') || r.includes('login') || r.includes('refresh')));
  if (isPublic) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authorization token required' });

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.headers['x-user-id']   = decoded.id;
    req.headers['x-user-email']= decoded.email;
    req.headers['x-user-role'] = decoded.role;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
};

app.use(verifyToken);

// ── Service URLs ──────────────────────────────────────────────
// K8s mein yeh environment variables K8s Service DNS names hoge
// e.g., http://user-service.shopwave.svc.cluster.local:3001
const SERVICES = {
  user:         process.env.USER_SERVICE_URL         || 'http://localhost:3001',
  product:      process.env.PRODUCT_SERVICE_URL      || 'http://localhost:3002',
  order:        process.env.ORDER_SERVICE_URL        || 'http://localhost:3003',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
};

const proxy = (target) => createProxyMiddleware({
  target,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      logger.error(`Proxy error → ${target}`, { path: req.path, error: err.message });
      res.status(503).json({ error: 'Service temporarily unavailable', service: target });
    }
  }
});

// ── Routing ───────────────────────────────────────────────────
app.use('/api/users/login',    authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/users',         proxy(SERVICES.user));
app.use('/api/products',      proxy(SERVICES.product));
app.use('/api/categories',    proxy(SERVICES.product));
app.use('/api/orders',        proxy(SERVICES.order));
app.use('/api/notifications', proxy(SERVICES.notification));

// ── Health & Metrics ──────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'api-gateway',
  version: process.env.APP_VERSION || '1.0.0',
  uptime: process.uptime(), timestamp: new Date().toISOString()
}));

app.get('/health/ready', (req, res) => res.json({ status: 'ready' }));
app.get('/health/live',  (req, res) => res.json({ status: 'alive' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => logger.info(`🚀 API Gateway started on port ${PORT}`, { services: SERVICES }));
module.exports = app;
