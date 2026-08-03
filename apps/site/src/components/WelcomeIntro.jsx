// components/WelcomeIntro.jsx
export default function WelcomeIntro() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 text-center">
      <p className="mt-6 text-lg text-slate-700 leading-relaxed">
        At Rakie Salon, we believe that beauty is more than skin deep it is an
        experience. Our talented team is dedicated to providing you with
        personalized services that enhance your natural beauty and leave you
        feeling rejuvenated. Whether you are looking for a fresh haircut, a
        stunning color transformation, or a relaxing spa treatment, we’ve got
        you covered.
      </p>
      <p className="mt-4 text-lg text-slate-700 leading-relaxed">
        Step into our welcoming space, where you can unwind and indulge in
        luxury. We use only the highest quality products to ensure you receive
        the best care possible. Explore our services, meet our skilled
        professionals, and book your appointment today. Your journey to beauty
        and self-care starts here!
      </p>
      <p className="mt-4 text-lg text-slate-700 font-medium">
        Welcome to the Rakie family! We can’t wait to pamper you.
      </p>

      {/* Call-to-actions below text */}
      <div className="mt-8 flex justify-center gap-4">
        <a
          href="/services"
          className="inline-flex items-center px-6 py-3 rounded-xl bg-[#0D3B66] text-white font-semibold"
        >
          Explore Services
        </a>
      </div>
<p
  className="
    mt-4 text-center font-curly gentle-pulse relative
    text-5xl md:text-7xl leading-none
    bg-gradient-to-r from-[#B6862C] via-[#E8C27A] to-[#F7E3B0]
    bg-clip-text text-transparent
  "
>
  specializing in curly hair
  {/* subtle sheen overlay */}
  <span className="pointer-events-none absolute inset-0 shimmer-gold mix-blend-screen"></span>
</p>    </section>
  );
}
