import type { Allergen, DietaryTag } from "@/data/menu";

const TAG_STYLES: Record<DietaryTag, string> = {
  Vegetarian: "bg-basil-tint text-basil",
  Beef: "bg-crust text-ink",
  Chicken: "bg-gold-tint text-ink",
  Spicy: "bg-brand-tint text-brand-dark",
  Seafood: "bg-sky-100 text-sky-900",
};

export function TagList({ tags }: { tags: DietaryTag[] }) {
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TAG_STYLES[tag]}`}>
          {tag === "Spicy" ? "🌶 Spicy" : tag}
        </span>
      ))}
    </>
  );
}

export function AllergenList({ allergens, className = "" }: { allergens: Allergen[]; className?: string }) {
  return (
    <p className={`text-sm text-ink-soft ${className}`}>
      <span className="font-semibold text-ink">Allergens: </span>
      {allergens.length ? allergens.join(", ") : "none listed"}
      <span className="block text-xs">Our kitchen handles common allergens, so cross-contact is possible.</span>
    </p>
  );
}
