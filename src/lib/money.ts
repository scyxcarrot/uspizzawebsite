/** Format an integer amount in sen as "RM 12.50". Display only. */
export function formatRM(sen: number): string {
  const negative = sen < 0;
  const abs = Math.abs(Math.round(sen));
  const ringgit = Math.floor(abs / 100).toLocaleString("en-MY");
  const cents = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}RM ${ringgit}.${cents}`;
}
