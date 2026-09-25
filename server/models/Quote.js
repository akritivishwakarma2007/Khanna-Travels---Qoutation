const mongoose = require('mongoose');
const { Schema } = mongoose;

const QuoteSchema = new Schema(
  {
    quoteReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    customerName: {
      type: String,
      default: 'Customer',
      trim: true
    },
    dob: {
      type: String,
      required: true
    },
    age: {
      type: Number,
      required: true
    },
    departureCountry: {
      type: String,
      default: 'India',
      trim: true
    },
    arrivalCountry: {
      type: String,
      default: '',
      trim: true
    },
    travellingCountry: {
      type: String,
      default: '',
      trim: true
    },
    departureDate: {
      type: String,
      required: true
    },
    returnDate: {
      type: String,
      required: true
    },
    travelDays: {
      type: Number,
      required: true
    },
    coverageRequested: {
      type: Number,
      default: 50000
    },
    region: {
      type: String,
      required: true,
      enum: ['Excluding', 'Including']
    },
    medicalOption: {
      type: String,
      default: 'all'
    },
    durationOption: {
      type: String,
      default: 'all'
    },
    resultsSummary: {
      totalCompaniesMatched: { type: Number, default: 0 },
      lowestPremium: { type: Number, default: null },
      highestPremium: { type: Number, default: null },
      averagePremium: { type: Number, default: null }
    },
    selectedPlan: {
      companyName: { type: String, default: null },
      planName: { type: String, default: null },
      coverage: { type: Number, default: null },
      region: { type: String, default: null },
      premium: { type: Number, default: null }
    },
    selectedPlans: [
      {
        companyName: { type: String },
        planName: { type: String },
        coverage: { type: Number },
        region: { type: String },
        premium: { type: Number },
        currency: { type: String, default: 'INR' },
        benefits: { type: String },
        ageFrom: { type: Number },
        ageTo: { type: Number },
        daysFrom: { type: Number },
        daysTo: { type: Number },
        isBestPrice: { type: Boolean, default: false }
      }
    ],
    status: {
      type: String,
      enum: ['Compared', 'Selected'],
      default: 'Compared',
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Quote', QuoteSchema);
