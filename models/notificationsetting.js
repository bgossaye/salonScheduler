const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, default: 'notificationsetting_singleton' },
  masterNotificationsEnabled: { type: Boolean, default: true },
}, { _id: false, versionKey: false, timestamps: true });

schema.statics.getSingleton = function () {
  const id = 'notificationsetting_singleton';
  return this.findOneAndUpdate(
    { _id: id }, { $setOnInsert: { _id: id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports =
  mongoose.models.NotificationSetting
  || mongoose.model('NotificationSetting', schema, 'notificationsetting');
