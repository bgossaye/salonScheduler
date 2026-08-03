import { useEffect } from 'react';

export default function SmsBookingRedirect() {
  useEffect(() => {
    const destination = `/booking${window.location.search}${window.location.hash}`;
    window.location.replace(destination);
  }, []);

  return <p className="p-8">Opening your Rakie Salon appointment…</p>;
}
