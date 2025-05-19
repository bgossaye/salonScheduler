const Appointment = require('../../models/appointment');
const { Parser } = require('json2csv');

exports.exportAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find().lean();
    const fields = ['date', 'time', 'clientName', 'clientPhone', 'serviceName', 'status'];
    const parser = new Parser({ fields });
    const csv = parser.parse(appointments);
    
    res.header('Content-Type', 'text/csv');
    res.attachment('appointments.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
};