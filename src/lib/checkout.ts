// Checkout form validation. Shared by the checkout page and its tests.

import { z } from "zod";
import { formatRM } from "@/lib/money";
import type { CartSummary, Fulfilment } from "@/lib/pricing";

export type CheckoutForm = {
  fulfilment: Fulfilment;
  name: string;
  phone: string;
  address: string;
};

export type CheckoutErrors = Partial<Record<"name" | "phone" | "address" | "cart", string>>;

// Malaysian numbers: 01x mobile or 0x landline, optionally written with +60 / 60.
const PHONE_PATTERN = /^(?:\+?60|0)\d{8,10}$/;

const nameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your name (at least 2 characters).")
  .max(60, "Please keep your name under 60 characters.");

const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => s.length > 0, "Please enter your phone number.")
  .refine((s) => s.length === 0 || PHONE_PATTERN.test(s), {
    message: "Please enter a valid Malaysian phone number, for example 012-345 6789.",
  });

const addressSchema = z
  .string()
  .trim()
  .min(10, "Please enter your full delivery address, including street and area.")
  .max(200, "Please keep the address under 200 characters.");

export function validateCheckout(form: CheckoutForm, cart: CartSummary): CheckoutErrors {
  const errors: CheckoutErrors = {};

  const name = nameSchema.safeParse(form.name);
  if (!name.success) errors.name = name.error.issues[0]?.message;

  const phone = phoneSchema.safeParse(form.phone);
  if (!phone.success) errors.phone = phone.error.issues[0]?.message;

  if (form.fulfilment === "delivery") {
    const address = addressSchema.safeParse(form.address);
    if (!address.success) errors.address = address.error.issues[0]?.message;
  }

  if (cart.lines.length === 0) {
    errors.cart = "Your cart is empty. Add something from the menu first.";
  } else if (!cart.meetsMinimum) {
    errors.cart = `Delivery needs a food subtotal of at least RM 20.00. Add ${formatRM(
      cart.amountToMinimumSen,
    )} more, or choose pickup.`;
  }

  return errors;
}
