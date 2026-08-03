import React from 'react';

const CATS = [
  { id: 'color', label: 'Color' },
  { id: 'haircut', label: 'Haircut' },
  { id: 'style', label: 'Style' },
  { id: 'treatment', label: 'Treatment' },
  { id: 'texturizing', label: 'Texturizing' },
  { id: 'hair-removal', label: 'Hair Removal' },
  { id: 'add-ons', label: 'Add‑ons' },
]

export default function ServicesStickyNav() {
  return (
    <div className="sticky top-16 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar py-3">
          {CATS.map(c => (
            <a key={c.id} href={`#${c.id}`} className="shrink-0 px-3 py-1.5 rounded-full text-sm border border-slate-300 hover:bg-slate-50">
              {c.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
