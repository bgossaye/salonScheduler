const express = require('express');
const router = express.Router();
const Client = require('../../models/client');

// GET /api/clients?phone=...
router.get('/', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const client = await Client.findOne({ phone });
    res.json(client || null);
  } catch (err) {
    console.error('Error fetching client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/all
router.get('/all', async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (err) {
    console.error('Error fetching all clients:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  const {
    fullName,
    phone,
    email,
    dob,
    contactPreferences,
    appointmentHistory,
    servicePreferences,
    notes,
    paymentInfo,
    profilePhoto,
    visitStats
  } = req.body;

  if (!fullName || !phone) {
    return res.status(400).json({ error: 'Missing required client fields' });
  }

  try {
    const client = new Client({
      fullName,
      phone,
      email,
      dob,
      contactPreferences,
      appointmentHistory,
      servicePreferences,
      notes,
      paymentInfo,
      profilePhoto,
      visitStats
    });

    await client.save();
    res.status(201).json(client);
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  try {
    const updated = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating client:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
