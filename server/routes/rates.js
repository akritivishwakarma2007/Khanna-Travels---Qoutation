const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const Company = require('../models/Company');
const { requireAdminAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

const VALID_COVERAGES = [50000, 100000, 200000, 250000, 500000, 750000, 1000000];

async function getCompanyAndPlan(req) {
  const companyId = req.params.companyId || req.params.id;
  const planId = req.params.planId || req.params.pid;
  const company = await Company.findById(companyId);
  if (!company) return { company: null, plan: null, error: 'Company not found' };
  const plan = company.plans.id(planId);
  if (!plan) return { company, plan: null, error: 'Plan not found' };
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

// ── GET /api/companies/:id/plans/:pid/rates ──────────────────────────────────
// Returns rates, optionally filtered by coverage and/or region
router.get('/', async (req, res) => {
  try {
    const { plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

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

    if (!VALID_COVERAGES.includes(numCov)) {
      return res.status(400).json({ error: `Invalid coverage amount: ${coverage}. Must be one of: ${VALID_COVERAGES.join(', ')}` });
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

    const { company, plan, error } = await getCompanyAndPlan(req);
    if (error) return res.status(404).json({ error });

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

    if (!VALID_COVERAGES.includes(Number(coverage))) {
      return res.status(400).json({ error: `Invalid coverage. Must be one of: ${VALID_COVERAGES.join(', ')}` });
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
        VALID_COVERAGES.includes(numCov) &&
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
      if (!VALID_COVERAGES.includes(numCov)) {
        errors.push({
          row: rowNumber,
          reason: `Invalid coverage "${coverage}". Must be one of: ${VALID_COVERAGES.join(', ')}`,
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
