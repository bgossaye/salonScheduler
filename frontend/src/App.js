import React, { useState } from 'react';
import ClientWelcome from './components/ClientWelcome';
import ClientDashboard from './components/ClientDashboard';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


function App() {
  const [client, setClient] = useState(null);

  return (
    <div className="min-h-screen bg-gray-100">
    <ToastContainer position="top-center" />

      {!client ? (
        <ClientWelcome onClientLoaded={setClient} />
      ) : (
        <ClientDashboard client={client} />
      )}
    </div>

  );
}

export default App;
