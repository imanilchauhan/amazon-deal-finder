import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoryView } from "@/components/CategoryView";
import { getDeals } from "@/lib/deals";
import { allCategoryPaths, getCategory, getDepartment } from "@/lib/taxonomy";

export function generateStaticParams() {
  return allCategoryPaths();
}

export async function generateMetadata({ params }: PageProps<"/c/[department]/[category]">): Promise<Metadata> {
  const { department, category } = await params;
  const dep = getDepartment(department);
  const cat = getCategory(department, category);
  if (!dep || !cat) return { title: "Category not found", robots: { index: false } };
  const count = (await getDeals()).filter((d) => d.department === department && d.category === category).length;
  return {
    title: `${cat.name} Deals Today – ${dep.name} Offers on Amazon India`,
    description: `${count ? `${count} live ` : ""}${cat.name.toLowerCase()} deals on Amazon India, sorted by biggest discount and updated every few hours.`,
    alternates: { canonical: `/c/${department}/${category}` },
    robots: count ? undefined : { index: false, follow: true },
  };
}

export default function Page(props: PageProps<"/c/[department]/[category]">) {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <Cat params={props.params} />
    </Suspense>
  );
}

async function Cat({ params }: { params: PageProps<"/c/[department]/[category]">["params"] }) {
  const { department, category } = await params;
  return <CategoryView department={department} category={category} />;
}
