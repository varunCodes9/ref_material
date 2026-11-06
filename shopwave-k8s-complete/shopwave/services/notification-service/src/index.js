require('dotenv').config();
const express  = require('express');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');
const winston  = require('winston');
const client   = require('prom-client');

const app  = express();
const PORT = process.env.PORT || 3004;
app.use(express.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : winston.format.simple()),
  transports: [new winston.transports.Console()]
});

client.collectDefaultMetrics({ prefix: 'shopwave_notification_' });
const notificationsSent = new client.Counter({ name: 'shopwave_notifications_sent_total', help: 'Notifications sent', labelNames: ['type', 'channel'] });

// DB for notification history
const db = new Pool({
  host: process.env.DB_HOST || 'localhost', port: +process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'shopwave_notifications',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD, max: 5
});

const initDB = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID,
      event_type VARCHAR(100) NOT NULL,
      channel    VARCHAR(50) NOT NULL,
      recipient  VARCHAR(255),
      subject    VARCHAR(255),
      message    TEXT,
      status     VARCHAR(50) DEFAULT 'sent',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  logger.info('Notification DB initialized');
};

// Email transporter (dev: ethereal, prod: SES/SendGrid)
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.ethereal.email',
  port:   +process.env.SMTP_PORT  || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'test@example.com',
    pass: process.env.SMTP_PASS || 'password'
  }
});

// Email templates
const EMAIL_TEMPLATES = {
  ORDER_CREATED: (data) => ({
    subject: `Order Confirmed! #${data.orderId.slice(0,8)}`,
    html: `
      <h2>🎉 Order Confirmed!</h2>
      <p>Your order <strong>#${data.orderId.slice(0,8)}</strong> has been placed successfully.</p>
      <p>Total Amount: <strong>₹${data.amount}</strong></p>
      <p>We'll notify you when your order is shipped.</p>
      <p>Thank you for shopping with ShopWave! 🛍️</p>
    `
  }),
  ORDER_STATUS_UPDATED: (data) => ({
    subject: `Order Update: ${data.status.toUpperCase()} #${data.orderId.slice(0,8)}`,
    html: `
      <h2>📦 Order Status Update</h2>
      <p>Your order <strong>#${data.orderId.slice(0,8)}</strong> is now <strong>${data.status.toUpperCase()}</strong>.</p>
    `
  })
};

// Send email helper
const sendEmail = async (to, template, data) => {
  try {
    const { subject, html } = EMAIL_TEMPLATES[template](data);
    await transporter.sendMail({ from: process.env.FROM_EMAIL || 'noreply@shopwave.com', to, subject, html });
    notificationsSent.inc({ type: template, channel: 'email' });
    logger.info('Email sent', { to, template });
    return { status: 'sent', channel: 'email' };
  } catch (err) {
    logger.error('Email failed', { error: err.message, to, template });
    return { status: 'failed', channel: 'email', error: err.message };
  }
};

// Log notification to DB
const logNotification = async (userId, eventType, channel, recipient, subject, message, status) => {
  try {
    await db.query(
      'INSERT INTO notification_logs (user_id,event_type,channel,recipient,subject,message,status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, eventType, channel, recipient, subject, message, status]
    );
  } catch (err) { logger.error('Failed to log notification', { error: err.message }); }
};

// Kafka Consumer
const kafka    = new Kafka({ clientId: 'notification-service', brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',') });
const consumer = kafka.consumer({ groupId: 'notification-group' });

const startKafkaConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topics: ['order-events', 'user-events'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        logger.info('Event received', { topic, event: event.event, orderId: event.orderId });

        if (event.event === 'ORDER_CREATED') {
          // In real app, fetch user email from user-service
          const userEmail = event.userEmail || `user-${event.userId.slice(0,8)}@shopwave.com`;
          const result = await sendEmail(userEmail, 'ORDER_CREATED', event);
          await logNotification(event.userId, event.event, 'email', userEmail, `Order Confirmed #${event.orderId.slice(0,8)}`, JSON.stringify(event), result.status);
        }

        if (event.event === 'ORDER_STATUS_UPDATED') {
          const userEmail = event.userEmail || `user-${event.userId?.slice(0,8) || 'unknown'}@shopwave.com`;
          const result = await sendEmail(userEmail, 'ORDER_STATUS_UPDATED', event);
          await logNotification(event.userId, event.event, 'email', userEmail, `Order Status Update`, JSON.stringify(event), result.status);
        }
      } catch (err) {
        logger.error('Failed to process event', { error: err.message });
      }
    }
  });
  logger.info('Kafka consumer started, listening on: order-events, user-events');
};

// REST: Get notification history
app.get('/api/notifications', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const r = await db.query('SELECT * FROM notification_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId]);
  res.json(r.rows);
});

app.get('/health',       (req, res) => res.json({ status: 'ok', service: 'notification-service' }));
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
    await initDB();
    await startKafkaConsumer();
    app.listen(PORT, () => logger.info(`Notification Service on port ${PORT}`));
  } catch (err) { logger.error('Startup failed', { error: err.message }); process.exit(1); }
};
start();
module.exports = app;
