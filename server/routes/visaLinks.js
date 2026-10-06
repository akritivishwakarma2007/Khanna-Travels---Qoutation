const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const VisaLink = require('../models/VisaLink');
const { requireAdminAuth } = require('../middleware/auth');

// Load full visa links list from server/visa-links.json
let DEFAULT_INITIAL_LINKS = [];
try {
  const jsonPath = path.join(__dirname, '..', 'visa-links.json');
  if (fs.existsSync(jsonPath)) {
    DEFAULT_INITIAL_LINKS = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }
} catch (err) {
  console.warn('Could not load server/visa-links.json:', err.message);
}

// In-memory fallback if MongoDB is in offline mode
let inMemoryLinks = [...DEFAULT_INITIAL_LINKS.map((item, idx) => ({
  _id: `mem_${Date.now()}_${idx}`,
  title: item.title,
  url: item.url,
  country: item.country || '',
  category: item.category || item.type || 'Visa portal',
  notes: item.notes || item.description || '',
  createdAt: new Date(),
  updatedAt: new Date()
}))];

function isDbConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function normalizeUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

async function autoSeedVisaLinksToDb() {
  if (!isDbConnected() || DEFAULT_INITIAL_LINKS.length === 0) return;
  try {
    for (const item of DEFAULT_INITIAL_LINKS) {
      if (!item.url || !item.url.trim()) continue;
      let cleanUrl = normalizeUrl(item.url);
      const title = (item.title || 'Visa Link').trim();
      const country = (item.country || '').trim();
      const category = (item.category || item.type || 'Visa portal').trim();
      const notes = (item.notes || item.description || '').trim();

      const existing = await VisaLink.findOne({
        $or: [{ url: cleanUrl }, { title: title }]
      });

      if (!existing) {
        await VisaLink.create({
          title,
          url: cleanUrl,
          country,
          category,
          notes
        });
      }
    }
  } catch (err) {
    console.error('Auto-seed visa links error:', err.message);
  }
}

// ── GET /api/visa-links — List all visa portal links ──────────────────────────
router.get('/', async (req, res) => {
  try {
    if (isDbConnected()) {
      let count = await VisaLink.countDocuments();
      if (count === 0 || count < DEFAULT_INITIAL_LINKS.length) {
        await autoSeedVisaLinksToDb();
      }
      const links = await VisaLink.find().sort({ country: 1, title: 1 });
      return res.json(links);
    } else {
      return res.json(inMemoryLinks);
    }
  } catch (err) {
    console.error('Error fetching visa links:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch visa links' });
  }
});

// ── POST /api/visa-links — Add new visa portal link (Admin Only) ──────────────
router.post('/', requireAdminAuth, async (req, res) => {
  try {
    const { title, url, country, category, notes } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Visa / Portal name is required' });
    }
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'Website URL is required' });
    }

    const cleanUrl = normalizeUrl(url);

    if (isDbConnected()) {
      const newLink = new VisaLink({
        title: title.trim(),
        url: cleanUrl,
        country: (country || '').trim(),
        category: (category || 'Official Portal').trim(),
        notes: (notes || '').trim()
      });
      await newLink.save();
      return res.status(201).json(newLink);
    } else {
      const newLink = {
        _id: `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        title: title.trim(),
        url: cleanUrl,
        country: (country || '').trim(),
        category: (category || 'Official Portal').trim(),
        notes: (notes || '').trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      inMemoryLinks.unshift(newLink);
      return res.status(201).json(newLink);
    }
  } catch (err) {
    console.error('Error creating visa link:', err);
    res.status(500).json({ error: err.message || 'Failed to save visa link' });
  }
});

// ── PUT /api/visa-links/:id — Update visa portal link (Admin Only) ────────────
router.put('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { title, url, country, category, notes } = req.body;
    const { id } = req.params;

    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (url !== undefined) updateData.url = normalizeUrl(url);
    if (country !== undefined) updateData.country = (country || '').trim();
    if (category !== undefined) updateData.category = (category || 'Official Portal').trim();
    if (notes !== undefined) updateData.notes = (notes || '').trim();
    updateData.updatedAt = new Date();

    if (isDbConnected()) {
      const updated = await VisaLink.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: 'Visa link not found' });
      return res.json(updated);
    } else {
      const index = inMemoryLinks.findIndex(l => String(l._id) === String(id));
      if (index === -1) return res.status(404).json({ error: 'Visa link not found' });
      inMemoryLinks[index] = { ...inMemoryLinks[index], ...updateData };
      return res.json(inMemoryLinks[index]);
    }
  } catch (err) {
    console.error('Error updating visa link:', err);
    res.status(500).json({ error: err.message || 'Failed to update visa link' });
  }
});

// ── DELETE /api/visa-links/:id — Delete visa portal link (Admin Only) ─────────
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      const deleted = await VisaLink.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ error: 'Visa link not found' });
      return res.json({ success: true, deletedId: id });
    } else {
      const initialLen = inMemoryLinks.length;
      inMemoryLinks = inMemoryLinks.filter(l => String(l._id) !== String(id));
      if (inMemoryLinks.length === initialLen) {
        return res.status(404).json({ error: 'Visa link not found' });
      }
      return res.json({ success: true, deletedId: id });
    }
  } catch (err) {
    console.error('Error deleting visa link:', err);
    res.status(500).json({ error: err.message || 'Failed to delete visa link' });
  }
});

module.exports = router;
