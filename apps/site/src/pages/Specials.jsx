import DynamicDealTile from '../components/DynamicDealTile';
import { usePublicDeals } from '../utils/publicDeals';

export default function Specials() {
  const { deals, loading } = usePublicDeals();
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#800000]">Current promotions</p>
        <h1 className="mt-2 text-4xl font-bold text-[#0D3B66]">Salon Specials</h1>
        <p className="mt-3 max-w-3xl text-slate-700">Live offers are updated automatically from Rakie Salon&apos;s booking system.</p>
      </header>
      <div className="mt-8"><DynamicDealTile /></div>
      {!loading && deals.length === 0 && <div className="mt-8 rounded-2xl border bg-white p-8 text-center text-slate-600">There are no public specials at this time. Please check back soon.</div>}
    </section>
  );
}
