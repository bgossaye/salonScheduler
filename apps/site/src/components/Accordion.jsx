import React from 'react';
import { useState, useId } from 'react'

export default function Accordion({ items }) {
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 overflow-hidden bg-white">
      {items.map((item, idx) => (
        <AccordionItem key={idx} title={item.title}>
          {item.content}
        </AccordionItem>
      ))}
    </div>
  )
}

function AccordionItem({ title, children }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div>
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left font-medium hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D3B66]"
        aria-expanded={open}
        aria-controls={`sect-${id}`}
        onClick={() => setOpen(v => !v)}
      >
        <span>{title}</span>
        <svg className={"shrink-0 transition-transform " + (open ? "rotate-180" : "")} width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <div
        id={`sect-${id}`}
        role="region"
        hidden={!open}
        className="px-5 pb-5 text-slate-700"
      >
        {children}
      </div>
    </div>
  )
}
