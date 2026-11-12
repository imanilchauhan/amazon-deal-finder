import Link from "next/link";
import { DEPARTMENTS } from "@/lib/taxonomy";
import s from "./ui.module.css";

/** Horizontal department strip. `counts` hides empty departments so shoppers never hit a blank shelf. */
export function CategoryNav({ counts, active }: { counts?: Record<string, number>; active?: string }) {
  const items = DEPARTMENTS.filter((d) => !counts || (counts[d.slug] ?? 0) > 0);
  return (
    <nav className={s.catNav} aria-label="Shop by category">
      {items.map((d, i) => (
        <Link
          key={d.slug}
          href={`/c/${d.slug}`}
          className={s.catPill}
          aria-current={active === d.slug ? "page" : undefined}
          style={{ ["--i" as string]: Math.min(i, 14) }}
        >
          <span aria-hidden>{d.icon}</span>
          <span>{d.name}</span>
          {counts && <small>{counts[d.slug]}</small>}
        </Link>
      ))}
    </nav>
  );
}
