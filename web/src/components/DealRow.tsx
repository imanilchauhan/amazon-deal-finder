import Link from "next/link";
import type { Deal } from "@/lib/deals";
import { DealCard } from "./DealCard";
import s from "./ui.module.css";

type Props = {
  title: React.ReactNode;
  href: string;
  linkLabel: string;
  deals: Deal[];
  /** Short line under the title. */
  note?: string;
};

/** A titled, horizontally scrolling row of deal cards with a "see all" link (home page shelves). */
export function DealRow({ title, href, linkLabel, deals, note }: Props) {
  if (!deals.length) return null;
  return (
    <section className={s.rowSection}>
      <div className={s.rowHead}>
        <div>
          <h2>{title}</h2>
          {note && <p className={s.rowNote}>{note}</p>}
        </div>
        <Link href={href}>{linkLabel} →</Link>
      </div>
      <div className={s.row} role="list">
        {deals.map((d, i) => (
          <div key={d.asin} role="listitem" className={s.rowItem}>
            <DealCard deal={d} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
