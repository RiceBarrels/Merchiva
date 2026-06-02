// ─── POS mock data ───
const POS_CATEGORIES = [
  { id: "espresso", name: "Espresso",  icon: "coffee" },
  { id: "brewed",   name: "Brewed",    icon: "coffee" },
  { id: "tea",      name: "Tea",       icon: "leaf" },
  { id: "cold",     name: "Cold",      icon: "snowflake" },
  { id: "pastry",   name: "Pastry",    icon: "croissant" },
  { id: "food",     name: "Food",      icon: "sandwich" },
  { id: "retail",   name: "Retail",    icon: "package" },
];

const POS_PRODUCTS = [
  // Espresso
  { id: "p1",  cat: "espresso", name: "Espresso",          price: 3.25, tag: "☕",  desc: "Double shot",       color: "#44403c" },
  { id: "p2",  cat: "espresso", name: "Macchiato",         price: 3.75, tag: "☕",  desc: "Espresso + foam",   color: "#6f5b43" },
  { id: "p3",  cat: "espresso", name: "Cortado",           price: 4.25, tag: "☕",  desc: "Equal milk",        color: "#8b6f4e" },
  { id: "p4",  cat: "espresso", name: "Cappuccino",        price: 4.75, tag: "☕",  desc: "Foam forward",      color: "#a87f5b" },
  { id: "p5",  cat: "espresso", name: "Latte",             price: 5.25, tag: "☕",  desc: "Signature drink",   color: "#b89268", popular: true },
  { id: "p6",  cat: "espresso", name: "Flat White",        price: 5.00, tag: "☕",  desc: "Silky microfoam",   color: "#a98566" },
  { id: "p7",  cat: "espresso", name: "Mocha",             price: 5.75, tag: "☕",  desc: "Dark chocolate",    color: "#4a2e1a" },
  { id: "p8",  cat: "espresso", name: "Americano",         price: 3.75, tag: "☕",  desc: "Espresso + water",  color: "#3a2a1c" },

  // Brewed
  { id: "p9",  cat: "brewed",   name: "Drip Coffee",       price: 3.00, tag: "☕",  desc: "House blend",       color: "#5a3f28" },
  { id: "p10", cat: "brewed",   name: "Pour Over",         price: 5.50, tag: "☕",  desc: "Single origin",     color: "#7a5638" },
  { id: "p11", cat: "brewed",   name: "French Press",      price: 5.00, tag: "☕",  desc: "Full-bodied",       color: "#6e4a30" },
  { id: "p12", cat: "brewed",   name: "Cold Brew",         price: 4.75, tag: "🧊",  desc: "12hr steeped",      color: "#2c1f14" },

  // Tea
  { id: "p13", cat: "tea",      name: "Earl Grey",         price: 3.50, tag: "🍵",  desc: "Bergamot",          color: "#5c4a33" },
  { id: "p14", cat: "tea",      name: "Matcha Latte",      price: 5.75, tag: "🍵",  desc: "Ceremonial grade",  color: "#7a8e5c", popular: true },
  { id: "p15", cat: "tea",      name: "Chai Latte",        price: 5.25, tag: "🍵",  desc: "House spiced",      color: "#a87854" },
  { id: "p16", cat: "tea",      name: "Hojicha",           price: 4.75, tag: "🍵",  desc: "Roasted green",     color: "#8a6544" },
  { id: "p17", cat: "tea",      name: "Jasmine Green",     price: 3.75, tag: "🍵",  desc: "Light + floral",    color: "#97a571" },

  // Cold
  { id: "p18", cat: "cold",     name: "Iced Latte",        price: 5.50, tag: "🧊",  desc: "Over ice",          color: "#c7a882" },
  { id: "p19", cat: "cold",     name: "Iced Americano",    price: 4.00, tag: "🧊",  desc: "Refreshing",        color: "#3a2a1c" },
  { id: "p20", cat: "cold",     name: "Horchata Oat",      price: 6.25, tag: "🧊",  desc: "Seasonal",          color: "#d8c2a0" },
  { id: "p21", cat: "cold",     name: "Sparkling Yuzu",    price: 5.00, tag: "🧊",  desc: "Citrus soda",       color: "#e2c86b" },

  // Pastry
  { id: "p22", cat: "pastry",   name: "Butter Croissant",  price: 4.25, tag: "🥐",  desc: "Baked daily",       color: "#d4a867" },
  { id: "p23", cat: "pastry",   name: "Pain au Chocolat",  price: 4.75, tag: "🥐",  desc: "Two chocolate bars",color: "#8a5a34" },
  { id: "p24", cat: "pastry",   name: "Almond Croissant",  price: 5.25, tag: "🥐",  desc: "Twice baked",       color: "#c99a5f" },
  { id: "p25", cat: "pastry",   name: "Morning Bun",       price: 4.50, tag: "🥐",  desc: "Orange + cardamom", color: "#d6a462" },
  { id: "p26", cat: "pastry",   name: "Blueberry Muffin",  price: 3.75, tag: "🧁",  desc: "Jumbo",             color: "#6a5a89" },
  { id: "p27", cat: "pastry",   name: "Scone",             price: 3.50, tag: "🥯",  desc: "Today: currant",    color: "#c8a579" },

  // Food
  { id: "p28", cat: "food",     name: "Avocado Toast",     price: 9.50, tag: "🥑",  desc: "Sourdough + chili", color: "#7a8a4a" },
  { id: "p29", cat: "food",     name: "Egg Sandwich",      price: 8.75, tag: "🥪",  desc: "Brioche, gruyère",  color: "#d9a86b" },
  { id: "p30", cat: "food",     name: "Turkey + Brie",     price: 11.25, tag: "🥪", desc: "Apple + mustard",   color: "#c08a5a" },
  { id: "p31", cat: "food",     name: "Grain Bowl",        price: 12.50, tag: "🥗", desc: "Rotating seasonal", color: "#8ca064" },
  { id: "p32", cat: "food",     name: "Soup of the Day",   price: 7.50, tag: "🍲",  desc: "Ask the counter",   color: "#c97a4a" },

  // Retail
  { id: "p33", cat: "retail",   name: "Whole Bean 12oz",   price: 22.00, tag: "📦", desc: "Maple Blend",       color: "#3a2a1c" },
  { id: "p34", cat: "retail",   name: "Whole Bean 5lb",    price: 72.00, tag: "📦", desc: "Bulk · Maple",      color: "#3a2a1c" },
  { id: "p35", cat: "retail",   name: "Ceramic Mug",       price: 24.00, tag: "🏷️", desc: "Cream glaze",       color: "#e8dfd0" },
  { id: "p36", cat: "retail",   name: "Tote Bag",          price: 18.00, tag: "🏷️", desc: "Canvas, heavy",     color: "#a9a082" },
];

// Modifiers (for drinks)
const POS_MODIFIERS = {
  size: [
    { id: "sz-s", name: "Small",  delta: -0.50 },
    { id: "sz-m", name: "Medium", delta:  0.00, default: true },
    { id: "sz-l", name: "Large",  delta:  0.75 },
  ],
  milk: [
    { id: "mk-whole", name: "Whole",    delta: 0 },
    { id: "mk-oat",   name: "Oat",      delta: 0.75 },
    { id: "mk-almond", name: "Almond",   delta: 0.75 },
    { id: "mk-skim",  name: "Skim",      delta: 0 },
    { id: "mk-none",  name: "No milk",  delta: 0 },
  ],
  shots: [
    { id: "sh-1", name: "1 shot",   delta: 0, default: true },
    { id: "sh-2", name: "2 shots",  delta: 1.00 },
    { id: "sh-3", name: "3 shots",  delta: 2.00 },
    { id: "sh-decaf", name: "Decaf", delta: 0 },
  ],
  temp: [
    { id: "tp-hot", name: "Hot",  delta: 0, default: true },
    { id: "tp-ice", name: "Iced", delta: 0 },
  ],
};

// Members
const POS_MEMBERS = [
  { id: "u1", name: "Walk-in",           phone: null, points: 0,   tier: "guest" },
  { id: "u2", name: "Sarah Okonkwo",     phone: "555-0142", points: 1240, tier: "gold",    fav: "Latte, oat" },
  { id: "u3", name: "David Chen",        phone: "555-0233", points: 380,  tier: "silver",  fav: "Cold Brew" },
  { id: "u4", name: "Maya Patel",        phone: "555-0455", points: 2105, tier: "gold",    fav: "Matcha, oat" },
  { id: "u5", name: "Theo Nakamura",     phone: "555-0619", points: 75,   tier: "silver",  fav: "Drip + croissant" },
  { id: "u6", name: "Isabel Vargas",     phone: "555-0822", points: 640,  tier: "silver",  fav: "Cortado" },
];

// Active tickets (kitchen queue)
const POS_TICKETS = [
  { id: "#A412", station: "bar", time: "2m",  state: "making",  items: [{ name: "Latte · Oat",  qty: 1, notes: "Extra hot" }, { name: "Drip", qty: 1 }], cust: "Sarah O." },
  { id: "#A413", station: "bar", time: "3m",  state: "new",     items: [{ name: "Matcha Latte", qty: 1, notes: "No syrup" }], cust: "Maya" },
  { id: "#A414", station: "kitchen", time: "4m", state: "making", items: [{ name: "Egg Sandwich", qty: 2 }, { name: "Avocado Toast", qty: 1 }], cust: "Walk-in" },
  { id: "#A415", station: "bar", time: "6m",  state: "ready",   items: [{ name: "Cold Brew", qty: 1 }], cust: "David C." },
  { id: "#A416", station: "bar", time: "7m",  state: "ready",   items: [{ name: "Flat White", qty: 1 }, { name: "Almond Croissant", qty: 1 }], cust: "Walk-in" },
  { id: "#A417", station: "kitchen", time: "9m", state: "ready", items: [{ name: "Grain Bowl", qty: 1, notes: "No cheese" }], cust: "Theo N." },
];

// Recent transactions for refunds
const POS_RECENT_TX = [
  { id: "T-0887", time: "11:42", total: 18.25, items: 3, cashier: "Amelia", paid: "Card ··4821", cust: "Sarah O." },
  { id: "T-0886", time: "11:38", total:  5.75, items: 1, cashier: "Amelia", paid: "Cash",        cust: "Walk-in" },
  { id: "T-0885", time: "11:31", total: 24.00, items: 4, cashier: "Marcus", paid: "Card ··0012", cust: "Walk-in" },
  { id: "T-0884", time: "11:22", total:  9.50, items: 2, cashier: "Marcus", paid: "Mobile Pay",  cust: "Maya P." },
  { id: "T-0883", time: "11:14", total: 12.75, items: 2, cashier: "Amelia", paid: "Card ··4821", cust: "David C." },
  { id: "T-0882", time: "11:06", total:  3.25, items: 1, cashier: "Amelia", paid: "Cash",        cust: "Walk-in" },
];

const POS_EOD = {
  date: "Wed Apr 22, 2026",
  shift: "Morning (07:00 – 14:00)",
  cashier: "Amelia Chen",
  txCount: 142,
  gross: 1842.50,
  refunds: 24.00,
  discounts: 38.75,
  tips: 128.25,
  net: 1907.00,
  tenders: [
    { method: "Card",    count: 98, amount: 1420.50 },
    { method: "Cash",    count: 31, amount:  326.00 },
    { method: "Mobile",  count: 13, amount:   96.00 },
  ],
  cashDrawer: { opening: 200, expected: 526.00, counted: 523.25, variance: -2.75 },
  topItems: [
    { name: "Latte",          qty: 38 },
    { name: "Drip Coffee",    qty: 27 },
    { name: "Butter Croissant", qty: 24 },
    { name: "Matcha Latte",   qty: 19 },
    { name: "Cold Brew",      qty: 17 },
  ],
};

Object.assign(window, {
  POS_CATEGORIES, POS_PRODUCTS, POS_MODIFIERS, POS_MEMBERS,
  POS_TICKETS, POS_RECENT_TX, POS_EOD,
});
