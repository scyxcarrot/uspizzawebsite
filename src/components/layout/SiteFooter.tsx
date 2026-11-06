import Link from "next/link";
import { STORE } from "@/data/store";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-ink text-white/85">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-lg font-extrabold text-white">US Pizza Demo</p>
          <p className="mt-2">
            <strong className="text-gold">Demo with dummy data.</strong> {STORE.demoNotice}
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Opening hours</p>
          <p className="mt-1">{STORE.hours.summary}</p>
          <p className="mt-3 font-semibold text-white">Delivery</p>
          <p className="mt-1">
            {STORE.delivery.area}, about {STORE.delivery.estimatedMinutes.min}–{STORE.delivery.estimatedMinutes.max}{" "}
            minutes
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Contact (demo)</p>
          <p className="mt-1">{STORE.contact.email}</p>
          <p>{STORE.contact.phone}</p>
          <p className="mt-3">
            <Link href="/track" className="inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-4">
              Track an order
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
