import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/specials', label: 'Specials' },
  {
    label: 'About',
    children: [
      { to: '/about', label: 'About' },
      { to: '/policies', label: 'Policies' },
      { to: '/careers', label: 'Careers' },
    ],
  },
  {
    label: 'Services',
    children: [{ to: '/services', label: 'All Services' }],
  },
  {
    label: 'ContactUs',
    children: [{ to: '/contact', label: 'Contact' }],
  },
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const linkBase =
    'px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:text-[#0D3B66] transition-colors'
  const linkActive = 'text-[#0D3B66] bg-slate-100'

  return (
    <>
      {/* Sticky bar */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          {/* Relative so the center button can be truly centered */}
          <div className="relative h-14 md:h-16 flex items-center">
            {/* LEFT: logo + name */}
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/logo.svg"
                alt="Rakie Salon"
                className="h-10 w-10 md:h-12 md:w-12 object-contain"
              />
              <span className="hidden sm:inline text-slate-800 font-medium">
                Rakie Salon Site
              </span>
            </Link>

            {/* CENTER: Book Now (absolutely centered) */}
            <a
              href="/booking"
              className="absolute left-1/2 -translate-x-1/2 group inline-flex items-center rounded-full
                         px-5 py-2 text-sm font-semibold text-black
                         bg-gradient-to-r from-[#F4D35E] to-[#FFE08A]
                         shadow-[0_8px_20px_rgba(244,211,94,.35)] ring-1 ring-black/5
                         hover:brightness-95 active:translate-y-[1px]"
            >
              <span className="mr-1">Book Now</span>
              <svg className="opacity-80 group-hover:opacity-100" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>

            {/* RIGHT: desktop nav + mobile hamburger */}
            <div className="ml-auto flex items-center">
              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1" aria-label="Main">
                {NAV.map((item) =>
                  item.children ? (
                    <div key={item.label} className="relative group">
                      <button className={`${linkBase} flex items-center gap-1`} aria-haspopup="true">
                        {item.label}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeWidth="2" d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      <div className="absolute right-0 top-full z-50 hidden group-hover:block w-48 p-1
                before:content-[''] before:absolute before:-top-2 before:left-0 before:h-2 before:w-full
                rounded-lg border border-slate-200 bg-white shadow-lg"
>
                        {item.children.map((c) => (
                          <NavLink
                            key={c.to}
                            to={c.to}
                            className={({ isActive }) =>
                              `block rounded-md px-3 py-2 text-sm ${
                                isActive ? 'bg-slate-100 text-[#0D3B66]' : 'text-slate-700 hover:bg-slate-50'
                              }`
                            }
                          >
                            {c.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `${linkBase} ${isActive ? linkActive : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  )
                )}
              </nav>

              {/* Mobile hamburger */}
              <button
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                className="md:hidden inline-flex items-center justify-center rounded-xl border border-slate-300/70 bg-white ml-2 px-3 py-2 hover:bg-slate-50"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <nav
          className={`absolute top-0 right-0 h-full w-80 max-w-[85%] bg-white shadow-xl transform transition-transform
                      ${open ? 'translate-x-0' : 'translate-x-full'}`}
          aria-label="Mobile"
        >
          <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200">
            <span className="text-base font-semibold text-[#0D3B66]">Menu</span>
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-300/70 bg-white px-3 py-2 hover:bg-slate-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>

          <ul className="px-2 py-3 space-y-1">
            {NAV.map((item) =>
              item.children ? (
                <li key={item.label}>
                  <div className="px-4 py-2 text-[13px] uppercase tracking-wide text-slate-500">{item.label}</div>
                  {item.children.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `block rounded-lg px-6 py-2.5 text-[15px] ${
                          isActive ? 'bg-slate-100 text-[#0D3B66]' : 'text-slate-700 hover:bg-slate-50'
                        }`
                      }
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </li>
              ) : (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `block rounded-lg px-4 py-3 text-[15px] font-medium ${
                        isActive ? 'bg-slate-100 text-[#0D3B66]' : 'text-slate-700 hover:bg-slate-50'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              )
            )}
            <li className="px-2 pt-2">
              <a
                href="/booking"
                onClick={() => setOpen(false)}
                className="block rounded-lg bg-gradient-to-r from-[#F4D35E] to-[#FFE08A]
                           px-4 py-3 text-center font-semibold text-black hover:brightness-95
                           shadow-[0_8px_20px_rgba(244,211,94,.35)] ring-1 ring-black/5"
              >
                Book Now
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </>
  )
}
