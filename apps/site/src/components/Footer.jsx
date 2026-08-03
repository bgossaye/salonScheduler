
export default function Footer() {
  const mapsQuery = encodeURIComponent('4051 Hwy 78 STE E105, Lilburn, GA 30047');
  const mapsUrl = `https://www.google.com/maps?q=${mapsQuery}&output=embed&z=16`;
  const mapsLink = `https://www.google.com/maps?q=${mapsQuery}&z=16`;

  return (
    <footer className="mt-16 border-t border-slate-200 bg-blue-600">
      <div className="mx-auto max-w-7xl px-4 py-10 text-white font-bold">
        <div className="grid gap-10 md:grid-cols-3">
          {/* LEFT: Store hours */}
          <div>
            <h2 className="text-sm uppercase tracking-wider">Store Hours</h2>
            <ul className="mt-3 space-y-1">
              <li>
                <span className="inline-block w-36">Tuesday - Friday</span>
                <span>9 AM – 6 PM</span>
              </li>
              <li>
                <span className="inline-block w-36">Saturday</span>
                <span>8 AM – 7 PM</span>
              </li>
              <li>
                <span className="inline-block w-36">Sunday</span>
                <span>Closed</span>
              </li>
              <li>
                <span className="inline-block w-36">Monday</span>
                <span>Only by appointment</span>
              </li>
            </ul>
          </div>

          {/* MIDDLE: Map with target marker */}
          <div>
            <h2 className="text-sm uppercase tracking-wider">Find Us</h2>

            <div className="relative mt-3 h-64 w-full overflow-hidden rounded-xl border border-white">
              <iframe
                title="Rakie Salon Location"
                src={mapsUrl}
                className="absolute inset-0 h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                {/* red marker stays the same */}
                <svg width="42" height="42" viewBox="0 0 42 42" className="drop-shadow">
                  <circle cx="21" cy="21" r="20" fill="none" stroke="rgba(255,0,0,.65)" strokeWidth="2" />
                  <circle cx="21" cy="21" r="8" fill="none" stroke="rgba(255,0,0,.75)" strokeWidth="2" />
                  <circle cx="21" cy="21" r="3" fill="rgba(255,0,0,.9)" />
                </svg>
              </div>
            </div>

            <a
              href={mapsLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm underline"
            >
              Open in Google Maps
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M7 7h10v10M7 17l10-10" />
              </svg>
            </a>
          </div>

          {/* RIGHT: Address + phones + social */}
          <div>
            <h2 className="text-sm uppercase tracking-wider">Rakie Salon</h2>

            <address className="not-italic mt-3">
              <div>4051 Hwy 78 &nbsp; STE E105</div>
              <div>Lilburn, GA 30047</div>
            </address>

            <div className="mt-2 space-y-1">
              <a href="tel:+16786153704" className="block underline">
                (678) 615-3704
              </a>
              <a href="tel:+158595764041" className="block underline" title="Second phone">
                (585) 957-64041
              </a>
            </div>

            <div className="mt-4">
              <span className="text-sm uppercase tracking-wider">Follow</span>
              <div className="mt-2 flex items-center gap-3">
                {/* Social icons — make bg transparent with white borders */}
                <a
                  href="https://www.facebook.com/profile.php?id=61566048725143"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white text-white hover:bg-blue-700"
                >
                  {/* Facebook icon */}
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M22 12.06C22 6.48 17.52 2 11.94 2S2 6.48 2 12.06C2 17.08 5.66 21.2 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.62.77-1.62 1.56v1.88h2.76l-.44 2.91h-2.32V22C18.34 21.2 22 17.08 22 12.06z"/>
                  </svg>
                </a>
                {/* TikTok */}
                <a
                  href="https://www.tiktok.com/@rakiesalon0"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="TikTok"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white text-white hover:bg-blue-700"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M21 8.13a7 7 0 0 1-4.2-1.38v7.05a5.6 5.6 0 1 1-5.6-5.6c.28 0 .56.02.83.07v2.5a3.12 3.12 0 1 0 2.28 3v-11h2.5a4.47 4.47 0 0 0 4.19 4.36z"/>
                  </svg>
                </a>
                {/* Instagram */}
                <a
                  href="https://www.instagram.com/rakiesalon/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white text-white hover:bg-blue-700"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm5.75-.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* fine print / bottom bar */}
        <div className="mt-10 border-t border-white pt-4 text-xs">
          © {new Date().getFullYear()} Rakie Salon. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
