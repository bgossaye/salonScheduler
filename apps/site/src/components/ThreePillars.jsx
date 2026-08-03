export default function ThreePillars() {
  const pillars = [
    { title: 'Color', blurb: 'Dimensional color, shine, and healthy finish.', anchor: '#color' },
    { title: 'Cut', blurb: 'Precision cuts tailored to your style.', anchor: '#haircut' },
    { title: 'Style', blurb: 'Blowouts, updos, and everyday polish.', anchor: '#style' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map(p => (
          <a key={p.title} href={`/services${p.anchor}`} className="group rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-shadow bg-white">
            <div className="text-sm uppercase tracking-wider text-[#0D3B66]/70">Signature</div>
            <h3 className="mt-2 text-xl font-semibold text-[#0D3B66]">{p.title}</h3>
            <p className="mt-2 text-slate-600">{p.blurb}</p>
            <div className="mt-4 inline-flex items-center gap-2 text-[#0D3B66] font-medium">
              View services
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="group-hover:translate-x-0.5 transition-transform">
                <path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
