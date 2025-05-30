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

// Get client details including appointment history
exports.getClientDetails = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    const appointments = await Appointment.find({ clientId: req.params.id });
    res.json({ client, appointments });
  } catch (err) {
    res.status(400).json({ error: 'Client not found' });
  }
};

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

    if (email) newClient.email = email;

    const client = await new Client(newClient).save();
    res.status(201).json(client);
  } catch (err) {
    console.error("❌ Failed to create client:", err);
    res.status(500).json({ error: 'Server error creating client' });
  }
};exports.deleteClient = async (req, res) => {
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

