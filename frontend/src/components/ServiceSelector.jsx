import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { toast } from 'react-toastify';
import ScheduleConfirmationModal from './ScheduleConfirmationModal';

export default function ServiceSelector({ client, onBooked }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [suggestedAddOns, setSuggestedAddOns] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [showAddOnModal, setShowAddOnModal] = useState(false);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const { data } = await API.get('/services');
        setServices(data);
        const uniqueCategories = [...new Set(data.map(s => s.category))];
        setCategories(uniqueCategories);
      } catch (err) {
        console.error('Failed to load services:', err);
      }
    };
    fetchServices();
  }, []);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!selectedService || !selectedDate) return;
      try {
        const { data } = await API.get('/availability', {
          params: { date: selectedDate, serviceId: selectedService._id }
        });
        const normalized = Array.isArray(data) && data.length
          ? data.map(({ time, status }) => ({
              time,
              available: status === 'free'
            }))
          : [];
        setAvailableTimes(normalized);
        setSelectedTime(null);
      } catch (err) {
        console.error('Error fetching availability:', err);
        setAvailableTimes([]);
      }
    };
    fetchAvailability();
  }, [selectedService, selectedDate]);

  const handleDateClick = ({ dateStr }) => {
    const clicked = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (clicked >= today) setSelectedDate(dateStr);
    else toast.warning('You cannot book in the past.');
  };

  const filteredServices = services.filter(s => s.category === selectedCategory);

  const handleServiceSelect = async (service) => {
    setSelectedService(service);
    setAvailableTimes([]);
    setSelectedTime(null);
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);

    try {
      const { data } = await API.get(`/services/${service._id}/addons`);
      if (data?.length) {
        setSuggestedAddOns(data);
        setShowAddOnModal(true);
      } else {
        setSuggestedAddOns([]);
        setSelectedAddOns([]);
      }
    } catch (err) {
      console.error('Error fetching add-ons:', err);
      setSuggestedAddOns([]);
    }
  };

  const handleAddOnConfirm = (selectedIds) => {
    const matchedAddOns = suggestedAddOns.filter(a => selectedIds.includes(a._id));
    setSelectedAddOns(matchedAddOns);
    setShowAddOnModal(false);
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    const totalAddOnDuration = selectedAddOns.reduce((sum, addon) => sum + (addon.duration || 0), 0);
    const totalDuration = selectedService.duration + totalAddOnDuration;
    const serviceSummary = selectedService.name + (selectedAddOns.length ? ' + ' + selectedAddOns.map(a => a.name).join(', ') : '');

    try {
      const payload = {
        clientId: client._id,
        service: serviceSummary,
        serviceId: selectedService._id,
        date: selectedDate,
        time: selectedTime,
        duration: totalDuration,
        addOns: selectedAddOns.map(a => a._id),
        status: 'Booked'
      };

      const { data } = await API.post('/appointments', payload);
      toast.success('✅ Appointment booked!');
      if (onBooked) onBooked(data);
    } catch (err) {
      toast.error('❌ Booking failed: ' + err.message);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3 shadow">
          <h3 className="text-lg font-semibold mb-2">Select Category</h3>
          {categories.map(cat => (
            <button
              key={cat}
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedCategory === cat ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
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

        <div className="border rounded p-3 shadow">
          <h3 className="text-lg font-semibold mb-2">Select Service</h3>
          {filteredServices.map(service => (
            <button
              key={service._id}
              className={`w-full text-left px-4 py-2 rounded mb-2 text-sm md:text-base ${selectedService?._id === service._id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              onClick={() => handleServiceSelect(service)}
            >
              {service.name} – ${service.price}
            </button>
          ))}
        </div>
      </div>

      {selectedService && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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
              headerToolbar={{ left: 'prev,next', center: 'title', right: '' }}
            />
            {selectedDate && (
              <p className="mt-2 text-green-600">Selected: {selectedDate}</p>
            )}
          </div>

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

      {showAddOnModal && (
        <ScheduleConfirmationModal
          suggestedAddOns={suggestedAddOns}
          onClose={() => setShowAddOnModal(false)}
          onConfirm={handleAddOnConfirm}
        />
      )}
    </div>
  );
}
