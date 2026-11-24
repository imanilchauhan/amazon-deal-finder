import type { Metadata } from "next";
import { SavedList } from "@/components/SavedList";

export const metadata: Metadata = {
  title: "Saved deals",
  description: "Deals you saved on CartCrush, kept in this browser.",
  alternates: { canonical: "/saved" },
  robots: { index: false, follow: true },
};

export default function SavedPage() {
  return (
    <main>
      <SavedList />
    </main>
  );
}
