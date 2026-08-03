import { ADDRESS_LINE, MAPS_URL, PHONE } from '@rakie/tokens/js'

export default function LocationHours() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold text-[#0D3B66]">Visit us</h2>
          <p className="mt-2 text-slate-700">{ADDRESS_LINE}</p>
          <div className="mt-2 flex gap-3">
            <a className="inline-flex items-center px-4 py-2 rounded-lg bg-[#0D3B66] text-white font-medium" href={MAPS_URL} target="_blank" rel="noreferrer">Directions</a>
            <a className="inline-flex items-center px-4 py-2 rounded-lg bg-[#F4D35E] text-black font-medium" href={`tel:${PHONE}`}>Call</a>
          </div>
          <div className="mt-6">
            <h3 className="font-semibold text-[#0D3B66]">Hours</h3>
            <ul className="mt-2 text-slate-700 space-y-1">
              <li>Tue – Sat: 9:00 AM – 7:00 PM</li>
              <li>Sun – Mon: Closed</li>
            </ul>
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden ring-1 ring-black/10">
          <div className="aspect-[4/3] w-full bg-slate-100 flex items-center justify-center text-slate-500">(Map embed placeholder)</div>
        </div>
      </div>
    </section>
  )
}
