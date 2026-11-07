"use client";

// Shared browser state: cart, orders and delivery/pickup choice.
// Saved to localStorage so it survives refreshes, and shared across pages
// through React context in the root layout.
//
// To avoid hydration mismatches, the server and the first browser render both
// start with an empty state. We load from storage in an effect and set
// `ready` to true, so components can show a loading state until then.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addLinesToCart,
  addToCart,
  removeCartLine,
  sanitizeCart,
  updateCartLine,
  type AddLinesResult,
  type AddToCartInput,
  type CartLine,
  type CartResult,
} from "@/lib/cart";
import { createOrder, nextOrderId, sanitizeBrowserOrders, type Customer, type Order } from "@/lib/orders";
import { priceCart, type CartSummary, type Fulfilment } from "@/lib/pricing";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import { findOutlet } from "@/data/outlets";
import type { LatLng } from "@/lib/outlets";

type StoredApp = { cart?: unknown; orders?: unknown; fulfilment?: unknown; outlet?: unknown };

/** The chosen demo outlet. Saved in the browser; never contains the customer's coordinates. */
export type OutletChoice = { outletId: string; distanceKm?: number; areaLabel?: string };

function sanitizeOutletChoice(raw: unknown): OutletChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.outletId !== "string" || !findOutlet(r.outletId)) return null;
  const choice: OutletChoice = { outletId: r.outletId };
  if (typeof r.distanceKm === "number" && Number.isFinite(r.distanceKm) && r.distanceKm >= 0 && r.distanceKm < 100) choice.distanceKm = r.distanceKm;
  if (typeof r.areaLabel === "string" && r.areaLabel.length <= 60) choice.areaLabel = r.areaLabel;
  return choice;
}

export type Notice = { id: number; text: string; tone: "success" | "info" };

type AppState = {
  ready: boolean;
  cart: CartLine[];
  summary: CartSummary;
  orders: Order[];
  fulfilment: Fulfilment;
  setFulfilment: (f: Fulfilment) => void;
  addItem: (input: AddToCartInput) => CartResult;
  setQuantity: (lineId: string, quantity: number) => CartResult;
  removeLine: (lineId: string) => CartResult;
  /** Add several lines at once (all or nothing), e.g. a group order plan. */
  addLines: (lines: CartLine[]) => AddLinesResult;
  /** Replace the whole cart, e.g. with the server-validated cart from the chatbot. */
  replaceCart: (cart: unknown) => void;
  placeOrder: (customer: Customer) => Order;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** The menu item the customer has open (or asked the assistant about), sent with chat requests. */
  focusItemId: string | null;
  setFocusItemId: (id: string | null) => void;
  notice: Notice | null;
  showNotice: (text: string, tone?: Notice["tone"]) => void;
  outlet: OutletChoice | null;
  /** Choose an outlet and how to get the order. */
  chooseOutlet: (choice: OutletChoice | null, fulfilment?: Fulfilment) => void;
  /** The customer's shared location: kept in memory for this visit only, never saved. */
  location: LatLng | null;
  setLocation: (location: LatLng | null) => void;
  outletPicker: { open: boolean; mode: Fulfilment };
  openOutletPicker: (mode?: Fulfilment) => void;
  closeOutletPicker: () => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>("delivery");
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [outlet, setOutlet] = useState<OutletChoice | null>(null);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [outletPicker, setOutletPicker] = useState<{ open: boolean; mode: Fulfilment }>({ open: false, mode: "delivery" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeId = useRef(0);

  // Load saved state once, after the first render.
  useEffect(() => {
    const load = () => {
      const saved = readJSON<StoredApp>(STORAGE_KEYS.app);
      setCart(sanitizeCart(saved?.cart));
      setOrders(sanitizeBrowserOrders(saved?.orders));
      setFulfilment(saved?.fulfilment === "pickup" ? "pickup" : "delivery");
      setOutlet(sanitizeOutletChoice(saved?.outlet));
    };
    // Reading localStorage after hydration is a deliberate one-off sync from
    // an external system; doing it during render would cause a hydration
    // mismatch because the server has no access to the browser's storage.
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Keep other open tabs in sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.app) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Save whenever something changes (but not before we have loaded).
  useEffect(() => {
    if (!ready) return;
    writeJSON(STORAGE_KEYS.app, { cart, orders, fulfilment, outlet });
  }, [ready, cart, orders, fulfilment, outlet]);

  const showNotice = useCallback((text: string, tone: Notice["tone"] = "success") => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, text, tone });
  }, []);

  // Auto-hide notices.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const applyResult = useCallback((result: CartResult) => {
    if (result.ok) setCart(result.cart);
    return result;
  }, []);

  const addItem = useCallback(
    (input: AddToCartInput) => applyResult(addToCart(cart, input)),
    [cart, applyResult],
  );
  const setQuantity = useCallback(
    (lineId: string, quantity: number) => applyResult(updateCartLine(cart, lineId, quantity)),
    [cart, applyResult],
  );
  const removeLine = useCallback(
    (lineId: string) => applyResult(removeCartLine(cart, lineId)),
    [cart, applyResult],
  );
  const replaceCart = useCallback((next: unknown) => setCart(sanitizeCart(next)), []);
  const addLines = useCallback(
    (lines: CartLine[]) => {
      const result = addLinesToCart(cart, lines);
      if (result.ok) setCart(result.cart);
      return result;
    },
    [cart],
  );

  const placeOrder = useCallback(
    (customer: Customer) => {
      const order = createOrder({
        id: nextOrderId(orders.map((o) => o.id)),
        placedAt: new Date(),
        cart,
        fulfilment,
        customer,
        outletId: outlet?.outletId,
      });
      setOrders((prev) => [order, ...prev]);
      setCart([]);
      return order;
    },
    [cart, orders, fulfilment, outlet],
  );

  const chooseOutlet = useCallback((choice: OutletChoice | null, f?: Fulfilment) => {
    setOutlet(choice ? sanitizeOutletChoice(choice) : null);
    if (f) setFulfilment(f);
  }, []);
  const openOutletPicker = useCallback(
    (mode?: Fulfilment) => setOutletPicker({ open: true, mode: mode ?? fulfilment }),
    [fulfilment],
  );
  const closeOutletPicker = useCallback(() => setOutletPicker((p) => ({ ...p, open: false })), []);

  const summary = useMemo(() => priceCart(cart, fulfilment), [cart, fulfilment]);

  const value: AppState = {
    ready,
    cart,
    summary,
    orders,
    fulfilment,
    setFulfilment,
    addItem,
    setQuantity,
    removeLine,
    addLines,
    replaceCart,
    placeOrder,
    cartOpen,
    setCartOpen,
    chatOpen,
    setChatOpen,
    focusItemId,
    setFocusItemId,
    notice,
    showNotice,
    outlet,
    chooseOutlet,
    location,
    setLocation,
    outletPicker,
    openOutletPicker,
    closeOutletPicker,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside AppStateProvider");
  return ctx;
}
