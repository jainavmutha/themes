export function currency(n) {
  if (Number.isNaN(+n)) return "Rs.0";
  return "Rs." + new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function numberWithCommas(x) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(Math.round(Number(x || 0)));
}

export function safeFileNamePart(value, fallback = "Customer") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-");

  return cleaned || fallback;
}

export const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const ceilDiv = (a, b) => Math.ceil(a / b);