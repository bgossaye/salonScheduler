const Appointment = require('../../models/Appointment');

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
    const { clientId, serviceId, service, date, time, duration } = req.body;

    if (!clientId || !service || !date || !time || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Just create and save the appointment — skip overlap check
    const appointment = new Appointment(req.body);
    const saved = await appointment.save();

    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create appointment:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
  req.params.id,
  req.body,
  { new: true }
)
  .populate('clientId')
  .populate('serviceId');


    res.json(appointment);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Appointment deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed' });
  }
};
