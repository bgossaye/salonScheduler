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

  const isReturning = !!client?.appointment;

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

  useEffect(() => {
    if (selectedDate && selectedService) {
      axios.get('/api/availability', {
        params: {
          date: selectedDate,
          serviceId: selectedService._id
        }
      }).then(res => {
        setAvailableTimes(res.data);
        setSelectedTime(null);
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
  const displayName = client?.firstName || client?.name || client?.phone || 'Guest';

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
        alert('✅ Appointment booked!');
        if (onBooked) onBooked(res.data);
      })
      .catch(err => alert('❌ Booking failed: ' + err.message));
  };

  return (
    <div className="p-4 space-y-4">
<h2 className="text-xl font-semibold mb-4">
  {isReturning ? `Welcome back, ${displayName}` : `Welcome, ${displayName}`}
</h2>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category Selection */}
        <div className="border rounded p-3 shadow">
          <h3 className="text-lg font-semibold mb-2">Select Category</h3>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedCategory === cat ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
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
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedService?._id === service._id ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              onClick={() => {
                setSelectedService(service);
                setAvailableTimes([]);
                setSelectedDate(null);
                setSelectedTime(null);
              }}
            >
              {service.name} – ${service.price}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar + Time (Only after service is selected) */}
      {selectedService && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Small Calendar */}
          <div className="border rounded p-3 shadow">
            <h3 className="text-lg font-semibold mb-2">Select a Date</h3>
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              dateClick={handleDateClick}
              selectable={true}
              height={300}
              contentHeight={300}
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

          {/* Available Times */}
          <div className="border rounded p-3 shadow">
            <h3 className="text-lg font-semibold mb-2">Available Times</h3>
            {selectedDate ? (
              availableTimes.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {availableTimes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedTime(t)}
                      className={`px-4 py-2 rounded border text-left ${
                        selectedTime === t ? 'bg-blue-500 text-white' : 'bg-gray-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No available times for this date.</p>
              )
            ) : (
              <p className="text-gray-400">Select a date first.</p>
            )}
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
