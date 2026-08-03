export default function ServiceCard({ title, blurb, price }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
      <h4 className="text-[#0D3B66] font-semibold">{title}</h4>
      <p className="mt-2 text-slate-600">{blurb}</p>
      <div className="mt-3 text-sm text-slate-500">{price}</div>
      <div className="mt-5">
        <a href="/booking" className="inline-flex items-center px-4 py-2 rounded-lg bg-[#0D3B66] text-white font-medium hover:brightness-110">Book</a>
      </div>
    </div>
  )
}
