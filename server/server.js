const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
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
(async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`\n🚀  Khanna Travels API running at http://localhost:${PORT}`);
    console.log(`    Frontend  → http://localhost:${PORT}`);
    console.log(`    API health → http://localhost:${PORT}/api/health\n`);
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
})();

module.exports = app;
