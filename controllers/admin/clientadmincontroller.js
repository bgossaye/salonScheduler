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

exports.getClientDetails = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .select('firstName lastName phone email dob notes profilePhoto visitFrequency servicePreferences paymentInfo contactPreferences appointmentHistory');

        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const lastCompletedAppointment = await Appointment.findOne({
            clientId: req.params.id,
            status: 'completed',
        })
            .sort({ date: -1, time: -1 })
            .select('date service');

        res.json({
            _id: client._id,
            firstName: client.firstName,
            lastName: client.lastName,
            phone: client.phone,
            email: client.email,
            dob: client.dob,
            notes: client.notes,
            appointmentHistory: client.appointmentHistory,
            servicePreferences: client.servicePreferences,
            paymentInfo: client.paymentInfo,
            profilePhoto: client.profilePhoto,
            visitFrequency: client.visitFrequency,
            contactPreferences: {
                method: client.contactPreferences?.method,
                optInPromotions: client.contactPreferences?.optInPromotions,
                smsDisabled: client.contactPreferences?.smsDisabled,
                emailDisabled: client.contactPreferences?.emailDisabled
            },
            lastCompletedAppointment
        });

    } catch (err) {
        console.error('Error fetching client details:', err);
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
      const {
          firstName,
          lastName,
          phone,
          email,
          visitFrequency,
          servicePreferences,
          contactPreferences
      } = req.body;

    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newClient = {
      firstName,
      lastName,
        phone,
        ...(email && { email: email.trim() }),
        ...(visitFrequency && { visitFrequency }),
        ...(servicePreferences && { servicePreferences }),
        ...(contactPreferences && { contactPreferences })
    };

    if (email?.trim()) newClient.email = email.trim();
    if (visitFrequency?.trim()) newClient.visitFrequency = visitFrequency.trim();
    if (servicePreferences?.trim()) newClient.servicePreferences = servicePreferences.trim();

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

