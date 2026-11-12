import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoryView } from "@/components/CategoryView";
import { getDeals } from "@/lib/deals";
import { DEPARTMENTS, getDepartment } from "@/lib/taxonomy";

export function generateStaticParams() {
  return DEPARTMENTS.map((d) => ({ department: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[department]">): Promise<Metadata> {
  const { department } = await params;
  const dep = getDepartment(department);
  if (!dep) return { title: "Category not found", robots: { index: false } };
  const count = (await getDeals()).filter((d) => d.department === department).length;
  return {
    title: `${dep.name} Deals Today – Best Amazon India Offers`,
    description: `${count ? `${count} live ` : ""}${dep.name} deals on Amazon India: ${dep.categories
      .slice(0, 4)
      .map((c) => c.name.toLowerCase())
      .join(", ")} and more, sorted by biggest discount.`,
    alternates: { canonical: `/c/${department}` },
    robots: count ? undefined : { index: false, follow: true }, // thin pages stay out of the index
  };
}

export default function Page(props: PageProps<"/c/[department]">) {
  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <Dept params={props.params} />
    </Suspense>
  );
}

async function Dept({ params }: { params: PageProps<"/c/[department]">["params"] }) {
  const { department } = await params;
  return <CategoryView department={department} />;
}
