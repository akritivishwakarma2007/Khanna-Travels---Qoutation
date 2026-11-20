/**
 * Passport OCR API Route
 * Endpoint: POST /api/passport/extract
 *
 * Handles multipart file uploads (in-memory only), enforces agent auth,
 * executes rate limiting, and dispatches to the OCR service.
 * Supports:
 * - One PDF containing both pages (front + back)
 * - One image with both pages (side-by-side scan)
 * - Two separate files (front and back), in any order
 * - Front page only
 */
const express = require('express');
const multer = require('multer');
const { requireAdminAuth } = require('../middleware/auth');
const { extractPassport } = require('../services/ocr');
const { lookupPinCode } = require('../services/ocr/addressParser');

const router = express.Router();

// ── PIN Code Lookup Endpoint ─────────────────────────────────────────────────
router.get('/pincode/:pin', async (req, res) => {
  const pin = (req.params.pin || '').replace(/\D/g, '');
  if (pin.length !== 6) {
    return res.status(400).json({ error: 'PIN code must be 6 digits' });
  }
  const result = await lookupPinCode(pin);
  if (!result) {
    return res.status(404).json({ error: 'PIN code not found' });
  }
  return res.json(result);
});

// ── In-Memory Multer Configuration (Strictly zero disk persistence) ───────────
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 4
  },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    const hasValidExt = /\.(jpe?g|png|webp|pdf)$/i.test(name);

    if (ALLOWED_MIME_TYPES.includes(mime) || hasValidExt) {
      cb(null, true);
    } else {
      const err = new Error('Upload a JPG, PNG, WEBP or PDF.');
      err.code = 'BAD_FILE';
      cb(err, false);
    }
  }
});

// ── Per-User In-Memory Rate Limiter ──────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests / min
const rateLimitMap = new Map(); // key -> timestamps[]

function rateLimiter(req, res, next) {
  const userKey = req.headers.authorization || req.ip || 'anonymous';
  const now = Date.now();

  let timestamps = rateLimitMap.get(userKey) || [];
  timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded. Please wait a minute before retrying.'
    });
  }

  timestamps.push(now);
  rateLimitMap.set(userKey, timestamps);

  // Periodic cleanup
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(k);
      }
    }
  }

  next();
}

// ── Extraction Endpoint ───────────────────────────────────────────────────────
router.post(
  '/extract',
  requireAdminAuth,
  rateLimiter,
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            code: 'TOO_LARGE',
            message: 'File is larger than 10 MB.'
          });
        }
        if (err.code === 'BAD_FILE') {
          return res.status(400).json({
            code: 'BAD_FILE',
            message: 'Upload a JPG, PNG, WEBP or PDF.'
          });
        }
        return res.status(400).json({
          code: 'BAD_FILE',
          message: err.message || 'Invalid file upload.'
        });
      }
      next();
    });
  },
  async (req, res) => {
    // Header requirement: Cache-Control: no-store
    res.setHeader('Cache-Control', 'no-store');

    const files = req.files || [];
    if (!files || files.length === 0) {
      return res.status(400).json({
        code: 'NO_FILE',
        message: 'Attach the passport photo page.'
      });
    }

    try {
      const normalizedData = await extractPassport(files);
      return res.status(200).json(normalizedData);
    } catch (err) {
      if (err.code === 'NO_FILE') {
        return res.status(400).json({
          code: 'NO_FILE',
          message: 'Attach the passport photo page.'
        });
      }

      if (err.code === 'IMAGE_TOO_SMALL') {
        return res.status(400).json({
          code: 'IMAGE_TOO_SMALL',
          message: 'Image is too small. Upload a clearer photo or a 300 DPI scan.'
        });
      }

      if (err.code === 'NO_DOCUMENT') {
        return res.status(422).json({
          code: 'NO_DOCUMENT',
          message: 'No passport photo page was found in this file.'
        });
      }

      if (err.code === 'AUTH_FAILED') {
        return res.status(502).json({
          code: 'AUTH_FAILED',
          message: err.message || 'AZAPI OCR authentication failed.'
        });
      }

      return res.status(502).json({
        code: 'OCR_FAILED',
        message: err.message || "The passport reader didn't respond. Try again."
      });
    }
  }
);

module.exports = router;
