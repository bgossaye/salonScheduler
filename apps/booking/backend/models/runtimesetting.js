const mongoose = require('mongoose');

const RuntimeSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    type: {
      type: String,
      enum: ['boolean', 'string', 'number', 'json'],
      default: 'string',
    },
    group: {
      type: String,
      default: 'General',
    },
    label: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    isAdvanced: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

RuntimeSettingSchema.statics.getByKey = async function getByKey(key) {
  return this.findOne({ key }).lean();
};

module.exports = mongoose.models.RuntimeSetting || mongoose.model('RuntimeSetting', RuntimeSettingSchema);
