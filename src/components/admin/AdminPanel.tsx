"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MenuItem } from "@/data/menu";
import type { Outlet } from "@/data/outlets";
import type { Catalog } from "@/lib/catalog";
import type { CatalogSource } from "@/lib/db/catalog-server";
import type { AuditEntry } from "@/lib/db/store";
import { formatMalaysiaDateTime, hoursLabel, isTemporarilyClosed } from "@/lib/outlets";

type Props = { catalog: Catalog; audit: AuditEntry[]; source: CatalogSource; canSave: boolean };
type Message = { tone: "ok" | "error"; text: string } | null;

const rm = (sen: number) => (sen / 100).toFixed(2);
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const input = "min-h-11 w-full rounded-xl border-2 border-line bg-white px-3 focus:border-ink disabled:bg-crust";
const smallButton = "inline-flex min-h-11 items-center justify-center rounded-full px-4 font-bold disabled:opacity-60";

export function AdminPanel({ catalog, audit, source, canSave }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; summary?: string };
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "That change couldn't be saved." });
        if (res.status === 401) router.refresh();
        return false;
      }
      setMessage({ tone: "ok", text: `Saved: ${data.summary ?? "done"}. The menu and assistant update within a few seconds.` });
      router.refresh();
      return true;
    } catch {
      setMessage({ tone: "error", text: "Couldn't reach the server. Please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="space-y-6" data-testid="admin-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Admin</h1>
          <p className="text-sm text-ink-soft" data-testid="admin-source">
            {source === "database" ? "Connected to the database." : source === "memory" ? "Using the test store (not the database)." : "The database is unavailable: showing the original data. Changes can't be saved right now."}
          </p>
        </div>
        <button type="button" onClick={logout} className={`${smallButton} border-2 border-ink`} data-testid="admin-logout">
          Sign out
        </button>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`sticky top-20 z-10 rounded-xl px-4 py-3 font-medium shadow-card ${message.tone === "error" ? "bg-brand-tint text-brand-dark" : "bg-gold-tint"}`}
          data-testid="admin-message"
        >
          {message.text}
        </p>
      )}

      <section aria-labelledby="admin-menu-heading" className="space-y-3">
        <h2 id="admin-menu-heading" className="text-2xl font-extrabold">
          Menu
        </h2>
        <ul className="space-y-3">
          {catalog.menu.map((item) => (
            <ItemEditor key={`${item.id}-${JSON.stringify(item)}`} item={item} disabled={!canSave || busy} send={send} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="admin-outlets-heading" className="space-y-3">
        <h2 id="admin-outlets-heading" className="text-2xl font-extrabold">
          Outlets
        </h2>
        <ul className="space-y-3">
          {catalog.outlets.map((o) => (
            <OutletEditor key={`${o.id}-${JSON.stringify(o)}`} outlet={o} disabled={!canSave || busy} send={send} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="admin-audit-heading" className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
        <h2 id="admin-audit-heading" className="text-xl font-extrabold">
          Recent changes
        </h2>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No changes yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-line text-sm" data-testid="admin-audit">
            {audit.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
                <span className="shrink-0 tabular-nums text-ink-soft">{formatMalaysiaDateTime(a.at)}</span>
                <span className="break-words">{a.summary}</span>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={() => {
            if (window.confirm("Reset the whole menu and all outlets to the original data?")) void send("/api/admin/reset", {});
          }}
          className={`${smallButton} mt-4 border-2 border-brand text-brand`}
          data-testid="admin-reset"
        >
          Reset to original data
        </button>
      </section>
    </div>
  );
}

type Send = (path: string, body: unknown) => Promise<boolean>;

function ItemEditor({ item, disabled, send }: { item: MenuItem; disabled: boolean; send: Send }) {
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.kind === "simple" ? rm(item.price) : "");
  const [regular, setRegular] = useState(item.kind === "pizza" ? rm(item.priceBySize.regular) : "");
  const [large, setLarge] = useState(item.kind === "pizza" ? rm(item.priceBySize.large) : "");
  const id = `admin-${item.id}`;

  function save() {
    const change: Record<string, unknown> = { id: item.id };
    if (description !== item.description) change.description = description;
    if (item.kind === "pizza") {
      if (regular !== rm(item.priceBySize.regular)) change.regularRM = Number(regular);
      if (large !== rm(item.priceBySize.large)) change.largeRM = Number(large);
    } else if (price !== rm(item.price)) change.priceRM = Number(price);
    void send("/api/admin/item", change);
  }

  return (
    <li className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5" data-testid={`admin-item-${item.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">
          {item.name}
          {item.soldOut && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 align-middle text-xs font-bold uppercase text-white">Sold out</span>}
        </h3>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send("/api/admin/item", { id: item.id, soldOut: !item.soldOut })}
          aria-pressed={!!item.soldOut}
          className={`${smallButton} ${item.soldOut ? "bg-ink text-white" : "border-2 border-ink"}`}
          data-testid={`admin-soldout-${item.id}`}
        >
          {item.soldOut ? "Mark back in stock" : "Mark sold out"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor={`${id}-description`} className="text-sm font-semibold">
            Description
          </label>
          <textarea
            id={`${id}-description`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
            rows={2}
            className={`${input} py-2`}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {item.kind === "pizza" ? (
            <>
              <PriceInput id={`${id}-regular`} label="Regular (RM)" value={regular} onChange={setRegular} disabled={disabled} />
              <PriceInput id={`${id}-large`} label="Large (RM)" value={large} onChange={setLarge} disabled={disabled} />
            </>
          ) : (
            <PriceInput id={`${id}-price`} label="Price (RM)" value={price} onChange={setPrice} disabled={disabled} />
          )}
          <button type="button" disabled={disabled} onClick={save} className={`${smallButton} bg-brand text-white hover:bg-brand-dark`} data-testid={`admin-save-${item.id}`}>
            Save
          </button>
        </div>
      </div>
    </li>
  );
}

function PriceInput(props: { id: string; label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="w-28">
      <label htmlFor={props.id} className="text-sm font-semibold">
        {props.label}
      </label>
      <input
        id={props.id}
        inputMode="decimal"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
        className={`${input} tabular-nums`}
      />
    </div>
  );
}

function OutletEditor({ outlet, disabled, send }: { outlet: Outlet; disabled: boolean; send: Send }) {
  const [opensAt, setOpensAt] = useState(hhmm(outlet.hours.opensAt));
  const [closesAt, setClosesAt] = useState(hhmm(outlet.hours.closesAt));
  const [hours, setHours] = useState("2");
  const [reason, setReason] = useState("");
  const closed = isTemporarilyClosed(outlet, new Date());
  const id = `admin-outlet-${outlet.id}`;

  return (
    <li className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5" data-testid={id}>
      <h3 className="font-display text-lg font-bold">{outlet.name}</h3>
      <p className="text-sm text-ink-soft">{hoursLabel(outlet)}</p>
      {closed && (
        <p className="mt-1 text-sm font-bold text-brand-dark" data-testid={`${id}-closed`}>
          Temporarily closed until {formatMalaysiaDateTime(outlet.closedUntil!)}
          {outlet.closedReason ? ` (${outlet.closedReason})` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-32">
          <label htmlFor={`${id}-opens`} className="text-sm font-semibold">
            Opens
          </label>
          <input id={`${id}-opens`} type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={disabled} className={input} />
        </div>
        <div className="w-32">
          <label htmlFor={`${id}-closes`} className="text-sm font-semibold">
            Closes
          </label>
          <input id={`${id}-closes`} type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} disabled={disabled} className={input} />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void send("/api/admin/outlet", { id: outlet.id, opensAt, closesAt })}
          className={`${smallButton} bg-brand text-white hover:bg-brand-dark`}
          data-testid={`${id}-save-hours`}
        >
          Save hours
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        {closed ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void send("/api/admin/outlet", { id: outlet.id, closure: null })}
            className={`${smallButton} border-2 border-ink`}
            data-testid={`${id}-reopen`}
          >
            Reopen now
          </button>
        ) : (
          <>
            <div className="w-36">
              <label htmlFor={`${id}-closure-hours`} className="text-sm font-semibold">
                Close for
              </label>
              <select id={`${id}-closure-hours`} value={hours} onChange={(e) => setHours(e.target.value)} disabled={disabled} className={input}>
                {[1, 2, 4, 8, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} {h === 1 ? "hour" : "hours"}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-48">
              <label htmlFor={`${id}-closure-reason`} className="text-sm font-semibold">
                Reason (optional)
              </label>
              <input id={`${id}-closure-reason`} value={reason} onChange={(e) => setReason(e.target.value)} disabled={disabled} maxLength={120} className={input} />
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void send("/api/admin/outlet", { id: outlet.id, closure: { hours: Number(hours), reason } })}
              className={`${smallButton} border-2 border-brand text-brand`}
              data-testid={`${id}-close`}
            >
              Close temporarily
            </button>
          </>
        )}
      </div>
    </li>
  );
}
