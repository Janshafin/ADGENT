/** Demo merchant network for the simulated PayPal transaction graph. */

export type SeedMerchant = {
  id: string;
  name: string;
  category: string;
  emoji: string;
  /** typical days between repeat purchases (replenishable goods) */
  cycleDays: number | null;
  products: { id: string; title: string; description: string; category: string; price: number; image: string; tags: string[] }[];
};

export const SEED_MERCHANTS: SeedMerchant[] = [
  {
    id: "m_beanthere",
    name: "Bean There Coffee Roasters",
    category: "coffee",
    emoji: "☕",
    cycleDays: 21,
    products: [
      { id: "p_bt_espresso", title: "Midnight Espresso Blend (12oz)", description: "Dark chocolate, molasses, low acidity. Roasted to order in small batches.", category: "coffee", price: 1899, image: "☕", tags: ["coffee", "beans", "espresso", "dark roast", "whole bean", "chocolate"] },
      { id: "p_bt_ethiopia", title: "Ethiopia Yirgacheffe (12oz)", description: "Single-origin light roast. Jasmine, bergamot, lemon.", category: "coffee", price: 2199, image: "🌸", tags: ["coffee", "beans", "single origin", "light roast", "pour over", "fruity"] },
      { id: "p_bt_decaf", title: "Swiss Water Decaf (12oz)", description: "Chemical-free decaf with caramel sweetness.", category: "coffee", price: 1799, image: "🌙", tags: ["coffee", "beans", "decaf", "medium roast", "evening"] },
      { id: "p_bt_sub", title: "Roaster's Choice Subscription (2 bags)", description: "Two rotating bags every 3 weeks. Skip anytime.", category: "coffee", price: 3499, image: "📦", tags: ["coffee", "beans", "subscription", "variety", "gift"] },
      { id: "p_bt_coldbrew", title: "Cold Brew Coarse Grind (2lb)", description: "Smooth, sweet, made for overnight cold brew.", category: "coffee", price: 2899, image: "🧊", tags: ["coffee", "cold brew", "ground", "iced", "summer"] },
    ],
  },
  {
    id: "m_brewlab",
    name: "BrewLab Gear",
    category: "brewing equipment",
    emoji: "⚗️",
    cycleDays: null,
    products: [
      { id: "p_bl_grinder", title: "Precision Burr Grinder", description: "40 grind settings, conical steel burrs, espresso-capable.", category: "brewing equipment", price: 14900, image: "⚙️", tags: ["coffee", "grinder", "espresso", "gear", "gift", "nerd", "burr"] },
      { id: "p_bl_kettle", title: "Gooseneck Pour-Over Kettle", description: "Variable temperature, 0.9L, hold mode.", category: "brewing equipment", price: 7900, image: "🫖", tags: ["coffee", "tea", "kettle", "pour over", "gear", "gift"] },
      { id: "p_bl_v60", title: "Ceramic Dripper + 100 Filters", description: "Classic cone dripper for clean, bright cups.", category: "brewing equipment", price: 3400, image: "🔻", tags: ["coffee", "pour over", "dripper", "gear", "beginner"] },
      { id: "p_bl_scale", title: "Coffee Scale with Timer", description: "0.1g precision, auto-timer, USB-C.", category: "brewing equipment", price: 4500, image: "⚖️", tags: ["coffee", "scale", "gear", "gift", "nerd", "espresso"] },
    ],
  },
  {
    id: "m_crumb",
    name: "Crumb & Co Bakery",
    category: "bakery",
    emoji: "🥐",
    cycleDays: 14,
    products: [
      { id: "p_cc_biscotti", title: "Almond Biscotti Tin", description: "Twice-baked, perfect for dunking. 24 pieces.", category: "bakery", price: 1600, image: "🥖", tags: ["biscotti", "snack", "tasty", "treat", "coffee", "morning", "gift"] },
      { id: "p_cc_croissant", title: "Freeze & Bake Croissants (8)", description: "Laminated butter croissants, bake from frozen in 20 min.", category: "bakery", price: 2400, image: "🥐", tags: ["croissant", "breakfast", "pastry", "tasty", "morning", "coffee"] },
      { id: "p_cc_banana", title: "Brown Butter Banana Bread", description: "Moist loaf with toasted walnuts.", category: "bakery", price: 1400, image: "🍞", tags: ["bread", "banana", "breakfast", "tasty", "snack", "morning"] },
    ],
  },
  {
    id: "m_leaf",
    name: "Leaf & Loom Tea House",
    category: "tea",
    emoji: "🍵",
    cycleDays: 30,
    products: [
      { id: "p_ll_matcha", title: "Ceremonial Matcha (30g)", description: "Stone-ground Uji matcha, vibrant and umami.", category: "tea", price: 2800, image: "🍵", tags: ["tea", "matcha", "green tea", "caffeine", "gift"] },
      { id: "p_ll_earl", title: "Earl Grey Crème (100g)", description: "Black tea with bergamot and vanilla.", category: "tea", price: 1500, image: "🫖", tags: ["tea", "black tea", "earl grey", "bergamot", "morning"] },
      { id: "p_ll_chai", title: "Masala Chai Blend (150g)", description: "Assam with cardamom, ginger, clove.", category: "tea", price: 1700, image: "🌶️", tags: ["tea", "chai", "spiced", "latte", "cozy"] },
    ],
  },
  {
    id: "m_trailhead",
    name: "Trailhead Outfitters",
    category: "outdoor",
    emoji: "🏕️",
    cycleDays: null,
    products: [
      { id: "p_th_flask", title: "Insulated Camp Flask (1L)", description: "Keeps coffee hot 24h. Lifetime warranty.", category: "outdoor", price: 3900, image: "🧴", tags: ["flask", "camping", "hiking", "travel", "coffee", "outdoor", "gift"] },
      { id: "p_th_press", title: "Travel French Press Mug", description: "Brew and drink in one 16oz mug.", category: "outdoor", price: 3200, image: "🥤", tags: ["french press", "travel", "coffee", "mug", "camping", "commute"] },
      { id: "p_th_stove", title: "Ultralight Backpacking Stove", description: "Boils 1L in 3.5 min, 85g.", category: "outdoor", price: 5900, image: "🔥", tags: ["stove", "camping", "hiking", "backpacking", "outdoor"] },
    ],
  },
  {
  id: "m_sunnyside",
  name: "SunnySide Essentials",
  category: "lifestyle",
  emoji: "🌿",
  cycleDays: 30,
  products: [
    { id: "p_ss_bottle", title: "Reusable Steel Bottle", description: "Insulated stainless steel bottle for everyday use.", category: "lifestyle", price: 2499, image: "🧴", tags: ["bottle", "reusable", "eco-friendly", "travel"] },
    { id: "p_ss_tote", title: "Organic Cotton Tote Bag", description: "Durable reusable tote made from organic cotton.", category: "lifestyle", price: 999, image: "👜", tags: ["tote", "cotton", "reusable", "shopping"] },
    { id: "p_ss_lunch", title: "Bamboo Lunch Box", description: "Lightweight sustainable lunch box for everyday meals.", category: "lifestyle", price: 1799, image: "🍱", tags: ["lunch", "bamboo", "eco-friendly", "reusable"] },
  ],
},
];

/** Which merchant categories co-occur in buyer baskets (drives the synthetic graph). */
export const AFFINITY: Record<string, Record<string, number>> = {
  m_beanthere: { m_brewlab: 0.38, m_crumb: 0.22, m_trailhead: 0.12, m_leaf: 0.05, m_sunnyside: 0.10 },
  m_leaf: { m_crumb: 0.25, m_brewlab: 0.08 },
  m_trailhead: { m_beanthere: 0.2, m_brewlab: 0.1 },
  m_sunnyside: { m_beanthere: 0.15, m_crumb: 0.10 },
};

/** Campaigns that are live as soon as the demo is seeded, so every surface has offers on a judge's first visit. */
export const SEED_LIVE_CAMPAIGNS = [
  { id: "c_live_beanthere", merchantId: "m_beanthere", name: "Win back lapsed coffee buyers", objective: "winback", audience: ["lapsed", "high_ltv"], products: ["p_bt_espresso", "p_bt_ethiopia", "p_bt_decaf", "p_bt_sub"], discount: 10, fee: 0.1, headline: "We miss you: 10% off your favorite roast" },
  { id: "c_live_brewlab", merchantId: "m_brewlab", name: "Coffee lovers → better gear", objective: "acquire", audience: ["lookalike", "high_ltv"], products: ["p_bl_grinder", "p_bl_kettle", "p_bl_v60", "p_bl_scale"], discount: 0, fee: 0.12, headline: "Gear that makes every cup better" },
  { id: "c_live_crumb", merchantId: "m_crumb", name: "Something tasty with your coffee", objective: "cross_sell", audience: ["lookalike", "high_ltv"], products: ["p_cc_biscotti", "p_cc_croissant", "p_cc_banana"], discount: 5, fee: 0.1, headline: "Fresh-baked, made for dunking" },
  { id: "c_live_leaf", merchantId: "m_leaf", name: "Tea for the curious", objective: "acquire", audience: ["lookalike", "high_ltv"], products: ["p_ll_matcha", "p_ll_earl", "p_ll_chai"], discount: 10, fee: 0.12, headline: "Discover loose-leaf tea" },
  { id: "c_live_trailhead", merchantId: "m_trailhead", name: "Coffee on the trail", objective: "cross_sell", audience: ["lookalike", "high_ltv"], products: ["p_th_flask", "p_th_press", "p_th_stove"], discount: 0, fee: 0.1, headline: "Hot coffee, anywhere" },
  {
  id: "c_live_sunnyside",
  merchantId: "m_sunnyside",
  name: "Everyday sustainable essentials",
  objective: "winback",
  audience: ["lapsed", "high_ltv"],
  products: ["p_ss_bottle", "p_ss_tote", "p_ss_lunch"],
  discount: 10,
  fee: 0.10,
  headline: "Make everyday choices greener – 10% off",
},
] as const;

export const SEED_PUBLISHERS = [
  { id: "pub_dailygrind", name: "The Daily Grind (coffee blog)", site: "/demo/blog", revShare: 0.5 },
  { id: "pub_agentnet", name: "AI Agent Network", site: "mcp://adgent", revShare: 0.3 },
];
