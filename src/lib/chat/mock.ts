// Scripted replies for browser tests (AI_MOCK=true). No AI is called.
// Cart changes still go through the real tool code, so tests exercise the
// same validation and pricing as the live chatbot.
// Mock mode is refused in production (see isMockAllowed in config.ts).

import { MENU } from "@/data/menu";
import { AREAS, OUTLETS } from "@/data/outlets";
import type { ChatCard } from "@/lib/chat/cards";
import { applyOutcome, finalCards, type Emit, type TurnCards } from "@/lib/chat/engine";
import type { ChatRequest } from "@/lib/chat/request";
import { TOOL_STATUS, runTool, type ToolContext, type ToolName } from "@/lib/chat/tools";

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

function streamText(emit: Emit, text: string) {
  for (const piece of text.match(/.{1,24}(\s|$)/g) ?? [text]) emit({ type: "text", delta: piece });
}

export async function runMockTurn(request: ChatRequest, emit: Emit): Promise<void> {
  const last = request.messages[request.messages.length - 1]?.text ?? "";
  const text = last.toLowerCase();
  const ctx: ToolContext = {
    cart: request.cart,
    fulfilment: request.fulfilment,
    browserOrders: request.orders,
    now: new Date(),
    webSearch: async () => ({
      ok: true,
      answer: "Mock search result.",
      sources: [{ title: "Example source", url: "https://example.com/" }],
    }),
    pendingPlan: request.pendingPlan,
    location: request.location,
    outletId: request.outletId,
  };
  const turn: TurnCards = { cards: [] as ChatCard[], cartChanged: false };
  /** Run a real tool, apply its cart change and keep its card, like the live engine. */
  const tool = async (name: ToolName, args: Record<string, unknown>) => {
    emit({ type: "status", text: TOOL_STATUS[name], tool: name });
    const outcome = await runTool(name, args, ctx);
    applyOutcome(outcome, ctx, emit, turn);
    return outcome;
  };
  const finish = () => {
    for (const card of finalCards(turn)) emit({ type: "card", card });
    emit({ type: "done" });
  };

  // Group order planner: "Feed 6 people under RM120, 2 are vegetarian, no beef"
  const people = text.match(/\b(\d+)\s*(?:people|persons|pax|of us)\b/);
  if (people && /\b(feed|plan|group|party|people)\b/.test(text)) {
    const budget = text.match(/rm\s?(\d+(?:\.\d+)?)/);
    const veg = text.match(/\b(\d+)\s*(?:are\s+)?vegetarians?\b/);
    const exclude = [...text.matchAll(/\bno\s+([a-z]+)/g)].map((m) => m[1]!).filter((w) => w !== "budget");
    const outcome = await tool("plan_order", {
      people: Number(people[1]),
      ...(budget ? { budget_rm: Number(budget[1]) } : {}),
      ...(veg ? { vegetarians: Number(veg[1]) } : {}),
      ...(exclude.length ? { exclude } : {}),
      ...(/\bdessert\b/.test(text) ? { dessert: true } : {}),
    });
    const r = outcome.result;
    streamText(
      emit,
      r.ok
        ? `(Mock) Here's a plan for ${String(r.people)} people: total ${String(r.total)}, about ${String(r.per_person)} each.${
            r.within_budget ? "" : ` It is ${String(r.over_budget_by)} over your budget.`
          } Nothing is in your cart yet. Tap **Add all to cart** or say yes.`
        : `(Mock) Sorry, I couldn't plan that: ${String(r.error ?? "no items fit")}`,
    );
    finish();
    return;
  }

  if (/^(yes|yes please|yep|ok|okay|sure|add (it )?all|add the plan)\b/.test(text.trim())) {
    const outcome = await tool("add_plan_to_cart", {});
    streamText(emit, outcome.cart ? `(Mock) Done! ${outcome.cartMessage}. [Go to checkout](/checkout)` : `(Mock) ${String(outcome.result.error)}`);
    finish();
    return;
  }

  // Outlets: "nearest outlet", "outlets near Bangsar", "switch to pickup at KLCC"
  if (/\b(outlet|outlets|store|branch|nearest|near me)\b/.test(text)) {
    const area = AREAS.find((a) => text.includes(a.name.toLowerCase()));
    const switching = /\b(switch|change|use|set)\b/.test(text);
    if (switching) {
      const target = OUTLETS.find((o) => text.includes(o.area.toLowerCase()));
      const fulfilment = /\bpick ?up\b/.test(text) ? "pickup" : "delivery";
      if (!target) {
        streamText(emit, "(Mock) Which outlet would you like?");
        finish();
        return;
      }
      const outcome = await tool("set_outlet", { outlet: target.id, fulfilment });
      streamText(emit, outcome.outletChange ? `(Mock) Done: ${outcome.outletChange.message}.` : `(Mock) ${String(outcome.result.error)}`);
      finish();
      return;
    }
    const outcome = await tool("find_outlets", area ? { area: area.name } : {});
    const list = outcome.result.outlets as { name: string; distance?: string; delivers_here?: boolean }[] | undefined;
    const first = list?.[0];
    streamText(
      emit,
      first?.distance
        ? `(Mock) The nearest outlet is ${first.name}, ${first.distance} away.${first.delivers_here ? " It delivers to you." : " It's outside the delivery radius, so pickup only."}`
        : "(Mock) Share your location or tell me your area, and I'll find the nearest outlet.",
    );
    finish();
    return;
  }

  // Page awareness: "Is this spicy?" / "Add this" while an item is open.
  const open = request.page?.itemId ? MENU.find((i) => i.id === request.page?.itemId) : undefined;
  if (open && /\b(this|it|this one)\b/.test(text)) {
    if (/\badd\b/.test(text)) {
      const size = /\blarge\b/.test(text) ? "large" : /\bregular\b/.test(text) ? "regular" : undefined;
      if (open.kind === "pizza" && !size) {
        streamText(emit, `(Mock) Sure! Which size would you like for the ${open.name}: Regular or Large?`);
        finish();
        return;
      }
      const outcome = await tool("add_to_cart", { item: open.id, quantity: 1, ...(size ? { size } : {}) });
      streamText(emit, outcome.cart ? `(Mock) Done! ${outcome.cartMessage}.` : `(Mock) Sorry: ${String(outcome.result.error)}`);
      finish();
      return;
    }
    await tool("get_item", { item: open.id });
    const spicy = open.tags.includes("Spicy");
    streamText(
      emit,
      /\bspicy\b/.test(text)
        ? `(Mock) ${spicy ? "Yes" : "No"}, the ${open.name} is ${spicy ? "" : "not "}spicy.`
        : `(Mock) Here's the ${open.name}.`,
    );
    finish();
    return;
  }

  if (/\badd\b/.test(text)) {
    const item = MENU.find(
      (i) => text.includes(i.name.toLowerCase()) || i.id.split("-").some((p) => p.length >= 4 && text.includes(p)),
    );
    if (!item) {
      streamText(emit, "(Mock) Which item would you like, and for a pizza, which size: Regular or Large?");
      emit({ type: "done" });
      return;
    }
    const qtyMatch = text.match(/\b(\d+|a|an|one|two|three|four|five)\b/);
    const quantity = qtyMatch ? Number(qtyMatch[1]) || NUMBER_WORDS[qtyMatch[1]!] || 1 : 1;
    const size = /\blarge\b/.test(text) ? "large" : /\bregular\b/.test(text) ? "regular" : undefined;
    if (item.kind === "pizza" && !size) {
      streamText(emit, `(Mock) Sure! Which size would you like for the ${item.name}: Regular or Large?`);
      emit({ type: "done" });
      return;
    }
    emit({ type: "status", text: TOOL_STATUS.add_to_cart, tool: "add_to_cart" });
    const outcome = await runTool("add_to_cart", { item: item.id, quantity, ...(size ? { size } : {}) }, ctx);
    if (outcome.cart) {
      emit({ type: "cart", cart: outcome.cart, message: outcome.cartMessage ?? "Cart updated" });
      const crustNote = item.kind === "pizza" ? " I used Hand-Tossed crust, but you can change it." : "";
      streamText(emit, `(Mock) Done! ${outcome.cartMessage}.${crustNote} [Go to checkout](/checkout)`);
    } else {
      streamText(emit, `(Mock) Sorry, I couldn't add that: ${String(outcome.result.error)}`);
    }
    emit({ type: "done" });
    return;
  }

  const orderId = text.match(/\bus-?\d{4}\b/);
  if (orderId) {
    const outcome = await tool("get_order_status", { order_id: orderId[0] });
    streamText(
      emit,
      outcome.result.found ? `(Mock) Order ${String(outcome.result.order_id)} is ${String(outcome.result.status)}.` : "(Mock) I couldn't find that order.",
    );
    finish();
    return;
  }

  if (/\bcart\b/.test(text)) {
    const outcome = await tool("get_cart", {});
    const cart = outcome.result.cart as { total: string; item_count: number };
    streamText(emit, cart.item_count ? `(Mock) Your cart comes to ${cart.total}.` : "(Mock) Your cart is empty.");
    finish();
    return;
  }

  if (/\b(vegetarian|veggie)\b/.test(text) && /\bpizzas?\b/.test(text)) {
    await tool("search_menu", { category: "pizzas", dietary_tag: "Vegetarian" });
    streamText(emit, "(Mock) Here are our vegetarian pizzas.");
    finish();
    return;
  }

  const named = MENU.find((i) => text.includes(i.name.toLowerCase()));
  if (named) {
    const outcome = await tool("get_item", { item: named.id });
    const soldOut = JSON.stringify(outcome.result).includes('"sold_out"');
    streamText(emit, soldOut ? `(Mock) Sorry, the ${named.name} is sold out right now.` : `(Mock) Here's the ${named.name}.`);
    finish();
    return;
  }

  if (/\bweather\b|\bnews\b/.test(text)) {
    emit({ type: "status", text: TOOL_STATUS.web_search, tool: "web_search" });
    const outcome = await runTool("web_search", { query: last }, ctx);
    streamText(emit, "(Mock) Here is what I found on the web.");
    if (outcome.sources) emit({ type: "sources", sources: outcome.sources });
    emit({ type: "done" });
    return;
  }

  emit({ type: "status", text: TOOL_STATUS.search_menu, tool: "search_menu" });
  streamText(
    emit,
    "(Mock reply) This is a scripted test response. Try **\"Add two large pepperoni pizzas\"** to see the cart update.\n\n- Mock mode is for tests only\n- No AI is called",
  );
  emit({ type: "done" });
}
