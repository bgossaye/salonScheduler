import React, { useState } from 'react';
import ClientWelcome from './components/ClientWelcome';
import ClientDashboard from './components/ClientDashboard';

function App() {
  const [client, setClient] = useState(null);

  return (
    <div className="min-h-screen bg-gray-100">
      {!client ? (
        <ClientWelcome onClientLoaded={setClient} />
      ) : (
        <ClientDashboard client={client} />
      )}
    </div>
  );
}

export default App;
