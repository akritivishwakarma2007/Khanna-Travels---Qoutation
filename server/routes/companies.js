const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const { requireAdminAuth } = require('../middleware/auth');

const DB_ERROR_MSG = 'Cannot reach the database. Check MONGODB_URI in server/.env.';
const SEED_FILE_PATH = path.join(__dirname, '..', 'khanna-travels-seed-data.json');

/**
 * Waits briefly if MongoDB is in the middle of connecting (state 2).
 */
async function ensureDbConnected(maxWaitMs = 4000) {
  if (mongoose.connection && mongoose.connection.readyState === 1) return true;
  if (!mongoose.connection || mongoose.connection.readyState !== 2) return false;

  const start = Date.now();
  while (mongoose.connection && mongoose.connection.readyState === 2 && Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 100));
  }
  return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
}

/**
 * Offline fallback to load seed companies when MongoDB is unavailable.
 */
function loadSeedCompaniesFallback() {
  try {
    if (fs.existsSync(SEED_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(SEED_FILE_PATH, 'utf8'));
      if (Array.isArray(data)) {
        return data.map((c, idx) => ({
          _id: c._id || `fallback-comp-${idx + 1}`,
          companyName: c.companyName,
          isActive: c.isActive !== false,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString(),
          plans: (c.plans || []).map((p, pIdx) => ({
            _id: p._id || `fallback-plan-${idx + 1}-${pIdx + 1}`,
            planName: p.planName,
            productLine: p.productLine || 'Standard',
            medicalCover: Boolean(p.medicalCover),
            isActive: p.isActive !== false,
            rates: p.rates || []
          }))
        }));
      }
    }
  } catch (err) {
    console.warn('Could not load fallback seed companies:', err.message);
  }
  return [];
}

// GET /api/companies — list all (slim: without rate rows for speed)
router.get('/', async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      const fallback = loadSeedCompaniesFallback();
      if (fallback.length > 0) {
        return res.json(fallback.map(c => ({
          _id: c._id,
          companyName: c.companyName,
          isActive: c.isActive,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          plans: c.plans.map(p => ({
            _id: p._id,
            planName: p.planName,
            productLine: p.productLine,
            medicalCover: p.medicalCover,
            isActive: p.isActive,
            rates: p.rates
          }))
        })));
      }
      return res.status(503).json({ error: DB_ERROR_MSG });
    }
    const companies = await Company.find(
      {},
      { companyName: 1, isActive: 1, createdAt: 1, updatedAt: 1, 'plans._id': 1, 'plans.planName': 1, 'plans.productLine': 1, 'plans.medicalCover': 1, 'plans.isActive': 1, 'plans.rates': 1 }
    ).sort({ companyName: 1 });
    res.json(companies);
  } catch (err) {
    const fallback = loadSeedCompaniesFallback();
    if (fallback.length > 0) return res.json(fallback);
    res.status(503).json({ error: DB_ERROR_MSG });
  }
});

// GET /api/companies/:id — full company including all rates
router.get('/:id', async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (!isConnected) {
      const fallback = loadSeedCompaniesFallback();
      const match = fallback.find(c => c._id === req.params.id || c.companyName.toLowerCase() === req.params.id.toLowerCase());
      if (match) return res.json(match);
      return res.status(503).json({ error: DB_ERROR_MSG });
    }
    const company = await Company.findById(req.params.id);
    if (!company) {
      const fallback = loadSeedCompaniesFallback();
      const match = fallback.find(c => c._id === req.params.id);
      if (match) return res.json(match);
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
  } catch (err) {
    const fallback = loadSeedCompaniesFallback();
    const match = fallback.find(c => c._id === req.params.id);
    if (match) return res.json(match);
    res.status(503).json({ error: DB_ERROR_MSG });
  }
});

// POST /api/companies — create new company (Admin protected)
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { companyName, isActive = true } = req.body;
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: 'companyName is required' });
    }
    const company = new Company({ companyName: companyName.trim(), isActive: Boolean(isActive), plans: [] });
    await company.save();
    res.status(201).json(company);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Company name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/companies/:id — update company (Admin protected)
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { companyName, isActive } = req.body;
    const updateData = {};
    if (companyName && companyName.trim()) updateData.companyName = companyName.trim();
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Company name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/companies/:id/status — toggle active/inactive status (Admin protected)
router.patch('/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    company.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !company.isActive;
    await company.save();
    res.json({ _id: company._id, companyName: company.companyName, isActive: company.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/companies/:id — soft delete via isActive flag (or hard delete if ?permanent=true) (Admin protected)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    if (req.query.permanent === 'true') {
      const company = await Company.findByIdAndDelete(req.params.id);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      return res.json({ message: 'Company permanently deleted', id: req.params.id });
    }

    // Soft delete via isActive flag
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    company.isActive = false;
    await company.save();
    res.json({ message: 'Company deactivated (soft deleted)', id: req.params.id, isActive: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
