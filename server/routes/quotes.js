const express = require('express');
const router = express.Router();
const Quote = require('../models/Quote');

// Helper to generate reference: KT-YYYYMMDD-####
async function generateQuoteReference() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `KT-${yyyy}${mm}${dd}-`;

  // Count quotes created today to increment suffix
  const startOfDay = new Date(yyyy, now.getMonth(), now.getDate());
  const countToday = await Quote.countDocuments({
    createdAt: { $gte: startOfDay }
  });

  const seq = String(countToday + 1).padStart(4, '0');
  return `${datePrefix}${seq}`;
}

// ── GET /api/quotes — list recent quotes ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(limit);
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/quotes/:ref — lookup by quoteReference or _id ────────────────────
router.get('/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    let quote = await Quote.findOne({ quoteReference: ref });
    if (!quote && ref.match(/^[0-9a-fA-F]{24}$/)) {
      quote = await Quote.findById(ref);
    }
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/quotes — save quote request with auto-generated reference ───────
router.post('/', async (req, res) => {
  try {
    const {
      customerName,
      dob,
      age,
      departureCountry,
      arrivalCountry,
      travellingCountry,
      departureDate,
      returnDate,
      travelDays,
      coverageRequested,
      region,
      medicalOption,
      durationOption,
      resultsSummary,
      selectedPlan,
      selectedPlans
    } = req.body;

    if (!dob || !departureDate || !returnDate || !region) {
      return res.status(400).json({ error: 'Missing mandatory quote fields (dob, departureDate, returnDate, region)' });
    }

    const quoteReference = await generateQuoteReference();

    const destCountry = (arrivalCountry || travellingCountry || 'Worldwide').trim();
    const origCountry = (departureCountry || 'India').trim();

    const initialPlans = Array.isArray(selectedPlans)
      ? selectedPlans
      : (selectedPlan ? [selectedPlan] : []);

    const quote = new Quote({
      quoteReference,
      customerName: (customerName && customerName.trim()) || 'Customer',
      dob,
      age: Number(age),
      departureCountry: origCountry,
      arrivalCountry: destCountry,
      travellingCountry: destCountry,
      departureDate,
      returnDate,
      travelDays: Number(travelDays),
      coverageRequested: coverageRequested ? Number(coverageRequested) : 50000,
      region,
      medicalOption: medicalOption || 'all',
      durationOption: durationOption || 'all',
      resultsSummary: resultsSummary || {},
      selectedPlan: initialPlans.length > 0 ? initialPlans[0] : (selectedPlan || null),
      selectedPlans: initialPlans,
      status: initialPlans.length > 0 ? 'Selected' : 'Compared'
    });

    await quote.save();
    res.status(201).json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/quotes/:id/select — updates selectedPlans / selectedPlan ────────
router.patch('/:id/select', async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedPlan, selectedPlans } = req.body;

    if (!selectedPlan && (!Array.isArray(selectedPlans) || selectedPlans.length === 0)) {
      // If user passed empty selectedPlans, clear them
      if (Array.isArray(selectedPlans) && selectedPlans.length === 0) {
        let quote = await Quote.findById(id);
        if (!quote) quote = await Quote.findOne({ quoteReference: id });
        if (!quote) return res.status(404).json({ error: 'Quote not found' });
        quote.selectedPlans = [];
        quote.selectedPlan = null;
        quote.status = 'Compared';
        await quote.save();
        return res.json(quote);
      }
      return res.status(400).json({ error: 'selectedPlan or selectedPlans array is required' });
    }

    let quote = await Quote.findById(id);
    if (!quote) {
      quote = await Quote.findOne({ quoteReference: id });
    }
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    if (Array.isArray(selectedPlans)) {
      quote.selectedPlans = selectedPlans;
      quote.selectedPlan = selectedPlans.length > 0 ? selectedPlans[0] : null;
      quote.status = selectedPlans.length > 0 ? 'Selected' : 'Compared';
    } else if (selectedPlan) {
      quote.selectedPlan = selectedPlan;
      quote.selectedPlans = [selectedPlan];
      quote.status = 'Selected';
    }

    await quote.save();
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
