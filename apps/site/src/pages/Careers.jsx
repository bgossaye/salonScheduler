// Careers.jsx
//import React from 'react';

export default function Careers() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-bold text-[#0D3B66]">Join Our Team at Rakie Salon</h1>
      <p className="mt-4 text-slate-700 max-w-3xl">
        Are you passionate about hair and beauty? Whether you are seasoned or just starting out, we provide a
        supportive environment with hands‑on training, mentorship, and room to grow.
      </p>
      <ul className="mt-4 list-disc ml-6 text-slate-700 space-y-1">
        <li><strong>Ongoing Training:</strong> Workshops and shadowing to keep your skills sharp.</li>
        <li><strong>Supportive Team:</strong> Collaborate with stylists who love to share knowledge.</li>
        <li><strong>Career Advancement:</strong> Clear paths for increased responsibility and leadership.</li>
        <li><strong>Creative Freedom:</strong> Express your ideas and help clients look and feel their best.</li>
      </ul>

<div className="mt-8 grid gap-6 md:grid-cols-2">
  <div className="aspect-[4/3] relative overflow-hidden rounded-2xl ring-1 ring-black/10">
    <img
      src="/assets/career.png"
      alt="Rakie Salon team member portrait"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
  </div>
        <form className="rounded-2xl bg-white border p-6 shadow-sm space-y-4" onSubmit={e => e.preventDefault()}>
          <h2 className="text-xl font-semibold text-[#0D3B66]">Apply Now</h2>
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input className="mt-1 w-full rounded-lg border p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input type="email" className="mt-1 w-full rounded-lg border p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input className="mt-1 w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Upload Résumé</label>
            <input type="file" className="mt-1 w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Tell us about you</label>
            <textarea rows="4" className="mt-1 w-full rounded-lg border p-2" placeholder="Experience, specialties, goals..." />
          </div>
          <button className="inline-flex items-center px-4 py-2 rounded-lg bg-[#0D3B66] text-white font-semibold" type="submit">
            Submit
          </button>
        </form>
      </div>
      <p className="mt-6 text-slate-700">We can’t wait to see what you bring to Rakie Salon!</p>
    </section>
  );
}
