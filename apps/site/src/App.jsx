// App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RootLayout from './router'; // <-- FIXED path

// Pages
import Home from './pages/Home';
import Specials from './pages/Specials';
import About from './pages/About';
import Policies from './pages/Policies';
import Careers from './pages/Careers';
import Services from './pages/Services';
import Contact from './pages/Contact';
import BookingHandoff from './pages/BookingHandoff'
import SmsBookingRedirect from './pages/SmsBookingRedirect';

export default function App() {
  return (
    <BrowserRouter
	future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
	}}
	>
      <Routes>
        <Route path="2booking" element={<SmsBookingRedirect />} />
        <Route path="booking/*" element={<BookingHandoff />} />
        <Route element={<RootLayout />}>
          <Route index element={<Home />} />
          <Route path="specials" element={<Specials />} />
          <Route path="about" element={<About />} />
          <Route path="policies" element={<Policies />} />
          <Route path="careers" element={<Careers />} />
          <Route path="services" element={<Services />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<div className="p-8">Not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
