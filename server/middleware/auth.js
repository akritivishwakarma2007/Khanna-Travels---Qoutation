const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'khanna2026';
const TOKEN_SECRET = process.env.TOKEN_SECRET || (ADMIN_PASSWORD + '_kt_secret_key_2026');
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a signed admin token
 */
function generateAdminToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

/**
 * Verify a signed admin token
 */
function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;

  // Support direct password as bearer token for convenience or API testing
  if (token === ADMIN_PASSWORD) return true;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const time = parseInt(timestamp, 10);
  if (isNaN(time)) return false;

  // Check expiration (24h)
  if (Date.now() - time > TOKEN_EXPIRY_MS) return false;

  const expectedSignature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(timestamp)
    .digest('hex');

  // Constant-time string comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Express middleware to protect write/admin endpoints
 */
function requireAdminAuth(req, res, next) {
  // Allow OPTIONS preflight
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
  ADMIN_PASSWORD,
  generateAdminToken,
  verifyAdminToken,
  requireAdminAuth
};
