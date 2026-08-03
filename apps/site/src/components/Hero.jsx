import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

/** Auto-load all *.png in ../assets/hero (CRA/CRACO: Webpack) */
function loadHeroPngs() {
  try {
    const ctx = require.context('../assets/hero', false, /\.png$/);
    const keys = ctx.keys().sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    return keys.map(ctx);
  } catch {
    return [];
  }
}

export default function Hero({
  intervalMs = 15000,   // total per image
  panMs = 10000,        // top->bottom pan (10s)
  containFadeMs = 1200, // fade to "contain"
  crossfadeMs = 900,    // prev OUT + active IN
  className = '',
}) {
  const images = useMemo(loadHeroPngs, []);
  const count = images.length;

  const [index, setIndex] = useState(0);   // active slide index
  const [prev, setPrev] = useState(null);  // previous slide index (for crossfade)
  const advanceTimer = useRef(null);

  // Advance slides every interval
  useEffect(() => {
    if (count < 2) return;
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setPrev(index);                          // mark current as "previous"
      setIndex((i) => (i + 1) % count);        // show next
    }, intervalMs);
    return () => clearTimeout(advanceTimer.current);
  }, [count, index, intervalMs]);

  // After prev is set, fade it out and then clear it
  useEffect(() => {
    if (prev == null) return;
    const t = setTimeout(() => setPrev(null), crossfadeMs);
    return () => clearTimeout(t);
  }, [prev, crossfadeMs]);

  if (count === 0) return null;

  const activeSrc = images[index];
  const prevSrc = prev != null ? images[prev] : null;

  // unique keys so animations restart each slide
  const slideKey = `slide-${index}-${Date.now()}`;
  const panKey = `pan-${index}-${Date.now()}`;
  const containKey = `contain-${index}-${Date.now()}`;

  return (
    <section className={`relative overflow-hidden bg-black ${className}`}>
      <div className="relative h-[48vh] min-h-[360px] md:h-[64vh]">

        {/* PREVIOUS SLIDE: show as full 'contain' and fade OUT */}
        {prevSrc && (
          <img
            src={prevSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-contain bg-black"
            style={{
              zIndex: 1,
              animation: `fadeOut ${crossfadeMs}ms ease forwards`,
            }}
            loading="eager"
          />
        )}

        {/* ACTIVE SLIDE: fade IN, pan, then reveal 'contain' */}
        <div
          key={slideKey}
          className="absolute inset-0"
          style={{
            zIndex: 2,
            animation: `fadeIn ${crossfadeMs}ms ease both`,
          }}
        >
          {/* LAYER 1: pan using background cover */}
          <div
            key={panKey}
            className="absolute inset-0 will-change-transform will-change-[background-position]"
            style={{
              backgroundImage: `url(${activeSrc})`,
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '50% 0%', // start top center
              animation: `panDown ${panMs}ms linear forwards`,
            }}
          />

          {/* LAYER 2: fade to full 'contain' after pan */}
          <img
            key={containKey}
            src={activeSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-contain bg-black"
            style={{
              opacity: 0,
              animation: `showContain ${containFadeMs}ms ease-in ${panMs}ms forwards`,
            }}
            loading="eager"
          />
        </div>

        {/* subtle overlay for legibility */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/25" />
      </div>

      <style>{`
        @keyframes panDown {
          0%   { background-position: 50% 0%;   transform: scale(1.10); }
          100% { background-position: 50% 100%; transform: scale(1.00); }
        }
        @keyframes showContain { to { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
      `}</style>
    </section>
  );
}

Hero.propTypes = {
   intervalMs: PropTypes.number,
   panMs: PropTypes.number,
   containFadeMs: PropTypes.number,
   crossfadeMs: PropTypes.number,
   className: PropTypes.string,
 };
