// Seeded demo orders with fixed statuses. Totals are calculated by the same
// pricing code as real checkout, so they always match the menu.

import { createOrder, type Order } from "@/lib/orders";

export const SEEDED_ORDERS: Order[] = [
  createOrder({
    id: "US-1001",
    placedAt: new Date("2026-11-05T12:15:00+08:00"),
    fulfilment: "delivery",
    customer: { name: "Aisyah R.", phone: "012-000 1001", address: "12 Jalan Contoh 1, Petaling Jaya" },
    cart: [
      { lineId: "margherita:large:hand-tossed", itemId: "margherita", size: "large", crust: "hand-tossed", quantity: 1 },
      { lineId: "garlic-bread", itemId: "garlic-bread", quantity: 1 },
      { lineId: "cola", itemId: "cola", quantity: 2 },
    ],
    outletId: "petaling-jaya",
    fixedStatus: "delivered",
  }),
  createOrder({
    id: "US-1002",
    placedAt: new Date("2026-11-05T18:40:00+08:00"),
    fulfilment: "delivery",
    customer: { name: "Daniel T.", phone: "016-000 1002", address: "8 Lorong Contoh, Kuala Lumpur" },
    cart: [
      { lineId: "beef-pepperoni:regular:thin", itemId: "beef-pepperoni", size: "regular", crust: "thin", quantity: 1 },
      { lineId: "chicken-wings", itemId: "chicken-wings", quantity: 1 },
      { lineId: "iced-lemon-tea", itemId: "iced-lemon-tea", quantity: 1 },
    ],
    outletId: "bangsar",
    fixedStatus: "out-for-delivery",
  }),
  createOrder({
    id: "US-1003",
    placedAt: new Date("2026-11-05T19:05:00+08:00"),
    fulfilment: "pickup",
    customer: { name: "Mei Ling K.", phone: "019-000 1003" },
    cart: [
      {
        lineId: "spicy-sambal-chicken:regular:cheese-stuffed",
        itemId: "spicy-sambal-chicken",
        size: "regular",
        crust: "cheese-stuffed",
        quantity: 2,
      },
      { lineId: "mango-ice-cream", itemId: "mango-ice-cream", quantity: 1 },
    ],
    outletId: "cheras",
    fixedStatus: "preparing",
  }),
];
