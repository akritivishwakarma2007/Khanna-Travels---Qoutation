const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Quote = require('../models/Quote');

const OFFLINE_QUOTES_FILE = path.join(__dirname, '..', 'offline-quotes.json');

function isDbConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function loadOfflineQuotes() {
  try {
    if (fs.existsSync(OFFLINE_QUOTES_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFLINE_QUOTES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn('Could not read offline-quotes.json:', err.message);
  }
  return [];
}

let inMemoryQuotes = loadOfflineQuotes();

function saveOfflineQuotes() {
  try {
    fs.writeFileSync(OFFLINE_QUOTES_FILE, JSON.stringify(inMemoryQuotes, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save offline-quotes.json:', err.message);
  }
}

// Helper to generate reference: KT-YYYYMMDD-####
async function generateQuoteReference() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `KT-${yyyy}${mm}${dd}-`;

  if (isDbConnected()) {
    try {
      const startOfDay = new Date(yyyy, now.getMonth(), now.getDate());
      const countToday = await Quote.countDocuments({
        createdAt: { $gte: startOfDay }
      });
      const seq = String(countToday + 1).padStart(4, '0');
      return `${datePrefix}${seq}`;
    } catch {
      // fallback to offline count below
    }
  }

  // Offline reference generation
  const todayPrefix = `KT-${yyyy}${mm}${dd}`;
  const countToday = inMemoryQuotes.filter(q => q.quoteReference && q.quoteReference.startsWith(todayPrefix)).length;
  const seq = String(countToday + 1).padStart(4, '0');
  return `${datePrefix}${seq}`;
}

// ── GET /api/quotes — list recent quotes ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    if (isDbConnected()) {
      const quotes = await Quote.find({}).sort({ createdAt: -1 }).limit(limit);
      return res.json(quotes);
    }
    const quotes = [...inMemoryQuotes]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
    res.json(quotes);
  } catch (err) {
    const quotes = [...inMemoryQuotes]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    res.json(quotes);
  }
});

// ── GET /api/quotes/:ref — lookup by quoteReference or _id ────────────────────
router.get('/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    if (isDbConnected()) {
      let quote = await Quote.findOne({ quoteReference: ref });
      if (!quote && ref.match(/^[0-9a-fA-F]{24}$/)) {
        quote = await Quote.findById(ref);
      }
      if (quote) return res.json(quote);
    }
    const quote = inMemoryQuotes.find(q => q.quoteReference === ref || q._id === ref);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    res.json(quote);
  } catch (err) {
    const quote = inMemoryQuotes.find(q => q.quoteReference === req.params.ref || q._id === req.params.ref);
    if (quote) return res.json(quote);
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

    const quoteData = {
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
    };

    if (isDbConnected()) {
      try {
        const quote = new Quote(quoteData);
        await quote.save();
        return res.status(201).json(quote);
      } catch (dbErr) {
        console.warn('DB save failed, falling back to offline quotes:', dbErr.message);
      }
    }

    const offlineQuote = {
      ...quoteData,
      _id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    inMemoryQuotes.unshift(offlineQuote);
    saveOfflineQuotes();
    res.status(201).json(offlineQuote);
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
      if (Array.isArray(selectedPlans) && selectedPlans.length === 0) {
        if (isDbConnected()) {
          try {
            let quote = await Quote.findById(id);
            if (!quote) quote = await Quote.findOne({ quoteReference: id });
            if (quote) {
              quote.selectedPlans = [];
              quote.selectedPlan = null;
              quote.status = 'Compared';
              await quote.save();
              return res.json(quote);
            }
          } catch {}
        }
        const offlineQuote = inMemoryQuotes.find(q => q._id === id || q.quoteReference === id);
        if (!offlineQuote) return res.status(404).json({ error: 'Quote not found' });
        offlineQuote.selectedPlans = [];
        offlineQuote.selectedPlan = null;
        offlineQuote.status = 'Compared';
        offlineQuote.updatedAt = new Date().toISOString();
        saveOfflineQuotes();
        return res.json(offlineQuote);
      }
      return res.status(400).json({ error: 'selectedPlan or selectedPlans array is required' });
    }

    if (isDbConnected()) {
      try {
        let quote = await Quote.findById(id);
        if (!quote) quote = await Quote.findOne({ quoteReference: id });
        if (quote) {
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
          return res.json(quote);
        }
      } catch {}
    }

    const offlineQuote = inMemoryQuotes.find(q => q._id === id || q.quoteReference === id);
    if (!offlineQuote) return res.status(404).json({ error: 'Quote not found' });
    if (Array.isArray(selectedPlans)) {
      offlineQuote.selectedPlans = selectedPlans;
      offlineQuote.selectedPlan = selectedPlans.length > 0 ? selectedPlans[0] : null;
      offlineQuote.status = selectedPlans.length > 0 ? 'Selected' : 'Compared';
    } else if (selectedPlan) {
      offlineQuote.selectedPlan = selectedPlan;
      offlineQuote.selectedPlans = [selectedPlan];
      offlineQuote.status = 'Selected';
    }
    offlineQuote.updatedAt = new Date().toISOString();
    saveOfflineQuotes();
    res.json(offlineQuote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
