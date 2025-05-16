import React from 'react';
import ServiceSelector from '../components/ServiceSelector';

export default function ClientSchedule() {
  const client = JSON.parse(localStorage.getItem('client') || '{}');

  return (
    <div className="max-w-4xl mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Welcome {client?.firstName || 'Guest'}</h1>
      <ServiceSelector client={client} />
    </div>
  );
}

