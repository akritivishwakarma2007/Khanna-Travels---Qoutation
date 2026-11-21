const { verifyAdminToken, ADMIN_EMAIL } = require('./auth');
const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

/**
 * Extracts agent identity and administrative privileges.
 * Sets req.agentId and req.isAdmin.
 */
function extractAgent(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-admin-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (verifyAdminToken(token)) {
    req.isAdmin = true;
    req.agentId = process.env.ADMIN_EMAIL || ADMIN_EMAIL || 'admin';
  } else {
    req.isAdmin = false;
    const clientAgent = req.headers['x-agent-id'] || req.query.agentId;
    req.agentId = clientAgent ? String(clientAgent).trim() : 'agent_default';
  }

  next();
}

/**
 * Audit log helper - writes to DB or fallback in-memory/console
 * Strictly IDs and timestamps only (Zero PII).
 */
async function recordAuditLog(action, recordType, recordId, agentId) {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await AuditLog.create({
        action,
        recordType,
        recordId: String(recordId),
        agentId: String(agentId),
        timestamp: new Date()
      });
    }
  } catch (err) {
    console.warn('[AuditLog] Error recording audit log:', err.message);
  }
}

module.exports = {
  extractAgent,
  recordAuditLog
};
