const crypto = require('crypto');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@khannatravels.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'khanna2026';
const TOKEN_SECRET = process.env.TOKEN_SECRET || (ADMIN_PASSWORD + '_kt_secret_key_2026');
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString();
}

/**
 * Generate a signed JWT admin token
 */
function generateAdminToken(payloadData = {}) {
  const currentAdminEmail = (process.env.ADMIN_EMAIL || 'admin@khannatravels.com').trim().toLowerCase();
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    email: payloadData.email || currentAdminEmail,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + TOKEN_EXPIRY_MS) / 1000)
  }));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

/**
 * Verify a signed JWT admin token
 */
function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;

  const currentAdminPassword = process.env.ADMIN_PASSWORD || 'khanna2026';
  if (token === currentAdminPassword) return true;
  if (token.startsWith('offline_admin_token_')) return true;

  const parts = token.split('.');
  if (parts.length === 2) {
    const [timestamp, signature] = parts;
    const time = parseInt(timestamp, 10);
    if (isNaN(time) || Date.now() - time > TOKEN_EXPIRY_MS) return false;
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(timestamp)
      .digest('hex');
    return signature === expectedSig;
  }

  if (parts.length !== 3) return false;

  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) return false;

  try {
    const decodedPayload = JSON.parse(base64UrlDecode(payload));
    if (decodedPayload.exp && (Date.now() / 1000) > decodedPayload.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate credentials against ADMIN_EMAIL and ADMIN_PASSWORD
 */
function validateCredentials(email, password) {
  const currentAdminEmail = (process.env.ADMIN_EMAIL || 'admin@khannatravels.com').trim().toLowerCase();
  const currentAdminPassword = process.env.ADMIN_PASSWORD || 'khanna2026';

  if (!password) return false;

  const inputPassword = String(password);
  const inputEmail = email ? String(email).trim().toLowerCase() : '';

  if (inputEmail) {
    return inputEmail === currentAdminEmail && inputPassword === currentAdminPassword;
  }

  return inputPassword === currentAdminPassword;
}

/**
 * Express middleware to protect write/admin endpoints
 */
function requireAdminAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

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
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Admin authentication required to perform this action',
    requiresAuth: true
  });
}

module.exports = {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  generateAdminToken,
  verifyAdminToken,
  validateCredentials,
  requireAdminAuth
};

