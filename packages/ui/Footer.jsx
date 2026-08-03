import { ADDRESS_LINE, MAPS_URL, PHONE, EMAIL } from '@rakie/tokens/js'

export default function Footer() {
  return (
    <footer className="mt-20 bg-[#0D3B66] text-white">
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 md:grid-cols-3">
        <div>
          <h3 className="text-lg font-semibold">Rakie Salon</h3>
          <p className="mt-2 text-white/80">Beautiful hair, tailored to you.</p>
        </div>
        <div>
          <h4 className="font-semibold">Visit</h4>
          <p className="mt-2 text-white/90">{ADDRESS_LINE}</p>
          <p className="mt-1">
            <a className="underline hover:no-underline" href={MAPS_URL} target="_blank" rel="noreferrer">Get Directions</a>
          </p>
        </div>
        <div>
          <h4 className="font-semibold">Contact</h4>
          <p className="mt-2">
            <a className="underline hover:no-underline" href={`tel:${PHONE}`}>Call {PHONE}</a>
          </p>
          <p className="mt-1">
            <a className="underline hover:no-underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>
          </p>
          <p className="mt-3 text-white/80">Tue–Sat 9:00 AM – 7:00 PM</p>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-white/70">© {new Date().getFullYear()} Rakie Salon. All rights reserved.</div>
      </div>
    </footer>
  )
}
