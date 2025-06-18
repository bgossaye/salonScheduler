const Appointment = require('../../models/appointment');
const sendSMS = require('../../utils/sendSMS');

exports.getAppointments = async (req, res) => {
  try {
    const { date, status, client } = req.query;
    const query = {};

    if (date) query.date = date;
    if (status) query.status = status;
    if (client) {
      query.$or = [
        { clientName: { $regex: client, $options: 'i' } },
        { clientPhone: { $regex: client, $options: 'i' } }
      ];
    }

    // ✅ Populate client and service
    const appointments = await Appointment.find(query)
  .populate('clientId')     // ✅ correct field
  .populate('serviceId') 
      .populate('addOns') // ✅ this line ensures the add-ons are fully loaded
      .sort({ date: 1, time: 1 });

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createAppointment = async (req, res) => {
  try {
console.log('controller createAppointment');

    const { clientId, serviceId, service, date, time, duration } = req.body;

    if (!clientId || !service || !date || !time || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Just create and save the appointment — skip overlap check
    const appointment = new Appointment(req.body);
const saved = await appointment.save();

// 🔁 Now populate the saved appointment before sending SMS
const populated = await Appointment.findById(saved._id).populate('clientId');

console.log('sendSMS confirmation');
await sendSMS('confirmation', populated);

res.status(201).json(saved);

  } catch (err) {
    console.error('❌ Failed to create appointment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...otherFields } = req.body;

    const updateFields = { status, ...otherFields };

    const updated = await Appointment.findByIdAndUpdate(id, updateFields, {
      new: true,
    }).populate('clientId');

    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (status) {
      const sendSMS = require('../../utils/sendSMS');
      await sendSMS(status, updated); // sendSMS maps it to template internally
    }

    res.json(updated);
  } catch (err) {
    console.error('❌ Update failed:', err);
    res.status(500).json({ message: 'Failed to update appointment' });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {

    const appt = await Appointment.findById(req.params.id).populate('clientId');
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    await Appointment.findByIdAndDelete(req.params.id);

    res.json({ message: 'Appointment deleted and client notified (if opted in)' });
  } catch (err) {
    console.error('❌ Failed to delete appointment:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
};


