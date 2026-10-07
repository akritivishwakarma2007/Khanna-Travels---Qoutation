const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const { requireAdminAuth } = require('../middleware/auth');

function getSeedCompaniesSlim() {
  try {
    const seedPath = path.join(__dirname, '..', 'khanna-travels-seed-data.json');
    if (fs.existsSync(seedPath)) {
      const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      return data.map((c, idx) => ({
        _id: c._id || `seed_${idx}`,
        companyName: c.companyName,
        isActive: c.isActive !== false,
        plans: (c.plans || []).map((p, pIdx) => ({
          _id: p._id || `plan_${idx}_${pIdx}`,
          planName: p.planName,
          isActive: p.isActive !== false
        }))
      }));
    }
  } catch (err) {
    console.error('Error reading seed data:', err.message);
  }
  return [];
}

// GET /api/companies — list all (slim: without rate rows for speed)
router.get('/', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json(getSeedCompaniesSlim());
    }
    const companies = await Company.find(
      {},
      { companyName: 1, isActive: 1, createdAt: 1, updatedAt: 1, 'plans._id': 1, 'plans.planName': 1, 'plans.isActive': 1 }
    ).sort({ companyName: 1 });
    res.json(companies);
  } catch (err) {
    res.json(getSeedCompaniesSlim());
  }
});

// GET /api/companies/:id — full company including all rates
router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
