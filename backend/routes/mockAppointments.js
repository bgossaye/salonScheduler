const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

let mockAppointments = [
  {
    id: '1',
    customer: 'Alice',
    service: 'Haircut',
    date: '2025-05-10T10:00:00Z',
    status: 'scheduled'
  },
  {
    id: '2',
    customer: 'Bob',
    service: 'Braiding',
    date: '2025-05-11T12:00:00Z',
    status: 'completed'
  }
];

router.get('/', (req, res) => res.json(mockAppointments));

router.post('/', (req, res) => {
  const newAppointment = { id: uuidv4(), ...req.body };
  mockAppointments.push(newAppointment);
  res.status(201).json(newAppointment);
});

router.put('/:id', (req, res) => {
  const index = mockAppointments.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).send('Not found');
  mockAppointments[index] = { ...mockAppointments[index], ...req.body };
  res.json(mockAppointments[index]);
});

router.delete('/:id', (req, res) => {
  mockAppointments = mockAppointments.filter(a => a.id !== req.params.id);
  res.status(204).send();
});

module.exports = router;
