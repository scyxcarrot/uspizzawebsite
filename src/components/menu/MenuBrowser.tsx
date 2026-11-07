"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { CATEGORIES, MENU, findMenuItem, startingPrice, type CategoryId, type MenuItem } from "@/data/menu";
import { formatRM } from "@/lib/money";
import { PlusIcon } from "@/components/Icons";
import { ItemDialog } from "@/components/menu/ItemDialog";
import { TagList } from "@/components/menu/Tags";

export function MenuBrowser() {
  // Keep the ID, not the object, so the open dialog shows live changes (e.g. sold out).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (findMenuItem(selectedId) ?? null) : null;
  const { setFocusItemId } = useAppState();
  const active = useActiveCategory();

  return (
    <>
      <CategoryNav active={active} />
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {CATEGORIES.map((cat) => {
          const items = MENU.filter((i) => i.category === cat.id);
          return (
            <section key={cat.id} id={cat.id} aria-labelledby={`${cat.id}-heading`} className="pt-8">
              <h2 id={`${cat.id}-heading`} className="mb-4 text-2xl font-extrabold sm:text-3xl">
                {cat.name}
              </h2>
              <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => (
                  <li key={item.id}>
                    <ItemCard
                      item={item}
                      onSelect={() => {
                        setSelectedId(item.id);
                        // The assistant knows which item is open ("Is this spicy?").
                        setFocusItemId(item.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <ItemDialog item={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}

function ItemCard({ item, onSelect }: { item: MenuItem; onSelect: () => void }) {
  const from = item.kind === "pizza" ? "From " : "";
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`item-${item.id}`}
      data-sold-out={item.soldOut ? "true" : undefined}
      className={`group flex h-full w-full flex-row overflow-hidden rounded-card border border-line bg-card text-left shadow-card transition-transform hover:-translate-y-0.5 min-[400px]:flex-col ${
        item.soldOut ? "opacity-70" : ""
      }`}
      aria-label={
        item.soldOut
          ? `${item.name}, sold out. View details`
          : `${item.name}, ${from}${formatRM(startingPrice(item))}. ${item.kind === "pizza" ? "Choose size and crust" : "Add to cart"}`
      }
    >
      <Image
        src={item.image}
        alt=""
        width={400}
        height={300}
        className="h-auto w-28 shrink-0 object-cover min-[400px]:aspect-[4/3] min-[400px]:w-full"
      />
      <span className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <span className="font-display text-base font-bold leading-tight sm:text-lg">{item.name}</span>
        <span className="line-clamp-2 text-sm text-ink-soft max-[399px]:hidden">{item.description}</span>
        <span className="flex flex-wrap gap-1">
          <TagList tags={item.tags} />
        </span>
        <span className="mt-auto flex items-center justify-between pt-1">
          <span className="font-bold tabular-nums">
            {from && <span className="text-xs font-medium text-ink-soft">from </span>}
            {formatRM(startingPrice(item))}
          </span>
          {item.soldOut ? (
            <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold uppercase tracking-wide text-white" data-testid="sold-out-badge">
              Sold out
            </span>
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-brand text-white transition-colors group-hover:bg-brand-dark">
              <PlusIcon />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function CategoryNav({ active }: { active: CategoryId }) {
  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-16 z-20 border-b border-line bg-cream/95 backdrop-blur"
    >
      <ul className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 sm:px-6">
        {CATEGORIES.map((cat) => (
          <li key={cat.id} className="shrink-0">
            <a
              href={`#${cat.id}`}
              aria-current={active === cat.id ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold transition-colors ${
                active === cat.id ? "bg-ink text-white" : "bg-white text-ink hover:bg-crust"
              }`}
            >
              {cat.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Highlights the category currently in view. */
function useActiveCategory(): CategoryId {
  const [active, setActive] = useState<CategoryId>(CATEGORIES[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible[0]) setActive(visible[0].target.id as CategoryId);
      },
      // A thin band near the top of the screen decides the active section.
      { rootMargin: "-140px 0px -65% 0px" },
    );
    for (const cat of CATEGORIES) {
      const el = document.getElementById(cat.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}
