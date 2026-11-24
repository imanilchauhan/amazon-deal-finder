/* eslint-disable @next/next/no-img-element -- Amazon product images are linked, not proxied */
import Link from "next/link";
import { CategoryNav } from "@/components/CategoryNav";
import { DealRow } from "@/components/DealRow";
import { MoodGrid } from "@/components/MoodGrid";
import { JsonLd } from "@/components/SiteChrome";
import { COLLECTIONS, buildCollection } from "@/data/collections";
import type { Deal } from "@/lib/deal-model";
import { getActiveProducts, getCollectionPicks, getDeals } from "@/lib/deals";
import { money } from "@/lib/format";
import { PRICE_DISCLAIMER, SITE, SOCIALS } from "@/lib/site";
import { DEPARTMENTS } from "@/lib/taxonomy";
import { isForHer, isWinter, moodsOf, snippet } from "@/lib/themes";
import { withoutVariants } from "@/lib/variants";
import h from "./home.module.css";
import s from "./page.module.css";

const deptName = (slug: string) => DEPARTMENTS.find((d) => d.slug === slug)?.name ?? "its category";

/** Hero pick: a strong, real discount on something people browse for, boosted for season and audience. */
function dealOfTheHour(deals: Deal[], now: Date): Deal | undefined {
  const score = (d: Deal) => d.discountPct + (isWinter(d, now) ? 8 : 0) + (isForHer(d) ? 8 : 0);
  return deals
    .filter((d) => d.discountPct >= 30 && d.price >= 199 && d.department !== "uncategorised" && d.imageUrl)
    .sort((a, b) => score(b) - score(a))[0];
}

function reasons(d: Deal, all: Deal[], now: Date): string[] {
  const out: string[] = [];
  const topInDept = all.filter((x) => x.department === d.department).every((x) => x.discountPct <= d.discountPct);
  if (topInDept) out.push(`Biggest discount in ${deptName(d.department).toLowerCase()} today`);
  const cap = [300, 500, 1000, 2000].find((c) => d.price < c);
  if (cap) out.push(`Under ${money(cap, d.currency)}`);
  if (isWinter(d, now)) out.push("Winter pick");
  else if (isForHer(d)) out.push("For her");
  return out.slice(0, 3);
}

export default async function Home() {
  const [all, products, picks] = await Promise.all([getDeals(), getActiveProducts(), getCollectionPicks()]);
  const now = new Date();
  const deals = withoutVariants(all);
  const hero = dealOfTheHour(deals, now);
  const rest = deals.filter((d) => d !== hero);
  const winter = rest.filter((d) => isWinter(d, now)).slice(0, 3);
  const steal = rest.find((d) => d.price < 500 && d.discountPct >= 50);
  const forHer = rest.find((d) => isForHer(d) && d !== steal);
  const home = rest.find((d) => d.department === "home-kitchen" && d !== steal && d !== forHer);
  const homeMax = Math.max(0, ...deals.filter((d) => d.department === "home-kitchen").map((d) => d.discountPct));
  const winterCol = COLLECTIONS.find((c) => c.group === "Winter");
  const used = new Set([hero, steal, forHer, home].filter(Boolean).map((d) => d!.asin));
  const crushes = rest.filter((d) => !used.has(d.asin)).slice(0, 60).map((deal) => ({ deal, moods: moodsOf(deal, now) }));

  const counts: Record<string, number> = {};
  for (const d of all) counts[d.department] = (counts[d.department] ?? 0) + 1;
  const shelves = DEPARTMENTS.filter((d) => (counts[d.slug] ?? 0) > 0).sort((a, b) => counts[b.slug] - counts[a.slug]);
  const collectionTiles = COLLECTIONS.map((col) => {
    const r = buildCollection(col, products, picks[col.slug] ?? []);
    const items = [...r.topDeals, ...r.picks, ...r.sections.flatMap((x) => x.items)];
    return { col, items, best: Math.max(0, ...items.map((d) => d.discountPct)) };
  })
    .filter((x) => x.items.length >= 3)
    .sort((a, b) => b.best - a.best)
    .slice(0, 6);
  // Each collection tile shows its own photos: a product already shown on an earlier tile is skipped.
  const shownOnTiles = new Set<string>();
  for (const t of collectionTiles) {
    const fresh = t.items.filter((d) => !shownOnTiles.has(d.asin));
    t.items = (fresh.length >= 3 ? fresh : t.items).slice(0, 3);
    t.items.forEach((d) => shownOnTiles.add(d.asin));
  }
  const day = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const instagram = SOCIALS.find((x) => x.name === "Instagram");
  const whatsapp = SOCIALS.find((x) => x.name === "WhatsApp");
  const facebook = SOCIALS.find((x) => x.name === "Facebook");

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Today's best Amazon deals in India",
    itemListElement: [hero, ...crushes.slice(0, 11).map((c) => c.deal)]
      .filter(Boolean)
      .map((d, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE.url}/deals/${d!.slug}`, name: d!.shortTitle })),
  };

  return (
    <main className={h.page}>
      <JsonLd data={itemList} />
      <section className={h.intro}>
        <div>
          <p className={h.eyebrow}>{day}</p>
          <h1>Today&apos;s best price drops, picked for you.</h1>
        </div>
        <p className={h.lead}>
          We check Amazon India every few hours and keep only real discounts. One card per product, no repeats, {all.length}{" "}
          live deals right now.
        </p>
      </section>

      <section className={h.bento} aria-label="Highlights">
        {hero && (
          <article className={`${h.tile} ${h.heroTile}`}>
            <div className={h.heroText}>
              <span className={h.kicker}>Deal of the hour</span>
              <h2>
                <Link href={`/deals/${hero.slug}`}>{hero.shortTitle}</Link>
              </h2>
              <p className={h.heroPrice}>
                <span>{money(hero.price, hero.currency)}</span>
                <s>{money(hero.originalPrice, hero.currency)}</s>
              </p>
              <p className={h.heroSave}>
                You save {money(hero.savings, hero.currency)} · {hero.discountPct}% off
              </p>
              <div className={h.why}>
                <p>Why it&apos;s a crush</p>
                <ul>
                  {reasons(hero, deals, now).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <a className={h.heroCta} href={hero.url} target="_blank" rel="sponsored nofollow noopener">
                Get this deal on Amazon
              </a>
            </div>
            <Link href={`/deals/${hero.slug}`} className={h.heroImg} aria-label={hero.shortTitle}>
              <img src={hero.imageUrl} alt={hero.shortTitle} width={420} height={420} />
              <span>−{hero.discountPct}%</span>
            </Link>
          </article>
        )}

        {winter.length > 0 && (
          <Link href={winterCol ? `/collections/${winterCol.slug}` : "/deals?q=winter"} className={`${h.tile} ${h.winter}`}>
            <span className={h.kicker}>Winter edit</span>
            <h3>Stay warm from {money(Math.min(...winter.map((d) => d.price)), "INR")}</h3>
            <div className={h.collage3}>
              {winter.map((d) => (
                <img key={d.asin} src={d.imageUrl} alt="" loading="lazy" />
              ))}
            </div>
          </Link>
        )}

        {steal && (
          <Link href="/deals?price=u500" className={`${h.tile} ${h.dark}`}>
            <div className={h.tileText}>
              <span className={h.kicker}>Steals</span>
              <h3 className={h.big}>Under ₹499</h3>
              <p>
                {snippet(steal.shortTitle, 22)} · {money(steal.price, steal.currency)} · {steal.discountPct}% off
              </p>
            </div>
            <img className={h.side} src={steal.imageUrl} alt="" loading="lazy" />
          </Link>
        )}

        {forHer && (
          <Link href="/deals?for=women" className={`${h.tile} ${h.her}`}>
            <div className={h.tileText}>
              <span className={h.kicker}>For her</span>
              <h3>Fashion, bags &amp; beauty</h3>
              <p>
                {snippet(forHer.shortTitle, 22)} · {money(forHer.price, forHer.currency)}
              </p>
            </div>
            <img className={h.side} src={forHer.imageUrl} alt="" loading="lazy" />
          </Link>
        )}

        {home && (
          <Link href="/c/home-kitchen" className={`${h.tile} ${h.home}`}>
            <div className={h.tileText}>
              <span className={h.kicker}>Home refresh</span>
              <h3>Home &amp; kitchen up to {homeMax}% off</h3>
              <p>
                {snippet(home.shortTitle, 22)} · {money(home.price, home.currency)}
              </p>
            </div>
            <img className={h.side} src={home.imageUrl} alt="" loading="lazy" />
          </Link>
        )}
      </section>

      <section className={h.section} aria-labelledby="crushes">
        <div className={h.head}>
          <div>
            <h2 id="crushes">Today&apos;s top crushes</h2>
            <p>Sorted by biggest discount. Tap a mood to narrow it down.</p>
          </div>
          <Link href="/deals">See all {all.length} deals →</Link>
        </div>
        <MoodGrid items={crushes} perView={12} />
      </section>

      {collectionTiles.length > 0 && (
        <section className={h.section} aria-labelledby="cols">
          <div className={h.head}>
            <h2 id="cols">Collections people love</h2>
            <Link href="/collections">All {COLLECTIONS.length} collections →</Link>
          </div>
          <div className={h.cols}>
            {collectionTiles.map(({ col, items, best }) => (
              <Link key={col.slug} href={`/collections/${col.slug}`} className={h.col}>
                <div className={h.collage}>
                  {items.slice(0, 3).map((d) => (
                    <img key={d.asin} src={d.imageUrl} alt="" loading="lazy" />
                  ))}
                </div>
                <div className={h.colText}>
                  <div>
                    <p>
                      {col.group}
                      {best ? ` · up to ${best}% off` : ""}
                    </p>
                    <h3>{col.h1}</h3>
                  </div>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={h.join} aria-labelledby="join">
        <div>
          <h2 id="join">Get the best deals where you scroll</h2>
          <p>Hourly deal cards on Instagram and Facebook{whatsapp ? ", and the top 5 every morning on WhatsApp" : ""}. Unfollow any time.</p>
        </div>
        <div className={h.joinBtns}>
          {whatsapp && (
            <a href={whatsapp.url} target="_blank" rel="noopener" className={h.wa}>
              Join on WhatsApp
            </a>
          )}
          {instagram && (
            <a href={instagram.url} target="_blank" rel="noopener me" className={h.light}>
              Follow on Instagram
            </a>
          )}
          {facebook && (
            <a href={facebook.url} target="_blank" rel="noopener me" className={h.ghost}>
              Facebook
            </a>
          )}
        </div>
      </section>

      <section className={h.section} aria-labelledby="cats">
        <div className={h.head}>
          <h2 id="cats">Shop by category</h2>
        </div>
        <CategoryNav counts={counts} />
      </section>
      {shelves.map((dep) => (
        <DealRow
          key={dep.slug}
          title={dep.name}
          label={dep.name}
          href={`/c/${dep.slug}`}
          linkLabel={`See all ${counts[dep.slug]}`}
          deals={all.filter((d) => d.department === dep.slug).slice(0, 12)}
        />
      ))}
      <p className={s.note}>{PRICE_DISCLAIMER}</p>

      <div className={s.seo}>
        <section>
          <h2>Amazon deals today, checked every few hours</h2>
          <p>
            Our deal finder scans Amazon.in for the biggest price drops of the day, so you can see today&apos;s offers in one
            place instead of scrolling through sale pages.
          </p>
        </section>
        <section>
          <h2>Real discounts, not inflated MRPs</h2>
          <p>Every deal shows the current price, the regular price and exactly how much you save. Deals that end are removed automatically.</p>
        </section>
        <section>
          <h2>Ask for what you need</h2>
          <p>
            Type what you&apos;re shopping for in the Ask box, like &ldquo;gift for mom under ₹500&rdquo;, and we&apos;ll show the
            matching deals. Or follow us on <a href={instagram?.url ?? SITE.xUrl}>Instagram</a> for new deals every hour.
          </p>
        </section>
      </div>
    </main>
  );
}
