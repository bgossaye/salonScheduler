// apps/site/src/router.jsx
import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';

export default function RootLayout() {
  return (
    <>
      <Header />
      <main className="pt-14 md:pt-16">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
