import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Header() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  const NavButton = ({ to, label }) => (
    <Link
      to={to}
      className={
        'px-3 py-2 rounded-md text-sm font-medium ' +
        (pathname === to ? 'bg-white/20 text-white' : 'text-white/90 hover:text-white')
      }
      aria-current={pathname === to ? 'page' : undefined}
    >
      {label}
    </Link>
  )

  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-[rgba(13,59,102,0.92)] text-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#F4D35E]" aria-hidden="true" />
            <span className="font-semibold tracking-wide">Rakie Salon</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavButton to="/" label="Home" />
            <NavButton to="/services" label="Services" />
            <NavButton to="/specials" label="Specials" />
            <NavButton to="/about" label="About" />
            <NavButton to="/policies" label="Policies" />
            <NavButton to="/contact" label="Contact" />
            <NavButton to="/careers" label="Careers" />
            <a
              className="ml-1 px-3 py-2 rounded-md text-sm font-semibold bg-[#F4D35E] text-black hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#F4D35E] focus:ring-offset-[#0D3B66]"
              href="/booking"
            >
              Book Now
            </a>
          </nav>

          <button
            className="md:hidden p-2 rounded focus:outline-none focus:ring-2 focus:ring-white/60"
            aria-label="Open menu"
            onClick={() => setOpen(v => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/15">
          <div className="mx-auto max-w-6xl px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <Link to="/" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Home</Link>
            <Link to="/services" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Services</Link>
            <Link to="/specials" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Specials</Link>
            <Link to="/about" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">About</Link>
            <Link to="/policies" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Policies</Link>
            <Link to="/contact" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Contact</Link>
            <Link to="/careers" className="px-3 py-2 rounded-md text-sm text-white/90 hover:text-white">Careers</Link>
            <a className="mt-1 inline-flex justify-center px-3 py-2 rounded-md text-sm font-semibold bg-[#F4D35E] text-black" href="/booking">Book Now</a>
          </div>
        </div>
      )}
    </header>
  )
}
