export const SITE = {
  name: "CartCrush",
  tagline: "Daily price drops worth crushing on",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://deal-finder-d7a62.web.app").replace(/\/$/, ""),
  xHandle: "@cartcrushdeals",
  xUrl: "https://x.com/cartcrushdeals",
  email: "crushcart004.21@gmail.com",
  description:
    "Today's best Amazon deals in India, checked every few hours. Big price drops, loot deals and discount offers on electronics, fashion, beauty, home and kitchen, with the original price and your savings on every deal.",
  keywords: [
    "amazon deals today",
    "best deals india",
    "amazon offers today",
    "loot deals",
    "discount offers",
    "today's deals",
    "amazon sale",
    "online shopping offers india",
    "lightning deals",
    "deals under 500",
    "cartcrush",
  ],
};

export const AMAZON_DISCLOSURE = "As an Amazon Associate, CartCrush earns from qualifying purchases.";
export const PRICE_DISCLAIMER =
  "Prices and availability are accurate as of the date and time shown and are subject to change. The price and availability shown on Amazon at the time of purchase will apply.";

export type Social = { name: string; handle: string; url: string; blurb: string; accent: string };

/** Every place CartCrush posts deals (contact page, footer and structured data). */
export const SOCIALS: Social[] = [
  {
    name: "Instagram",
    handle: "@crush_cart_deals",
    url: "https://instagram.com/crush_cart_deals",
    blurb: "Deal cards every hour from 9 AM to 10 PM. Tap the link in bio to shop.",
    accent: "#D62976",
  },
  {
    name: "Facebook",
    handle: "CartCrush Deals",
    url: "https://facebook.com/1430044273527286",
    blurb: "Every deal with a direct link, plus our collection of the week on Sundays.",
    accent: "#1877F2",
  },
  {
    name: "X",
    handle: "@cartcrushdeals",
    url: "https://x.com/cartcrushdeals",
    blurb: "The fastest way to catch new price drops as we post them.",
    accent: "var(--ink)",
  },
  // WhatsApp channel: add { name: "WhatsApp", handle: "CartCrush channel", url: "https://whatsapp.com/channel/…", … }
];
