import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { Card, CardContent } from './ui/card';

export default function FullCalendarBooking() {
  const [appointments, setAppointments] = useState([]);

  const fetchAppointments = async () => {
    try {
      const res = await API.get('/appointments');
      const events = res.data.map(app => ({
        id: app._id,
        title: `${app.client} - ${app.service}`,
        date: app.date
      }));
      setAppointments(events);
    } catch (err) {
      console.error('❌ Failed to load appointments:', err);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleDateClick = async (info) => {
    const client = prompt('Enter client name:');
    const service = prompt('Enter service name:');
    if (!client || !service) return;

    try {
      await API.post('/appointments', {
        client,
        service,
        date: info.dateStr,
        status: 'Scheduled'
      });
      fetchAppointments(); // Refresh calendar
    } catch (err) {
      console.error('❌ Failed to create appointment:', err);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Booking Calendar</h2>
      <Card>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            dateClick={handleDateClick}
            events={appointments}
            height="auto"
          />
        </CardContent>
      </Card>
    </div>
  );
}
