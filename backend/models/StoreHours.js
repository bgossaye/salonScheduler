const mongoose = require('mongoose');
const StoreHoursSchema = new mongoose.Schema({
  day: { type: String, required: true },
  open: { type: String },
  close: { type: String }
});
module.exports = mongoose.model('StoreHours', StoreHoursSchema);