import type { Metadata } from "next";
import { TrackForm } from "@/components/order/TrackForm";

export const metadata: Metadata = { title: "Track your order – US Pizza Demo" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Track your order</h1>
      <p className="mt-2 text-ink-soft">Enter your order ID to see where it is.</p>
      <TrackForm />
    </div>
  );
}
