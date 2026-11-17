/**
 * Buying guides: evergreen advice plus the live deals that match. The deal list is filtered at
 * build time, so each guide always shows what is on offer right now.
 * Advice only — never quote a specific product price in the copy; the live list does that.
 */
export type GuideMatch = {
  department: string;
  /** Limit to one category; omit to search the whole department. */
  category?: string;
  /** Deal title must match one of these (case-insensitive). */
  include?: string[];
  /** Deal title must not match any of these. */
  exclude?: string[];
  maxPrice?: number;
};

export type Guide = {
  slug: string;
  /** <title> and card title */
  title: string;
  h1: string;
  description: string;
  /** Date the advice was last reviewed (YYYY-MM-DD). */
  reviewed: string;
  intro: string[];
  sections: { heading: string; paras: string[]; points?: string[] }[];
  faq: { q: string; a: string }[];
  match: GuideMatch;
  /** Where the guide's "see all" link goes. */
  categoryHref: string;
  categoryName: string;
  dealsHeading: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "best-room-heaters-under-2000",
    title: "Best Room Heaters Under ₹2,000 in India – Live Deals & Buying Guide",
    h1: "Best room heaters under ₹2,000",
    description:
      "How to choose a budget room heater for an Indian winter: fan vs halogen vs carbon vs oil-filled, safety features, power use, and today's live Amazon deals under ₹2,000.",
    reviewed: "2026-11-14",
    intro: [
      "A room heater under ₹2,000 can keep a small bedroom or study comfortable through a North Indian winter, as long as you pick the right type for the room. This guide explains the four common types, the safety features worth insisting on, and what a heater costs to run. Below it, you will find every room heater deal under ₹2,000 that CartCrush has found on Amazon India right now.",
    ],
    sections: [
      {
        heading: "Which type of heater suits your room",
        paras: ["Budget heaters fall into four groups. The right one depends on the room size and how long you run it."],
        points: [
          "Fan heaters (blowers) warm a small room fastest and are the cheapest. They are noisy and dry the air, so they suit short bursts, such as before bed or while getting ready.",
          "Halogen heaters glow and warm whatever is directly in front of them. They are quiet and good for sitting at a desk, but do little for the whole room.",
          "Carbon heaters work like halogen heaters but give a softer, more even warmth for the same power, and are usually a little more expensive.",
          "Oil-filled radiators heat the whole room slowly and keep it warm without drying the air. Most cost more than ₹2,000, so they rarely appear in this list except during sales.",
        ],
      },
      {
        heading: "Safety features to look for",
        paras: [
          "Heaters cause many winter fires and burns, so do not compromise here to save a few hundred rupees. Look for the ISI mark, an automatic tip-over switch that cuts power if the heater falls, and overheat protection. A sturdy base and a protective grille matter if you have children or pets.",
          "Plug a heater straight into a wall socket rather than an extension board, keep it a metre away from curtains, bedding and furniture, and never leave it running while you sleep with doors and windows shut.",
        ],
      },
      {
        heading: "What it costs to run",
        paras: [
          "Most budget heaters draw between 800 and 2,000 watts. A 2,000-watt heater uses 2 units of electricity per hour at full power, so four hours a night is roughly 8 units a day. Models with two heat settings or a thermostat let you run at half power once the room is warm, which can cut that bill noticeably. Check your own electricity tariff per unit to work out the cost.",
        ],
      },
      {
        heading: "How to judge a deal",
        paras: [
          "Heater prices on Amazon India change often from November to January. Compare the deal price with the same model's regular price, check the warranty (a year is common), and read recent reviews for noise and for units that stopped working after a few weeks. Every deal below shows when its price was last checked.",
        ],
      },
    ],
    faq: [
      {
        q: "Which room heater is best for a small bedroom?",
        a: "A fan heater warms a small bedroom fastest; a carbon or halogen heater is quieter if you sit close to it. Choose one with a tip-over switch and overheat protection.",
      },
      {
        q: "Are room heaters safe to use overnight?",
        a: "It is safer not to. If you must, use a model with a thermostat and tip-over cut-off, keep it well away from bedding, and keep the room ventilated.",
      },
      {
        q: "How much electricity does a 2,000-watt heater use?",
        a: "About 2 units per hour at full power. Running it at a lower setting or with a thermostat uses less.",
      },
    ],
    match: { department: "large-appliances", category: "heaters-geysers", include: ["heater", "blower", "radiator"], exclude: ["geyser", "water heater", "immersion"], maxPrice: 2000 },
    categoryHref: "/c/large-appliances/heaters-geysers",
    categoryName: "all heater and geyser deals",
    dealsHeading: "Room heater deals under ₹2,000 right now",
  },
  {
    slug: "geyser-vs-immersion-rod",
    title: "Geyser vs Immersion Rod: Which to Buy This Winter – Live Deals",
    h1: "Geyser or immersion rod: which should you buy this winter?",
    description:
      "Instant geyser, storage geyser or immersion rod? Compare cost, safety and convenience for an Indian home, with today's live Amazon deals on geysers and immersion rods.",
    reviewed: "2026-11-14",
    intro: [
      "Hot water is the first thing most Indian homes shop for when winter arrives. The choice usually comes down to three options: an immersion rod, an instant geyser or a storage geyser. They differ a lot in price, safety and convenience, and the cheapest one to buy is not always the cheapest to live with. Here is how to decide, followed by the geyser and immersion rod deals CartCrush has found on Amazon India right now.",
    ],
    sections: [
      {
        heading: "Immersion rods: cheapest, but use them carefully",
        paras: [
          "An immersion rod heats a bucket of water and costs the least of the three. It suits students, renters and anyone who needs hot water only occasionally. The trade-off is safety: the rod sits in water connected to mains power. Buy only ISI-marked rods, switch off and unplug before touching the water or the bucket, never use one in a metal bucket, and do not leave it running unattended.",
        ],
      },
      {
        heading: "Instant geysers: hot water in seconds for small needs",
        paras: [
          "Instant geysers usually hold 1 to 6 litres and heat water quickly. They are ideal for a kitchen sink or a quick hand-and-face wash, but most cannot keep up with a full shower in peak winter. They take little space and are easy to fit above a sink.",
        ],
      },
      {
        heading: "Storage geysers: the right choice for bathing",
        paras: ["Storage geysers of 10 to 25 litres heat and store water so a full shower or bucket bath stays hot. Choose the size by household:"],
        points: [
          "10 to 15 litres for one or two people bathing one after another.",
          "15 to 25 litres for a family of three to four.",
          "Check the tank material (glass-lined or stainless steel tanks resist corrosion and hard water better), the BEE star rating for running cost, and the pressure rating if you live in a high-rise building.",
        ],
      },
      {
        heading: "Installation and hidden costs",
        paras: [
          "Many geyser listings do not include installation, the inlet and outlet pipes or a mounting kit, and some brands charge for the installation visit. Read that part of the listing before comparing prices, and make sure the geyser is wired to an earthed socket. Immersion rods need nothing beyond a 16-amp socket.",
        ],
      },
    ],
    faq: [
      {
        q: "Is an immersion rod cheaper to run than a geyser?",
        a: "Per bucket, the cost is similar because both turn electricity into heat. A storage geyser can waste some energy keeping water hot, but it is far safer and more convenient for daily bathing.",
      },
      {
        q: "What size geyser does a family of four need?",
        a: "A 15 to 25 litre storage geyser is usually enough for a family of four bathing one after another.",
      },
      {
        q: "Is installation included when you buy a geyser on Amazon?",
        a: "It depends on the brand. Check the listing's installation section; pipes and fittings are often extra.",
      },
    ],
    match: { department: "large-appliances", category: "heaters-geysers", include: ["geyser", "water heater", "immersion"] },
    categoryHref: "/c/large-appliances/heaters-geysers",
    categoryName: "all heater and geyser deals",
    dealsHeading: "Geyser and immersion rod deals right now",
  },
  {
    slug: "wedding-jewellery-under-500",
    title: "Wedding Jewellery Under ₹500 – Earrings, Sets & Bangles Deals",
    h1: "Wedding jewellery under ₹500",
    description:
      "Look festive for less: how to pick imitation earrings, necklace sets, bangles and maang tikkas for the wedding season, plus live Amazon jewellery deals under ₹500.",
    reviewed: "2026-11-14",
    intro: [
      "Wedding season means several functions and several outfits, and few people want to buy real gold for every look. Imitation and fashion jewellery under ₹500 can look rich in photos and on the day, if you know what to check. This guide covers the materials, finishes and sets that hold up best, and below it you will find the jewellery deals under ₹500 that CartCrush has found on Amazon India right now.",
    ],
    sections: [
      {
        heading: "Match the piece to the outfit and the function",
        paras: [],
        points: [
          "Heavy kundan or polki-style sets suit lehengas and silk sarees for the wedding day and reception.",
          "Oxidised silver jhumkas and chokers suit cotton and chanderi outfits for mehendi and haldi.",
          "Pearl and American diamond (AD) sets go well with pastel lehengas and Indo-western outfits for the sangeet or cocktail.",
          "Statement earrings alone, without a necklace, often look more modern with a heavy neckline or dupatta.",
        ],
      },
      {
        heading: "What to check before you buy",
        paras: [
          "Product photos are lit to make plating look golden and stones look bright, so scroll to customer photos for a realistic look. Check the base metal (brass and copper bases last longer than alloy), the plating, and the actual size in centimetres; jhumkas and maang tikkas often look bigger in photos than in life.",
          "If you have sensitive ears, look for hypoallergenic or nickel-free pieces, or plan to swap the hooks. For sets, read exactly what is included, such as earrings, maang tikka, nose ring or a storage box.",
        ],
      },
      {
        heading: "Make it last through the season",
        paras: [
          "Keep pieces in a zip pouch or box away from moisture, put perfume and hairspray on before your jewellery, and wipe pieces with a dry cloth after wearing. Imitation jewellery is rarely returnable once worn, so check pieces as soon as they arrive.",
        ],
      },
    ],
    faq: [
      {
        q: "Does imitation jewellery look real in wedding photos?",
        a: "Good kundan, AD and gold-plated pieces photograph well. Check customer photos rather than product shots to judge the finish.",
      },
      {
        q: "Will imitation jewellery turn my skin green?",
        a: "Copper and brass bases can leave a mark on some skin types. A clear nail-polish coat on the part that touches the skin, or nickel-free pieces, can help.",
      },
    ],
    match: { department: "fashion", category: "jewellery", maxPrice: 500 },
    categoryHref: "/c/fashion/jewellery",
    categoryName: "all jewellery deals",
    dealsHeading: "Jewellery deals under ₹500 right now",
  },
  {
    slug: "winter-jackets-under-1000",
    title: "Winter Jackets & Sweatshirts Under ₹1,000 – Live Amazon Deals",
    h1: "Winter jackets and sweatshirts under ₹1,000",
    description:
      "How to pick a warm, good-value winter jacket, sweatshirt or hoodie on a budget, what fabrics and fills to look for, and live Amazon India deals under ₹1,000.",
    reviewed: "2026-11-14",
    intro: [
      "You do not need to spend a lot to stay warm in an Indian winter. Below ₹1,000 you can find puffer jackets, fleece jackets, sweatshirts and hoodies that are warm enough for most cities, as long as you pick the right fabric and fit. This guide explains what to look for, and below it are the winter wear deals under ₹1,000 that CartCrush has found on Amazon India right now.",
    ],
    sections: [
      {
        heading: "How warm do you need it?",
        paras: [],
        points: [
          "Mild winters (Mumbai, Bengaluru, Hyderabad, Chennai): a sweatshirt, hoodie or light fleece jacket is enough for evenings.",
          "Cold winters (Delhi NCR, Punjab, UP, Rajasthan): a padded or puffer jacket over a sweater handles most days; add thermals in late December and January.",
          "Hill trips: budget jackets work as a layer, but you will need thermals underneath and a windproof outer shell.",
        ],
      },
      {
        heading: "Fabrics and fills to look for",
        paras: [
          "Under ₹1,000, most puffer jackets use polyester fill rather than down; that is fine, and it is easier to wash. Look for a quilted or baffled design so the fill does not bunch up, a hood, and elastic or ribbed cuffs that keep the wind out. Fleece-lined sweatshirts and hoodies are warmer than plain cotton ones of the same thickness.",
          "Check the outer fabric: nylon and polyester shells resist wind and light drizzle, while cotton blends are softer but let wind through.",
        ],
      },
      {
        heading: "Getting the size right",
        paras: [
          "You will wear a jacket over other layers, so if you are between sizes, take the larger one. Compare the size chart's chest measurement with a jacket you already own, and check the sleeve length in reviews. Choose listings with easy exchanges, because sizing on budget winter wear varies a lot between brands.",
        ],
      },
    ],
    faq: [
      {
        q: "Is a puffer jacket under ₹1,000 warm enough for Delhi?",
        a: "For most days, yes, worn over a sweater or sweatshirt. On the coldest days in late December and January, add a thermal layer.",
      },
      {
        q: "Should I size up for a winter jacket?",
        a: "If you are between sizes, yes, so you can layer underneath. Check the size chart's chest measurement first.",
      },
    ],
    match: {
      department: "fashion",
      category: "clothing",
      include: ["jacket", "sweatshirt", "hoodie", "sweater", "pullover", "cardigan", "thermal", "fleece", "puffer", "shrug"],
      maxPrice: 1000,
    },
    categoryHref: "/c/fashion/clothing",
    categoryName: "all clothing deals",
    dealsHeading: "Winter wear deals under ₹1,000 right now",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Guides that belong on a department or category page. */
export function guidesFor(department: string, category?: string): Guide[] {
  return GUIDES.filter((g) => g.match.department === department && (!category || !g.match.category || g.match.category === category));
}

export function matchesGuide(
  d: { department: string; category: string; title: string; price: number },
  m: GuideMatch,
): boolean {
  if (d.department !== m.department) return false;
  if (m.category && d.category !== m.category) return false;
  if (m.maxPrice && d.price > m.maxPrice) return false;
  const t = d.title.toLowerCase();
  if (m.include && !m.include.some((k) => t.includes(k))) return false;
  if (m.exclude && m.exclude.some((k) => t.includes(k))) return false;
  return true;
}
