const mongoose = require('mongoose');

const VisaLinkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Visa title/portal name is required'],
    trim: true
  },
  url: {
    type: String,
    required: [true, 'Visa portal URL is required'],
    trim: true
  },
  country: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    trim: true,
    default: 'Official Portal'
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

VisaLinkSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('VisaLink', VisaLinkSchema);
