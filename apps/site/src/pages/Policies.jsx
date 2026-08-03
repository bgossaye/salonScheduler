// Policies.jsx
export default function Policies() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-4xl font-bold text-[#0D3B66]">Our Store Policies</h1>
      <p className="mt-3 text-slate-700">Clear, friendly policies to help us serve you best.</p>

      {/* Image + text placeholders */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
<div className="rounded-2xl bg-slate-200 w-[50%] mx-auto">
  <img
    src="/assets/policy.png"
    alt="You rule"
    className="block w-full h-auto rounded-2xl"
    loading="lazy"
    decoding="async"
  />
</div>
        <div className="rounded-2xl bg-white border p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[#0D3B66]">Appointment Policy</h2>
          <p className="mt-2 text-slate-700">
            Please arrive on time for your appointment. If you’re running late, call us and we’ll do our best to
            accommodate you.
          </p>
          <h2 className="mt-5 text-xl font-semibold text-[#0D3B66]">Cancellation Policy</h2>
          <p className="mt-2 text-slate-700">
            Life happens—we understand. Kindly provide at least <strong>24 hours’ notice</strong> if you need to cancel
            or reschedule so we can offer your time to another guest.
          </p>
          <h2 className="mt-5 text-xl font-semibold text-[#0D3B66]">Cancellation Fees</h2>
          <p className="mt-2 text-slate-700">
            As we build sustainable policies and a supportive service environment, please give 24 hours’ notice
            or inform us as soon as possible. Your cooperation is greatly appreciated.
          </p>
          <h2 className="mt-5 text-xl font-semibold text-[#0D3B66]">Refunds</h2>
          <p className="mt-2 text-slate-700">
            Your satisfaction matters. If something isn’t quite right, contact us within <strong>3 days</strong> of your
            visit. We’ll work with you on a solution, which may include a complimentary adjustment or redo.
          </p>
        </div>
      </div>
    </section>
  );
}
