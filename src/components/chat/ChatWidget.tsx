"use client";

// The AI chat widget: a button on every page that opens a floating panel on
// tablet/desktop, or a full-screen view on phones.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { CartIcon, ChatIcon, CloseIcon, RefreshIcon, SendIcon, TrashIcon } from "@/components/Icons";
import { ChatCards } from "@/components/chat/ChatCards";
import { Markdown } from "@/components/chat/Markdown";
import { useChat } from "@/components/chat/useChat";
import { LIMITS } from "@/lib/chat/config";
import type { PlanCard } from "@/lib/chat/cards";
import type { ChatMessage } from "@/lib/chat/types";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const chat = useChat();
  const { setCartOpen, cartOpen } = useAppState();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const viewport = useVisualViewport(open);
  const returnFocus = useRef(false);

  // Focus the input when the panel opens; lock page scroll on phones.
  useEffect(() => {
    document.documentElement.classList.toggle("chat-open", open);
    if (open) inputRef.current?.focus({ preventScroll: true });
    // The launcher is re-mounted after closing, so return focus here.
    else if (returnFocus.current) {
      returnFocus.current = false;
      launcherRef.current?.focus();
    }
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.status, open]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft.trim() || chat.busy) return;
    void chat.send(draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      {!open && !cartOpen && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          data-testid="chat-launcher"
          aria-haspopup="dialog"
          className="fixed right-4 z-40 flex size-14 items-center justify-center gap-2 rounded-full bg-ink text-white ring-2 ring-white shadow-[var(--shadow-pop)] hover:bg-black md:right-6 md:h-14 md:w-auto md:px-5"
          style={{ bottom: "calc(var(--bottom-bar-h) + max(1rem, env(safe-area-inset-bottom)))" }}
        >
          <ChatIcon />
          <span className="sr-only md:not-sr-only md:font-bold">Ask our AI assistant</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="chat-title"
          data-testid="chat-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="anim-sheet fixed inset-x-0 top-[var(--vv-top,0px)] z-40 flex h-[var(--vv-height,100dvh)] flex-col bg-cream md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:h-[min(640px,calc(100dvh-7rem))] md:w-[400px] md:overflow-hidden md:rounded-card md:border md:border-line md:shadow-[var(--shadow-pop)]"
          style={viewport}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line bg-white px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden>
              <ChatIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <h2 id="chat-title" className="font-display text-lg font-extrabold">
                Pizza assistant
              </h2>
              <p className="truncate text-xs text-ink-soft">AI can make mistakes · demo data only</p>
            </div>
            <button
              type="button"
              onClick={chat.clear}
              disabled={chat.messages.length === 0}
              className="grid size-11 place-items-center rounded-full text-ink-soft hover:bg-crust hover:text-ink disabled:opacity-40"
              aria-label="Clear chat"
              title="Clear chat"
              data-testid="chat-clear"
            >
              <TrashIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={close}
              className="grid size-11 place-items-center rounded-full hover:bg-crust"
              aria-label="Close chat"
              data-testid="chat-close"
            >
              <CloseIcon />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" data-testid="chat-messages">
            {chat.messages.length === 0 && <Welcome onAsk={(q) => void chat.send(q)} />}
            {chat.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onRetry={() => chat.retry(m.id)}
                onViewCart={() => setCartOpen(true)}
                onAddPlan={(plan) => chat.addPlan(m.id, plan)}
                busy={chat.busy}
              />
            ))}
            {chat.status && (
              <p className="flex items-center gap-2 text-sm text-ink-soft" data-testid="chat-status">
                <span className="flex gap-1" aria-hidden>
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:120ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:240ms]" />
                </span>
                {chat.status}
              </p>
            )}
          </div>

          {/* Screen readers hear each complete reply once, not every streamed word. */}
          <p className="sr-only" aria-live="polite" role="status">
            {chat.announcement}
          </p>

          <form
            onSubmit={submit}
            className="flex shrink-0 items-end gap-2 border-t border-line bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <label htmlFor="chat-input" className="sr-only">
              Message the pizza assistant
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={LIMITS.maxMessageChars}
              placeholder="Ask about the menu, an order, or anything…"
              className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border-2 border-line bg-cream px-3 py-2.5 text-base focus:border-ink [field-sizing:content]"
              data-testid="chat-input"
            />
            {chat.busy ? (
              <button
                type="button"
                onClick={chat.stop}
                className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink font-bold"
                aria-label="Stop reply"
              >
                <span className="size-3.5 rounded-sm bg-ink" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-white hover:bg-brand-dark disabled:opacity-40"
                aria-label="Send message"
                data-testid="chat-send"
              >
                <SendIcon />
              </button>
            )}
          </form>
        </section>
      )}
    </>
  );
}

const STARTERS = [
  "Which vegetarian pizzas do you have?",
  "Add a large Margherita to my cart",
  "Where's order US-1002?",
  "How much is delivery?",
];

function Welcome({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="font-display text-lg font-bold">Hi! I&apos;m the US Pizza Demo assistant. 🍕</p>
        <p className="mt-1 text-sm text-ink-soft">
          Ask me about the menu, allergens, delivery, your order, or anything else. I can also add things to your
          cart.
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-soft">Try asking</p>
        <ul className="flex flex-wrap gap-2">
          {STARTERS.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="min-h-11 rounded-full border border-line bg-white px-3.5 py-2 text-left text-sm font-medium hover:border-ink"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MessageBubble(props: {
  message: ChatMessage;
  onRetry: () => void;
  onViewCart: () => void;
  onAddPlan: (plan: PlanCard) => void;
  busy: boolean;
}) {
  const { message: m } = props;
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p
          className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-white"
          data-testid="chat-user-message"
        >
          <span className="sr-only">You: </span>
          {m.text}
        </p>
      </div>
    );
  }
  if (!m.text && !m.error && !m.cartNotes?.length && !m.cards?.length) return null;

  return (
    <div className="max-w-[92%] space-y-2" data-testid="chat-assistant-message">
      {m.text && (
        <div className="break-words rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-card">
          <span className="sr-only">Assistant: </span>
          <Markdown text={m.text} />
        </div>
      )}
      {m.cards && m.cards.length > 0 && <ChatCards cards={m.cards} onAddPlan={props.onAddPlan} />}
      {m.cartNotes?.map((note, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-basil-tint px-3 py-2 text-sm font-semibold text-basil" data-testid="chat-cart-note">
          <CartIcon className="size-4" />
          <span className="flex-1">{note}</span>
          <button type="button" onClick={props.onViewCart} className="min-h-11 rounded-full px-2 underline underline-offset-2">
            View cart
          </button>
        </div>
      ))}
      {m.sources && m.sources.length > 0 && (
        <div className="rounded-xl border border-line bg-white px-3 py-2 text-sm" data-testid="chat-sources">
          <p className="font-semibold">Sources</p>
          <ul className="mt-1 space-y-1">
            {m.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-words text-brand underline underline-offset-2">
                  {s.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.error && (
        <div role="alert" className="rounded-xl bg-gold-tint px-3 py-2 text-sm" data-testid="chat-error">
          <p>{m.error.message}</p>
          {m.error.retryable && (
            <button
              type="button"
              onClick={props.onRetry}
              disabled={props.busy}
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 font-bold text-ink underline underline-offset-2 disabled:opacity-50"
              data-testid="chat-retry"
            >
              <RefreshIcon /> Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * On phones, the on-screen keyboard shrinks the visual viewport but not the
 * layout viewport. We size the full-screen chat to the visual viewport so
 * the input stays above the keyboard. On larger screens the CSS ignores it.
 */
function useVisualViewport(active: boolean): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties | undefined>(undefined);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () =>
      setStyle({ "--vv-height": `${vv.height}px`, "--vv-top": `${vv.offsetTop}px` } as React.CSSProperties);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return style;
}
