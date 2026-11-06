"use client";

// Chat state and the streaming request to /api/chat.
// The conversation is saved in localStorage so it survives refreshes and
// page changes.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import type { ChatEvent, ChatMessage } from "@/lib/chat/types";
import { STORAGE_KEYS, readJSON, removeKey, writeJSON } from "@/lib/storage";

const MAX_SAVED = 40;
const NETWORK_ERROR = {
  message: "I couldn't reach the assistant. Please check your connection and try again.",
  retryable: true,
};

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function loadMessages(): ChatMessage[] {
  const saved = readJSON<unknown>(STORAGE_KEYS.chat);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (m): m is ChatMessage =>
        !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string",
    )
    .slice(-MAX_SAVED);
}

export function useChat() {
  const { cart, orders, fulfilment, replaceCart, showNotice } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** Text for the screen-reader live region: set once a reply is complete. */
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest values in refs so the send function always uses them.
  const latest = useRef({ messages, cart, orders, fulfilment });
  latest.current = { messages, cart, orders, fulfilment };

  useEffect(() => {
    // One-off read from browser storage after hydration (see AppStateProvider).
    /* eslint-disable react-hooks/set-state-in-effect */
    setMessages(loadMessages());
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (loaded) writeJSON(STORAGE_KEYS.chat, messages.slice(-MAX_SAVED));
  }, [loaded, messages]);

  const updateMessage = (id: string, change: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? change(m) : m)));

  const send = useCallback(
    async (rawText: string, history?: ChatMessage[]) => {
      const text = rawText.trim();
      if (!text || busy) return;

      const base = history ?? latest.current.messages;
      const userMessage: ChatMessage = { id: newId(), role: "user", text };
      const assistantId = newId();
      const conversation = [...base, userMessage];
      setMessages([...conversation, { id: assistantId, role: "assistant", text: "" }]);
      setBusy(true);
      setStatus("Thinking…");
      setAnnouncement("");

      const controller = new AbortController();
      abortRef.current = controller;
      let finalText = "";

      const fail = (error: { message: string; retryable: boolean }) => {
        updateMessage(assistantId, (m) => ({ ...m, error }));
        finalText = error.message;
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            // Failed or empty replies are not sent back to the model.
            messages: conversation.filter((m) => !m.error && m.text.trim()).map((m) => ({ role: m.role, text: m.text })),
            cart: latest.current.cart,
            orders: latest.current.orders,
            fulfilment: latest.current.fulfilment,
          }),
        });

        if (!res.ok || !res.body) {
          let error = { message: "Sorry, something went wrong. Please try again.", retryable: true };
          try {
            const data = (await res.json()) as { error?: { message?: string; retryable?: boolean } };
            if (data.error?.message) error = { message: data.error.message, retryable: !!data.error.retryable };
          } catch {
            // not JSON: keep the generic message
          }
          fail(error);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: ChatEvent;
            try {
              event = JSON.parse(line) as ChatEvent;
            } catch {
              continue;
            }
            switch (event.type) {
              case "status":
                setStatus(event.text);
                break;
              case "text":
                finalText += event.delta;
                setStatus(null);
                updateMessage(assistantId, (m) => ({ ...m, text: m.text + event.delta }));
                break;
              case "cart":
                // The server has already validated and priced this cart.
                replaceCart(event.cart);
                showNotice(event.message);
                updateMessage(assistantId, (m) => ({ ...m, cartNotes: [...(m.cartNotes ?? []), event.message] }));
                break;
              case "sources":
                updateMessage(assistantId, (m) => ({ ...m, sources: event.sources }));
                break;
              case "error":
                fail({ message: event.message, retryable: event.retryable });
                break;
              case "done":
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          finalText = "Stopped.";
          updateMessage(assistantId, (m) => (m.text ? m : { ...m, text: "_Stopped._" }));
        } else {
          fail(NETWORK_ERROR);
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        setStatus(null);
        setAnnouncement(finalText ? `Assistant: ${finalText}` : "");
      }
    },
    [busy, replaceCart, showNotice],
  );

  /** Remove a failed reply (and the question before it) and ask again. */
  const retry = useCallback(
    (assistantId: string) => {
      const list = latest.current.messages;
      const index = list.findIndex((m) => m.id === assistantId);
      const question = list[index - 1];
      if (index < 1 || question?.role !== "user") return;
      void send(question.text, list.slice(0, index - 1));
    },
    [send],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    removeKey(STORAGE_KEYS.chat);
    setAnnouncement("Chat cleared.");
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, loaded, busy, status, announcement, send, retry, clear, stop };
}
