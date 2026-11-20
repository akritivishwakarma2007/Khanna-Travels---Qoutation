const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const XLSX = require('xlsx');
const Company = require('../models/Company');
const { requireAdminAuth } = require('../middleware/auth');

const mongoose = require('mongoose');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const { extractRatesFromDocument } = require('../services/rateDocExtractor');

const DB_ERROR_MSG = 'Cannot reach the database. Check MONGODB_URI in server/.env.';
const VALID_COVERAGES = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];

async function getCompanyAndPlan(req) {
  if (mongoose.connection.readyState !== 1) {
    return { company: null, plan: null, error: DB_ERROR_MSG, status: 503 };
  }
  const companyId = req.params.companyId || req.params.id;
  const planId = req.params.planId || req.params.pid;
  const company = await Company.findById(companyId);
  if (!company) return { company: null, plan: null, error: 'Company not found', status: 404 };
  const plan = company.plans.id(planId);
  if (!plan) return { company, plan: null, error: 'Plan not found', status: 404 };
  return { company, plan };
}

// Check if two numerical intervals [a1, a2] and [b1, b2] overlap
function isOverlap(a1, a2, b1, b2) {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

// ── GET /template — download standard CSV template ───────────────────────────
router.get('/template', (req, res) => {
  const header = 'coverage,region,ageFrom,ageTo,daysFrom,daysTo,premium,currency';
  const sampleRows = [
    '50000,Excluding,0,40,1,4,520,INR',
    '50000,Excluding,41,60,1,4,610,INR',
    '50000,Excluding,61,70,1,4,909,INR',
    '50000,Excluding,71,80,1,4,1609,INR',
    '50000,Excluding,81,85,1,4,1675,INR',
    '50000,Including,0,40,1,4,807,INR',
    '50000,Including,41,60,1,4,946,INR',
    '100000,Excluding,0,40,1,4,650,INR',
    '100000,Including,0,40,1,4,980,INR'
  ];
  const csvContent = [header, ...sampleRows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="khanna_travels_rate_template.csv"');
  res.send(csvContent);
});

// ── POST /extract-doc — extract rates from any document (PDF, Excel, Word, Image) via Gemini AI
router.post('/extract-doc', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file uploaded. Please upload a PDF, Excel, Word document, or image.' });
    }

    let existingCoverages = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];
    if (req.body.existingCoverages) {
      try {
        const parsed = JSON.parse(req.body.existingCoverages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          existingCoverages = parsed;
        }
      } catch {
        // use default
      }
    }

    const result = await extractRatesFromDocument({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      existingCoverages
    });

    res.json(result);
  } catch (err) {
    console.error('[routes/rates] extract-doc error:', err);
    res.status(500).json({ error: err.message || 'Failed to extract rates from document' });
  }
});

// ── GET /api/companies/:id/plans/:pid/rates ──────────────────────────────────
// Returns rates, optionally filtered by coverage and/or region
router.get('/', async (req, res) => {
  try {
    const { plan, error, status } = await getCompanyAndPlan(req);
    if (error) return res.status(status || 404).json({ error });

    let rates = plan.rates || [];
    const { coverage, region } = req.query;

    if (coverage) {
      rates = rates.filter(r => r.coverage === Number(coverage));
    }
    if (region) {
      rates = rates.filter(r => r.region.toLowerCase() === region.toLowerCase());
    }

    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates/grid ────────────────────────────
// Saves a 2D matrix grid (Age Bands × Days Slabs) for a specific Coverage + Region (Admin protected)
router.post('/grid', requireAdminAuth, async (req, res) => {
  try {
    const { coverage, region, ageBands, daysSlabs, matrix, currency = 'INR' } = req.body;
    const numCov = Number(coverage);

    if (!numCov || isNaN(numCov) || numCov <= 0) {
      return res.status(400).json({ error: `Invalid coverage amount: ${coverage}. Must be a positive number.` });
    }
    if (!region || typeof region !== 'string' || !region.trim()) {
      return res.status(400).json({ error: 'Region is required (e.g. "Excluding" or "Including")' });
    }
    const cleanRegion = region.trim();

    if (!Array.isArray(ageBands) || ageBands.length === 0) {
      return res.status(400).json({ error: 'At least one age band is required' });
    }
    if (!Array.isArray(daysSlabs) || daysSlabs.length === 0) {
      return res.status(400).json({ error: 'At least one days slab is required' });
    }

    // 1. Check for overlapping Age Bands
    const ageWarnings = [];
    for (let i = 0; i < ageBands.length; i++) {
      const a = ageBands[i];
      if (isNaN(a.from) || isNaN(a.to) || a.from > a.to) {
        return res.status(400).json({ error: `Invalid age band range at column ${i + 1}: ${a.from}-${a.to}` });
      }
      for (let j = i + 1; j < ageBands.length; j++) {
        const b = ageBands[j];
        if (isOverlap(Number(a.from), Number(a.to), Number(b.from), Number(b.to))) {
          ageWarnings.push(`Age band ${a.from}-${a.to} overlaps with ${b.from}-${b.to}`);
        }
      }
    }

    // 2. Check for overlapping Days Slabs
    const dayWarnings = [];
    for (let i = 0; i < daysSlabs.length; i++) {
      const d = daysSlabs[i];
      if (isNaN(d.from) || isNaN(d.to) || d.from > d.to) {
        return res.status(400).json({ error: `Invalid days slab range at row ${i + 1}: ${d.from}-${d.to}` });
      }
      for (let j = i + 1; j < daysSlabs.length; j++) {
        const e = daysSlabs[j];
        if (isOverlap(Number(d.from), Number(d.to), Number(e.from), Number(e.to))) {
          dayWarnings.push(`Days slab ${d.from}-${d.to} overlaps with ${e.from}-${e.to}`);
        }
      }
    }

    if (ageWarnings.length > 0 || dayWarnings.length > 0) {
      return res.status(400).json({
        error: 'Overlap validation failed',
        details: [...ageWarnings, ...dayWarnings]
      });
    }

    // 3. Detect any gaps in ranges for informational warnings
    const gapWarnings = [];
    const sortedAges = [...ageBands].sort((a, b) => Number(a.from) - Number(b.from));
    for (let i = 0; i < sortedAges.length - 1; i++) {
      const curTo = Number(sortedAges[i].to);
      const nextFrom = Number(sortedAges[i + 1].from);
      if (curTo + 1 < nextFrom) {
        gapWarnings.push(`Age gap detected between ${curTo} and ${nextFrom} (ages ${curTo + 1} to ${nextFrom - 1} unpriced)`);
      }
    }

    const sortedDays = [...daysSlabs].sort((a, b) => Number(a.from) - Number(b.from));
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const curTo = Number(sortedDays[i].to);
      const nextFrom = Number(sortedDays[i + 1].from);
      if (curTo + 1 < nextFrom) {
        gapWarnings.push(`Days gap detected between ${curTo} and ${nextFrom} (days ${curTo + 1} to ${nextFrom - 1} unpriced)`);
      }
    }

    const { company, plan, error, status } = await getCompanyAndPlan(req);
    if (error) return res.status(status || 404).json({ error });

    // 4. Remove existing rates for this specific (coverage + region)
    plan.rates = (plan.rates || []).filter(
      r => !(r.coverage === numCov && r.region.toLowerCase() === cleanRegion.toLowerCase())
    );

    // 5. Convert filled cells into rate documents
    let addedCount = 0;
    for (let r = 0; r < daysSlabs.length; r++) {
      const slab = daysSlabs[r];
      const rowData = Array.isArray(matrix[r]) ? matrix[r] : [];

      for (let c = 0; c < ageBands.length; c++) {
        const band = ageBands[c];
        const val = rowData[c];

        if (val !== undefined && val !== null && val !== '' && !isNaN(val)) {
          const premium = Number(val);
          if (premium > 0) {
            plan.rates.push({
              coverage: numCov,
              region: cleanRegion,
              ageFrom: Number(band.from),
              ageTo: Number(band.to),
              daysFrom: Number(slab.from),
              daysTo: Number(slab.to),
              premium,
              currency,
              updatedAt: new Date()
            });
            addedCount++;
          }
        }
      }
    }

    await company.save();
    res.json({
      message: `Successfully saved ${addedCount} rate records for ${numCov.toLocaleString()} (${cleanRegion})`,
      coverage: numCov,
      region: cleanRegion,
      savedRatesCount: addedCount,
      warnings: gapWarnings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates/bulk-edit ───────────────────────
// Bulk adjustment: increase/decrease premiums by percentage or fixed amount (Admin protected)
router.post('/bulk-edit', requireAdminAuth, async (req, res) => {
  try {
    const { coverage, region, type, value, round = true } = req.body;
    const numValue = Number(value);

    if (isNaN(numValue)) {
      return res.status(400).json({ error: 'Value must be a valid number' });
    }
    if (!['percent', 'fixed'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "percent" or "fixed"' });
    }

    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    let updatedCount = 0;
    for (const rate of plan.rates) {
      const matchCoverage = !coverage || rate.coverage === Number(coverage);
      const matchRegion = !region || rate.region.toLowerCase() === region.toLowerCase();

      if (matchCoverage && matchRegion) {
        let newPremium = rate.premium;
        if (type === 'percent') {
          newPremium = rate.premium * (1 + numValue / 100);
        } else if (type === 'fixed') {
          newPremium = rate.premium + numValue;
        }

        if (round) {
          newPremium = Math.round(newPremium);
        }
        if (newPremium < 0) newPremium = 0;

        rate.premium = newPremium;
        rate.updatedAt = new Date();
        updatedCount++;
      }
    }

    await company.save();
    res.json({
      message: `Bulk edit applied to ${updatedCount} rate rows`,
      updatedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates — add or upsert a single rate row (Admin protected)
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { coverage, region, ageFrom, ageTo, daysFrom, daysTo, premium, currency } = req.body;

    if (!Number(coverage) || isNaN(Number(coverage)) || Number(coverage) <= 0) {
      return res.status(400).json({ error: `Invalid coverage. Must be a positive number.` });
    }
    if (!region || !region.trim()) {
      return res.status(400).json({ error: 'Region is required' });
    }

    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    const cleanRegion = region.trim();
    const existing = plan.rates.find(r =>
      r.coverage === Number(coverage) &&
      r.region.toLowerCase() === cleanRegion.toLowerCase() &&
      r.ageFrom === Number(ageFrom) &&
      r.ageTo === Number(ageTo) &&
      r.daysFrom === Number(daysFrom) &&
      r.daysTo === Number(daysTo)
    );

    if (existing) {
      existing.premium = Number(premium);
      if (currency) existing.currency = currency;
      existing.updatedAt = new Date();
    } else {
      plan.rates.push({
        coverage: Number(coverage),
        region: cleanRegion,
        ageFrom: Number(ageFrom),
        ageTo: Number(ageTo),
        daysFrom: Number(daysFrom),
        daysTo: Number(daysTo),
        premium: Number(premium),
        currency: currency || 'INR',
        updatedAt: new Date()
      });
    }

    await company.save();
    res.status(201).json(existing || plan.rates[plan.rates.length - 1]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/companies/:id/plans/:pid/rates/:rid — update a single rate (Admin protected)
router.put('/:rid', requireAdminAuth, async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });
    const rate = plan.rates.id(req.params.rid);
    if (!rate) return res.status(404).json({ error: 'Rate not found' });

    const { coverage, region, ageFrom, ageTo, daysFrom, daysTo, premium, currency } = req.body;
    if (coverage !== undefined) rate.coverage = Number(coverage);
    if (region !== undefined) rate.region = region.trim();
    if (ageFrom !== undefined) rate.ageFrom = Number(ageFrom);
    if (ageTo !== undefined) rate.ageTo = Number(ageTo);
    if (daysFrom !== undefined) rate.daysFrom = Number(daysFrom);
    if (daysTo !== undefined) rate.daysTo = Number(daysTo);
    if (premium !== undefined) rate.premium = Number(premium);
    if (currency !== undefined) rate.currency = currency;
    rate.updatedAt = new Date();

    await company.save();
    res.json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/companies/:id/plans/:pid/rates/:rid — delete a rate row (Admin protected)
router.delete('/:rid', requireAdminAuth, async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });
    const rate = plan.rates.id(req.params.rid);
    if (!rate) return res.status(404).json({ error: 'Rate not found' });

    rate.deleteOne();
    await company.save();
    res.json({ message: 'Rate deleted', id: req.params.rid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/companies/:id/plans/:pid/rates — clear ALL rates in this plan (Admin protected)
router.delete('/', requireAdminAuth, async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    plan.rates = [];
    await company.save();
    res.json({ message: 'All rates cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helper: Normalization & Clash Checks ────────────────────────────────────
function cleanStr(s) {
  return String(s || '').trim().toLowerCase();
}

function parseFileToRows(buffer) {
  let rawRows = [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  } catch (err) {
    const text = buffer.toString('utf-8');
    rawRows = text.split(/\r?\n/).filter(l => l.trim() !== '').map(l => l.split(','));
  }

  if (rawRows.length < 2) return [];

  const header = (rawRows[0] || []).map(h => String(h || '').trim().toLowerCase());
  let colCov = header.findIndex(h => h.includes('cover') || h.includes('sum') || h.includes('insured'));
  let colReg = header.findIndex(h => h.includes('reg') || h.includes('scope') || h.includes('country'));
  let colAgeFrom = header.findIndex(h => h.includes('age') && (h.includes('from') || h.includes('min') || h.includes('start')));
  let colAgeTo = header.findIndex(h => h.includes('age') && (h.includes('to') || h.includes('max') || h.includes('end')));
  let colAgeRange = header.findIndex(h => h.includes('age') && !h.includes('from') && !h.includes('to'));
  let colDaysFrom = header.findIndex(h => (h.includes('day') || h.includes('slab')) && (h.includes('from') || h.includes('min') || h.includes('start')));
  let colDaysTo = header.findIndex(h => (h.includes('day') || h.includes('slab')) && (h.includes('to') || h.includes('max') || h.includes('end')));
  let colDaysRange = header.findIndex(h => (h.includes('day') || h.includes('slab')) && !h.includes('from') && !h.includes('to'));
  let colPrem = header.findIndex(h => h.includes('prem') || h.includes('rate') || h.includes('price') || h.includes('cost') || h.includes('amount'));
  let colCurr = header.findIndex(h => h.includes('curr'));

  // Default fallback if no match: 0: cov, 1: reg, 2: ageFrom, 3: ageTo, 4: daysFrom, 5: daysTo, 6: premium, 7: currency
  if (colCov === -1 && colReg === -1 && colPrem === -1) {
    colCov = 0; colReg = 1; colAgeFrom = 2; colAgeTo = 3; colDaysFrom = 4; colDaysTo = 5; colPrem = 6; colCurr = 7;
  }

  const parsed = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0 || row.every(c => c === '' || c === undefined || c === null)) continue;

    const parseRange = (val, fromIdx, toIdx) => {
      let f = fromIdx !== -1 && row[fromIdx] !== undefined && row[fromIdx] !== '' ? Number(row[fromIdx]) : null;
      let t = toIdx !== -1 && row[toIdx] !== undefined && row[toIdx] !== '' ? Number(row[toIdx]) : null;
      if ((f === null || isNaN(f) || t === null || isNaN(t)) && val !== undefined && val !== '') {
        const parts = String(val).split(/[-–—to]/i).map(s => s.trim().replace(/[^0-9]/g, ''));
        if (parts.length >= 2) {
          f = Number(parts[0]);
          t = Number(parts[1]);
        }
      }
      return { from: f, to: t };
    };

    const age = parseRange(colAgeRange !== -1 ? row[colAgeRange] : undefined, colAgeFrom, colAgeTo);
    const days = parseRange(colDaysRange !== -1 ? row[colDaysRange] : undefined, colDaysFrom, colDaysTo);

    let covRaw = colCov !== -1 ? row[colCov] : '';
    let numCov = Number(String(covRaw).replace(/[^0-9]/g, ''));
    if (numCov === 50) numCov = 50000;
    else if (numCov === 100) numCov = 100000;
    else if (numCov === 200) numCov = 200000;
    else if (numCov === 250) numCov = 250000;
    else if (numCov === 500) numCov = 500000;
    else if (numCov === 750) numCov = 750000;
    else if (numCov === 1 || numCov === 1000) numCov = 1000000;

    let regRaw = colReg !== -1 ? String(row[colReg] || '').trim() : 'Excluding';
    if (/incl/i.test(regRaw)) regRaw = 'Including';
    else if (/excl/i.test(regRaw)) regRaw = 'Excluding';

    let premRaw = colPrem !== -1 ? row[colPrem] : '';
    let numPrem = Number(String(premRaw).replace(/[^0-9.]/g, ''));
    let currRaw = colCurr !== -1 && row[colCurr] ? String(row[colCurr]).trim() : 'INR';

    parsed.push({
      rowNum: i + 1,
      coverage: numCov,
      region: regRaw,
      ageFrom: age.from,
      ageTo: age.to,
      daysFrom: days.from,
      daysTo: days.to,
      premium: numPrem,
      currency: currRaw
    });
  }

  return parsed;
}

function checkImportClashes(rows, savedRates, mode = 'merge') {
  const evaluated = rows.map((r, idx) => {
    const rowNum = r.rowNum || (idx + 1);
    const numCov = Number(r.coverage);
    const numPrem = Number(r.premium);
    const aFrom = Number(r.ageFrom);
    const aTo = Number(r.ageTo);
    const dFrom = Number(r.daysFrom);
    const dTo = Number(r.daysTo);

    const isInvalid = (
      isNaN(numCov) || numCov <= 0 ||
      isNaN(numPrem) || numPrem <= 0 ||
      isNaN(aFrom) || isNaN(aTo) || aFrom > aTo ||
      isNaN(dFrom) || isNaN(dTo) || dFrom > dTo ||
      !r.region
    );

    if (isInvalid) {
      return {
        ...r,
        rowNum,
        tag: 'Clash',
        status: 'Error',
        isInvalid: true,
        note: 'Missing or invalid fields (check numbers/boundaries)'
      };
    }

    if (mode === 'replace') {
      return {
        ...r,
        rowNum,
        coverage: numCov,
        premium: numPrem,
        ageFrom: aFrom,
        ageTo: aTo,
        daysFrom: dFrom,
        daysTo: dTo,
        tag: 'New',
        status: 'OK',
        note: 'Will replace table'
      };
    }

    // Merge mode: check against saved rates
    const exact = (savedRates || []).find(s =>
      s.coverage === numCov &&
      cleanStr(s.region) === cleanStr(r.region) &&
      s.ageFrom === aFrom && s.ageTo === aTo &&
      s.daysFrom === dFrom && s.daysTo === dTo
    );

    if (exact) {
      if (exact.premium === numPrem) {
        return {
          ...r,
          rowNum,
          coverage: numCov,
          premium: numPrem,
          ageFrom: aFrom,
          ageTo: aTo,
          daysFrom: dFrom,
          daysTo: dTo,
          tag: 'Same',
          status: 'OK',
          note: 'Exact match with saved table (no write needed)',
          savedId: exact._id
        };
      } else {
        const pct = Math.abs(numPrem - exact.premium) / exact.premium * 100;
        const isLarge = pct > 30;
        return {
          ...r,
          rowNum,
          coverage: numCov,
          premium: numPrem,
          ageFrom: aFrom,
          ageTo: aTo,
          daysFrom: dFrom,
          daysTo: dTo,
          tag: 'Changed',
          oldPremium: exact.premium,
          pctChange: Math.round(pct),
          status: isLarge ? 'Check' : 'OK',
          isLargeChange: isLarge,
          note: isLarge ? 'Large change. Check the digits.' : ('Was ₹' + exact.premium),
          savedId: exact._id
        };
      }
    }

    // Range clash with saved table
    const overlap = (savedRates || []).find(s =>
      s.coverage === numCov &&
      cleanStr(s.region) === cleanStr(r.region) &&
      isOverlap(aFrom, aTo, s.ageFrom, s.ageTo) &&
      isOverlap(dFrom, dTo, s.daysFrom, s.daysTo)
    );

    if (overlap) {
      return {
        ...r,
        rowNum,
        coverage: numCov,
        premium: numPrem,
        ageFrom: aFrom,
        ageTo: aTo,
        daysFrom: dFrom,
        daysTo: dTo,
        tag: 'Clash',
        status: 'Error',
        clashType: 'saved_table',
        savedBand: {
          ageFrom: overlap.ageFrom,
          ageTo: overlap.ageTo,
          daysFrom: overlap.daysFrom,
          daysTo: overlap.daysTo,
          premium: overlap.premium,
          id: overlap._id
        },
        note: `Clashes with saved band: Days ${overlap.daysFrom}-${overlap.daysTo}, Age ${overlap.ageFrom}-${overlap.ageTo} (₹${overlap.premium})`
      };
    }

    // Key not saved yet
    return {
      ...r,
      rowNum,
      coverage: numCov,
      premium: numPrem,
      ageFrom: aFrom,
      ageTo: aTo,
      daysFrom: dFrom,
      daysTo: dTo,
      tag: 'New',
      status: 'OK',
      note: 'New rate record'
    };
  });

  // Internal checks inside import (both merge & replace)
  for (let i = 0; i < evaluated.length; i++) {
    for (let j = i + 1; j < evaluated.length; j++) {
      const r1 = evaluated[i];
      const r2 = evaluated[j];
      if (r1.isInvalid || r2.isInvalid) continue;
      if (r1.coverage === r2.coverage && cleanStr(r1.region) === cleanStr(r2.region)) {
        if (r1.ageFrom === r2.ageFrom && r1.ageTo === r2.ageTo && r1.daysFrom === r2.daysFrom && r1.daysTo === r2.daysTo) {
          r1.tag = 'Clash';
          r1.status = 'Error';
          r1.clashType = 'import_duplicate';
          r1.note = `Appears twice (rows ${r1.rowNum} and ${r2.rowNum})`;

          r2.tag = 'Clash';
          r2.status = 'Error';
          r2.clashType = 'import_duplicate';
          r2.note = `Appears twice (rows ${r1.rowNum} and ${r2.rowNum})`;
        } else if (isOverlap(r1.ageFrom, r1.ageTo, r2.ageFrom, r2.ageTo) && isOverlap(r1.daysFrom, r1.daysTo, r2.daysFrom, r2.daysTo)) {
          r1.tag = 'Clash';
          r1.status = 'Error';
          r1.clashType = 'import_overlap';
          r1.note = `Overlaps row ${r2.rowNum}`;

          r2.tag = 'Clash';
          r2.status = 'Error';
          r2.note = `Overlaps row ${r1.rowNum}`;
        }
      }
    }
  }

  const counts = { total: evaluated.length, new: 0, changed: 0, same: 0, clash: 0, check: 0, error: 0, missing: 0 };
  evaluated.forEach(r => {
    if (r.tag === 'New') counts.new++;
    else if (r.tag === 'Changed') counts.changed++;
    else if (r.tag === 'Same') counts.same++;
    else if (r.tag === 'Clash') counts.clash++;

    if (r.isInvalid) counts.missing++;
    if (r.status === 'Check') counts.check++;
    else if (r.status === 'Error') counts.error++;
  });

  return { evaluated, counts };
}

// ── POST /api/companies/:id/plans/:pid/rates/clash-check — Server-side clash analysis
router.post('/clash-check', upload.single('file'), async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    let rows = [];
    const mode = req.body.mode || 'merge';

    if (req.file) {
      rows = parseFileToRows(req.file.buffer);
    } else if (req.body.rows) {
      rows = typeof req.body.rows === 'string' ? JSON.parse(req.body.rows) : req.body.rows;
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'No rate rows found in uploaded file. Ensure column headers match coverage, region, age, days, premium.' });
    }

    const { evaluated, counts } = checkImportClashes(rows, plan.rates || [], mode);

    res.json({
      success: true,
      planName: plan.planName,
      companyName: company.companyName,
      mode,
      rows: evaluated,
      counts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates/commit-import — Commit resolved rows to DB (Admin protected)
router.post('/commit-import', requireAdminAuth, async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    const { mode = 'merge', rows = [] } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rate rows provided to save' });
    }

    let addedCount = 0;
    let updatedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;

    if (mode === 'replace') {
      plan.rates = [];
      rows.forEach(r => {
        if (r.isDeleted || r.action === 'skip') return;
        plan.rates.push({
          coverage: Number(r.coverage),
          region: String(r.region).trim(),
          ageFrom: Number(r.ageFrom),
          ageTo: Number(r.ageTo),
          daysFrom: Number(r.daysFrom),
          daysTo: Number(r.daysTo),
          premium: Number(r.premium),
          currency: r.currency || 'INR',
          updatedAt: new Date()
        });
        addedCount++;
      });
    } else {
      // Merge mode
      rows.forEach(r => {
        if (r.isDeleted || r.action === 'keep_saved' || r.tag === 'Same') {
          skippedCount++;
          return;
        }

        const numCov = Number(r.coverage);
        const regStr = String(r.region).trim();
        const aFrom = Number(r.ageFrom);
        const aTo = Number(r.ageTo);
        const dFrom = Number(r.daysFrom);
        const dTo = Number(r.daysTo);
        const numPrem = Number(r.premium);

        if (r.action === 'use_imported') {
          // Remove any overlapping saved rows
          plan.rates = plan.rates.filter(s =>
            !(s.coverage === numCov &&
              cleanStr(s.region) === cleanStr(regStr) &&
              isOverlap(aFrom, aTo, s.ageFrom, s.ageTo) &&
              isOverlap(dFrom, dTo, s.daysFrom, s.daysTo))
          );
          plan.rates.push({
            coverage: numCov,
            region: regStr,
            ageFrom: aFrom,
            ageTo: aTo,
            daysFrom: dFrom,
            daysTo: dTo,
            premium: numPrem,
            currency: r.currency || 'INR',
            updatedAt: new Date()
          });
          replacedCount++;
          return;
        }

        // Exact match update or new rate
        const existing = plan.rates.find(s =>
          s.coverage === numCov &&
          cleanStr(s.region) === cleanStr(regStr) &&
          s.ageFrom === aFrom && s.ageTo === aTo &&
          s.daysFrom === dFrom && s.daysTo === dTo
        );

        if (existing) {
          existing.premium = numPrem;
          existing.currency = r.currency || existing.currency || 'INR';
          existing.updatedAt = new Date();
          updatedCount++;
        } else {
          plan.rates.push({
            coverage: numCov,
            region: regStr,
            ageFrom: aFrom,
            ageTo: aTo,
            daysFrom: dFrom,
            daysTo: dTo,
            premium: numPrem,
            currency: r.currency || 'INR',
            updatedAt: new Date()
          });
          addedCount++;
        }
      });
    }

    await company.save();

    res.json({
      success: true,
      message: `Rates saved successfully! (${addedCount} added, ${updatedCount} updated, ${replacedCount} replaced, ${skippedCount} skipped)`,
      added: addedCount,
      updated: updatedCount,
      replaced: replacedCount,
      skipped: skippedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates/preview-import — preview parsed CSV
router.post('/preview-import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

    const previewRows = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 7) {
        invalidCount++;
        continue;
      }

      const [coverage, region, ageFrom, ageTo, daysFrom, daysTo, premium, currency = 'INR'] = cols;
      const numCov = Number(coverage);
      const numPremium = Number(premium);
      const numAgeFrom = Number(ageFrom);
      const numAgeTo = Number(ageTo);
      const numDaysFrom = Number(daysFrom);
      const numDaysTo = Number(daysTo);

      const isValid = (
        !isNaN(numCov) && numCov > 0 &&
        Boolean(region && region.trim()) &&
        !isNaN(numAgeFrom) && !isNaN(numAgeTo) && numAgeFrom <= numAgeTo &&
        !isNaN(numDaysFrom) && !isNaN(numDaysTo) && numDaysFrom <= numDaysTo &&
        !isNaN(numPremium) && numPremium > 0
      );

      if (isValid) validCount++; else invalidCount++;

      previewRows.push({
        rowNum: i,
        coverage: numCov,
        region,
        ageBand: `${numAgeFrom}-${numAgeTo}`,
        daysSlab: `${numDaysFrom}-${numDaysTo}`,
        premium: numPremium,
        currency,
        isValid
      });
    }

    res.json({
      total: lines.length - 1,
      validCount,
      invalidCount,
      preview: previewRows.slice(0, 50),
      hasMore: previewRows.length > 50
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:id/plans/:pid/rates/import — bulk import from CSV with per-row error report (Admin protected)
router.post('/import', requireAdminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    const csvText = req.file.buffer.toString('utf-8');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    let added = 0, updated = 0, skipped = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const lineText = lines[i];
      const cols = lineText.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      const rowNumber = i + 1; // 1-based row index in spreadsheet (row 1 is header)

      if (cols.length < 7) {
        errors.push({
          row: rowNumber,
          reason: `Found only ${cols.length} column(s). Required at least 7 (coverage,region,ageFrom,ageTo,daysFrom,daysTo,premium)`,
          data: lineText
        });
        skipped++;
        continue;
      }

      const [coverage, region, ageFrom, ageTo, daysFrom, daysTo, premium, currency] = cols;
      const numCov = Number(coverage);
      const numPremium = Number(premium);
      const numAgeFrom = Number(ageFrom);
      const numAgeTo = Number(ageTo);
      const numDaysFrom = Number(daysFrom);
      const numDaysTo = Number(daysTo);

      // Detailed validation per row
      if (isNaN(numCov) || numCov <= 0) {
        errors.push({
          row: rowNumber,
          reason: `Invalid coverage "${coverage}". Must be a positive number.`,
          data: lineText
        });
        skipped++;
        continue;
      }

      if (!region || !region.trim()) {
        errors.push({
          row: rowNumber,
          reason: 'Region cannot be blank',
          data: lineText
        });
        skipped++;
        continue;
      }

      if (isNaN(numAgeFrom) || isNaN(numAgeTo) || numAgeFrom > numAgeTo) {
        errors.push({
          row: rowNumber,
          reason: `Invalid age range "${ageFrom}-${ageTo}". Both must be numbers and ageFrom <= ageTo`,
          data: lineText
        });
        skipped++;
        continue;
      }

      if (isNaN(numDaysFrom) || isNaN(numDaysTo) || numDaysFrom > numDaysTo) {
        errors.push({
          row: rowNumber,
          reason: `Invalid days range "${daysFrom}-${daysTo}". Both must be numbers and daysFrom <= daysTo`,
          data: lineText
        });
        skipped++;
        continue;
      }

      if (isNaN(numPremium) || numPremium <= 0) {
        errors.push({
          row: rowNumber,
          reason: `Invalid premium amount "${premium}". Must be a positive number`,
          data: lineText
        });
        skipped++;
        continue;
      }

      const cleanRegion = region.trim();
      const existing = plan.rates.find(r =>
        r.coverage === numCov &&
        r.region.toLowerCase() === cleanRegion.toLowerCase() &&
        r.ageFrom === numAgeFrom &&
        r.ageTo === numAgeTo &&
        r.daysFrom === numDaysFrom &&
        r.daysTo === numDaysTo
      );

      if (existing) {
        existing.premium = numPremium;
        if (currency && currency.trim()) existing.currency = currency.trim();
        existing.updatedAt = new Date();
        updated++;
      } else {
        plan.rates.push({
          coverage: numCov,
          region: cleanRegion,
          ageFrom: numAgeFrom,
          ageTo: numAgeTo,
          daysFrom: numDaysFrom,
          daysTo: numDaysTo,
          premium: numPremium,
          currency: (currency && currency.trim()) || 'INR',
          updatedAt: new Date()
        });
        added++;
      }
    }

    await company.save();
    res.json({
      message: `Import processed: ${added} added, ${updated} updated, ${skipped} skipped`,
      totalRows: lines.length - 1,
      added,
      updated,
      skipped,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/companies/:id/plans/:pid/rates/export — download CSV
router.get('/export', async (req, res) => {
  try {
    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

    const header = 'coverage,region,ageFrom,ageTo,daysFrom,daysTo,premium,currency';
    const rows = (plan.rates || []).map(r =>
      `${r.coverage},${r.region},${r.ageFrom},${r.ageTo},${r.daysFrom},${r.daysTo},${r.premium},${r.currency || 'INR'}`
    );
    const csv = [header, ...rows].join('\r\n');

    const filename = `${company.companyName}_${plan.planName}_rates.csv`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
