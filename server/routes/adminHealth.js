const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { requireAdminAuth } = require('../middleware/auth');
const Company = require('../models/Company');
const VisaLink = require('../models/VisaLink');

function getSeedCompanies() {
  try {
    const seedPath = path.join(__dirname, '..', 'models', 'khanna-travels-seed-data.json');
    const altPath = path.join(__dirname, '..', 'khanna-travels-seed-data.json');
    const target = fs.existsSync(seedPath) ? seedPath : (fs.existsSync(altPath) ? altPath : null);
    if (target) {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not read seed companies:', err.message);
  }
  return [];
}

function getSeedVisaLinks() {
  try {
    const linkPath = path.join(__dirname, '..', 'visa-links.json');
    if (fs.existsSync(linkPath)) {
      return JSON.parse(fs.readFileSync(linkPath, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not read visa-links.json:', err.message);
  }
  return [];
}

function normalizeDomain(rawUrl) {
  if (!rawUrl) return '';
  try {
    let u = rawUrl.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const parsed = new URL(u);
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

/**
 * GET /api/admin/health
 * Returns comprehensive system health, configuration flags, live counts,
 * and data integrity checks.
 * Requires valid Admin JWT authentication.
 */
router.get('/', requireAdminAuth, async (req, res) => {
  const reqStart = Date.now();

  let dbStatus = 'not_connected';
  let dbPingMs = null;
  let dbError = null;
  let dbHost = null;

  // ── 1. MongoDB Ping & Connection Check ──────────────────────────────────────
  const readyState = mongoose.connection ? mongoose.connection.readyState : 0;
  if (readyState === 1) {
    const pingStart = Date.now();
    try {
      if (mongoose.connection.db && mongoose.connection.db.admin) {
        await mongoose.connection.db.admin().ping();
      } else {
        await Company.findOne({}).select('_id').lean();
      }
      dbPingMs = Math.max(1, Date.now() - pingStart);
      dbStatus = dbPingMs > 1000 ? 'slow' : 'connected';
      dbHost = mongoose.connection.host || null;
    } catch (err) {
      dbStatus = 'not_connected';
      dbError = err.message || 'Database ping failed';
    }
  } else {
    dbStatus = 'not_connected';
    dbError = 'Database not connected. Connection state is ' + readyState;
  }

  // ── 2. Data Retrieval (MongoDB or Seed fallback) ─────────────────────────────
  let companies = [];
  let visaLinks = [];

  if (readyState === 1 && dbStatus !== 'not_connected') {
    try {
      companies = await Company.find({}).lean();
    } catch (err) {
      console.warn('Failed to query companies from Mongo, using seed data:', err.message);
      companies = getSeedCompanies();
    }
    try {
      visaLinks = await VisaLink.find({}).lean();
    } catch (err) {
      console.warn('Failed to query visa links from Mongo, using seed data:', err.message);
      visaLinks = getSeedVisaLinks();
    }
  } else {
    // Offline / fallback data
    companies = getSeedCompanies();
    visaLinks = getSeedVisaLinks();
  }

  // ── 3. Counts & Calculations ────────────────────────────────────────────────
  const activeCompanies = companies.filter(c => c.isActive !== false);
  let totalPlansCount = 0;
  let activePlansCount = 0;

  companies.forEach(c => {
    const plans = c.plans || [];
    totalPlansCount += plans.length;
    if (c.isActive !== false) {
      activePlansCount += plans.filter(p => p.isActive !== false).length;
    }
  });

  // ── 4. Data Checks ──────────────────────────────────────────────────────────
  // Check A: Every active company has at least one plan
  const activeCompaniesWithNoPlans = activeCompanies
    .filter(c => !c.plans || c.plans.length === 0)
    .map(c => c.companyName);

  // Check B: Every plan has a rate table (rates.length > 0)
  const plansWithNoRateTable = [];
  companies.forEach(c => {
    (c.plans || []).forEach(p => {
      if (!p.rates || p.rates.length === 0) {
        plansWithNoRateTable.push({
          companyName: c.companyName,
          companyIsActive: c.isActive !== false,
          planName: p.planName,
          planIsActive: p.isActive !== false
        });
      }
    });
  });

  // Check C: Duplicate visa links (grouped by normalized title or domain)
  const visaLinkGroups = {};
  visaLinks.forEach(item => {
    const titleKey = (item.title || '').trim().toUpperCase();
    const domainKey = normalizeDomain(item.url);
    const key = titleKey || domainKey;
    if (!key) return;

    if (!visaLinkGroups[key]) {
      visaLinkGroups[key] = {
        key,
        title: item.title || key,
        count: 0,
        ids: []
      };
    }
    visaLinkGroups[key].count++;
    if (item._id) visaLinkGroups[key].ids.push(String(item._id));
  });

  const duplicateVisaLinks = Object.values(visaLinkGroups).filter(g => g.count > 1);

  // ── 5. Server Settings Checks (FLAGS ONLY - NEVER VALUES) ───────────────────
  const hasMongoUri = Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());
  const hasAdminEmail = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.trim());
  const hasAdminPassword = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim());
  const allServerSettingsSet = hasMongoUri && hasAdminEmail && hasAdminPassword;

  // ── 6. Token Signing Secret Configured ──────────────────────────────────────
  const tokenSigningConfigured = Boolean(
    process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD
  );

  // ── 7. Overall System Status Assessment ─────────────────────────────────────
  let warningsCount = 0;
  if (dbStatus === 'slow') warningsCount++;
  if (dbStatus === 'not_connected') warningsCount++;
  if (!allServerSettingsSet) warningsCount++;
  if (!tokenSigningConfigured) warningsCount++;
  if (activeCompaniesWithNoPlans.length > 0) warningsCount++;
  if (plansWithNoRateTable.length > 0) warningsCount++;
  if (duplicateVisaLinks.length > 0) warningsCount++;

  const overallStatus = (dbStatus === 'not_connected' || warningsCount > 0)
    ? 'Needs attention'
    : 'Everything is working';

  const apiResponseMs = Math.max(1, Date.now() - reqStart);

  return res.json({
    status: overallStatus,
    warningsCount,
    api: {
      status: 'Reachable',
      responseMs: apiResponseMs
    },
    database: {
      status: dbStatus, // 'connected' | 'slow' | 'not_connected'
      pingMs: dbPingMs,
      error: dbError,
      host: dbHost
    },
    auth: {
      tokenSigningConfigured,
      label: tokenSigningConfigured ? 'Token signing is configured' : 'Token signing secret missing'
    },
    serverSettings: {
      hasMongoUri,
      hasAdminEmail,
      hasAdminPassword,
      allSet: allServerSettingsSet,
      keysSet: ['MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter(k => Boolean(process.env[k])),
      missingKeys: ['MONGODB_URI', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter(k => !process.env[k])
    },
    quoteEngine: {
      loadedFrom: (readyState === 1 && dbStatus !== 'not_connected') ? 'database' : 'offline_fallback',
      plansCount: activePlansCount,
      totalPlansCount
    },
    counts: {
      companies: companies.length,
      activeCompanies: activeCompanies.length,
      plans: totalPlansCount,
      activePlans: activePlansCount,
      visaLinks: visaLinks.length
    },
    dataChecks: {
      companiesWithoutPlans: activeCompaniesWithNoPlans,
      plansWithoutRates: plansWithNoRateTable,
      duplicateVisaLinks: duplicateVisaLinks
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
