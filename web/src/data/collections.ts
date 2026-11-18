/**
 * Collections: evergreen, curated pages of good products, not only deals.
 * Each collection = hand-picked products (added in /admin, stored in Firestore
 * collections/{slug}.asins) shown first, then sections filled automatically by rules
 * over the live catalogue. Copy is advice that stays true whatever is live; never quote
 * a specific product price here.
 */
export type Rule = {
  department: string;
  /** Any of these categories; omit for the whole department. */
  categories?: string[];
  /** Deal title must contain one of these (case-insensitive). */
  include?: string[];
  /** And also one of these (a second keyword group, e.g. "boys" + "shorts"). */
  alsoInclude?: string[];
  /** Deal title must contain none of these. */
  exclude?: string[];
  /** Classifier gender (men | women | kids); a title keyword in `include` also works. */
  genders?: ("men" | "women" | "kids")[];
  maxPrice?: number;
};

export type Section = { heading: string; rules: Rule[] };

export const COLLECTION_GROUPS = [
  "Winter",
  "Wedding season",
  "Gifts",
  "Everyday basics",
  "Tech & gadgets",
  "Home & living",
  "Beauty & wellness",
  "Kids & baby",
  "Fitness & travel",
] as const;

export type Collection = {
  slug: string;
  group: (typeof COLLECTION_GROUPS)[number];
  title: string;
  h1: string;
  description: string;
  intro: string[];
  /** Applies to every section (e.g. a budget cap). */
  maxPrice?: number;
  sections: Section[];
  /** Related buying guide slugs. */
  guides?: string[];
};

const JACKETS = ["jacket", "sweatshirt", "hoodie", "sweater", "pullover", "cardigan", "thermal", "fleece", "puffer", "shrug", "shawl", "coat"];
const BOYS = ["boys", "boy's", "boy "];
const GIRLS = ["girls", "girl's", "girl "];
const BOTTOMS = ["shorts", "track pant", "trackpant", "jogger", "lowers", "bermuda", "capri"];

export const COLLECTIONS: Collection[] = [
  // ---- Winter ----------------------------------------------------------------------
  {
    slug: "winter-essentials",
    group: "Winter",
    title: "Winter Essentials 2026 – Jackets, Heaters, Blankets & Skincare",
    h1: "Winter essentials",
    description:
      "Everything for an Indian winter in one place: jackets and sweatshirts, room heaters and geysers, warm blankets and dry-skin care, picked from Amazon India and checked every few hours.",
    intro: [
      "Winter shopping in India comes in a predictable order: something warm to wear, a way to heat water and a room, a heavier blanket, and a moisturiser that copes with dry air. This collection gathers good options for each, so you can sort the season in one visit.",
      "Our own picks come first, followed by the best-value products we are tracking right now. Prices change quickly at this time of year, so every price shows when it was last checked.",
    ],
    sections: [
      { heading: "Jackets, sweatshirts & thermals", rules: [{ department: "fashion", categories: ["clothing"], include: JACKETS }] },
      { heading: "Room heaters & geysers", rules: [{ department: "large-appliances", categories: ["heaters-geysers"] }] },
      {
        heading: "Blankets & quilts",
        rules: [{ department: "home-kitchen", categories: ["bedding-bath"], include: ["blanket", "quilt", "comforter", "dohar", "razai", "fleece"] }],
      },
      {
        heading: "Dry-skin care",
        rules: [{ department: "beauty-personal-care", include: ["moistur", "lotion", "cold cream", "lip balm", "body butter", "petroleum jelly", "body oil"] }],
      },
    ],
    guides: ["best-room-heaters-under-2000", "winter-jackets-under-1000"],
  },
  {
    slug: "room-heaters-and-geysers",
    group: "Winter",
    title: "Room Heaters, Geysers & Immersion Rods – Best Picks This Winter",
    h1: "Room heaters, geysers & immersion rods",
    description:
      "Room heaters, instant and storage geysers, and immersion rods on Amazon India, with our picks and what to check before you buy.",
    intro: [
      "Hot water and a warm room are the two big winter purchases. Pick a geyser by how you bathe (instant for a sink, 10 to 25 litre storage for a shower) and a heater by room size: fan heaters warm small rooms fast, oil-filled radiators keep a room warm without drying the air.",
      "Whatever you choose, look for the ISI mark, overheat protection and, for heaters, an automatic tip-over switch. Check whether installation is included before comparing geyser prices.",
    ],
    sections: [
      {
        heading: "Room heaters",
        rules: [{ department: "large-appliances", categories: ["heaters-geysers"], include: ["heater", "blower", "radiator"], exclude: ["geyser", "water heater", "immersion"] }],
      },
      {
        heading: "Geysers & immersion rods",
        rules: [{ department: "large-appliances", categories: ["heaters-geysers"], include: ["geyser", "water heater", "immersion"] }],
      },
    ],
    guides: ["best-room-heaters-under-2000", "geyser-vs-immersion-rod"],
  },
  {
    slug: "winter-jackets-under-1000",
    group: "Winter",
    title: "Winter Jackets & Sweatshirts Under ₹1,000 for Men, Women & Kids",
    h1: "Winter jackets & sweatshirts under ₹1,000",
    description: "Warm, good-value jackets, sweatshirts, hoodies and thermals under ₹1,000 for men, women and kids on Amazon India.",
    intro: [
      "You don't need to spend much to stay warm in most Indian cities. Under ₹1,000 you'll find puffer jackets with polyester fill, fleece-lined sweatshirts and thermals that layer well.",
      "Size up if you plan to wear layers underneath, check the size chart's chest measurement, and prefer listings with easy exchanges.",
    ],
    maxPrice: 1000,
    sections: [
      { heading: "Men", rules: [{ department: "fashion", categories: ["clothing"], include: JACKETS, genders: ["men"] }] },
      { heading: "Women", rules: [{ department: "fashion", categories: ["clothing"], include: JACKETS, genders: ["women"] }] },
      { heading: "Kids", rules: [{ department: "fashion", categories: ["clothing"], include: JACKETS, genders: ["kids"] }] },
    ],
    guides: ["winter-jackets-under-1000"],
  },

  // ---- Wedding season --------------------------------------------------------------
  {
    slug: "wedding-jewellery",
    group: "Wedding season",
    title: "Wedding Jewellery – Earrings, Necklace Sets & Bangles",
    h1: "Wedding jewellery",
    description:
      "Kundan, polki, oxidised and American diamond jewellery for the wedding season: earrings, jhumkas, necklace sets, bangles and maang tikkas on Amazon India.",
    intro: [
      "Several functions mean several looks, and fashion jewellery lets you match each outfit without buying gold. Kundan and polki sets suit the wedding day, oxidised silver suits mehendi and haldi, and pearls or American diamond suit the sangeet.",
      "Check the base metal and plating, the size in centimetres, and real customer photos before you buy; product photos are lit to look richer.",
    ],
    sections: [
      { heading: "Earrings & jhumkas", rules: [{ department: "fashion", categories: ["jewellery"], include: ["earring", "jhumka", "ear chain", "earchain", "kan chain", "studs", "chandbali"] }] },
      { heading: "Necklace sets", rules: [{ department: "fashion", categories: ["jewellery"], include: ["necklace", "choker", "jewellery set", "jewelry set", "haar", "mala"] }] },
      { heading: "Bangles, tikkas & more", rules: [{ department: "fashion", categories: ["jewellery"], include: ["bangle", "bracelet", "kada", "anklet", "payal", "maang", "tikka", "nath", "ring"] }] },
    ],
    guides: ["wedding-jewellery-under-500"],
  },
  {
    slug: "ethnic-wear-for-women",
    group: "Wedding season",
    title: "Ethnic Wear for Women – Sarees, Kurta Sets & Lehengas",
    h1: "Ethnic wear for women",
    description: "Sarees, kurta sets, lehengas, anarkalis and dupattas for weddings and festivals, picked from Amazon India.",
    intro: [
      "For wedding functions, silk-blend sarees and lehengas photograph best, while cotton and chanderi kurta sets are comfortable for daytime events. Check the fabric line and whether a blouse piece or dupatta is included.",
      "Sizes vary a lot between brands, so open the size chart for each product and choose listings with easy exchanges.",
    ],
    sections: [
      { heading: "Sarees", rules: [{ department: "fashion", categories: ["clothing"], include: ["saree", "sari"] }] },
      {
        heading: "Kurta sets & anarkalis",
        rules: [{ department: "fashion", categories: ["clothing"], include: ["kurta set", "kurti", "anarkali", "salwar", "palazzo set", "sharara"], genders: ["women"] }],
      },
      { heading: "Lehengas & dupattas", rules: [{ department: "fashion", categories: ["clothing"], include: ["lehenga", "dupatta", "ghagra"] }] },
    ],
  },
  {
    slug: "kurta-sets-for-men",
    group: "Wedding season",
    title: "Kurta Sets for Men – Wedding & Festive Ethnic Wear",
    h1: "Kurta sets & ethnic wear for men",
    description: "Kurta pyjama sets, Nehru jackets and sherwanis for weddings and festivals, picked from Amazon India.",
    intro: [
      "A well-fitted kurta set covers most wedding functions; add a Nehru jacket to dress it up for the main day. Silk blends look richer, cotton and linen are cooler for day events.",
      "Check the kurta length and chest size on the size chart, and whether the pyjama or churidar is included in the set.",
    ],
    sections: [
      { heading: "Kurta sets", rules: [{ department: "fashion", categories: ["clothing"], include: ["kurta"], genders: ["men"] }] },
      { heading: "Nehru jackets & sherwanis", rules: [{ department: "fashion", categories: ["clothing"], include: ["nehru", "sherwani", "bandhgala", "modi jacket", "waistcoat"] }] },
    ],
  },

  // ---- Gifts -------------------------------------------------------------------------
  {
    slug: "gifts-for-him-under-1000",
    group: "Gifts",
    title: "Gifts for Him Under ₹1,000 – Watches, Wallets, Grooming & Gadgets",
    h1: "Gifts for him under ₹1,000",
    description: "Thoughtful gifts for men under ₹1,000: watches, wallets, grooming kits, earbuds and more on Amazon India.",
    intro: [
      "Good gifts under ₹1,000 are things people use every day: a smart-looking watch, a leather wallet, a grooming kit or a pair of earbuds. Pick by what he already uses, not by the biggest discount.",
      "Check delivery dates before a birthday or anniversary, and choose gift-wrap at checkout if you're shipping directly to him.",
    ],
    maxPrice: 1000,
    sections: [
      {
        heading: "Watches & wallets",
        rules: [
          { department: "fashion", categories: ["watches"], genders: ["men"] },
          { department: "fashion", categories: ["accessories", "bags-luggage"], include: ["wallet", "belt", "cufflink", "sunglass", "card holder"], genders: ["men"] },
        ],
      },
      { heading: "Grooming", rules: [{ department: "beauty-personal-care", categories: ["grooming-shaving", "fragrance"] }, { department: "health-wellness", categories: ["personal-care-appliances"], include: ["trimmer", "shaver"] }] },
      { heading: "Gadgets", rules: [{ department: "electronics" }, { department: "mobiles-tablets", categories: ["mobile-accessories"] }] },
    ],
  },
  {
    slug: "gifts-for-her-under-1000",
    group: "Gifts",
    title: "Gifts for Her Under ₹1,000 – Jewellery, Handbags & Beauty",
    h1: "Gifts for her under ₹1,000",
    description: "Gifts for women under ₹1,000: fashion jewellery, handbags, skincare and makeup sets, and more on Amazon India.",
    intro: [
      "Jewellery, a handbag or a skincare set make easy gifts at this budget. For beauty products, stick to brands she already uses or gentle, fragrance-free options.",
      "Check the delivery date before the occasion, and choose gift-wrap at checkout when it ships straight to her.",
    ],
    maxPrice: 1000,
    sections: [
      { heading: "Jewellery", rules: [{ department: "fashion", categories: ["jewellery"] }] },
      {
        heading: "Handbags & watches",
        rules: [
          { department: "fashion", categories: ["watches"], genders: ["women"] },
          { department: "fashion", categories: ["bags-luggage", "accessories"], include: ["handbag", "sling", "tote", "clutch", "purse", "wallet"] },
        ],
      },
      { heading: "Beauty & skincare", rules: [{ department: "beauty-personal-care", categories: ["skincare", "makeup", "fragrance", "haircare"] }] },
    ],
  },
  {
    slug: "gifts-for-kids-under-500",
    group: "Gifts",
    title: "Gifts for Kids Under ₹500 – Toys, Games & Learning Toys",
    h1: "Gifts for kids under ₹500",
    description: "Toys, board games, learning toys and outdoor play under ₹500 for boys and girls, on Amazon India.",
    intro: [
      "The best kids' gifts at this price are board games, building and learning toys, and simple outdoor toys. Always check the age range on the box: toys with small parts aren't safe for children under three.",
      "For battery-powered toys, check which batteries they need and whether they're included.",
    ],
    maxPrice: 500,
    sections: [
      { heading: "Learning & board games", rules: [{ department: "toys-games", categories: ["learning-toys", "board-games"] }] },
      { heading: "Remote-control & die-cast", rules: [{ department: "toys-games", categories: ["remote-control-toys", "die-cast-vehicles"] }] },
      { heading: "Outdoor play & more", rules: [{ department: "toys-games", categories: ["outdoor-play", "other"] }] },
    ],
  },

  // ---- Everyday basics ---------------------------------------------------------------
  {
    slug: "shorts-and-track-pants",
    group: "Everyday basics",
    title: "Shorts & Track Pants for Men, Women, Boys & Girls",
    h1: "Shorts & track pants",
    description: "Everyday shorts, track pants and joggers for men, women, boys and girls, picked from Amazon India.",
    intro: [
      "Shorts and track pants are the clothes you wear most at home and to the gym, so fabric matters more than the brand: cotton blends for lounging, polyester or dri-fit for workouts. Zip pockets and a drawstring waist are worth having.",
      "Check the length (above or below the knee) and the waist size on the size chart; kids' sizes go by age.",
    ],
    sections: [
      { heading: "Men", rules: [{ department: "fashion", categories: ["clothing"], include: ["shorts", "track pant", "trackpant", "jogger", "lowers", "bermuda"], genders: ["men"] }] },
      { heading: "Women", rules: [{ department: "fashion", categories: ["clothing"], include: ["shorts", "track pant", "trackpant", "jogger", "lowers", "capri"], genders: ["women"] }] },
      { heading: "Boys", rules: [{ department: "fashion", categories: ["clothing"], include: BOTTOMS, alsoInclude: BOYS }] },
      { heading: "Girls", rules: [{ department: "fashion", categories: ["clothing"], include: BOTTOMS, alsoInclude: GIRLS }] },
    ],
  },
  {
    slug: "everyday-footwear",
    group: "Everyday basics",
    title: "Everyday Footwear – Sneakers, Sandals & Slippers",
    h1: "Everyday footwear",
    description: "Sneakers, sports shoes, sandals and slippers for men, women and kids, picked from Amazon India.",
    intro: [
      "For daily wear, comfort beats looks: a cushioned sole, a grip that works on wet floors and an upper you can wipe clean. Running and walking shoes are worth spending a little more on; slippers and sandals rarely need to be.",
      "Sizing is the main risk online. Indian and UK sizes usually match, US and EU sizes differ, so check the chart and reviews that say whether a shoe runs small.",
    ],
    sections: [
      { heading: "Men", rules: [{ department: "fashion", categories: ["footwear"], genders: ["men"] }] },
      { heading: "Women", rules: [{ department: "fashion", categories: ["footwear"], genders: ["women"] }] },
      { heading: "Kids", rules: [{ department: "fashion", categories: ["footwear"], genders: ["kids"] }] },
    ],
  },
  {
    slug: "home-and-kitchen-must-haves",
    group: "Everyday basics",
    title: "Home & Kitchen Must-Haves – Cookware, Storage, Bedding & Cleaning",
    h1: "Home & kitchen must-haves",
    description: "Useful everyday buys for the home: cookware, kitchen tools, storage containers, bedsheets and cleaning supplies on Amazon India.",
    intro: [
      "The best home buys are the boring ones you use every day: a good non-stick pan, airtight containers, a decent mop and cotton bedsheets. Buy them when the price is right, since you'll need them anyway.",
      "For cookware, check the base works on your stove (induction needs a magnetic base); for bedding, prefer cotton and check the size against your mattress.",
    ],
    sections: [
      { heading: "Kitchen", rules: [{ department: "home-kitchen", categories: ["cookware", "kitchen-tools", "kitchen-appliances", "storage-containers", "dining"] }] },
      { heading: "Bedding & bath", rules: [{ department: "home-kitchen", categories: ["bedding-bath"] }] },
      { heading: "Cleaning", rules: [{ department: "home-kitchen", categories: ["cleaning"] }] },
      { heading: "Décor & lighting", rules: [{ department: "home-kitchen", categories: ["home-d-cor", "lighting"] }] },
    ],
  },

  // ---- Tech & gadgets ----------------------------------------------------------------
  {
    slug: "budget-gadgets-under-999",
    group: "Tech & gadgets",
    title: "Budget Gadgets Under ₹999 – Earbuds, Chargers, Speakers & More",
    h1: "Budget gadgets under ₹999",
    description: "Useful gadgets under ₹999 on Amazon India: earbuds, Bluetooth speakers, chargers, power banks, keyboards, mice and more.",
    intro: [
      "Under ₹999 you can get genuinely useful tech: budget wireless earbuds, a fast charger, a power bank, a small speaker or a wireless mouse. Stick to known brands for anything that charges a battery.",
      "Check the warranty and whether the charger or cable is included, and read recent reviews for battery life claims.",
    ],
    maxPrice: 999,
    sections: [
      { heading: "Audio", rules: [{ department: "electronics", categories: ["headphones-earbuds", "speakers"] }] },
      { heading: "Phone accessories", rules: [{ department: "mobiles-tablets", categories: ["mobile-accessories"] }] },
      { heading: "Computer accessories", rules: [{ department: "computers-accessories", categories: ["keyboards-mice", "storage", "networking", "laptop-bags-cases", "other"] }] },
      { heading: "Smartwatches & more", rules: [{ department: "electronics", categories: ["smartwatches-bands", "gaming", "other"] }] },
    ],
  },
  {
    slug: "mobile-accessories",
    group: "Tech & gadgets",
    title: "Mobile Accessories – Chargers, Cables, Power Banks & Covers",
    h1: "Mobile accessories",
    description: "Fast chargers, cables, power banks, phone covers and screen guards on Amazon India, picked and checked every few hours.",
    intro: [
      "A fast charger only charges fast if your phone supports the same standard, so check the wattage your phone accepts. For power banks, real capacity is lower than the label; 10,000 mAh gives roughly two phone charges.",
      "Buy cables and chargers from known brands or Amazon-fulfilled listings; cheap fakes can damage batteries.",
    ],
    sections: [
      { heading: "Chargers & cables", rules: [{ department: "mobiles-tablets", categories: ["mobile-accessories"], include: ["charger", "cable", "adapter", "charging"] }] },
      { heading: "Power banks", rules: [{ department: "mobiles-tablets", categories: ["mobile-accessories"], include: ["power bank", "powerbank"] }] },
      { heading: "Covers, stands & more", rules: [{ department: "mobiles-tablets", categories: ["mobile-accessories", "other"] }] },
    ],
  },
  {
    slug: "earbuds-and-headphones",
    group: "Tech & gadgets",
    title: "Earbuds & Headphones – Wireless, Noise Cancelling & Budget Picks",
    h1: "Earbuds & headphones",
    description: "Wireless earbuds, neckbands and over-ear headphones on Amazon India, from budget picks to noise cancelling.",
    intro: [
      "Compare earbuds by battery life with noise cancelling switched on, call quality and the warranty. Over-ear headphones are more comfortable for long listening; neckbands last longest on a charge.",
      "If you game or watch videos, look for a low-latency mode.",
    ],
    sections: [
      { heading: "Earbuds", rules: [{ department: "electronics", categories: ["headphones-earbuds"], include: ["earbud", "tws", "buds", "earphone"] }] },
      { heading: "Headphones & neckbands", rules: [{ department: "electronics", categories: ["headphones-earbuds"] }] },
    ],
  },
  {
    slug: "smartwatches-and-fitness-bands",
    group: "Tech & gadgets",
    title: "Smartwatches & Fitness Bands – Calling, AMOLED & Budget Picks",
    h1: "Smartwatches & fitness bands",
    description: "Smartwatches with Bluetooth calling, AMOLED displays and fitness bands on Amazon India.",
    intro: [
      "Budget smartwatches differ most in display (AMOLED looks far better outdoors), battery life and how good the companion app is. Bluetooth calling is only useful if reviews rate the mic and speaker.",
      "Health readings on budget watches are estimates, not medical measurements.",
    ],
    sections: [{ heading: "Smartwatches & bands", rules: [{ department: "electronics", categories: ["smartwatches-bands"] }] }],
  },
  {
    slug: "work-from-home-setup",
    group: "Tech & gadgets",
    title: "Work From Home Setup – Chairs, Desks, Monitors, Keyboards & Lighting",
    h1: "Work from home setup",
    description: "Everything for a comfortable home office: office chairs, study tables, monitors, keyboards, mice, routers and desk lamps.",
    intro: [
      "Comfort first: a chair with lumbar support and adjustable height, and a monitor at eye level, matter more than any gadget. Then a keyboard and mouse you like, a reliable router and a desk lamp with neutral light.",
      "For furniture, measure your space and check assembly details before ordering.",
    ],
    sections: [
      { heading: "Chairs & desks", rules: [{ department: "home-kitchen", categories: ["furniture"], include: ["chair", "desk", "table"] }, { department: "office-stationery", categories: ["office-furniture"] }] },
      { heading: "Monitors, keyboards & mice", rules: [{ department: "computers-accessories", categories: ["monitors", "keyboards-mice"] }] },
      { heading: "Wi-Fi & storage", rules: [{ department: "computers-accessories", categories: ["networking", "storage"] }] },
      { heading: "Desk lamps & lighting", rules: [{ department: "home-kitchen", categories: ["lighting"], include: ["lamp", "desk", "study"] }] },
    ],
  },
  {
    slug: "watches-for-men-and-women",
    group: "Tech & gadgets",
    title: "Watches for Men & Women – Analog, Digital & Chronograph",
    h1: "Watches for men & women",
    description: "Analog, digital and chronograph watches for men and women on Amazon India, picked and price-checked.",
    intro: [
      "For everyday wear, a quartz analog watch from a known brand with a stainless steel case is hard to beat. Check the water-resistance rating if you'll wear it while washing hands or swimming.",
      "Strap width and case size matter for comfort; reviews with wrist photos help.",
    ],
    sections: [
      { heading: "Men", rules: [{ department: "fashion", categories: ["watches"], genders: ["men"] }] },
      { heading: "Women", rules: [{ department: "fashion", categories: ["watches"], genders: ["women"] }] },
      { heading: "More watches", rules: [{ department: "fashion", categories: ["watches"] }] },
    ],
  },

  // ---- Home & living ----------------------------------------------------------------
  {
    slug: "kitchen-appliances",
    group: "Home & living",
    title: "Kitchen Appliances – Mixer Grinders, Kettles, Air Fryers & More",
    h1: "Kitchen appliances",
    description: "Mixer grinders, electric kettles, air fryers, induction cooktops and other kitchen appliances on Amazon India.",
    intro: [
      "For Indian cooking the mixer grinder is the workhorse: 750 W with three jars suits most homes. Kettles, induction cooktops and air fryers save time; check the wattage and the warranty on the motor or heating element.",
      "Read recent reviews for noise and after-sales service in your city.",
    ],
    sections: [{ heading: "Kitchen appliances", rules: [{ department: "home-kitchen", categories: ["kitchen-appliances"] }] }],
  },
  {
    slug: "home-decor-and-lighting",
    group: "Home & living",
    title: "Home Décor & Lighting – Lights, Wall Décor, Curtains & More",
    h1: "Home décor & lighting",
    description: "String lights, lamps, wall décor, curtains, cushions and showpieces to refresh your home, on Amazon India.",
    intro: [
      "Small changes refresh a room most: warm lighting, new cushion covers or curtains, and one piece of wall décor. For string and LED lights, check the length, plug-in or battery power, and the warranty.",
      "Look at customer photos for real colours; product photos are often edited.",
    ],
    sections: [
      { heading: "Lighting", rules: [{ department: "home-kitchen", categories: ["lighting"] }] },
      { heading: "Décor", rules: [{ department: "home-kitchen", categories: ["home-d-cor"] }] },
    ],
  },
  {
    slug: "storage-and-organisation",
    group: "Home & living",
    title: "Storage & Organisation – Containers, Organisers & Racks",
    h1: "Storage & organisation",
    description: "Airtight containers, wardrobe organisers, shoe racks and storage boxes on Amazon India.",
    intro: [
      "Airtight, BPA-free containers keep staples fresh, and stackable sets save shelf space. For wardrobes and shoe racks, measure first and check the material: metal and solid plastic last longer than fabric.",
      "Sets look cheaper per piece, but only if you'll use every size.",
    ],
    sections: [
      { heading: "Kitchen containers", rules: [{ department: "home-kitchen", categories: ["storage-containers"] }] },
      { heading: "Racks & organisers", rules: [{ department: "home-kitchen", categories: ["furniture", "other"], include: ["rack", "organiser", "organizer", "storage", "shelf", "stand"] }] },
    ],
  },

  // ---- Beauty & wellness --------------------------------------------------------------
  {
    slug: "skincare-essentials",
    group: "Beauty & wellness",
    title: "Skincare Essentials – Face Wash, Moisturiser, Sunscreen & Serums",
    h1: "Skincare essentials",
    description: "Cleansers, moisturisers, sunscreens and serums from trusted brands on Amazon India.",
    intro: [
      "A simple routine works for most skin: a gentle cleanser, a moisturiser and a broad-spectrum sunscreen every morning. Add one active ingredient at a time, and patch-test anything new.",
      "Buy from the brand's store or Amazon-fulfilled listings, and check the expiry date in recent reviews.",
    ],
    sections: [{ heading: "Skincare", rules: [{ department: "beauty-personal-care", categories: ["skincare"] }] }],
  },
  {
    slug: "grooming-for-men",
    group: "Beauty & wellness",
    title: "Men's Grooming – Trimmers, Shaving, Beard Care & Fragrances",
    h1: "Grooming for men",
    description: "Trimmers, shavers, beard care, face wash and perfumes for men on Amazon India.",
    intro: [
      "A good trimmer is the one grooming tool worth spending on: check battery runtime, the number of length settings and whether the blades are washable. Beard oils, face washes and deodorants are easy add-ons when prices drop.",
      "For fragrances, Eau de Parfum lasts longer than Eau de Toilette.",
    ],
    sections: [
      { heading: "Trimmers & shavers", rules: [{ department: "health-wellness", categories: ["personal-care-appliances"], include: ["trimmer", "shaver", "groom"] }, { department: "beauty-personal-care", categories: ["grooming-shaving"], include: ["trimmer", "shaver", "razor"] }] },
      { heading: "Grooming & fragrance", rules: [{ department: "beauty-personal-care", categories: ["grooming-shaving", "fragrance"], genders: ["men"] }, { department: "beauty-personal-care", categories: ["grooming-shaving"] }] },
    ],
  },
  {
    slug: "haircare",
    group: "Beauty & wellness",
    title: "Haircare – Shampoos, Conditioners, Oils & Hair Dryers",
    h1: "Haircare",
    description: "Shampoos, conditioners, hair oils, serums, dryers and straighteners on Amazon India.",
    intro: [
      "Choose shampoo by scalp (oily or dry) and conditioner by hair length and texture. For heat tools, a dryer with a cool-shot setting and a straightener with adjustable temperature are kinder to hair.",
      "Larger bottles and combo packs usually cost less per ml.",
    ],
    sections: [
      { heading: "Shampoo, conditioner & oils", rules: [{ department: "beauty-personal-care", categories: ["haircare"] }] },
      { heading: "Dryers & stylers", rules: [{ department: "health-wellness", categories: ["personal-care-appliances"], include: ["dryer", "straightener", "curler", "styler"] }] },
    ],
  },

  // ---- Kids & baby ------------------------------------------------------------------
  {
    slug: "baby-care-essentials",
    group: "Kids & baby",
    title: "Baby Care Essentials – Diapers, Wipes, Feeding & Baby Gear",
    h1: "Baby care essentials",
    description: "Diapers, wipes, feeding bottles, baby skincare and baby gear on Amazon India, picked and price-checked.",
    intro: [
      "Most baby buys repeat, so stock up on the brand and size your baby already uses when the price is right. For anything that touches food or skin, check the material and expiry date.",
      "For gear like strollers and carriers, check weight limits and how easy they are to fold.",
    ],
    sections: [
      { heading: "Diapers & wipes", rules: [{ department: "baby", categories: ["diapering"] }] },
      { heading: "Feeding & care", rules: [{ department: "baby", categories: ["feeding", "baby-care"] }] },
      { heading: "Baby gear", rules: [{ department: "baby", categories: ["baby-gear", "other"] }] },
    ],
  },
  {
    slug: "school-and-stationery",
    group: "Kids & baby",
    title: "School & Stationery – Bags, Pens, Notebooks & Art Supplies",
    h1: "School & stationery",
    description: "School bags, pens, notebooks, art and craft supplies and desk organisers on Amazon India.",
    intro: [
      "Stationery is cheapest bought in packs: pens, notebooks and colours in bulk cost far less per piece. For school bags, check the capacity in litres, padded straps and whether it fits the child's height.",
      "Art supplies labelled non-toxic are safer for younger children.",
    ],
    sections: [
      { heading: "Stationery", rules: [{ department: "office-stationery", categories: ["stationery", "office-supplies"] }] },
      { heading: "School bags", rules: [{ department: "fashion", categories: ["bags-luggage"], include: ["school", "kids", "backpack"] }] },
    ],
  },

  // ---- Fitness & travel -------------------------------------------------------------
  {
    slug: "fitness-at-home",
    group: "Fitness & travel",
    title: "Fitness at Home – Dumbbells, Yoga Mats, Resistance Bands & More",
    h1: "Fitness at home",
    description: "Dumbbells, yoga mats, resistance bands, skipping ropes and home gym equipment on Amazon India.",
    intro: [
      "A home workout needs very little: a yoga mat, adjustable dumbbells or resistance bands, and a skipping rope. Choose a mat thick enough for your floor (6 mm is a good default) with a grippy surface.",
      "For bigger equipment, check the dimensions and maximum user weight.",
    ],
    sections: [
      { heading: "Gym equipment", rules: [{ department: "sports-fitness-outdoors", categories: ["gym-equipment"] }] },
      { heading: "Yoga", rules: [{ department: "sports-fitness-outdoors", categories: ["yoga"] }] },
      { heading: "Sports gear & cycling", rules: [{ department: "sports-fitness-outdoors", categories: ["sports-gear", "cycling", "other"] }] },
    ],
  },
  {
    slug: "travel-essentials",
    group: "Fitness & travel",
    title: "Travel Essentials – Trolley Bags, Backpacks, Power Banks & More",
    h1: "Travel essentials",
    description: "Trolley bags, backpacks, duffels, power banks, neck pillows and travel organisers on Amazon India.",
    intro: [
      "For flights, check your airline's cabin and check-in size limits before buying a trolley; four spinner wheels and a hard shell suit airports, a soft duffel suits road trips. A power bank and a cable organiser make any trip easier.",
      "Luggage warranties vary a lot; good brands offer several years.",
    ],
    sections: [
      { heading: "Luggage & backpacks", rules: [{ department: "fashion", categories: ["bags-luggage"], include: ["trolley", "luggage", "suitcase", "backpack", "duffel", "travel"] }] },
      { heading: "Travel gadgets", rules: [{ department: "mobiles-tablets", categories: ["mobile-accessories"], include: ["power bank", "powerbank", "travel adapter"] }] },
      { heading: "Camping & outdoors", rules: [{ department: "sports-fitness-outdoors", categories: ["camping"] }] },
    ],
  },
  {
    slug: "handbags-and-wallets",
    group: "Fitness & travel",
    title: "Handbags, Wallets & Sling Bags for Women and Men",
    h1: "Handbags, wallets & sling bags",
    description: "Handbags, totes, sling bags, clutches and wallets for women and men on Amazon India.",
    intro: [
      "A structured tote or a crossbody sling covers most daily needs. Check the inner pockets, strap length, and whether the material is real or vegan leather; customer photos show the true colour and size.",
      "For wallets, RFID blocking is a useful extra if you carry contactless cards.",
    ],
    sections: [
      { heading: "Handbags & slings", rules: [{ department: "fashion", categories: ["bags-luggage"], include: ["handbag", "tote", "sling", "clutch", "purse", "shoulder bag"] }] },
      { heading: "Wallets", rules: [{ department: "fashion", categories: ["accessories", "bags-luggage"], include: ["wallet", "card holder"] }] },
    ],
  },
];

export function getCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

type Matchable = { department: string; category: string; title: string; price: number; gender: string };

export function matchesRule(d: Matchable, r: Rule, maxPrice?: number): boolean {
  if (d.department !== r.department) return false;
  if (r.categories && !r.categories.includes(d.category)) return false;
  const cap = r.maxPrice ?? maxPrice;
  if (cap && d.price > cap) return false;
  const t = d.title.toLowerCase();
  if (r.include && !r.include.some((k) => t.includes(k))) return false;
  if (r.alsoInclude && !r.alsoInclude.some((k) => t.includes(k))) return false;
  if (r.exclude && r.exclude.some((k) => t.includes(k))) return false;
  if (r.genders && !r.genders.includes(d.gender as "men" | "women" | "kids")) return false;
  return true;
}

/** Collections that belong on a department or category page. */
export function collectionsFor(department: string, category?: string): Collection[] {
  return COLLECTIONS.filter((c) =>
    c.sections.some((s) => s.rules.some((r) => r.department === department && (!category || !r.categories || r.categories.includes(category)))),
  );
}

export type BuiltSection<T> = { heading: string; items: T[] };

/**
 * Resolve a collection against the live catalogue: hand-picked products first (in the
 * owner's order), then each section's automatic matches, best discount first, without
 * repeating a product. `perSection` caps each automatic section.
 */
/** A product counts as a "top deal" in a collection from this discount up. */
export const TOP_DEAL_MIN_DISCOUNT = 15;

export function buildCollection<T extends Matchable & { asin: string; discountPct: number }>(
  c: Collection,
  live: T[],
  picks: string[],
  perSection = 12,
  topCount = 8,
): { topDeals: T[]; picks: T[]; sections: BuiltSection<T>[] } {
  const byAsin = new Map(live.map((d) => [d.asin, d]));
  const picked = picks.map((a) => byAsin.get(a)).filter((d): d is T => !!d);
  const pickedSet = new Set(picked.map((d) => d.asin));
  // Today's biggest discounts that fit any section of this collection (live is sorted by discount).
  const fits = (d: T) => c.sections.some((s) => s.rules.some((r) => matchesRule(d, r, c.maxPrice)));
  const topDeals = live
    .filter((d) => d.discountPct >= TOP_DEAL_MIN_DISCOUNT && !pickedSet.has(d.asin) && fits(d))
    .slice(0, topCount);
  const used = new Set([...pickedSet, ...topDeals.map((d) => d.asin)]);
  const sections: BuiltSection<T>[] = [];
  for (const s of c.sections) {
    const items: T[] = [];
    for (const d of live) {
      if (items.length >= perSection) break;
      if (used.has(d.asin)) continue;
      if (s.rules.some((r) => matchesRule(d, r, c.maxPrice))) {
        items.push(d);
        used.add(d.asin);
      }
    }
    if (items.length) sections.push({ heading: s.heading, items });
  }
  return { topDeals, picks: picked, sections };
}
