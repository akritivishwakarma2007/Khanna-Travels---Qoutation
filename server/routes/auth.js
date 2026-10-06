const express = require('express');
const router = express.Router();
const { ADMIN_EMAIL, ADMIN_PASSWORD, generateAdminToken, verifyAdminToken, validateCredentials } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { email?: string, password: string }
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (validateCredentials(email, password)) {
    const token = generateAdminToken({ email: email || process.env.ADMIN_EMAIL || ADMIN_EMAIL });
    return res.json({
      success: true,
      message: 'Admin authenticated successfully',
      token
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid admin credentials'
  });
});

/**
 * GET /api/auth/verify
 * Checks Authorization header
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization || req.headers['x-admin-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  const isValid = verifyAdminToken(token);
  res.json({
    authenticated: isValid
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
