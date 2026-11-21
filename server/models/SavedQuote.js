const mongoose = require('mongoose');
const { Schema } = mongoose;

const SavedQuoteSchema = new Schema(
  {
    quoteId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    agentId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: ['saved', 'applied'],
      default: 'saved',
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // MongoDB TTL index: auto-deletes record when expiresAt is reached
    },
    quote: {
      quoteId: { type: String, trim: true },
      plan: { type: String, trim: true },
      insurer: { type: String, trim: true },
      premium: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
      destination: { type: String, trim: true },
      travelStart: { type: String, trim: true },
      travelEnd: { type: String, trim: true },
      travellersCount: { type: Number, default: 1 },
      coverage: { type: Number },
      coverageSummary: { type: String, trim: true },
      isGroup: { type: Boolean, default: false }
    },
    customer: {
      name: { type: String, trim: true, default: '' },
      dob: { type: String, trim: true, default: '' },
      mobile: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' }
    },
    // Application-level AES-256-GCM encrypted string: extracted passport fields ONLY, NEVER file/image
    passportEncrypted: {
      type: String,
      default: null
    },
    // For group quotes: AES-256-GCM encrypted traveller table data, NEVER files/images
    groupTravellersEncrypted: {
      type: String,
      default: null
    },
    flowStep: {
      type: String,
      enum: ['passport', 'quotes', 'policy details', 'review'],
      default: 'quotes'
    },
    extendedOnce: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Compound index for agent list queries
SavedQuoteSchema.index({ agentId: 1, expiresAt: 1, createdAt: -1 });

module.exports = mongoose.models.SavedQuote || mongoose.model('SavedQuote', SavedQuoteSchema);
