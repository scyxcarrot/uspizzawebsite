// Dummy menu data for the US Pizza Demo.
// All prices are integers in sen (RM 1.00 = 100 sen) so we never hit
// floating-point rounding problems. Format them only for display.

export const CATEGORIES = [
  { id: "pizzas", name: "Pizzas" },
  { id: "sides", name: "Sides" },
  { id: "pasta", name: "Pasta" },
  { id: "drinks", name: "Drinks" },
  { id: "desserts", name: "Desserts" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const DIETARY_TAGS = ["Vegetarian", "Beef", "Chicken", "Spicy", "Seafood"] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

export const ALLERGENS = ["gluten", "dairy", "egg", "soy", "nuts", "seafood"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const SIZES = [
  { id: "regular", name: "Regular" },
  { id: "large", name: "Large" },
] as const;
export type SizeId = (typeof SIZES)[number]["id"];

export const CRUSTS = [
  { id: "hand-tossed", name: "Hand-Tossed", extraSen: 0 },
  { id: "thin", name: "Thin", extraSen: 0 },
  { id: "cheese-stuffed", name: "Cheese-Stuffed", extraSen: 500 },
] as const;
export type CrustId = (typeof CRUSTS)[number]["id"];

export const DEFAULT_CRUST: CrustId = "hand-tossed";

type BaseItem = {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  image: string;
  tags: DietaryTag[];
  allergens: Allergen[];
};

/** A pizza has a price per size and needs a size and crust to be ordered. */
export type PizzaItem = BaseItem & {
  kind: "pizza";
  priceBySize: Record<SizeId, number>;
};

/** Everything else has a single fixed price and no options. */
export type SimpleItem = BaseItem & {
  kind: "simple";
  price: number;
};

export type MenuItem = PizzaItem | SimpleItem;

const img = (id: string) => `/images/menu/${id}.svg`;

export const MENU: MenuItem[] = [
  // Pizzas
  {
    id: "margherita",
    kind: "pizza",
    name: "Margherita",
    category: "pizzas",
    description: "San Marzano-style tomato, creamy mozzarella and fresh basil on a golden crust.",
    image: img("margherita"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy"],
    priceBySize: { regular: 2200, large: 3400 },
  },
  {
    id: "beef-pepperoni",
    kind: "pizza",
    name: "Beef Pepperoni",
    category: "pizzas",
    description: "A generous layer of crisp-edged beef pepperoni over rich tomato and mozzarella.",
    image: img("beef-pepperoni"),
    tags: ["Beef"],
    allergens: ["gluten", "dairy"],
    priceBySize: { regular: 2600, large: 3900 },
  },
  {
    id: "bbq-chicken-feast",
    kind: "pizza",
    name: "BBQ Chicken Feast",
    category: "pizzas",
    description: "Smoky BBQ sauce, roast chicken, red onion and sweet corn, finished with melted cheese.",
    image: img("bbq-chicken-feast"),
    tags: ["Chicken"],
    allergens: ["gluten", "dairy", "soy"],
    priceBySize: { regular: 2700, large: 4100 },
  },
  {
    id: "hawaiian-chicken",
    kind: "pizza",
    name: "Hawaiian Chicken",
    category: "pizzas",
    description: "Chicken ham and juicy pineapple on tomato and mozzarella. Sweet, salty, sorted.",
    image: img("hawaiian-chicken"),
    tags: ["Chicken"],
    allergens: ["gluten", "dairy"],
    priceBySize: { regular: 2500, large: 3800 },
  },
  {
    id: "spicy-sambal-chicken",
    kind: "pizza",
    name: "Spicy Sambal Chicken",
    category: "pizzas",
    description: "Fiery house sambal, tender chicken, onion and cili padi for those who like the heat.",
    image: img("spicy-sambal-chicken"),
    tags: ["Chicken", "Spicy"],
    // House sambal is made with belacan (shrimp paste).
    allergens: ["gluten", "dairy", "seafood"],
    priceBySize: { regular: 2700, large: 4100 },
  },
  {
    id: "veggie-garden",
    kind: "pizza",
    name: "Veggie Garden",
    category: "pizzas",
    description: "Capsicum, mushroom, black olive, onion and tomato on a herby tomato base.",
    image: img("veggie-garden"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy"],
    priceBySize: { regular: 2400, large: 3600 },
  },
  {
    id: "seafood-deluxe",
    kind: "pizza",
    name: "Seafood Deluxe",
    category: "pizzas",
    description: "Prawns, squid and crab stick with garlic butter and a squeeze of lemon.",
    image: img("seafood-deluxe"),
    tags: ["Seafood"],
    allergens: ["gluten", "dairy", "seafood"],
    priceBySize: { regular: 3100, large: 4600 },
  },
  {
    id: "meat-lovers",
    kind: "pizza",
    name: "Meat Lovers",
    category: "pizzas",
    description: "Beef pepperoni, minced beef, chicken sausage and roast chicken. Not for the faint-hearted.",
    image: img("meat-lovers"),
    tags: ["Beef", "Chicken"],
    allergens: ["gluten", "dairy", "soy"],
    priceBySize: { regular: 3200, large: 4800 },
  },

  // Sides
  {
    id: "garlic-bread",
    kind: "simple",
    name: "Garlic Bread",
    category: "sides",
    description: "Warm, crusty bread brushed with garlic and herb butter.",
    image: img("garlic-bread"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy"],
    price: 900,
  },
  {
    id: "chicken-wings",
    kind: "simple",
    name: "Chicken Wings (6 pieces)",
    category: "sides",
    description: "Six crispy wings tossed in a sticky, spicy glaze.",
    image: img("chicken-wings"),
    tags: ["Chicken", "Spicy"],
    allergens: ["soy"],
    price: 1600,
  },
  {
    id: "cheesy-potato-wedges",
    kind: "simple",
    name: "Cheesy Potato Wedges",
    category: "sides",
    description: "Seasoned potato wedges smothered in melted cheese sauce.",
    image: img("cheesy-potato-wedges"),
    tags: ["Vegetarian"],
    allergens: ["dairy"],
    price: 1200,
  },
  {
    id: "garden-salad",
    kind: "simple",
    name: "Garden Salad",
    category: "sides",
    description: "Crisp lettuce, cucumber, cherry tomato and carrot with honey-mustard dressing.",
    image: img("garden-salad"),
    tags: ["Vegetarian"],
    allergens: ["egg"],
    price: 1400,
  },

  // Pasta
  {
    id: "creamy-mushroom-penne",
    kind: "simple",
    name: "Creamy Mushroom Penne",
    category: "pasta",
    description: "Penne in a silky cream sauce with sautéed button mushrooms and parmesan.",
    image: img("creamy-mushroom-penne"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy"],
    price: 1900,
  },
  {
    id: "beef-bolognese",
    kind: "simple",
    name: "Beef Bolognese",
    category: "pasta",
    description: "Slow-cooked minced beef and tomato ragù over spaghetti, topped with parmesan.",
    image: img("beef-bolognese"),
    tags: ["Beef"],
    allergens: ["gluten", "dairy"],
    price: 2000,
  },

  // Drinks
  {
    id: "cola",
    kind: "simple",
    name: "Cola",
    category: "drinks",
    description: "Ice-cold classic cola. 330ml can.",
    image: img("cola"),
    tags: ["Vegetarian"],
    allergens: [],
    price: 500,
  },
  {
    id: "iced-lemon-tea",
    kind: "simple",
    name: "Iced Lemon Tea",
    category: "drinks",
    description: "Freshly brewed black tea with lemon, served over ice.",
    image: img("iced-lemon-tea"),
    tags: ["Vegetarian"],
    allergens: [],
    price: 600,
  },
  {
    id: "mineral-water",
    kind: "simple",
    name: "Mineral Water",
    category: "drinks",
    description: "Still mineral water. 500ml bottle.",
    image: img("mineral-water"),
    tags: ["Vegetarian"],
    allergens: [],
    price: 300,
  },

  // Desserts
  {
    id: "chocolate-lava-cake",
    kind: "simple",
    name: "Chocolate Lava Cake",
    category: "desserts",
    description: "A warm chocolate cake with a molten, gooey centre.",
    image: img("chocolate-lava-cake"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy", "egg"],
    price: 1100,
  },
  {
    id: "cinnamon-rolls",
    kind: "simple",
    name: "Cinnamon Rolls",
    category: "desserts",
    description: "Soft, swirled rolls with cinnamon sugar and a vanilla glaze.",
    image: img("cinnamon-rolls"),
    tags: ["Vegetarian"],
    allergens: ["gluten", "dairy", "egg"],
    price: 1000,
  },
  {
    id: "mango-ice-cream",
    kind: "simple",
    name: "Mango Ice Cream",
    category: "desserts",
    description: "Two scoops of creamy, tropical mango ice cream.",
    image: img("mango-ice-cream"),
    tags: ["Vegetarian"],
    allergens: ["dairy"],
    price: 800,
  },
];

export function findMenuItem(id: string): MenuItem | undefined {
  return MENU.find((item) => item.id === id);
}

/** The lowest price a customer can pay for this item (Regular, Hand-Tossed for pizzas). */
export function startingPrice(item: MenuItem): number {
  return item.kind === "pizza" ? item.priceBySize.regular : item.price;
}
