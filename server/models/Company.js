const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Rate ────────────────────────────────────────────────────────────────────
const RateSchema = new Schema({
  coverage: {
    type: Number,
    required: true,
    enum: [50000, 100000, 200000, 250000, 500000, 750000, 1000000]
  },
  region: {
    type: String,
    required: true,
    trim: true
  },
  ageFrom:  { type: Number, required: true },
  ageTo:    { type: Number, required: true },
  daysFrom: { type: Number, required: true },
  daysTo:   { type: Number, required: true },
  premium:  { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  updatedAt: { type: Date, default: Date.now }
});

// ─── Plan ────────────────────────────────────────────────────────────────────
const PlanSchema = new Schema(
  {
    planName: { type: String, required: true, trim: true },
    productLine: { type: String, trim: true },
    medicalCover: { type: Boolean, default: false },
    policyType: { type: String, default: 'new' },
    isActive: { type: Boolean, default: true },
    rates: [RateSchema]
  },
  { timestamps: true }
);

// ─── Company ─────────────────────────────────────────────────────────────────
const CompanySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true, trim: true },
    isActive: { type: Boolean, default: true },
    plans: [PlanSchema]
  },
  { timestamps: true }
);

// Indexes for query performance
CompanySchema.index({ 'plans.rates.coverage': 1, 'plans.rates.region': 1 });

module.exports = mongoose.model('Company', CompanySchema);
