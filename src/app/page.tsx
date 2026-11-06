import { STORE } from "@/data/store";
import { MenuBrowser } from "@/components/menu/MenuBrowser";

export default function MenuPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-brand text-white">
        {/* Decorative pepperoni dots */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" />
          <span className="absolute right-24 top-16 size-10 rounded-full bg-brand-dark" />
          <span className="absolute right-6 top-28 size-6 rounded-full bg-brand-dark" />
          <span className="absolute -bottom-16 left-1/3 size-40 rounded-full bg-white/5" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <p className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            Hot, fresh and entirely fictional
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
            Pizza night, sorted in a few taps.
          </h1>
          <p className="mt-3 max-w-xl text-white/90 sm:text-lg">
            Pick your pizza, tweak the crust, and track it to your door. Questions? Our AI assistant can
            help with the menu, your order, or anything else.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-white/90">
            <li>⏱ {STORE.hours.summary}</li>
            <li>🛵 Delivery in {STORE.delivery.estimatedMinutes.min}–{STORE.delivery.estimatedMinutes.max} min</li>
            <li>🎉 Free delivery from RM 50</li>
          </ul>
        </div>
      </section>
      <MenuBrowser />
    </>
  );
}
