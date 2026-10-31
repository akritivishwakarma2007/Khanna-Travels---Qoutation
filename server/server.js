const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS Configuration ────────────────────────────────────────────────────────
// Configured to allow all local dev servers (Live Server :5500, Vite :5173, etc.),
// private LAN testing, and production/preview Vercel & Render deployments.
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman, or same-origin)
    if (!origin) return callback(null, true);

    // Allow all localhost, 127.0.0.1, 0.0.0.0 on ANY port (5500, 5173, 3000, 8080, etc.)
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin);
    // Allow LAN IP addresses (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x) on any port
    const isLan = /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
    // Allow Vercel & Render cloud deployments
    const isCloud = /\.vercel\.app$/.test(origin) || /\.onrender\.com$/.test(origin);
    // Allow explicit FRONTEND_URL if set in .env
    const isCustomFrontend = Boolean(process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL);

    if (isLocalhost || isLan || isCloud || isCustomFrontend || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve frontend static files ───────────────────────────────────────────────
// The frontend lives one level up from server/
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/companies/:companyId/plans', require('./routes/plans'));
app.use('/api/companies/:companyId/plans/:planId/rates', require('./routes/rates'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/quote/compare', require('./routes/compare'));
app.use('/api/compare', require('./routes/compare'));
app.use('/api/visa-links', require('./routes/visaLinks'));
app.use('/api/admin/health', require('./routes/adminHealth'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ── Unmatched API routes return JSON 404 ──────────────────────────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Catch-all: serve index.html for client-side SPA routing ───────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀  Khanna Travels API running at http://localhost:${PORT}`);
  console.log(`    Frontend  → http://localhost:${PORT}`);
  console.log(`    API health → http://localhost:${PORT}/api/health\n`);
});

connectDB().catch(err => {
  console.warn('Background MongoDB connection error:', err.message);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is already in use by another running process.`);
    console.error(`👉  To free port ${PORT} in PowerShell, run:`);
    console.error(`    Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
  } else {
    console.error('Server error:', err);
  }
});

module.exports = app;
