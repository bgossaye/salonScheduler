const Appointment = require('../../models/Appointment');
const Service = require('../../models/Service');
const Client = require('../../models/Client');

exports.getSummaryReport = async (req, res) => {
  try {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const totalAppointments = await Appointment.countDocuments({ date: { $gte: monthStart } });
    const completedAppointments = await Appointment.countDocuments({ status: 'completed', date: { $gte: monthStart } });
    const canceledAppointments = await Appointment.countDocuments({ status: 'canceled', date: { $gte: monthStart } });

    const services = await Service.find();
    const appointments = await Appointment.find({ date: { $gte: monthStart } });

    const revenueByService = services.map(service => {
      const relevant = appointments.filter(a => a.serviceName === service.name);
      const revenue = relevant.length * (service.price || 0);
      return { service: service.name, revenue };
    });

    const topClients = await Client.aggregate([
      { $lookup: { from: 'appointments', localField: '_id', foreignField: 'clientId', as: 'appointments' }},
      { $project: { name: { $concat: ['$firstName', ' ', '$lastName'] }, visits: { $size: '$appointments' } }},
      { $sort: { visits: -1 }},
      { $limit: 5 }
    ]);

    res.json({
      totalAppointments,
      completedAppointments,
      canceledAppointments,
      revenueByService,
      topClients
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load report' });
  }
};