"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SURVEY from "@/lib/survey.json";
import s from "./survey.module.css";

type Q = (typeof SURVEY.questions)[number] & { max?: number; other?: boolean; maxLength?: number; placeholder?: string };
const QUESTIONS = SURVEY.questions as Q[];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Answers = Record<string, string | string[]>;

export default function SurveyForm() {
  const [answers, setAnswers] = useState<Answers>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [digest, setDigest] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [formError, setFormError] = useState("");
  const started = useRef(0);
  const source = useRef("web");
  const trap = useRef<HTMLInputElement>(null);

  useEffect(() => {
    started.current = Date.now();
    const src = new URLSearchParams(window.location.search).get("src") || "";
    if (SURVEY.sources.includes(src)) source.current = src;
  }, []);

  const pickedOf = (id: string) => (answers[id] as string[] | undefined) ?? [];

  function toggle(q: Q, opt: string) {
    setErrors((e) => ({ ...e, [q.id]: "" }));
    if (q.type === "single") return setAnswers((a) => ({ ...a, [q.id]: opt }));
    const cur = pickedOf(q.id);
    if (cur.includes(opt)) return setAnswers((a) => ({ ...a, [q.id]: cur.filter((x) => x !== opt) }));
    if (q.max && cur.length >= q.max) {
      return setErrors((e) => ({ ...e, [q.id]: `Pick up to ${q.max}. Untick one to change.` }));
    }
    setAnswers((a) => ({ ...a, [q.id]: [...cur, opt] }));
  }

  function validate() {
    const e: Record<string, string> = {};
    for (const q of QUESTIONS) {
      const v = answers[q.id];
      const empty = q.type === "text" ? !String(v ?? "").trim() : q.type === "single" ? !v : !(v as string[] | undefined)?.length;
      if (q.required && empty) e[q.id] = "Please answer this question.";
    }
    const em = email.trim();
    if (!em) e.email = "Please enter your email.";
    else if (!EMAIL_RE.test(em) || em.length > 254) e.email = "Please enter a valid email address.";
    if (!consent) e.consent = "Please tick the box to agree.";
    return e;
  }

  function focusFirst(e: Record<string, string>) {
    const order = [...QUESTIONS.map((q) => q.id), "email", "consent"];
    const first = order.find((id) => e[id]);
    if (first) document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError("");
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return focusFirst(e);
    setStatus("sending");
    try {
      const r = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: { ...answers, ...Object.fromEntries(Object.entries(others).map(([k, v]) => [`${k}_other`, v])) },
          email: email.trim(),
          consent,
          digest,
          source: source.current,
          website: trap.current?.value || "",
          elapsed: Date.now() - started.current,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setStatus("done");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setStatus("idle");
      if (d.field) {
        const fe = { [d.field]: d.error };
        setErrors(fe);
        focusFirst(fe);
      } else setFormError(d.error || "Something went wrong. Please try again.");
    } catch {
      setStatus("idle");
      setFormError("Couldn't reach CartCrush. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <section className={`${s.card} ${s.done}`} aria-live="polite">
        <div className={s.tick} aria-hidden="true">✓</div>
        <h2>Thanks, your answers are in!</h2>
        <p>We&apos;ll use them to pick deals you actually want. Sent it before? Your newest answers replace the old ones.</p>
        <Link href="/" className={s.submit}>
          See today&apos;s best deals →
        </Link>
      </section>
    );
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {QUESTIONS.map((q, i) => (
        <fieldset key={q.id} id={`q-${q.id}`} className={`${s.card} ${errors[q.id] ? s.invalid : ""}`}>
          <legend className={s.legend}>
            <span className={s.num}>{i + 1}</span>
            <span>
              {q.title}
              {q.hint && <span className={s.hint}>{q.hint}</span>}
            </span>
          </legend>
          {q.type === "text" ? (
            <input
              className={s.input}
              type="text"
              maxLength={q.maxLength}
              placeholder={q.placeholder}
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              aria-label={q.title}
            />
          ) : (
            <div className={s.chips} role={q.type === "single" ? "radiogroup" : "group"}>
              {q.options!.map((opt) => {
                const on = q.type === "single" ? answers[q.id] === opt : pickedOf(q.id).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    role={q.type === "single" ? "radio" : "checkbox"}
                    aria-checked={on}
                    className={`${s.chip} ${on ? s.on : ""}`}
                    onClick={() => toggle(q, opt)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          {q.other && pickedOf(q.id).includes("Other") && (
            <input
              className={s.input}
              type="text"
              maxLength={80}
              placeholder={q.id === "stores" ? "Which other app or site?" : "What else?"}
              value={others[q.id] ?? ""}
              onChange={(e) => setOthers((o) => ({ ...o, [q.id]: e.target.value }))}
              aria-label={`Other: ${q.title}`}
            />
          )}
          {errors[q.id] && <p className={s.error}>{errors[q.id]}</p>}
        </fieldset>
      ))}

      <fieldset id="q-email" className={`${s.card} ${errors.email || errors.consent ? s.invalid : ""}`}>
        <legend className={s.legend}>
          <span className={s.num}>{QUESTIONS.length + 1}</span>
          <span>Your email</span>
        </legend>
        <input
          className={s.input}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((x) => ({ ...x, email: "" }));
          }}
          aria-label="Your email"
          aria-invalid={!!errors.email}
          required
        />
        {errors.email && <p className={s.error}>{errors.email}</p>}
        <label id="q-consent" className={s.check}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((x) => ({ ...x, consent: "" }));
            }}
          />
          <span>
            I agree that CartCrush can store my answers and email to improve its deals. See our{" "}
            <Link href="/privacy#survey">privacy policy</Link>.
          </span>
        </label>
        {errors.consent && <p className={s.error}>{errors.consent}</p>}
        <label className={s.check}>
          <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
          <span>Also email me a weekly deals digest (optional).</span>
        </label>
        {/* Hidden from people; bots tend to fill it in. */}
        <input ref={trap} className={s.trap} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      </fieldset>

      {formError && (
        <p className={s.formError} role="alert">
          {formError}
        </p>
      )}
      <button className={s.submit} type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send my answers"}
      </button>
      <p className={s.note}>We never sell or share your email. You can ask us to delete your answers at any time.</p>
    </form>
  );
}
