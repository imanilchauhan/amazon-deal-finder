import data from "@/data/taxonomy.json";

export type Category = { slug: string; name: string; keywords: string[] };
export type Department = { slug: string; name: string; icon: string; categories: Category[] };

export const DEPARTMENTS: Department[] = data.departments as Department[];

export function getDepartment(slug: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug);
}

export function getCategory(dep: string, cat: string): Category | undefined {
  return getDepartment(dep)?.categories.find((c) => c.slug === cat);
}

/** Every real category page (the "other" shelf stays reachable but unlinked from menus). */
export function allCategoryPaths(): { department: string; category: string }[] {
  return DEPARTMENTS.flatMap((d) => d.categories.map((c) => ({ department: d.slug, category: c.slug })));
}

export const UNCATEGORISED = "uncategorised";
