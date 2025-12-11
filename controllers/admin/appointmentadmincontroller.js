const Appointment = require('../../models/appointment');
const sendSMS = require('../../utils/sendSMS');

// GET /api/appointments/client/:id  (client dashboard: list this client's appts)
exports.getAppointmentsForClient = async (req, res) => {
  try {
    const list = await Appointment.find({ clientId: req.params.id })
      .populate('clientId')
      .populate('serviceId')
      .sort({ date: 1, time: 1 })
      .lean();

    res.json(list || []);
  } catch (err) {
    console.error('❌ getAppointmentsForClient failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

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

 setImmediate(async () => {
  try {
    const populated = await Appointment.findById(saved._id)
      .populate('clientId')
      .populate('serviceId');

    // Compose a startTime from separate date+time (ISO-friendly)
    const startTime = new Date(`${populated.date}T${populated.time}`);

   const smsType = saved.status === 'pending' ? 'pending' : 'confirmation';

    await sendSMS(smsType , {
      // minimal context for tokens
      phone: populated?.clientId?.phone,
      client: { firstName: populated?.clientId?.firstName, lastName: populated?.clientId?.lastName },
      service: populated?.serviceId?.name || populated?.service,
      startTime,
      // keep the whole appt too, in case sendSMS reads extra fields
      ...populated.toObject?.() || populated
    });
  } catch (e) {
    console.error('[notify] confirmation failed', e);
  }
});


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

        // Send response FIRST to avoid blocking or duplicate headers
        res.json(updated);

        // Send SMS in the background
      setImmediate(() => {
        // normalize to correct spelling for template key
        const statusMap = { canceled: 'cancellation', cancelation: 'cancellation' };
        const key = statusMap[status] || status; // e.g., 'pending','confirmation','cancellation','noshow'

        const startTime = new Date(`${updated.date}T${updated.time}`);
        sendSMS(key, {
          phone: updated?.clientId?.phone,
          client: { firstName: updated?.clientId?.firstName, lastName: updated?.clientId?.lastName },
          service: updated?.serviceId?.name || updated?.service,
          startTime,
          ...updated.toObject?.() || updated
        }).catch(e => console.error('[notify] status update failed', e));
      });

    } catch (err) {
        console.error('❌ Update failed:', err);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to update appointment' });
        }
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


