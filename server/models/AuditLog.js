const mongoose = require('mongoose');
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    action: {
      type: String,
      enum: ['view', 'resume', 'delete', 'issue', 'save', 'extend'],
      required: true,
      index: true
    },
    recordType: {
      type: String,
      enum: ['saved_quote', 'policy'],
      required: true,
      index: true
    },
    recordId: {
      type: String,
      required: true,
      index: true
    },
    agentId: {
      type: String,
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false
  }
);

AuditLogSchema.index({ recordType: 1, recordId: 1, timestamp: -1 });
AuditLogSchema.index({ agentId: 1, timestamp: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
