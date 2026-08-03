// Contact.jsx
 import { useState } from 'react';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });
  const onSubmit = e => {
    e.preventDefault();
    const subject = encodeURIComponent('Website contact from ' + (form.name || ''));
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\n\n${form.message}`);
    window.location.href = `mailto:rakiesalon@gmail.com?subject=${subject}&body=${body}`;
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-2">
      <div>
        <h1 className="text-4xl font-bold text-[#0D3B66]">Contact Us</h1>
        <p className="mt-3 text-slate-700">Questions? We’re here to help.</p>
        <div className="mt-6 space-y-2 text-slate-700">
          <p><strong>Address:</strong> 4051 Hwy 78, STE E105, Lilburn, GA 30047</p>
          <p><strong>Phone:</strong> <a className="underline" href="tel:+16786153704">(678) 615-3704</a> OR <a className="underline" href="tel:+15859576404">(585) 957-6404</a></p>
          <p><strong>Email:</strong> <a className="underline" href="mailto:rakiesalon@gmail.com">rakiesalon@gmail.com</a></p>
          <p className="text-sm text-slate-600">Open Tue–Fri 9–6 • Sat 8–7 • Sun Closed • Mon by appointment</p>
        </div>
       {/* Image + text */}
<div className="mt-8 grid gap-6 md:grid-cols-2">
  <div className="aspect-[4/3] relative overflow-hidden rounded-2xl ring-1 ring-black/10">
    <img
      src="/assets/phoneclient.jpg"   // <-- your image in public/assets
      alt="Client with beautiful curly hair calling Rakie Salon"
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
  </div>
      </div>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[#0D3B66]">Send a message</h2>
        <div className="mt-4 grid gap-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input name="name" value={form.name} onChange={onChange} className="mt-1 w-full rounded-lg border p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input name="email" type="email" value={form.email} onChange={onChange} className="mt-1 w-full rounded-lg border p-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input name="phone" value={form.phone} onChange={onChange} className="mt-1 w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Message</label>
            <textarea name="message" rows="5" value={form.message} onChange={onChange} className="mt-1 w-full rounded-lg border p-2" required />
          </div>
          <div className="flex gap-3">
            <button className="inline-flex items-center px-4 py-2 rounded-lg bg-[#0D3B66] text-white font-medium" type="submit">Send</button>
            <a href="/booking" className="inline-flex items-center px-4 py-2 rounded-lg bg-[#F4D35E] text-black font-medium">Book Now</a>
          </div>
        </div>
      </form>
    </section>
  );
}
