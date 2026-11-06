import type { Metadata } from "next";
import { OrderTracker } from "@/components/order/OrderTracker";

export const metadata: Metadata = { title: "Your order – US Pizza Demo" };

export default async function OrderPage({ params }: PageProps<"/order/[id]">) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <OrderTracker id={decodeURIComponent(id)} />
    </div>
  );
}
