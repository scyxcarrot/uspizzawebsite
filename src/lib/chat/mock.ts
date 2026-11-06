// Scripted replies for browser tests (AI_MOCK=true). No AI is called.
// Cart changes still go through the real tool code, so tests exercise the
// same validation and pricing as the live chatbot.
// Mock mode is refused in production (see isMockAllowed in config.ts).

import { MENU } from "@/data/menu";
import type { Emit } from "@/lib/chat/engine";
import type { ChatRequest } from "@/lib/chat/request";
import { TOOL_STATUS, runTool, type ToolContext } from "@/lib/chat/tools";

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
  };

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
