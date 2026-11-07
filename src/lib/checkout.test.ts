import { describe, expect, it } from "vitest";
import { validateCheckout, type CheckoutForm } from "@/lib/checkout";
import { priceCart } from "@/lib/pricing";

const bigCart = priceCart([{ lineId: "beef-bolognese", itemId: "beef-bolognese", quantity: 2 }], "delivery");
const valid: CheckoutForm = {
  fulfilment: "delivery",
  name: "Siti Aminah",
  phone: "012-345 6789",
  address: "12 Jalan Demo, Petaling Jaya",
  outletId: "petaling-jaya",
};

describe("validateCheckout", () => {
  it("accepts a valid delivery order", () => {
    expect(validateCheckout(valid, bigCart)).toEqual({});
  });

  it("accepts common Malaysian phone formats", () => {
    for (const phone of ["0123456789", "+60123456789", "60 12-345 6789", "03-1234 5678"]) {
      expect(validateCheckout({ ...valid, phone }, bigCart).phone).toBeUndefined();
    }
  });

  it("explains each missing or invalid field", () => {
    const errors = validateCheckout({ ...valid, name: " ", phone: "abc", address: "short" }, bigCart);
    expect(errors.name).toMatch(/name/i);
    expect(errors.phone).toMatch(/valid Malaysian phone/i);
    expect(errors.address).toMatch(/address/i);
  });

  it("asks for a phone number when it is empty", () => {
    expect(validateCheckout({ ...valid, phone: "" }, bigCart).phone).toBe("Please enter your phone number.");
  });

  it("does not need an address for pickup", () => {
    const pickupCart = priceCart(bigCart.lines, "pickup");
    expect(validateCheckout({ ...valid, fulfilment: "pickup", address: "" }, pickupCart)).toEqual({});
  });

  it("blocks delivery below the RM20 minimum and explains why", () => {
    const small = priceCart([{ lineId: "cola", itemId: "cola", quantity: 1 }], "delivery");
    expect(validateCheckout(valid, small).cart).toBe(
      "Delivery needs a food subtotal of at least RM 20.00. Add RM 15.00 more, or choose pickup.",
    );
  });

  it("allows a small pickup order", () => {
    const small = priceCart([{ lineId: "cola", itemId: "cola", quantity: 1 }], "pickup");
    expect(validateCheckout({ ...valid, fulfilment: "pickup" }, small).cart).toBeUndefined();
  });

  it("blocks an empty cart", () => {
    expect(validateCheckout(valid, priceCart([], "delivery")).cart).toMatch(/empty/);
  });
});

describe("validateCheckout: outlet", () => {
  it("needs a real outlet", () => {
    expect(validateCheckout({ ...valid, outletId: null }, bigCart).outlet).toMatch(/choose the outlet/);
    expect(validateCheckout({ ...valid, outletId: "atlantis" }, bigCart).outlet).toBeDefined();
    expect(validateCheckout({ ...valid, fulfilment: "pickup", outletId: undefined }, bigCart).outlet).toMatch(/pick up from/);
    expect(validateCheckout(valid, bigCart).outlet).toBeUndefined();
  });
});
