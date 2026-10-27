"use client";

/**
 * Pages légales de la boutique — politique de confidentialité, conditions
 * d'utilisation, fonctionnement de la plateforme, politique cookies, à propos.
 * Chaque vue = LegalPage({ kind }).
 *
 * Task 37-c : la STRUCTURE (sections, listes, étapes) reste décrite ici ; les
 * TEXTES viennent du dictionnaire i18n (clés legal.<page>.s<n>.*) — traduction
 * anglaise complète et fidèle, sans résumé.
 */
import type { ReactNode } from "react";
import { useI18n } from "./i18n";

export type LegalKind = "privacy" | "terms" | "disclosure" | "cookies" | "about";

/* ─────────────── Blocs de contenu (textes traduits en amont) ─────────────── */

type LegalBlock =
  | { kind: "p"; text: string; strong?: boolean }
  /** Paragraphe avec segment mis en gras (ex. renvoi « Politique cookies »). */
  | { kind: "emph"; before: string; emphasis: string; after: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: { title: string; text: string }[] };

interface LegalSectionData {
  title: string;
  blocks: LegalBlock[];
}

function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <article className="rounded-2xl border bg-white p-6 shadow-sm lg:p-10">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("legal.updated")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm leading-relaxed text-foreground/85">
          {intro}
        </p>
        <div className="mt-7 space-y-7">{children}</div>
      </article>
    </div>
  );
}

function Section({ title, blocks }: { title: string; blocks: LegalBlock[] }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-foreground/80">
        {blocks.map((b, i) => {
          if (b.kind === "p") {
            return <p key={i} className={b.strong ? "font-medium text-foreground" : undefined}>{b.text}</p>;
          }
          if (b.kind === "emph") {
            return (
              <p key={i}>
                {b.before}
                <span className="font-medium text-foreground">{b.emphasis}</span>
                {b.after}
              </p>
            );
          }
          if (b.kind === "bullets") {
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          }
          return (
            <ol key={i} className="space-y-3">
              {b.items.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span className="brand-gradient mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
                    {j + 1}
                  </span>
                  <p>
                    <span className="font-semibold text-foreground">{s.title} </span>
                    {s.text}
                  </p>
                </li>
              ))}
            </ol>
          );
        })}
      </div>
    </section>
  );
}

function LegalDoc({ title, intro, sections }: { title: string; intro: string; sections: LegalSectionData[] }) {
  return (
    <LegalShell title={title} intro={intro}>
      {sections.map((s) => (
        <Section key={s.title} title={s.title} blocks={s.blocks} />
      ))}
    </LegalShell>
  );
}

/* ─────────────── Politique de confidentialité ─────────────── */

function PrivacyPage() {
  const { t } = useI18n();
  return (
    <LegalDoc
      title={t("legal.privacy.title")}
      intro={t("legal.privacy.intro")}
      sections={[
        {
          title: t("legal.privacy.s1.title"),
          blocks: [{ kind: "p", text: t("legal.privacy.s1.body") }],
        },
        {
          title: t("legal.privacy.s2.title"),
          blocks: [
            { kind: "p", text: t("legal.privacy.s2.lead1"), strong: true },
            { kind: "bullets", items: [t("legal.privacy.s2.b1"), t("legal.privacy.s2.b2")] },
            { kind: "p", text: t("legal.privacy.s2.lead2"), strong: true },
            { kind: "bullets", items: [t("legal.privacy.s2.b3"), t("legal.privacy.s2.b4")] },
            { kind: "p", text: t("legal.privacy.s2.tail") },
          ],
        },
        {
          title: t("legal.privacy.s3.title"),
          blocks: [
            {
              kind: "bullets",
              items: [
                t("legal.privacy.s3.b1"),
                t("legal.privacy.s3.b2"),
                t("legal.privacy.s3.b3"),
                t("legal.privacy.s3.b4"),
              ],
            },
          ],
        },
        {
          title: t("legal.privacy.s4.title"),
          blocks: [
            {
              kind: "bullets",
              items: [t("legal.privacy.s4.b1"), t("legal.privacy.s4.b2"), t("legal.privacy.s4.b3")],
            },
          ],
        },
        {
          title: t("legal.privacy.s5.title"),
          blocks: [
            {
              kind: "bullets",
              items: [t("legal.privacy.s5.b1"), t("legal.privacy.s5.b2"), t("legal.privacy.s5.b3")],
            },
            { kind: "p", text: t("legal.privacy.s5.tail") },
          ],
        },
        {
          title: t("legal.privacy.s6.title"),
          blocks: [
            { kind: "p", text: t("legal.privacy.s6.lead") },
            {
              kind: "bullets",
              items: [
                t("legal.privacy.s6.b1"),
                t("legal.privacy.s6.b2"),
                t("legal.privacy.s6.b3"),
                t("legal.privacy.s6.b4"),
                t("legal.privacy.s6.b5"),
                t("legal.privacy.s6.b6"),
                t("legal.privacy.s6.b7"),
              ],
            },
            { kind: "p", text: t("legal.privacy.s6.tail") },
          ],
        },
        {
          title: t("legal.privacy.s7.title"),
          blocks: [{ kind: "p", text: t("legal.privacy.s7.body") }],
        },
        {
          title: t("legal.privacy.s8.title"),
          blocks: [
            {
              kind: "emph",
              before: t("legal.privacy.s8.before"),
              emphasis: t("legal.privacy.s8.emphasis"),
              after: t("legal.privacy.s8.after"),
            },
          ],
        },
      ]}
    />
  );
}

/* ─────────────── Conditions d'utilisation ─────────────── */

function TermsPage() {
  const { t } = useI18n();
  return (
    <LegalDoc
      title={t("legal.terms.title")}
      intro={t("legal.terms.intro")}
      sections={[
        {
          title: t("legal.terms.s1.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s1.body") }],
        },
        {
          title: t("legal.terms.s2.title"),
          blocks: [
            {
              kind: "bullets",
              items: [
                t("legal.terms.s2.b1"),
                t("legal.terms.s2.b2"),
                t("legal.terms.s2.b3"),
                t("legal.terms.s2.b4"),
              ],
            },
          ],
        },
        {
          title: t("legal.terms.s3.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s3.body") }],
        },
        {
          title: t("legal.terms.s4.title"),
          blocks: [
            { kind: "p", text: t("legal.terms.s4.lead") },
            {
              kind: "bullets",
              items: [
                t("legal.terms.s4.b1"),
                t("legal.terms.s4.b2"),
                t("legal.terms.s4.b3"),
                t("legal.terms.s4.b4"),
              ],
            },
          ],
        },
        {
          title: t("legal.terms.s5.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s5.body") }],
        },
        {
          title: t("legal.terms.s6.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s6.body") }],
        },
        {
          title: t("legal.terms.s7.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s7.body") }],
        },
        {
          title: t("legal.terms.s8.title"),
          blocks: [{ kind: "p", text: t("legal.terms.s8.body") }],
        },
      ]}
    />
  );
}

/* ─────────────── Fonctionnement de la plateforme ─────────────── */

function DisclosurePage() {
  const { t } = useI18n();
  return (
    <LegalDoc
      title={t("legal.disclosure.title")}
      intro={t("legal.disclosure.intro")}
      sections={[
        {
          title: t("legal.disclosure.s1.title"),
          blocks: [
            {
              kind: "steps",
              items: [
                { title: t("legal.disclosure.s1.step1.title"), text: t("legal.disclosure.s1.step1.text") },
                { title: t("legal.disclosure.s1.step2.title"), text: t("legal.disclosure.s1.step2.text") },
                { title: t("legal.disclosure.s1.step3.title"), text: t("legal.disclosure.s1.step3.text") },
              ],
            },
          ],
        },
        {
          title: t("legal.disclosure.s2.title"),
          blocks: [{ kind: "p", text: t("legal.disclosure.s2.body") }],
        },
        {
          title: t("legal.disclosure.s3.title"),
          blocks: [{ kind: "p", text: t("legal.disclosure.s3.body") }],
        },
        {
          title: t("legal.disclosure.s4.title"),
          blocks: [
            {
              kind: "bullets",
              items: [
                t("legal.disclosure.s4.b1"),
                t("legal.disclosure.s4.b2"),
                t("legal.disclosure.s4.b3"),
                t("legal.disclosure.s4.b4"),
              ],
            },
          ],
        },
        {
          title: t("legal.disclosure.s5.title"),
          blocks: [{ kind: "p", text: t("legal.disclosure.s5.body") }],
        },
      ]}
    />
  );
}

/* ─────────────── Politique cookies ─────────────── */

function CookiesPage() {
  const { t } = useI18n();
  return (
    <LegalDoc
      title={t("legal.cookies.title")}
      intro={t("legal.cookies.intro")}
      sections={[
        {
          title: t("legal.cookies.s1.title"),
          blocks: [
            {
              kind: "emph",
              before: t("legal.cookies.s1.before"),
              emphasis: t("legal.cookies.s1.emphasis"),
              after: t("legal.cookies.s1.after"),
            },
          ],
        },
        {
          title: t("legal.cookies.s2.title"),
          blocks: [
            {
              kind: "bullets",
              items: [t("legal.cookies.s2.b1"), t("legal.cookies.s2.b2"), t("legal.cookies.s2.b3")],
            },
          ],
        },
        {
          title: t("legal.cookies.s3.title"),
          blocks: [
            {
              kind: "bullets",
              items: [t("legal.cookies.s3.b1"), t("legal.cookies.s3.b2"), t("legal.cookies.s3.b3")],
            },
          ],
        },
        {
          title: t("legal.cookies.s4.title"),
          blocks: [{ kind: "p", text: t("legal.cookies.s4.body") }],
        },
        {
          title: t("legal.cookies.s5.title"),
          blocks: [{ kind: "p", text: t("legal.cookies.s5.body") }],
        },
      ]}
    />
  );
}

/* ─────────────── À propos ─────────────── */

function AboutPage() {
  const { t } = useI18n();
  return (
    <LegalDoc
      title={t("legal.about.title")}
      intro={t("legal.about.intro")}
      sections={[
        {
          title: t("legal.about.s1.title"),
          blocks: [{ kind: "p", text: t("legal.about.s1.body") }],
        },
        {
          title: t("legal.about.s2.title"),
          blocks: [
            {
              kind: "steps",
              items: [
                { title: t("legal.about.s2.step1.title"), text: t("legal.about.s2.step1.text") },
                { title: t("legal.about.s2.step2.title"), text: t("legal.about.s2.step2.text") },
                { title: t("legal.about.s2.step3.title"), text: t("legal.about.s2.step3.text") },
              ],
            },
          ],
        },
        {
          title: t("legal.about.s3.title"),
          blocks: [
            {
              kind: "bullets",
              items: [
                t("legal.about.s3.b1"),
                t("legal.about.s3.b2"),
                t("legal.about.s3.b3"),
                t("legal.about.s3.b4"),
              ],
            },
          ],
        },
        {
          title: t("legal.about.s4.title"),
          blocks: [{ kind: "p", text: t("legal.about.s4.body") }],
        },
      ]}
    />
  );
}

/* ─────────────── Sélecteur de vue ─────────────── */

export function LegalPage({ kind }: { kind: LegalKind }) {
  if (kind === "privacy") return <PrivacyPage />;
  if (kind === "terms") return <TermsPage />;
  if (kind === "disclosure") return <DisclosurePage />;
  if (kind === "cookies") return <CookiesPage />;
  return <AboutPage />;
}
