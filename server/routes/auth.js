const express = require('express');
const router = express.Router();
const { ADMIN_PASSWORD, generateAdminToken, verifyAdminToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { password: string }
 */
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;

  if (password === expectedPassword) {
    const token = generateAdminToken();
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
