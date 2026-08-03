// About.jsx
export default function About() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-bold text-[#0D3B66]">We are committed to beautifying you</h1>
      <p className="mt-4 text-slate-700 max-w-3xl">
        Welcome to Rakie Salon—your destination for exceptional beauty and relaxation. Conveniently located at
        the intersection of Killian Hill Rd and Hwy 78 (inside the plaza next to Home Depot and Burlington),
        we’re easy to find and excited to serve the Lilburn community.
      </p>
      <p className="mt-4 text-slate-700 max-w-3xl">
        Our mission is to provide a warm, inviting atmosphere where every guest feels valued and pampered.
        Our talented team is passionate about enhancing your natural beauty through personalized services
        tailored to your style and preferences.
      </p>
      <p className="mt-4 text-slate-700 max-w-3xl">
        From trend‑forward cuts and vibrant color to relaxing, restorative treatments, we aim to create an
        experience that leaves you feeling confident and rejuvenated. Join us where beauty meets community.
      </p>

      {/* Image + text placeholders */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
<div className="rounded-2xl bg-slate-200 w-[50%] mx-auto">
  <img
    src="/assets/about.png"
    alt="It is all about you"
    className="block w-full h-auto rounded-2xl"
    loading="lazy"
    decoding="async"
  />
</div>


        <div className="rounded-2xl bg-white border p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[#0D3B66]">Our Promise</h2>
          <p className="mt-2 text-slate-700">
            We listen first, recommend thoughtfully, and deliver with care, so you love your look today and
            tomorrow.
          </p>
        </div>
      </div>
    </section>
  );
}
