import { MAPS_URL, PHONE } from '@rakie/tokens/js'

export default function MobileStickyActions() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white shadow md:hidden">
      <div className="mx-auto max-w-6xl px-3 py-2 grid grid-cols-3 gap-2 text-sm">
        <a className="flex items-center justify-center rounded-lg border bg-white py-2 font-medium" href={`tel:${PHONE}`}>Call</a>
        <a className="flex items-center justify-center rounded-lg border bg-white py-2 font-medium" href={MAPS_URL} target="_blank" rel="noreferrer">Directions</a>
        <a className="flex items-center justify-center rounded-lg bg-[#F4D35E] py-2 font-semibold" href="/booking">Book</a>
      </div>
    </div>
  )
}
