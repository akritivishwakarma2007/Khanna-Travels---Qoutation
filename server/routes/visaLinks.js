const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const VisaLink = require('../models/VisaLink');
const { requireAdminAuth } = require('../middleware/auth');

// Default initial official visa portals
const DEFAULT_INITIAL_LINKS = [
  {
    title: 'Dubai / UAE Official eVisa (ICP Smart Services)',
    url: 'https://smartservices.icp.gov.ae/',
    country: 'UAE',
    category: 'Official eVisa',
    notes: 'Official Federal Authority for Identity, Citizenship, Customs & Port Security (Tourist 30/60 Days)'
  },
  {
    title: 'Dubai GDRFA eVisa Portal (General Directorate)',
    url: 'https://www.gdrfad.gov.ae/',
    country: 'UAE',
    category: 'Official eVisa',
    notes: 'Dubai entry permit and residency visa application & status verification'
  },
  {
    title: 'United States Visa Appointment Service (US Travel Docs / CGI)',
    url: 'https://www.ustraveldocs.com/',
    country: 'USA',
    category: 'Appointment Portal',
    notes: 'Official US Visa appointment scheduling and fee payment for India'
  },
  {
    title: 'US DS-160 Non-Immigrant Visa Application (CEAC)',
    url: 'https://ceac.state.gov/genniv/',
    country: 'USA',
    category: 'Official Application',
    notes: 'Consular Electronic Application Center — submit nonimmigrant visa application'
  },
  {
    title: 'UK Visa & Immigration Official Portal (GOV.UK)',
    url: 'https://www.gov.uk/apply-to-come-to-the-uk',
    country: 'United Kingdom',
    category: 'Official Portal',
    notes: 'Official British Government portal for UK standard visitor visa applications'
  },
  {
    title: 'Schengen Visa Booking & Tracking (VFS Global)',
    url: 'https://visa.vfsglobal.com/',
    country: 'Schengen / Europe',
    category: 'VFS Application',
    notes: 'Official biometric appointment booking for France, Germany, Italy, Switzerland, Spain, etc.'
  },
  {
    title: 'Thailand Official eVisa Portal',
    url: 'https://www.thaievisa.go.th/',
    country: 'Thailand',
    category: 'Official eVisa',
    notes: 'Official Ministry of Foreign Affairs of the Kingdom of Thailand online visa system'
  },
  {
    title: 'Singapore Immigration & Checkpoints Authority (ICA e-Services)',
    url: 'https://www.ica.gov.sg/',
    country: 'Singapore',
    category: 'Official Portal',
    notes: 'SG Arrival Card with electronic health declaration and eVisa processing'
  }
];

// In-memory fallback if MongoDB is in offline/demo mode
let inMemoryLinks = [...DEFAULT_INITIAL_LINKS.map((item, idx) => ({
  _id: `mem_${Date.now()}_${idx}`,
  ...item,
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

// ── GET /api/visa-links — List all visa portal links ──────────────────────────
router.get('/', async (req, res) => {
  try {
    if (isDbConnected()) {
      let count = await VisaLink.countDocuments();
      if (count === 0) {
        // Seed default verified portals if DB is empty
        await VisaLink.insertMany(DEFAULT_INITIAL_LINKS);
      }
      const links = await VisaLink.find().sort({ country: 1, title: 1 });
      return res.json(links);
    } else {
      // In-memory fallback
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
