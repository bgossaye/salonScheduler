import { useEffect } from 'react';
import Hero from '../components/Hero';
import WelcomeIntro from '../components/WelcomeIntro';
import ThreePillars from '../components/ThreePillars';
import Testimonials from '../components/Testimonials';
import DynamicDealTile from '../components/DynamicDealTile';

export default function Home() {
  const ctaLabel = 'New client? Get $10 off';
  const ctaSub = '2-min intake. First visit only.';

  useEffect(() => {
    /* no wake on Home; Testimonials manages reviews */
  }, []);

  return (
    <>
      {/* Wrap hero so we can overlay a corner CTA */}
      <div className="relative">
        <Hero />

        {/* Desktop/Laptop: top-right corner badge */}
        <a
          href="/booking?promo=NEWCLIENT10"
          aria-label="Client Intake Form - New client $10"
          className="
            hidden md:flex items-center gap-2
            absolute top-4 right-4 z-20
            rounded-full px-4 py-2 shadow-lg
            bg-[linear-gradient(90deg,#800000,#E6E6FA)] text-white
            hover:opacity-95 transition
          "
        >
          <span className="text-lg">🎁</span>
          <span className="text-sm leading-tight">
            <strong className="block">{ctaLabel}</strong>
            <span className="opacity-90">{ctaSub}</span>
          </span>
        </a>
      </div>

      {/* Mobile: sticky bottom CTA */}
      <a
        href="/booking?promo=NEWCLIENT10"
        className="
          md:hidden fixed bottom-4 inset-x-4 z-50
          rounded-full px-5 py-3 text-center shadow-xl
          bg-[linear-gradient(90deg,#800000,#E6E6FA)] text-white
          hover:opacity-95 active:scale-[0.99] transition
        "
        aria-label="Client Intake Form - New client $10"
      >
        <div className="font-semibold">{ctaLabel}</div>
        <div className="text-xs opacity-90">{ctaSub}</div>
      </a>

      <div className="relative py-8 flex items-center justify-center text-center">
        {/* smaller, soft radial glow */}
        <span
          aria-hidden
          className="
            pointer-events-none absolute -z-10
            w-56 h-56 md:w-72 md:h-72
            rounded-full
            blur-md
          "
          style={{
            background:
              'radial-gradient(circle at center, rgba(230,230,250,0.5) 0%, rgba(230,230,250,0.0) 65%)',
          }}
        />

        {/* smaller, static conic 'rays' */}
        <span
          aria-hidden
          className="
            pointer-events-none absolute -z-10
            w-60 h-60 md:w-80 md:h-80
            rounded-full
            blur-sm
            [mask-image:radial-gradient(circle,black_40%,transparent_75%)]
          "
          style={{
            background:
              'conic-gradient(from 0deg, rgba(128,0,0,0.2) 0 10deg, transparent 10deg 20deg, rgba(128,0,0,0.2) 20deg 30deg, transparent 30deg 40deg, rgba(128,0,0,0.2) 40deg 50deg, transparent 50deg 60deg, rgba(128,0,0,0.2) 60deg 70deg, transparent 70deg 80deg, rgba(128,0,0,0.2) 80deg 90deg, transparent 90deg 100deg, rgba(128,0,0,0.2) 100deg 110deg, transparent 110deg 120deg, rgba(128,0,0,0.2) 120deg 130deg, transparent 130deg 140deg, rgba(128,0,0,0.2) 140deg 150deg, transparent 150deg 160deg, rgba(128,0,0,0.2) 160deg 170deg, transparent 170deg 180deg, rgba(128,0,0,0.2) 180deg 190deg, transparent 190deg 200deg, rgba(128,0,0,0.2) 200deg 210deg, transparent 210deg 220deg, rgba(128,0,0,0.2) 220deg 230deg, transparent 230deg 240deg, rgba(128,0,0,0.2) 240deg 250deg, transparent 250deg 260deg, rgba(128,0,0,0.2) 260deg 270deg, transparent 270deg 280deg, rgba(128,0,0,0.2) 280deg 290deg, transparent 290deg 300deg, rgba(128,0,0,0.2) 300deg 310deg, transparent 310deg 320deg, rgba(128,0,0,0.2) 320deg 330deg, transparent 330deg 340deg, rgba(128,0,0,0.2) 340deg 350deg, transparent 350deg 360deg)',
          }}
        />

        {/* centered heading */}
        <h2
          className="
            relative overflow-visible
            mx-auto max-w-[90%]
            text-center
            text-4xl md:text-5xl
            leading-[1.18]
            pt-1 md:pt-2
            text-transparent bg-clip-text
            bg-[linear-gradient(90deg,#800000,#E6E6FA)]
            drop-shadow-[0_0_14px_rgba(230,230,250,0.45)]
          "
          style={{ fontFamily: '"Great Vibes", cursive' }}
        >
          Welcome to Rakie Salon!
        </h2>
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <DynamicDealTile />
      </section>

      <Testimonials />
      <WelcomeIntro />
      <ThreePillars />
    </>
  );
}
