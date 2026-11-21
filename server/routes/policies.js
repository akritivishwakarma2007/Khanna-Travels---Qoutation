/**
 * server/routes/policies.js
 * Endpoints for issuing policies, storing long-term policy records,
 * searching issued policies, and controlled retention management.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Policy = require('../models/Policy');
const SavedQuote = require('../models/SavedQuote');
const { extractAgent, recordAuditLog } = require('../middleware/agentAuth');
const { encryptJson, decryptJson } = require('../utils/crypto');
const { purgePoliciesByRetention } = require('../services/savedQuoteCleaner');

const OFFLINE_POLICIES_FILE = path.join(__dirname, '..', 'offline-policies.json');

function isDbConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function loadOfflinePolicies() {
  try {
    if (fs.existsSync(OFFLINE_POLICIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFLINE_POLICIES_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn('[policies] Offline policies load warning:', err.message);
  }
  return [];
}

function saveOfflinePolicies(list) {
  try {
    fs.writeFileSync(OFFLINE_POLICIES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('[policies] Offline policies save warning:', err.message);
  }
}

function generatePolicyNumber(isGroup = false) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(100000 + Math.random() * 900000);
  const prefix = isGroup ? 'POL-GRP' : 'POL-IND';
  return `${prefix}-${yyyy}${mm}${dd}-${rand}`;
}

router.use(extractAgent);

/**
 * POST /api/policy/issue (and /api/policy/issue/individual)
 * Creates a permanent Policy record and removes any originating SavedQuote.
 */
router.post(['/', '/issue', '/issue/individual', '/issue/group'], async (req, res) => {
  try {
    const payload = req.body;
    const isGroup = Boolean(payload.isGroup || req.path.includes('group'));
    const agentId = req.agentId;

    const policyNumber = payload.policyNumber || generatePolicyNumber(isGroup);
    const issuedAt = new Date();

    // Sensitive traveller passport data is encrypted at rest
    const travellers = payload.travellers || (payload.travellerName || payload.passportNumber ? [
      {
        givenNames: payload.givenNames,
        surname: payload.surname,
        fullName: payload.travellerName,
        passportNumber: payload.passportNumber,
        dob: payload.dob,
        sex: payload.sex,
        nationality: payload.nationality,
        expiryDate: payload.expiryDate,
        dateOfIssue: payload.dateOfIssue,
        placeOfBirth: payload.placeOfBirth,
        placeOfIssue: payload.placeOfIssue
      }
    ] : []);

    const travellersEncrypted = encryptJson(travellers);

    // Primary summary for non-PII display/search
    const firstTraveller = travellers[0] || {};
    const primaryName = firstTraveller.fullName || `${firstTraveller.givenNames || ''} ${firstTraveller.surname || ''}`.trim() || payload.customerName || 'Traveller';
    const primaryPassport = firstTraveller.passportNumber || payload.passportNumber || '';

    // Document URL from insurer
    const documentUrl = payload.documentUrl || `https://policies.khannatravels.com/docs/${policyNumber}.pdf`;

    const policyRecord = {
      policyNumber,
      issuedAt,
      agentId,
      savedQuoteId: payload.savedQuoteId || null,
      quoteDetails: {
        quoteId: payload.quoteId || payload.quoteReference || '',
        plan: payload.planName || payload.plan || 'Travel Prime',
        insurer: payload.companyName || payload.insurer || 'Insurer',
        premium: Number(payload.premium || payload.totalPremium || 0),
        currency: payload.currency || 'INR',
        destination: payload.destination || 'Worldwide',
        travelStart: payload.tripStart || payload.travelStart || '',
        travelEnd: payload.tripEnd || payload.travelEnd || '',
        coverage: Number(payload.coverage || 50000),
        isGroup
      },
      travellersEncrypted,
      travellerSummary: {
        primaryName,
        passportNumber: primaryPassport,
        count: travellers.length
      },
      proposer: payload.proposer || null,
      nominee: payload.nominee || { name: '', relationship: '' },
      contact: payload.contact || {
        email: payload.email || '',
        mobile: payload.phone || payload.mobile || ''
      },
      address: {
        addressLine: payload.addressLine || '',
        city: payload.city || '',
        state: payload.state || '',
        pinCode: payload.pinCode || payload.pin || '',
        country: payload.country || 'India'
      },
      entryMethod: payload.entryMethod || 'ocr',
      overrides: payload.overrides || [],
      documentUrl,
      kycDocuments: [] // Empty by default unless STORE_KYC_DOCUMENTS=true
    };

    if (isDbConnected()) {
      const created = await Policy.create(policyRecord);

      // If policy was issued from a saved quote, delete the SavedQuote immediately!
      if (payload.savedQuoteId) {
        await SavedQuote.deleteOne({
          $or: [{ quoteId: payload.savedQuoteId }, { _id: mongoose.isValidObjectId(payload.savedQuoteId) ? payload.savedQuoteId : null }]
        });
        console.log(`[policies] Deleted associated SavedQuote ${payload.savedQuoteId} upon policy issuance.`);
      }

      await recordAuditLog('issue', 'policy', created.policyNumber, agentId);

      return res.json({
        success: true,
        message: 'Policy successfully issued and recorded.',
        policyNumber: created.policyNumber,
        issuedAt: created.issuedAt,
        premium: created.quoteDetails.premium,
        currency: created.quoteDetails.currency,
        plan: created.quoteDetails.plan,
        insurer: created.quoteDetails.insurer,
        travellerName: primaryName,
        passport: primaryPassport,
        destination: created.quoteDetails.destination,
        coverPeriod: `${created.quoteDetails.travelStart} to ${created.quoteDetails.travelEnd}`,
        documentUrl: created.documentUrl
      });
    }

    // Offline storage fallback
    const offlineList = loadOfflinePolicies();
    offlineList.unshift({ _id: `pol_${Date.now()}`, ...policyRecord });
    saveOfflinePolicies(offlineList);

    // Delete offline saved quote if present
    if (payload.savedQuoteId) {
      try {
        const sqFile = path.join(__dirname, '..', 'offline-saved-quotes.json');
        if (fs.existsSync(sqFile)) {
          const sqData = JSON.parse(fs.readFileSync(sqFile, 'utf8'));
          const updated = sqData.filter(i => i.quoteId !== payload.savedQuoteId && i._id !== payload.savedQuoteId);
          fs.writeFileSync(sqFile, JSON.stringify(updated, null, 2), 'utf8');
        }
      } catch {}
    }

    await recordAuditLog('issue', 'policy', policyNumber, agentId);

    return res.json({
      success: true,
      message: 'Policy successfully issued (offline mode).',
      policyNumber,
      issuedAt,
      premium: policyRecord.quoteDetails.premium,
      currency: policyRecord.quoteDetails.currency,
      plan: policyRecord.quoteDetails.plan,
      insurer: policyRecord.quoteDetails.insurer,
      travellerName: primaryName,
      passport: primaryPassport,
      destination: policyRecord.quoteDetails.destination,
      coverPeriod: `${policyRecord.quoteDetails.travelStart} to ${policyRecord.quoteDetails.travelEnd}`,
      documentUrl
    });
  } catch (err) {
    console.error('[policies] Issue policy error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/policies
 * Lists issued policies.
 * Search by policy number, customer name, passport no, mobile.
 * Agents see only their own; Admins see all.
 */
router.get('/', async (req, res) => {
  try {
    const searchQuery = (req.query.search || '').trim().toLowerCase();
    const filter = {};

    if (!req.isAdmin) {
      filter.agentId = req.agentId;
    }

    let records = [];

    if (isDbConnected()) {
      records = await Policy.find(filter)
        .select('-travellersEncrypted') // exclude encrypted payload in listing
        .sort({ issuedAt: -1 })
        .lean();
    } else {
      records = loadOfflinePolicies().filter(item => {
        if (!req.isAdmin && item.agentId !== req.agentId) return false;
        return true;
      });
    }

    if (searchQuery) {
      records = records.filter(item => {
        const polNum = (item.policyNumber || '').toLowerCase();
        const name = (item.travellerSummary?.primaryName || '').toLowerCase();
        const pass = (item.travellerSummary?.passportNumber || '').toLowerCase();
        const mobile = (item.contact?.mobile || '').toLowerCase();
        const plan = (item.quoteDetails?.plan || '').toLowerCase();
        const insurer = (item.quoteDetails?.insurer || '').toLowerCase();
        return (
          polNum.includes(searchQuery) ||
          name.includes(searchQuery) ||
          pass.includes(searchQuery) ||
          mobile.includes(searchQuery) ||
          plan.includes(searchQuery) ||
          insurer.includes(searchQuery)
        );
      });
    }

    await recordAuditLog('view', 'policy', 'list', req.agentId);

    res.json({
      success: true,
      count: records.length,
      policies: records
    });
  } catch (err) {
    console.error('[policies] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/policies/:policyNumber
 * Retrieves full policy details (decrypts traveller information).
 */
router.get('/:policyNumber', async (req, res) => {
  try {
    const polNum = req.params.policyNumber;
    let policy = null;

    if (isDbConnected()) {
      policy = await Policy.findOne({ policyNumber: polNum });
    } else {
      policy = loadOfflinePolicies().find(p => p.policyNumber === polNum);
    }

    if (!policy) {
      return res.status(404).json({ error: 'Policy not found.' });
    }

    if (!req.isAdmin && policy.agentId !== req.agentId) {
      return res.status(403).json({ error: 'Unauthorized to view this policy.' });
    }

    const decryptedTravellers = policy.travellersEncrypted
      ? decryptJson(policy.travellersEncrypted)
      : [];

    await recordAuditLog('view', 'policy', policy.policyNumber, req.agentId);

    res.json({
      success: true,
      policy: {
        ...policy.toObject ? policy.toObject() : policy,
        travellers: decryptedTravellers,
        travellersEncrypted: undefined
      }
    });
  } catch (err) {
    console.error('[policies] Get details error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/policies/purge
 * Admin-only retention purge job.
 * Disabled until POLICY_RETENTION_YEARS is configured.
 */
router.post('/purge', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Only admins can execute policy retention purge.' });
    }

    const result = await purgePoliciesByRetention();
    if (result.disabled) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[policies] Purge error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
