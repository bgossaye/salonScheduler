import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import axios from 'axios';
import { toast } from 'react-toastify';

export default function ServiceSelector({ client, onBooked }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);

  const displayName = client?.firstName || client?.name || 'Guest';

  // Load services and extract unique categories
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

  // Load available time slots whenever service & date are selected
  useEffect(() => {
    if (selectedService && selectedDate) {
      axios.get('/api/availability', {
        params: {
          date: selectedDate,
          serviceId: selectedService._id
        }
      }).then(res => {
        const data = res.data;
        const normalized = typeof data[0] === 'string'
          ? data.map(t => ({ time: t, available: true }))
          : data;

        setAvailableTimes(normalized);
        setSelectedTime(null);
      }).catch(err => {
        console.error('Error fetching availability:', err);
        setAvailableTimes([]);
      });
    }
  }, [selectedDate, selectedService]);

  const handleDateClick = (arg) => {
    const clicked = new Date(arg.dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (clicked >= now) {
      setSelectedDate(arg.dateStr);
    } else {
      toast.warning('You cannot book in the past.');
    }
  };

  const filteredServices = services.filter(s => s.category === selectedCategory);

  const handleSubmit = () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    const payload = {
      clientId: client._id,
      service: selectedService.name,
      serviceId: selectedService._id,
      date: selectedDate,
      time: selectedTime,
      duration: selectedService.duration,
      status: 'Booked'
    };

    axios.post('/api/appointments', payload)
      .then((res) => {
        toast.success('✅ Appointment booked!');
        if (onBooked) onBooked(res.data);
      })
      .catch(err => toast.error('❌ Booking failed: ' + err.message));
  };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category Selection */}
        <div className="border rounded p-3 shadow">
          <h3 className="text-lg font-semibold mb-2">Select Category</h3>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${
                selectedCategory === cat ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedService(null);
                setAvailableTimes([]);
                setSelectedDate(null);
                setSelectedTime(null);
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Service Selection */}
        <div className="border rounded p-3 shadow">
          <h3 className="text-lg font-semibold mb-2">Select Service</h3>
          {filteredServices.map((service) => (
            <button
              key={service._id}
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${
                selectedService?._id === service._id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => {
                setSelectedService(service);
                setAvailableTimes([]);
                setSelectedTime(null);

                // Set today's date as default when a service is selected
                const today = new Date().toISOString().split('T')[0];
                setSelectedDate(today);
              }}
            >
              {service.name} – ${service.price}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar + Time Slot Picker */}
      {selectedService && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Calendar */}
          <div className="border rounded p-3 shadow h-[300px]">
            <h3 className="text-lg font-semibold mb-2">Select a Date</h3>
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              dateClick={handleDateClick}
              selectable={true}
              initialDate={selectedDate}
              height={260}
              contentHeight={260}
              aspectRatio={1.35}
              headerToolbar={{
                left: 'prev,next',
                center: 'title',
                right: ''
              }}
            />
            {selectedDate && (
              <p className="mt-2 text-green-600">Selected: {selectedDate}</p>
            )}
          </div>

          {/* Time Slots */}
          <div className="border rounded p-3 shadow h-[300px] flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Available Times</h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {availableTimes.length > 0 ? (
                availableTimes.map(({ time, available }) => (
                  <button
                    key={time}
                    onClick={() => available && setSelectedTime(time)}
                    disabled={!available}
                    className={`w-full px-4 py-2 rounded border text-left transition ${
                      !available
                        ? 'bg-yellow-300 text-gray-800 cursor-not-allowed'
                        : selectedTime === time
                          ? 'bg-blue-600 text-white shadow font-semibold'
                          : 'bg-green-100 hover:bg-green-200'
                    }`}
                  >
                    {time}
                  </button>
                ))
              ) : (
                <p className="text-gray-500">No available times. Store may be closed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {selectedService && selectedDate && selectedTime && (
        <div className="flex justify-center mt-6">
          <button
            className="w-full max-w-sm bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded text-lg"
            onClick={handleSubmit}
          >
            Book Appointment
          </button>
        </div>
      )}
    </div>
  );
}
