// apps/booking/frontend/src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const pathname =
  (typeof window !== 'undefined' && window.location && window.location.pathname) || '/';

const BASENAME =
  (window.__ENV && window.__ENV.BASENAME) ||
  (pathname.startsWith('/booking') ? '/booking' : '/');
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

class BookingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Rakie Booking] Render failed', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#fff' }}>
          <div style={{ width: 'min(460px, 100%)', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28, textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 12px' }}>Rakie Salon Booking</h1>
            <p style={{ color: '#4b5563', lineHeight: 1.5 }}>
              We could not load the booking page correctly. Please reload booking or call Rakie Salon.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ border: '1px solid #111827', borderRadius: 10, padding: '11px 16px', background: '#111827', color: '#fff', cursor: 'pointer' }}
              >
                Reload Booking
              </button>
              <a
                href="tel:+16786153704"
                style={{ border: '1px solid #111827', borderRadius: 10, padding: '11px 16px', color: '#111827', textDecoration: 'none' }}
              >
                Call (678) 615-3704
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <BookingErrorBoundary>
    <BrowserRouter basename={BASENAME} future={future}>
      <App />
    </BrowserRouter>
  </BookingErrorBoundary>
);
