/** Formatage monétaire — les montants sont stockés en centimes (Int) pour éviter les erreurs de flottants. */

/**
 * Devises proposées dans les formulaires back-office (codes ISO 4217).
 * Intl.NumberFormat gère nativement l'affichage (« 1 000 F CFA », « 12,99 € »…).
 */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — Dollar américain" },
  { code: "MAD", label: "MAD — Dirham marocain" },
  { code: "CHF", label: "CHF — Franc suisse" },
  { code: "CAD", label: "CAD — Dollar canadien" },
  { code: "XOF", label: "XOF — Franc CFA (Afrique de l'Ouest)" },
  { code: "XAF", label: "XAF — Franc CFA (Afrique centrale)" },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/** Libellé lisible d'un code devise (repli : code brut, jamais d'invention). */
export function currencyLabel(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.label ?? code;
}

export function formatCents(cents: number | null | undefined, currency = "EUR", locale = "fr-FR"): string {
  if (cents === null || cents === undefined) return "Prix inconnu";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatPriceRange(
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
  currency = "EUR",
  note?: string | null
): string {
  if (minCents != null && maxCents != null && minCents !== maxCents) {
    return `${formatCents(minCents, currency)} – ${formatCents(maxCents, currency)}${note ? ` ${note}` : ""}`;
  }
  return `${formatCents(minCents ?? maxCents, currency)}${note ? ` ${note}` : ""}`;
}
