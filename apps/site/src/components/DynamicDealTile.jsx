import { useEffect, useState } from 'react';
import { usePublicDeals } from '../utils/publicDeals';

const SLIDE_INTERVAL_MS = 5500;

const DEAL_TONES = [
  {
    panel: 'border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-white',
    divider: 'border-amber-200/80',
    chip: 'border-amber-300',
    dot: 'bg-amber-300',
  },
  {
    panel: 'border-rose-200 bg-gradient-to-r from-rose-50 via-pink-50 to-white',
    divider: 'border-rose-200/80',
    chip: 'border-rose-300',
    dot: 'bg-rose-300',
  },
  {
    panel: 'border-violet-200 bg-gradient-to-r from-violet-50 via-purple-50 to-white',
    divider: 'border-violet-200/80',
    chip: 'border-violet-300',
    dot: 'bg-violet-300',
  },
  {
    panel: 'border-sky-200 bg-gradient-to-r from-sky-50 via-cyan-50 to-white',
    divider: 'border-sky-200/80',
    chip: 'border-sky-300',
    dot: 'bg-sky-300',
  },
  {
    panel: 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white',
    divider: 'border-emerald-200/80',
    chip: 'border-emerald-300',
    dot: 'bg-emerald-300',
  },
  {
    panel: 'border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white',
    divider: 'border-orange-200/80',
    chip: 'border-orange-300',
    dot: 'bg-orange-300',
  },
];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function DynamicDealTile() {
  const { deals, loading } = usePublicDeals();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (index >= deals.length) setIndex(0);
  }, [deals.length, index]);

  useEffect(() => {
    if (paused || deals.length < 2) return undefined;

    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % deals.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [deals.length, index, paused]);

  if (loading || deals.length === 0) return null;

  const deal = deals[index];
  const tone = DEAL_TONES[index % DEAL_TONES.length];
  const chips = [...deal.services, deal.dayText, deal.discountLabel].filter(Boolean);
  const dateText = [
    deal.startsOn ? `Starts ${formatDate(deal.startsOn)}` : '',
    deal.endsOn ? `Ends ${formatDate(deal.endsOn)}` : '',
  ].filter(Boolean).join(' · ');

  const togglePlayback = () => {
    if (deals.length > 1) setPaused((current) => !current);
  };

  const stopTileToggle = (event) => event.stopPropagation();

  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-sm transition-colors duration-500 ${tone.panel}`}
      aria-label={`Current special: ${deal.title}`}
      onClick={togglePlayback}
    >
      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-[#800000] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white sm:text-xs">
              Current special
            </span>
            {deals.length > 1 && (
              <span className="text-xs font-medium text-slate-500">
                {index + 1} of {deals.length}
              </span>
            )}
          </div>

          {deals.length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                stopTileToggle(event);
                togglePlayback();
              }}
              className={`shrink-0 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ${tone.chip}`}
              aria-label={paused ? 'Resume deal slideshow' : 'Pause deal slideshow'}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>

        <h3 className="mt-2 text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{deal.title}</h3>
        {deal.description && (
          <p className="mt-1.5 text-sm leading-5 text-slate-700 sm:text-base">{deal.description}</p>
        )}

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((item) => (
              <span key={item} className={`rounded-full border bg-white px-2.5 py-1 text-xs font-medium text-slate-800 ${tone.chip}`}>
                {item}
              </span>
            ))}
          </div>
        )}

        {(deal.details.length > 0 || dateText) && (
          <div className={`mt-3 border-t pt-3 ${tone.divider}`}>
            {deal.details.length > 0 && (
              <ul className="grid gap-x-5 gap-y-1 text-sm leading-5 text-slate-700 sm:grid-cols-2">
                {deal.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2">
                    <span className="text-[#800000]">•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {dateText && (
              <p className={`${deal.details.length > 0 ? 'mt-2' : ''} text-xs font-medium text-slate-500`}>
                {dateText}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-2">
            <a
              href="/booking"
              onClick={stopTileToggle}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#800000] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 sm:flex-none"
            >
              Book Deal
            </a>
            <a
              href="/services"
              onClick={stopTileToggle}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:flex-none"
            >
              Services
            </a>
          </div>

          {deals.length > 1 && (
            <div className="flex shrink-0 items-center gap-1.5" aria-label="Deal slideshow navigation">
              {deals.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => {
                    stopTileToggle(event);
                    setIndex(itemIndex);
                  }}
                  className={`h-2.5 rounded-full transition-all ${
                    itemIndex === index ? 'w-6 bg-[#800000]' : `w-2.5 ${tone.dot}`
                  }`}
                  aria-label={`Show ${item.title}`}
                  aria-current={itemIndex === index ? 'true' : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {deals.length > 1 && (
          <p className="mt-2 text-center text-[11px] text-slate-500 sm:text-left">
            Tap the card to {paused ? 'resume' : 'pause'} slideshow
          </p>
        )}
      </div>
    </section>
  );
}
