/**
 * server/routes/savedQuotes.js
 * Endpoints for 24-hour draft quotes with auto-deletion, encryption at rest,
 * and resume verification.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const SavedQuote = require('../models/SavedQuote');
const Company = require('../models/Company');
const { extractAgent, recordAuditLog } = require('../middleware/agentAuth');
const { encryptJson, decryptJson } = require('../utils/crypto');

const OFFLINE_SAVED_QUOTES_FILE = path.join(__dirname, '..', 'offline-saved-quotes.json');

function isDbConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function loadOfflineSavedQuotes() {
  try {
    if (fs.existsSync(OFFLINE_SAVED_QUOTES_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFLINE_SAVED_QUOTES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn('[savedQuotes] Error loading offline file:', err.message);
  }
  return [];
}

function saveOfflineSavedQuotes(list) {
  try {
    fs.writeFileSync(OFFLINE_SAVED_QUOTES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('[savedQuotes] Error saving offline file:', err.message);
  }
}

function generateQuoteDraftId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SQ-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Re-checks latest premium from Company rate card
 */
async function lookupCurrentPremium({ insurer, planName, coverage, region, age, travelDays }) {
  try {
    if (!isDbConnected()) return null;
    if (!insurer || !planName || !coverage || !region || age === undefined || !travelDays) return null;

    const company = await Company.findOne({
      companyName: new RegExp(`^${insurer.trim()}$`, 'i'),
      isActive: { $ne: false }
    });
    if (!company) return null;

    const plan = (company.plans || []).find(p =>
      p.isActive !== false &&
      p.planName.trim().toLowerCase() === planName.trim().toLowerCase()
    );
    if (!plan || !plan.rates) return null;

    const normalizedRegion = region.toLowerCase().includes('inc') ? 'Including' : 'Excluding';
    const rate = plan.rates.find(r => {
      const matchesRegion = r.region && (
        r.region.trim().toLowerCase() === normalizedRegion.toLowerCase() ||
        (r.region.toLowerCase().includes('inc') === normalizedRegion.toLowerCase().includes('inc'))
      );
      return (
        matchesRegion &&
        Number(r.coverage) === Number(coverage) &&
        age >= r.ageFrom &&
        age <= r.ageTo &&
        travelDays >= r.daysFrom &&
        travelDays <= r.daysTo
      );
    });

    return rate ? rate.premium : null;
  } catch (err) {
    console.warn('[savedQuotes] lookupCurrentPremium error:', err.message);
    return null;
  }
}

// Apply agent identification middleware to all routes
router.use(extractAgent);

/**
 * POST /api/quotes/saved
 * Saves or updates a 24-hour draft quote. Encrypts passport and traveller details at rest.
 */
router.post('/', async (req, res) => {
  try {
    const {
      quoteId: inputQuoteId,
      quote = {},
      customer = {},
      passport = null,
      groupTravellers = null,
      flowStep = 'quotes',
      isAutoSave = false
    } = req.body;

    const agentId = req.agentId;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Encrypt sensitive passport fields at rest; NEVER save passport file or images
    const passportEncrypted = passport ? encryptJson(passport) : null;
    const groupTravellersEncrypted = groupTravellers ? encryptJson(groupTravellers) : null;

    const quoteId = inputQuoteId || quote.quoteId || generateQuoteDraftId();

    const recordData = {
      quoteId,
      agentId,
      status: 'saved',
      createdAt: now,
      expiresAt,
      quote: {
        quoteId: quote.quoteId || quoteId,
        plan: quote.plan || quote.planName || 'Standard Plan',
        insurer: quote.insurer || quote.companyName || 'Insurer',
        premium: Number(quote.premium || quote.totalPremium || quote.estimatedTotal || 0),
        currency: quote.currency || 'INR',
        destination: quote.destination || 'Worldwide',
        travelStart: quote.travelStart || quote.tripStart || '',
        travelEnd: quote.travelEnd || quote.tripEnd || '',
        travellersCount: Number(quote.travellersCount || 1),
        coverage: Number(quote.coverage || quote.sumInsured || 50000),
        coverageSummary: quote.coverageSummary || `$${Number(quote.coverage || 50000).toLocaleString()}`,
        isGroup: Boolean(quote.isGroup)
      },
      customer: {
        name: customer.name || customer.travellerName || '',
        dob: customer.dob || '',
        mobile: customer.mobile || '',
        email: customer.email || ''
      },
      passportEncrypted,
      groupTravellersEncrypted,
      flowStep: flowStep || 'quotes',
      extendedOnce: false
    };

    if (isDbConnected()) {
      // Upsert by quoteId if belonging to the same agent
      const saved = await SavedQuote.findOneAndUpdate(
        { quoteId, agentId },
        { $set: recordData },
        { upsert: true, new: true }
      );
      await recordAuditLog('save', 'saved_quote', quoteId, agentId);
      return res.json({
        success: true,
        message: 'Quote saved for 24 hours',
        savedQuote: {
          id: saved._id,
          quoteId: saved.quoteId,
          expiresAt: saved.expiresAt,
          flowStep: saved.flowStep
        }
      });
    }

    // Offline storage fallback
    const offlineList = loadOfflineSavedQuotes().filter(item =>
      !(item.quoteId === quoteId && item.agentId === agentId)
    );
    offlineList.unshift({ _id: `off_${Date.now()}`, ...recordData });
    saveOfflineSavedQuotes(offlineList);
    await recordAuditLog('save', 'saved_quote', quoteId, agentId);

    return res.json({
      success: true,
      message: 'Quote saved for 24 hours (offline mode)',
      savedQuote: {
        quoteId,
        expiresAt,
        flowStep
      }
    });
  } catch (err) {
    console.error('[savedQuotes] Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/quotes/saved
 * Lists active (non-expired) saved quotes.
 * Agents see only their own; Admins see all.
 * Newest first.
 */
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const searchQuery = (req.query.search || '').trim().toLowerCase();

    // Query filter: strictly non-expired records
    const filter = {
      expiresAt: { $gt: now },
      status: 'saved'
    };

    // Agent scoping: admins see all; regular agents see only their own
    if (!req.isAdmin) {
      filter.agentId = req.agentId;
    }

    let records = [];

    if (isDbConnected()) {
      records = await SavedQuote.find(filter)
        .select('-passportEncrypted -groupTravellersEncrypted') // Never return encrypted PII in listing
        .sort({ createdAt: -1 })
        .lean();
    } else {
      records = loadOfflineSavedQuotes().filter(item => {
        if (new Date(item.expiresAt) <= now) return false;
        if (item.status !== 'saved') return false;
        if (!req.isAdmin && item.agentId !== req.agentId) return false;
        return true;
      });
    }

    // Apply search filter if provided
    if (searchQuery) {
      records = records.filter(item => {
        const name = (item.customer?.name || '').toLowerCase();
        const mobile = (item.customer?.mobile || '').toLowerCase();
        const qid = (item.quoteId || '').toLowerCase();
        const plan = (item.quote?.plan || '').toLowerCase();
        const insurer = (item.quote?.insurer || '').toLowerCase();
        return (
          name.includes(searchQuery) ||
          mobile.includes(searchQuery) ||
          qid.includes(searchQuery) ||
          plan.includes(searchQuery) ||
          insurer.includes(searchQuery)
        );
      });
    }

    // Format expiry countdown for UI
    const formattedList = records.map(item => {
      const expDate = new Date(item.expiresAt);
      const remainingMs = Math.max(0, expDate.getTime() - now.getTime());
      const remainingHrs = Math.floor(remainingMs / (1000 * 60 * 60));
      const remainingMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

      const expiresInText = remainingHrs > 0
        ? `${remainingHrs}h ${remainingMins}m`
        : `${remainingMins}m`;

      return {
        id: item._id,
        quoteId: item.quoteId,
        agentId: item.agentId,
        status: item.status,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        expiresInText,
        remainingMs,
        isExpiringSoon: remainingMs < 2 * 60 * 60 * 1000, // < 2 hours triggers orange badge
        extendedOnce: Boolean(item.extendedOnce),
        flowStep: item.flowStep || 'quotes',
        customer: item.customer,
        quote: item.quote
      };
    });

    await recordAuditLog('view', 'saved_quote', 'list', req.agentId);

    res.json({
      success: true,
      count: formattedList.length,
      savedQuotes: formattedList
    });
  } catch (err) {
    console.error('[savedQuotes] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/quotes/saved/:id/resume
 * Resumes a saved quote:
 * 1. Verifies not expired (expiresAt > now)
 * 2. Checks if travel start date has passed
 * 3. Re-checks premium from quotes API / rate tables
 * 4. Decrypts passport fields if previously saved
 */
router.get('/:id/resume', async (req, res) => {
  try {
    const idOrQuoteId = req.params.id;
    const now = new Date();

    let record = null;
    if (isDbConnected()) {
      record = await SavedQuote.findOne({
        $or: [{ quoteId: idOrQuoteId }, { _id: mongoose.isValidObjectId(idOrQuoteId) ? idOrQuoteId : null }],
        expiresAt: { $gt: now } // Expiry check at query level
      });
    } else {
      record = loadOfflineSavedQuotes().find(item =>
        (item.quoteId === idOrQuoteId || item._id === idOrQuoteId) &&
        new Date(item.expiresAt) > now
      );
    }

    if (!record) {
      return res.status(404).json({
        error: 'Saved quote not found or has expired (quotes are automatically deleted after 24 hours).',
        code: 'QUOTE_EXPIRED'
      });
    }

    // Agent permission check
    if (!req.isAdmin && record.agentId !== req.agentId) {
      return res.status(403).json({ error: 'Unauthorized to resume this quote' });
    }

    // Check travel start date
    const travelStartStr = record.quote?.travelStart;
    if (travelStartStr) {
      const travelStartDate = new Date(travelStartStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!isNaN(travelStartDate.getTime()) && travelStartDate < today) {
        return res.status(400).json({
          error: 'Travel date has passed. Create a new quote.',
          code: 'TRAVEL_DATE_PASSED'
        });
      }
    }

    // Decrypt passport details (NEVER plain in DB)
    const decryptedPassport = record.passportEncrypted ? decryptJson(record.passportEncrypted) : null;
    const decryptedGroupTravellers = record.groupTravellersEncrypted ? decryptJson(record.groupTravellersEncrypted) : null;

    // Re-check premium with latest rates
    const savedPremium = Number(record.quote?.premium || 0);
    let latestPremium = savedPremium;
    let premiumChanged = false;

    if (record.quote && record.customer?.dob && record.quote.travelStart && record.quote.travelEnd) {
      const depDate = new Date(record.quote.travelStart);
      const retDate = new Date(record.quote.travelEnd);
      const bDate = new Date(record.customer.dob);

      if (!isNaN(depDate) && !isNaN(retDate) && !isNaN(bDate)) {
        let age = depDate.getFullYear() - bDate.getFullYear();
        const mDiff = depDate.getMonth() - bDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && depDate.getDate() < bDate.getDate())) age--;

        const msPerDay = 1000 * 60 * 60 * 24;
        const travelDays = Math.floor((retDate - depDate) / msPerDay) + 1;

        const currentRatePremium = await lookupCurrentPremium({
          insurer: record.quote.insurer,
          planName: record.quote.plan,
          coverage: record.quote.coverage,
          region: record.quote.destination || 'Excluding',
          age,
          travelDays
        });

        if (currentRatePremium !== null && currentRatePremium !== savedPremium) {
          latestPremium = currentRatePremium;
          premiumChanged = true;
        }
      }
    }

    await recordAuditLog('resume', 'saved_quote', record.quoteId, req.agentId);

    res.json({
      success: true,
      savedQuote: {
        id: record._id,
        quoteId: record.quoteId,
        flowStep: record.flowStep || 'quotes',
        quote: {
          ...record.quote,
          premium: latestPremium
        },
        customer: record.customer,
        passport: decryptedPassport,
        hasPassportData: Boolean(decryptedPassport),
        groupTravellers: decryptedGroupTravellers,
        expiresAt: record.expiresAt,
        premiumCheck: {
          premiumChanged,
          savedPremium,
          latestPremium,
          message: premiumChanged
            ? `Premium changed from ₹${savedPremium.toLocaleString('en-IN')} to ₹${latestPremium.toLocaleString('en-IN')}`
            : 'Premium unchanged'
        }
      }
    });
  } catch (err) {
    console.error('[savedQuotes] Resume error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/quotes/saved/:id
 * Permanently hard-deletes a saved quote and all associated encrypted data.
 */
router.delete('/:id', async (req, res) => {
  try {
    const idOrQuoteId = req.params.id;
    const filter = {
      $or: [{ quoteId: idOrQuoteId }, { _id: mongoose.isValidObjectId(idOrQuoteId) ? idOrQuoteId : null }]
    };

    if (!req.isAdmin) {
      filter.agentId = req.agentId;
    }

    if (isDbConnected()) {
      const result = await SavedQuote.deleteOne(filter);
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Saved quote not found or already deleted.' });
      }
    } else {
      const list = loadOfflineSavedQuotes();
      const filtered = list.filter(item => {
        const matches = (item.quoteId === idOrQuoteId || item._id === idOrQuoteId);
        if (matches && (!req.isAdmin && item.agentId !== req.agentId)) return true; // keep if not owned
        return !matches;
      });
      saveOfflineSavedQuotes(filtered);
    }

    await recordAuditLog('delete', 'saved_quote', idOrQuoteId, req.agentId);

    res.json({
      success: true,
      message: 'Saved quote permanently deleted.'
    });
  } catch (err) {
    console.error('[savedQuotes] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/quotes/saved/:id/extend
 * Optional extension by 24h (one time only, guarded by ALLOW_SAVED_QUOTE_EXTENSION)
 */
router.post('/:id/extend', async (req, res) => {
  try {
    const allowExtension = process.env.ALLOW_SAVED_QUOTE_EXTENSION === 'true';
    if (!allowExtension) {
      return res.status(403).json({ error: 'Extension of saved quotes is disabled.' });
    }

    const idOrQuoteId = req.params.id;
    const now = new Date();

    let record = null;
    if (isDbConnected()) {
      record = await SavedQuote.findOne({
        $or: [{ quoteId: idOrQuoteId }, { _id: mongoose.isValidObjectId(idOrQuoteId) ? idOrQuoteId : null }],
        expiresAt: { $gt: now }
      });
    } else {
      record = loadOfflineSavedQuotes().find(item =>
        (item.quoteId === idOrQuoteId || item._id === idOrQuoteId) &&
        new Date(item.expiresAt) > now
      );
    }

    if (!record) {
      return res.status(404).json({ error: 'Saved quote not found or already expired.' });
    }

    if (!req.isAdmin && record.agentId !== req.agentId) {
      return res.status(403).json({ error: 'Unauthorized to extend this quote' });
    }

    if (record.extendedOnce) {
      return res.status(400).json({ error: 'This quote has already been extended once.' });
    }

    const newExpiresAt = new Date(new Date(record.expiresAt).getTime() + 24 * 60 * 60 * 1000);

    if (isDbConnected()) {
      record.expiresAt = newExpiresAt;
      record.extendedOnce = true;
      await record.save();
    } else {
      const list = loadOfflineSavedQuotes();
      const target = list.find(i => i.quoteId === record.quoteId || i._id === record._id);
      if (target) {
        target.expiresAt = newExpiresAt;
        target.extendedOnce = true;
        saveOfflineSavedQuotes(list);
      }
    }

    await recordAuditLog('extend', 'saved_quote', record.quoteId, req.agentId);

    res.json({
      success: true,
      message: 'Quote extended by 24 hours.',
      expiresAt: newExpiresAt
    });
  } catch (err) {
    console.error('[savedQuotes] Extend error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
