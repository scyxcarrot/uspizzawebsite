// Dummy store information. The chatbot's get_store_info tool returns this
// data directly, so every policy answer comes from one place.

export const STORE = {
  name: "US Pizza Demo",
  isDemo: true,
  demoNotice:
    "This is a demo website with dummy data built for a job assessment. It is not an official US Pizza ordering channel, and no real orders are taken.",
  hours: {
    open: "10:00",
    close: "22:00",
    summary: "10:00am to 10:00pm daily",
  },
  delivery: {
    area: "Klang Valley",
    estimatedMinutes: { min: 30, max: 45 },
    feeSen: 500,
    freeDeliveryThresholdSen: 5000,
    minimumOrderSen: 2000,
    summary:
      "We deliver within the Klang Valley in about 30 to 45 minutes. Delivery costs RM5.00 and is free for food subtotals of RM50.00 or more. The minimum food subtotal for delivery is RM20.00.",
  },
  pickup: {
    feeSen: 0,
    readyInMinutes: 20,
    summary: "Pickup is free and is usually ready in about 20 minutes.",
  },
  payment: {
    summary:
      "You choose 'Pay on delivery or pickup' at checkout. No real payment is taken and no card details are collected.",
  },
  refunds: {
    summary:
      "Wrong or missing items can be reported within 24 hours of the order for a refund or a replacement.",
  },
  cancellations: {
    summary:
      "Orders can be cancelled free of charge until they reach the Baking stage. After that they can no longer be cancelled.",
  },
  promotions: {
    summary:
      "The only current promotion is free delivery on food subtotals of RM50.00 or more. No promo codes are available.",
    promoCodes: [] as string[],
  },
  contact: {
    email: "hello@example.com",
    // Deliberately fictional: 555 numbers are reserved for fiction.
    phone: "+60 3-0000 5555",
    summary: "Email hello@example.com or call +60 3-0000 5555.",
  },
  allergens: {
    summary:
      "Our kitchen handles gluten, dairy, egg, soy, nuts and seafood, so cross-contact is possible with any item. Each menu item lists its known allergens. If you have a serious allergy, please check with the store before ordering.",
  },
  halal: {
    summary: "This demo has no halal certification information. Please check with the store directly.",
  },
} as const;

export const STORE_TOPICS = [
  "hours",
  "delivery",
  "pickup",
  "payment",
  "refunds",
  "cancellations",
  "promotions",
  "contact",
  "allergens",
  "halal",
] as const;

export type StoreTopic = (typeof STORE_TOPICS)[number];
