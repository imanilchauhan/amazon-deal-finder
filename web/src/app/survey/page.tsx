import type { Metadata } from "next";
import SurveyForm from "./SurveyForm";
import s from "./survey.module.css";

export const metadata: Metadata = {
  title: "Quick survey: help us find deals you'll actually buy",
  description:
    "Tell CartCrush what you shop for on Amazon India, your budget and where you want deals. 8 quick questions, about 90 seconds.",
  alternates: { canonical: "/survey" },
  openGraph: {
    title: "CartCrush survey: what deals do you want?",
    description: "8 quick questions, about 90 seconds. Help us pick the Amazon India deals you actually want.",
  },
};

export default function Survey() {
  return (
    <main className={s.page}>
      <header className={s.hero}>
        <p className={s.kicker}>Quick survey · about 90 seconds</p>
        <h1>Help us find deals you&apos;ll actually buy</h1>
        <p className={s.lead}>
          Tell us what you shop for, your budget and where you want to see deals. We use your answers to pick better deals
          for you.
        </p>
      </header>
      <SurveyForm />
    </main>
  );
}
