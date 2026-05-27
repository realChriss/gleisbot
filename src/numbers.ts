const ONES = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
const TEENS = [
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
];
const TENS = [
  "",
  "",
  "zwanzig",
  "dreißig",
  "vierzig",
  "fünfzig",
  "sechzig",
  "siebzig",
  "achtzig",
  "neunzig",
];

function under100(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (o === 0) return TENS[t];
  return `${ONES[o]}und${TENS[t]}`;
}

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 100) return under100(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${ONES[h]}hundert${rest > 0 ? under100(rest) : ""}`;
}

export function numberToGermanWords(n: number, attributive: boolean = true): string {
  if (!Number.isFinite(n)) return String(n);
  n = Math.trunc(n);
  if (n === 0) return "null";
  if (n < 0) return `minus ${numberToGermanWords(-n, attributive)}`;

  const million = Math.floor(n / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];

  if (million > 0) {
    if (million === 1) parts.push("eine Million");
    else parts.push(`${under1000(million)} Millionen`);
  }

  let lower = "";
  if (thousand > 0) {
    lower += `${under1000(thousand)}tausend`;
  }
  if (rest > 0) {
    lower += under1000(rest);
  }

  if (!attributive && lower.endsWith("ein") && !lower.endsWith("undein")) {
    lower = `${lower}s`;
  }

  if (lower) parts.push(lower);

  return parts.join(" ");
}
