import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

export default function AppointmentManager() {
  const [appointments, setAppointments] = useState([]);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = () => {
    axios.get('/api/appointments')
      .then(res => setAppointments(res.data))
      .catch(err => console.error('Failed to fetch appointments:', err));
  };

  const handleAdd = async (formData) => {
  const newAppointment = {
    clientId: formData.clientId,
    service: formData.service,
    serviceId: formData.serviceId,
    date: formData.date,
    time: formData.time,
    duration: formData.duration,
    addOns: formData.addOns, // array of IDs
    status: formData.status || 'Booked'
  };

  try {
    await axios.post('/api/appointments', newAppointment);
    fetchAppointments();
  } catch (err) {
    console.error('Add failed:', err);
  }
};


  const handleUpdate = async (id, newStatus) => {
    try {
      await axios.put(`/api/appointments/${id}`, { status: newStatus });
      fetchAppointments();
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const handleCancel = async (id) => {
    try {
      await axios.delete(`/api/appointments/${id}`);
      fetchAppointments();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-bold">Appointments</h2>
        <Button onClick={handleAdd}>+ Add Appointment</Button>
      </div>

      {appointments.map(app => (
        <Card key={app._id} className="mb-2">
          <CardContent className="flex justify-between items-center">
            <div>
              <p><strong>{app.client}</strong></p>
              <p>{app.service} - {new Date(app.date).toLocaleString()}</p>
              <p>Status: {app.status}</p>
            </div>
            <div className="space-x-2">
              <Button onClick={() => handleUpdate(app._id, 'Completed')}>Mark as Completed</Button>
              <Button variant="destructive" onClick={() => handleCancel(app._id)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}