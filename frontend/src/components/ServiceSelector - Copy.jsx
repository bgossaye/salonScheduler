// Finalized ServiceSelector.jsx with frozen top banner and preserved layout
import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/RSlogo.jpg';

export default function ServiceSelector({ client }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showAddOnModal, setShowAddOnModal] = useState(false);

  useEffect(() => {
    API.get('/services')
      .then(({ data }) => {
        setServices(data);
        const ordered = ['Color', 'Haircut', 'Style', 'Texturizing', 'Treatment', 'Hair-Removal', 'Add-ons'];
        const unique = [...new Set(data.map(s => s.category))];
        const sorted = ordered.filter(c => unique.includes(c));
        setCategories(sorted);
      })
      .catch(err => toast.error('Failed to load services'));
  }, []);

  useEffect(() => {
    const edit = sessionStorage.getItem('editingAppointment');
    if (edit) setEditingAppointment(JSON.parse(edit));
  }, []);

  useEffect(() => {
    if (selectedService && selectedDate) {
      API.get('/availability', {
        params: { date: selectedDate, serviceId: selectedService._id }
      })
        .then(({ data }) => {
          const mapped = data.map(t => ({ time: t.time, available: t.status === 'free' }));
          setAvailableTimes(mapped);
        })
        .catch(() => setAvailableTimes([]));
    }
  }, [selectedService, selectedDate]);

  const handleServiceClick = async (service) => {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
    try {
      const { data } = await API.get(`/services/${service._id}/addons`);
      setAddOns(data);
      if (data.length > 0) {
        setShowAddOnModal(true);
      }
    } catch {
      setAddOns([]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    const duration = selectedService.duration + selectedAddOns.reduce((sum, a) => sum + (a.duration || 0), 0);
    const payload = {
      clientId: client._id,
      service: selectedService.name,
      serviceId: selectedService._id,
      date: selectedDate,
      time: selectedTime,
      duration,
      addOns: selectedAddOns.map(a => a._id),
      status: 'Booked'
    };

    try {
      if (editingAppointment?._id) {
        await API.delete(`/appointments/${editingAppointment._id}`);
      }
      await API.post('/appointments', payload);
      sessionStorage.removeItem('editingAppointment');
      window.location.href = '/booking/dashboard';
    } catch (err) {
      toast.error('Failed to save appointment');
    }
  };

  const handleDateClick = ({ dateStr }) => {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr >= today) setSelectedDate(dateStr);
    else toast.warning('Cannot book in the past');
  };

  const handleNotYou = () => {
    localStorage.removeItem('client');
    sessionStorage.removeItem('clientData');
    window.location.href = '/booking/welcome';
  };

  return (
    <div className="p-2 relative max-w-screen-md mx-auto">
      <div className="sticky top-0 z-40 bg-white border-b py-3 px-4 shadow-sm flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-gray-700">
            Welcome, {client?.fullName || 'Client'}<br />
            <button onClick={handleNotYou} className="text-blue-500 underline text-xs">It's not you?</button>
          </div>
          <img src={logo} alt="Logo" className="h-8 w-8" />
        </div>
        <div className="text-center font-medium text-sm text-gray-800">
          {selectedService?.name || 'Select a Service'}
          {selectedDate ? ` → ${selectedDate}` : ''}
          {selectedTime ? ` @ ${selectedTime}` : ''}
        </div>
        {editingAppointment && (
          <div className="text-center text-xs text-yellow-600">
            <span className="font-semibold">Original:</span> {editingAppointment.service} → {editingAppointment.date} @ {editingAppointment.time}
          </div>
        )}
      </div>

      {showAddOnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h2 className="text-lg font-bold mb-2">Suggested Add-ons</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {addOns.map(add => (
                <label key={add._id} className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={selectedAddOns.includes(add)}
                    onChange={() => {
                      setSelectedAddOns(prev => prev.includes(add)
                        ? prev.filter(a => a !== add)
                        : [...prev, add]
                      );
                    }}
                  />
                  {add.name}
                </label>
              ))}
            </div>
            <button
              onClick={() => setShowAddOnModal(false)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
  <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-2 w-max">
          <div className="text-sm font-semibold">Category</div>
          {categories.map(cat => (
            <button
              key={cat}
              className={`px-2 py-1 text-sm rounded whitespace-nowrap ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedService(null);
                setSelectedTime(null);
              }}
            >{cat}</button>
          ))}
        </div>

        <div className="flex flex-col gap-2 w-max">
          <div className="text-sm font-semibold">Services</div>
          {services.filter(s => s.category === selectedCategory).map(service => (
            <button
              key={service._id}
              className={`px-2 py-1 text-sm rounded whitespace-nowrap ${selectedService?._id === service._id ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
              onClick={() => handleServiceClick(service)}
            >{service.name}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-row gap-4 items-start mt-4">
        <div className="border rounded shadow p-1 w-[300px]">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height={300}
            contentHeight={300}
            aspectRatio={1}
            dayMaxEventRows={false}
            dateClick={handleDateClick}
            headerToolbar={{ left: '', center: 'title', right: '' }}
            dayHeaderFormat={{ weekday: 'narrow' }}
            dayCellClassNames={({ date }) => {
              const d = new Date();
              const iso = date.toISOString().split('T')[0];
              const isToday = iso === new Date().toISOString().split('T')[0];
              const isSelected = selectedDate === iso;
              return [
                'border border-gray-300 text-sm text-center font-medium',
                isToday ? 'bg-green-200' : '',
                isSelected ? 'bg-orange-500 text-white' : ''
              ];
            }}
          />
        </div>

        <div className="overflow-y-auto max-h-[300px] space-y-1 w-40">
          {availableTimes.map(({ time, available }) => (
            <button
              key={time}
              disabled={!available}
              className={`w-full px-2 py-1 text-sm text-left rounded ${
                !available ? 'bg-yellow-300 text-gray-700 cursor-not-allowed' :
                selectedTime === time ? 'bg-blue-600 text-white' : 'bg-green-100 hover:bg-green-200'
              }`}
              onClick={() => available && setSelectedTime(time)}
            >{time}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={handleSubmit}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Book Appointment
        </button>
      </div>

      <img src={logo} alt="Rakie Salon Logo" className="fixed bottom-4 right-4 w-16 h-16 opacity-20 pointer-events-none" />
    
    </div>
  );
}
