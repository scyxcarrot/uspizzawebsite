import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";

export const metadata: Metadata = { title: "Checkout – US Pizza Demo" };

export default function CheckoutPage() {
  return <CheckoutView />;
}
