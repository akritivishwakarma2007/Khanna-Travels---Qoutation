const express = require('express');
const router = express.Router({ mergeParams: true });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const { requireAdminAuth } = require('../middleware/auth');

const DB_ERROR_MSG = 'Cannot reach the database. Check MONGODB_URI in server/.env.';

// GET /api/companies/:id/plans — get all plans for a company
router.get('/', async (req, res) => {
  try {
    const companyId = req.params.companyId || req.params.id;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: DB_ERROR_MSG });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const plansSummary = company.plans.map(p => ({
      _id: p._id,
      planName: p.planName,
      productLine: p.productLine || '',
      medicalCover: p.medicalCover,
      isActive: p.isActive !== false,
      rateCount: p.rates ? p.rates.length : 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    res.json({
      companyId: company._id,
      companyName: company.companyName,
      plans: plansSummary
    });
  } catch (err) {
    res.status(503).json({ error: DB_ERROR_MSG });
  }
});

// POST /api/companies/:id/plans — add a plan to a company (Admin protected)
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { planName, productLine, region, medicalCover, isActive = true } = req.body;
    if (!planName || !planName.trim()) return res.status(400).json({ error: 'planName is required' });

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: DB_ERROR_MSG });
    }

    const companyId = req.params.companyId || req.params.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const cleanName = planName.trim();
    if (company.plans.some(p => p.planName.trim().toLowerCase() === cleanName.toLowerCase())) {
      return res.status(409).json({ error: 'Plan name already exists in this company' });
    }

    let medVal = false;
    if (typeof medicalCover === 'boolean') medVal = medicalCover;
    else if (medicalCover === 'with' || medicalCover === 'With') medVal = true;
    else if (medicalCover === 'without' || medicalCover === 'Without') medVal = false;

    company.plans.push({
      planName: cleanName,
      productLine: (productLine !== undefined ? productLine : region) || '',
      medicalCover: medVal,
      isActive: Boolean(isActive),
      rates: []
    });
    await company.save();
    res.status(201).json(company.plans[company.plans.length - 1]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/companies/:id/plans/:pid — rename or update plan settings (Admin protected)
router.put('/:pid', requireAdminAuth, async (req, res) => {
  try {
    const { planName, isActive, productLine, region, medicalCover } = req.body;
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: DB_ERROR_MSG });
    }

    const companyId = req.params.companyId || req.params.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const planId = req.params.pid || req.params.planId;
    const plan = company.plans.id(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    if (planName !== undefined && planName.trim()) {
      const cleanName = planName.trim();
      const duplicate = company.plans.some(
        p => p._id.toString() !== planId.toString() && p.planName.trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ error: 'Plan name already exists in this company' });
      }
      plan.planName = cleanName;
    }

    if (isActive !== undefined) {
      plan.isActive = Boolean(isActive);
    }

    if (productLine !== undefined || region !== undefined) {
      plan.productLine = (productLine !== undefined ? productLine : region) || '';
    }

    if (medicalCover !== undefined) {
      if (typeof medicalCover === 'boolean') {
        plan.medicalCover = medicalCover;
      } else if (medicalCover === 'with' || medicalCover === 'With') {
        plan.medicalCover = true;
      } else if (medicalCover === 'without' || medicalCover === 'Without') {
        plan.medicalCover = false;
      } else {
        plan.medicalCover = false;
      }
    }

    await company.save();
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/companies/:id/plans/:pid/status — toggle active/inactive status (Admin protected)
router.patch('/:pid/status', requireAdminAuth, async (req, res) => {
  try {
    const { isActive } = req.body;
    const companyId = req.params.companyId || req.params.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const planId = req.params.pid || req.params.planId;
    const plan = company.plans.id(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    plan.isActive = isActive !== undefined ? Boolean(isActive) : !plan.isActive;
    await company.save();
    res.json({ _id: plan._id, planName: plan.planName, isActive: plan.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies/:id/plans/:pid/duplicate — clone plan and all its rates (Admin protected)
router.post('/:pid/duplicate', requireAdminAuth, async (req, res) => {
  try {
    const { newPlanName } = req.body;
    const companyId = req.params.companyId || req.params.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const planId = req.params.pid || req.params.planId;
    const sourcePlan = company.plans.id(planId);
    if (!sourcePlan) return res.status(404).json({ error: 'Source plan not found' });

    let targetName = newPlanName ? newPlanName.trim() : `${sourcePlan.planName} (Copy)`;
    let counter = 1;
    while (company.plans.some(p => p.planName.trim().toLowerCase() === targetName.toLowerCase())) {
      counter++;
      targetName = `${sourcePlan.planName} (Copy ${counter})`;
    }

    // Deep clone rate rows
    const clonedRates = sourcePlan.rates.map(r => ({
      coverage: r.coverage,
      region: r.region,
      ageFrom: r.ageFrom,
      ageTo: r.ageTo,
      daysFrom: r.daysFrom,
      daysTo: r.daysTo,
      premium: r.premium,
      currency: r.currency || 'INR'
    }));

    company.plans.push({
      planName: targetName,
      isActive: true,
      rates: clonedRates
    });

    await company.save();
    const createdPlan = company.plans[company.plans.length - 1];
    res.status(201).json(createdPlan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/companies/:id/plans/:pid — delete plan (soft delete via isActive=false, or permanent if ?permanent=true) (Admin protected)
router.delete('/:pid', requireAdminAuth, async (req, res) => {
  try {
    const companyId = req.params.companyId || req.params.id;
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const planId = req.params.pid || req.params.planId;
    const plan = company.plans.id(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    if (req.query.permanent === 'true') {
      plan.deleteOne();
      await company.save();
      return res.json({ message: 'Plan permanently deleted', id: planId });
    }

    // Soft delete
    plan.isActive = false;
    await company.save();
    res.json({ message: 'Plan deactivated (soft deleted)', id: planId, isActive: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
