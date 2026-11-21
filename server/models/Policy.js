const mongoose = require('mongoose');
const { Schema } = mongoose;

const PolicySchema = new Schema(
  {
    policyNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    agentId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    savedQuoteId: {
      type: String,
      trim: true,
      default: null
    },
    quoteDetails: {
      quoteId: { type: String, trim: true },
      plan: { type: String, trim: true },
      insurer: { type: String, trim: true },
      premium: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
      destination: { type: String, trim: true },
      travelStart: { type: String, trim: true },
      travelEnd: { type: String, trim: true },
      coverage: { type: Number },
      isGroup: { type: Boolean, default: false }
    },
    // Verified traveller details (encrypted at rest for security/privacy)
    travellersEncrypted: {
      type: String,
      default: null
    },
    // Non-PII traveller summary for quick search & display
    travellerSummary: {
      primaryName: { type: String, trim: true },
      passportNumber: { type: String, trim: true },
      count: { type: Number, default: 1 }
    },
    proposer: {
      name: { type: String, trim: true },
      passportNumber: { type: String, trim: true },
      dob: { type: String, trim: true },
      relationship: { type: String, trim: true }
    },
    nominee: {
      name: { type: String, trim: true },
      relationship: { type: String, trim: true }
    },
    contact: {
      email: { type: String, trim: true },
      mobile: { type: String, trim: true }
    },
    address: {
      addressLine: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pinCode: { type: String, trim: true },
      country: { type: String, default: 'India', trim: true }
    },
    entryMethod: {
      type: String,
      enum: ['ocr', 'manual'],
      default: 'ocr'
    },
    overrides: [
      {
        field: { type: String },
        quoteValue: { type: Schema.Types.Mixed },
        passportValue: { type: Schema.Types.Mixed },
        confirmedBy: { type: String },
        confirmedAt: { type: Date }
      }
    ],
    documentUrl: {
      type: String,
      trim: true
    },
    // By default false/empty. Only if STORE_KYC_DOCUMENTS=true is enabled
    kycDocuments: [
      {
        filename: String,
        documentType: String,
        storedAt: Date,
        encryptedRef: String
      }
    ]
  },
  {
    timestamps: true
  }
);

PolicySchema.index({ agentId: 1, issuedAt: -1 });
PolicySchema.index({ 'travellerSummary.primaryName': 'text', 'travellerSummary.passportNumber': 'text', policyNumber: 'text' });
PolicySchema.index({ 'contact.mobile': 1 });

module.exports = mongoose.models.Policy || mongoose.model('Policy', PolicySchema);
