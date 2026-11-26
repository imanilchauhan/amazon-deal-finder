import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Footer, Header, JsonLd } from "@/components/SiteChrome";
import { getDeals, lastChecked } from "@/lib/deals";
import { SITE, SOCIALS } from "@/lib/site";
import { ADSENSE_CLIENT, adsEnabled } from "@/lib/ads";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "CartCrush – Today's Best Amazon Deals & Price Drops in India",
    template: "%s | CartCrush",
  },
  description: SITE.description,
  keywords: SITE.keywords,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
    url: "/",
    title: "CartCrush – Today's Best Amazon Deals & Price Drops",
    description: SITE.description,
    images: [{ url: "/og.png", width: 1500, height: 500, alt: "CartCrush daily deals" }],
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.xHandle,
    creator: SITE.xHandle,
    title: "CartCrush – Today's Best Amazon Deals & Price Drops",
    description: SITE.description,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  // Google Search Console ownership (public by design: it appears in the page head).
  verification: { google: "f4J5jy714hQbYwgNYIr-thm-04zeb2r6kesYM2vxf9c" },
  category: "shopping",
  // AdSense site ownership (only once an AdSense account id is configured).
  ...(adsEnabled() ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
  ],
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/logo-mark.png`,
      sameAs: SOCIALS.map((so) => so.url),
    },
    {
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
      inLanguage: "en-IN",
    },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const checked = lastChecked(await getDeals());
  return (
    <html lang="en-IN" className={`${inter.variable} ${display.variable}`}>
      <body>
        <JsonLd data={orgJsonLd} />
        <Header checked={checked} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
