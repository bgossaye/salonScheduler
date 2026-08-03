// apps/site/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import Header from './components/Header'

// import your pages as you already do
import Home from './pages/Home'
import Services from './pages/Services'
import Policies from './pages/Policies'
import Specials from './pages/Specials'
import About from './pages/About'
import Contact from './pages/Contact'
import Careers from './pages/Careers'
import BookingHandoff from './pages/BookingHandoff'
import SmsBookingRedirect from './pages/SmsBookingRedirect'

function RootLayout() {
  return (
    <>
      <Header />
      {/* Spacer so content isn't hidden under fixed header */}
      <main className="pt-16">
        <Outlet />
      </main>
    </>
  )
}

const router = createBrowserRouter([
  { path: '/2booking', element: <SmsBookingRedirect /> },
  { path: '/booking/*', element: <BookingHandoff /> },
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/services', element: <Services /> },
      { path: '/specials', element: <Specials /> },
      { path: '/policies', element: <Policies /> },
      { path: '/about', element: <About /> },
      { path: '/contact', element: <Contact /> },
      { path: '/careers', element: <Careers /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
