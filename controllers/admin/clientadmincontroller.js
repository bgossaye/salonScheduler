const Client = require('../../models/client');
const Appointment = require('../../models/appointment');

// Get all clients with optional search
exports.getClients = async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const clients = await Client.find(query);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Update client profile
exports.updateClient = async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
  }
};

// Get full client info including last completed appointment
exports.getClientWithLastCompletedAppointment = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const lastCompleted = await Appointment.find({
      clientId: req.params.id,
      status: 'completed',
    })
      .sort({ date: -1 })
      .limit(1)
      .populate('serviceId');

    if (lastCompleted.length > 0) {
      const last = lastCompleted[0];
      client.lastCompletedAppointment = {
        date: last.date,
        service: last.serviceId?.name || 'Unknown',
      };
    }

    res.json(client);
  } catch (err) {
    console.error('❌ Failed to fetch client details:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get client details including appointment history (still used elsewhere)
exports.getClientDetails = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    const appointments = await Appointment.find({ clientId: req.params.id });
    res.json({ client, appointments });
  } catch (err) {
    res.status(400).json({ error: 'Client not found' });
  }
};

// Upload client profile photo
exports.uploadClientPhoto = async (req, res) => {
  try {
    const filePath = `/uploads/${req.file.filename}`;
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { profilePhoto: filePath },
      { new: true }
    );
    res.json({ url: client.profilePhoto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

// Create client
exports.createClient = async (req, res) => {
  try {
    const { firstName, lastName, phone, email } = req.body;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newClient = {
      firstName,
      lastName,
      phone,
      fullName: `${firstName} ${lastName}`,
    };

    if (email?.trim()) newClient.email = email.trim();

    const client = await new Client(newClient).save();
    res.status(201).json(client);
  } catch (err) {
    console.error("❌ Failed to create client:", err);
    res.status(500).json({ error: 'Server error creating client' });
  }
};

// Delete client
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedClient = await Client.findByIdAndDelete(id);

    if (!deletedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.status(200).json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
};

