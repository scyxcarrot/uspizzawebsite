export const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

/** e.g. "Friday, 6 November 2026, 5:45 pm (Malaysia time, UTC+8)" */
export function formatMalaysiaNow(now: Date = new Date()): string {
  const text = new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return `${text} (Malaysia time, UTC+8)`;
}

/** Short date and time for showing when an order was placed. */
export function formatOrderTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
