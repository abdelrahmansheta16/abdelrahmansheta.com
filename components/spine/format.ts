/** Small formatting helpers shared by the spine. Digits stay Western in both locales. */

/** "2023-06" -> "Jun 2023" / "يونيو 2023". Latin digits are forced via the `nu-latn` extension. */
export function formatYearMonth(value: string, locale: string): string {
  const [year, month] = value.split("-");
  if (!month) return year ?? value;
  const tag = locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat(tag, { month: "short", year: "numeric" }).format(date);
}

export function formatRange(start: string, end: string | null, locale: string, presentLabel: string) {
  return `${formatYearMonth(start, locale)} – ${end ? formatYearMonth(end, locale) : presentLabel}`;
}
