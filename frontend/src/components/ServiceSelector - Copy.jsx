import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import axios from 'axios';

export default function ServiceSelector({ client, onBooked }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);

  useEffect(() => {
    axios.get('/api/services')
      .then(res => {
        const allServices = res.data;
        const cats = [...new Set(allServices.map(s => s.category))];
        setCategories(cats);
        setServices(allServices);
      })
      .catch(err => console.error('Error loading services:', err));
  }, []);

  // Fetch available time slots
  useEffect(() => {
    if (selectedDate && selectedService) {
      axios.get('/api/availability', {
        params: {
          date: selectedDate,
          serviceId: selectedService._id
        }
      }).then(res => {
        setAvailableTimes(res.data);
        setSelectedTime(null); // reset time when date/service changes
      }).catch(err => {
        console.error('Error fetching availability:', err);
        setAvailableTimes([]);
      });
    }
  }, [selectedDate, selectedService]);

  const handleDateClick = (arg) => {
    const clickedDate = new Date(arg.dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (clickedDate >= today) {
      setSelectedDate(arg.dateStr);
    }
  };

  const filteredServices = services.filter(s => s.category === selectedCategory);

  const handleSubmit = () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    const payload = {
      serviceId: selectedService._id,
      date: selectedDate,
      time: selectedTime,
      duration: selectedService.duration
    };

   axios.post('/api/appointments', payload)
  .then((res) => {
    alert('✅ Appointment booked!');
    if (onBooked) onBooked(res.data); // send booked appt back to parent
  })
  .catch(err => alert('❌ Booking failed: ' + err.message));

  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">

      {/* Calendar */}
      <div className="border rounded p-2 shadow">
        <h2 className="text-lg font-semibold mb-2">Choose Date</h2>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          dateClick={handleDateClick}
          selectable={true}
          height="auto"
        />
        {selectedDate && <p className="mt-2 text-green-600">Selected: {selectedDate}</p>}
      </div>

      {/* Categories */}
      <div className="border rounded p-2 shadow">
        <h2 className="text-lg font-semibold mb-2">Category</h2>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedCategory === cat ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => {
              setSelectedCategory(cat);
              setSelectedService(null);
              setAvailableTimes([]);
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Services */}
      <div className="border rounded p-2 shadow">
        <h2 className="text-lg font-semibold mb-2">Service</h2>
        {filteredServices.map((service) => (
          <button
            key={service._id}
            className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedService?._id === service._id ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            onClick={() => {
              setSelectedService(service);
              setAvailableTimes([]);
              setSelectedTime(null);
            }}
          >
            {service.name}
          </button>
        ))}
      </div>

      {/* Price + Time */}
      <div className="border rounded p-2 shadow flex flex-col justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-2">Price</h2>
          {selectedService ? (
            <div className="text-green-700 text-xl font-bold">${selectedService.price}</div>
          ) : (
            <p className="text-gray-500">Select a service</p>
          )}
        </div>

        {/* Time Dropdown */}
        {availableTimes.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Available Time</label>
            <select
              value={selectedTime || ''}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="" disabled>Select a time</option>
              {availableTimes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="col-span-1 md:col-span-4 flex justify-center mt-6">
        <button
          className="w-full max-w-sm bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded text-lg"
          onClick={handleSubmit}
          disabled={!selectedService || !selectedDate || !selectedTime}
        >
          Book Appointment
        </button>
      </div>
    </div>
  );
}
