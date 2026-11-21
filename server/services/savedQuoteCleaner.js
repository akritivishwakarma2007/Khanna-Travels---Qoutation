/**
 * server/services/savedQuoteCleaner.js
 * Handles:
 * 1. 15-minute background scheduled purge of expired saved quotes (expiresAt < now)
 * 2. Disabled-by-default admin retention purge for policies (enabled only if POLICY_RETENTION_YEARS is configured)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const SavedQuote = require('../models/SavedQuote');
const Policy = require('../models/Policy');

const OFFLINE_SAVED_QUOTES_FILE = path.join(__dirname, '..', 'offline-saved-quotes.json');

function isDbConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Purges expired saved quotes permanently from MongoDB and offline file.
 */
async function cleanExpiredSavedQuotes() {
  const now = new Date();
  let deletedCount = 0;

  // 1. Purge from MongoDB
  if (isDbConnected()) {
    try {
      const res = await SavedQuote.deleteMany({ expiresAt: { $lt: now } });
      deletedCount += res.deletedCount || 0;
      if (deletedCount > 0) {
        console.log(`[savedQuoteCleaner] Purged ${deletedCount} expired saved quote(s) from database.`);
      }
    } catch (err) {
      console.error('[savedQuoteCleaner] Error cleaning DB saved quotes:', err.message);
    }
  }

  // 2. Purge from offline file if present
  try {
    if (fs.existsSync(OFFLINE_SAVED_QUOTES_FILE)) {
      const data = JSON.parse(fs.readFileSync(OFFLINE_SAVED_QUOTES_FILE, 'utf8'));
      if (Array.isArray(data)) {
        const active = data.filter(sq => new Date(sq.expiresAt) > now);
        const removed = data.length - active.length;
        if (removed > 0) {
          fs.writeFileSync(OFFLINE_SAVED_QUOTES_FILE, JSON.stringify(active, null, 2), 'utf8');
          deletedCount += removed;
          console.log(`[savedQuoteCleaner] Purged ${removed} expired saved quote(s) from offline storage.`);
        }
      }
    }
  } catch (err) {
    console.warn('[savedQuoteCleaner] Offline storage clean warning:', err.message);
  }

  return { success: true, deletedCount };
}

/**
 * Policy retention purge job.
 * Disabled by default. Enabled ONLY when POLICY_RETENTION_YEARS is configured with a positive number.
 */
async function purgePoliciesByRetention() {
  const retentionYearsStr = (process.env.POLICY_RETENTION_YEARS || '').trim();
  const retentionYears = parseInt(retentionYearsStr, 10);

  if (isNaN(retentionYears) || retentionYears <= 0) {
    return {
      success: false,
      disabled: true,
      purged: 0,
      message: 'Policy purge is disabled: POLICY_RETENTION_YEARS is not configured.'
    };
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears);

  let deletedCount = 0;
  if (isDbConnected()) {
    try {
      const res = await Policy.deleteMany({ issuedAt: { $lt: cutoff } });
      deletedCount = res.deletedCount || 0;
      console.log(`[savedQuoteCleaner] Purged ${deletedCount} policies older than ${retentionYears} years (prior to ${cutoff.toISOString()}).`);
    } catch (err) {
      console.error('[savedQuoteCleaner] Error purging policies by retention:', err.message);
      throw err;
    }
  }

  return {
    success: true,
    disabled: false,
    retentionYears,
    cutoffDate: cutoff.toISOString(),
    purged: deletedCount
  };
}

let cleanupInterval = null;

/**
 * Starts the periodic background cleanup job (every 15 minutes)
 */
function startBackgroundCleaner() {
  if (cleanupInterval) return;

  // Run initial cleanup once after start
  setTimeout(() => {
    cleanExpiredSavedQuotes().catch(() => {});
  }, 5000);

  // Repeat every 15 minutes (15 * 60 * 1000 ms)
  cleanupInterval = setInterval(() => {
    cleanExpiredSavedQuotes().catch(err => {
      console.error('[savedQuoteCleaner] Scheduled cleanup error:', err.message);
    });
  }, 15 * 60 * 1000);

  console.log('[savedQuoteCleaner] Background cleaner scheduled (interval: 15 minutes).');
}

function stopBackgroundCleaner() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

module.exports = {
  cleanExpiredSavedQuotes,
  purgePoliciesByRetention,
  startBackgroundCleaner,
  stopBackgroundCleaner
};
