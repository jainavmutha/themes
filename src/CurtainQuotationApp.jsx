import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Download, Plus, Trash2, Copy, FileText, Package, BarChart2, ShoppingCart, CheckSquare, Files } from "lucide-react";
import { jsPDF } from "jspdf";

/* =========================
   Quote Storage & Numbering
   ========================= */
const LS_QUOTES_KEY = "themes_quotes_v1";
const LS_SEQ_PREFIX = "themes_seq_";
const LS_FABRIC_PROCESSING_KEY = "themes_fabric_processing_global_v1";
const LS_PAYMENTS_KEY = "themes_payments_v1";
const LS_AUTH_USER_KEY = "themes_auth_user_v1";

const AUTH_USERS = [
  { username: "admin", password: "Themes@141$", role: "admin", label: "Admin" },
  { username: "staff", password: "staff123", role: "staff", label: "Staff" },
];

const STAFF_ALLOWED_TABS = new Set(["quote", "payments", "settings", "fabric-processing"]);

function canAccessTab(user, tab) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") return STAFF_ALLOWED_TABS.has(tab);
  return false;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_QUOTES_TABLE = "themes_quotes";
const SUPABASE_SETTINGS_TABLE = "themes_app_settings";
const SUPABASE_APP_STATE_TABLE = "app_state";
const SETTINGS_ROW_ID = "pricing_settings";
const DEFAULT_LOGO_URL = import.meta.env.VITE_DEFAULT_LOGO_URL || "https://drive.google.com/uc?export=view&id=1zPOSv3lHBukCB7QtZrD-oc3j8T8YxbYx";
const DEFAULT_SIGNATURE_URL = import.meta.env.VITE_DEFAULT_SIGNATURE_URL || "https://drive.google.com/uc?export=view&id=1w4OXKhD37BWQfAit1zOTBGlHK1YpfZqn";
const DEFAULT_PAYMENT_QR_URL = import.meta.env.VITE_DEFAULT_PAYMENT_QR_URL || "https://drive.google.com/uc?export=view&id=1fCy8MlBWYX2SrOpe52FQ4EIDo777nP4s";
const DEFAULT_PAYMENT_UPI_ID = import.meta.env.VITE_DEFAULT_PAYMENT_UPI_ID || "";
const QUOTE_STATUSES = ["Draft", "Sent", "Approved", "Rejected", "Cancelled"];
const STATUS_COLORS = {
  Draft:     { bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" },
  Sent:      { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  Approved:  { bg: "#ECFDF5", text: "#065F46", border: "#6EE7B7" },
  Rejected:  { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  Cancelled: { bg: "#FFF7ED", text: "#92400E", border: "#FED7AA" },
};

function stripUrlQuotes(url) {
  return String(url || "").trim().replace(/^['"]|['"]$/g, "");
}
function getGoogleDriveFileId(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";
  const fileMatch = raw.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  const idMatch = raw.match(/[?&]id=([^&#]+)/);
  if (raw.includes("drive.google.com") && idMatch?.[1]) return idMatch[1];
  return "";
}
function normalizeImageUrl(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";
  const driveId = getGoogleDriveFileId(raw);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w1000`;
  return raw;
}
function googleDrivePdfUrl(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";
  const driveId = getGoogleDriveFileId(raw);
  if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w1000`;
  return raw;
}
function hasSupabaseConfig() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
function supabaseHeaders(extra = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...extra };
}
async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: supabaseHeaders(options.headers || {}) });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `Supabase request failed with status ${res.status}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
function rowToQuoteRecord(row) {
  if (!row) return null;
  return { ...(row.data || {}), quoteNo: row.quote_no, createdAt: row.created_at || row.data?.createdAt, updatedAt: row.updated_at || row.data?.updatedAt };
}
function yyyymm(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}
async function loadAllQuotes() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseFetch(`/rest/v1/${SUPABASE_QUOTES_TABLE}?select=quote_no,data,created_at,updated_at&order=updated_at.desc`);
    return (rows || []).reduce((map, row) => { const rec = rowToQuoteRecord(row); if (rec?.quoteNo) map[rec.quoteNo] = rec; return map; }, {});
  }
  try { return JSON.parse(localStorage.getItem(LS_QUOTES_KEY) || '{}'); } catch { return {}; }
}
async function saveAllQuotes(map) { localStorage.setItem(LS_QUOTES_KEY, JSON.stringify(map)); }
async function nextMonthlySeq() {
  if (hasSupabaseConfig()) {
    const d = new Date();
    const YY = String(d.getFullYear()).slice(-2);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const prefix = `TF-${YY}${MM}-`;
    const rows = await supabaseFetch(`/rest/v1/${SUPABASE_QUOTES_TABLE}?select=quote_no&quote_no=like.${encodeURIComponent(prefix + '%')}&order=quote_no.desc&limit=1`);
    const lastNo = rows?.[0]?.quote_no || "";
    const lastSeq = Number(lastNo.split('-').pop() || 0);
    return Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  }
  const key = LS_SEQ_PREFIX + yyyymm();
  let n = +(localStorage.getItem(key) || '0');
  n += 1;
  localStorage.setItem(key, String(n));
  return n;
}
async function generateQuoteNo() {
  const d = new Date();
  const YY = String(d.getFullYear()).slice(-2);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const seq = String(await nextMonthlySeq()).padStart(4, '0');
  return `TF-${YY}${MM}-${seq}`;
}
async function saveQuoteRecord(quoteNo, data) {
  const now = new Date().toISOString();
  const record = { ...data, quoteNo, updatedAt: now };
  if (hasSupabaseConfig()) {
    await supabaseFetch(`/rest/v1/${SUPABASE_QUOTES_TABLE}?on_conflict=quote_no`, {
      method: "POST",
      body: JSON.stringify({ quote_no: quoteNo, data: record, updated_at: now }),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    return record;
  }
  const map = await loadAllQuotes();
  map[quoteNo] = record;
  await saveAllQuotes(map);
  return record;
}
async function deleteQuoteRecord(quoteNo) {
  if (hasSupabaseConfig()) {
    await supabaseFetch(`/rest/v1/${SUPABASE_QUOTES_TABLE}?quote_no=eq.${encodeURIComponent(quoteNo)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return;
  }
  const map = await loadAllQuotes();
  delete map[quoteNo];
  await saveAllQuotes(map);
}
async function loadRemoteSettings() {
  if (!hasSupabaseConfig()) return null;
  const rows = await supabaseFetch(`/rest/v1/${SUPABASE_SETTINGS_TABLE}?select=value&key=eq.${encodeURIComponent(SETTINGS_ROW_ID)}&limit=1`);
  return rows?.[0]?.value || null;
}
async function saveRemoteSettings(settings) {
  if (!hasSupabaseConfig()) return;
  await supabaseFetch(`/rest/v1/${SUPABASE_SETTINGS_TABLE}?on_conflict=key`, {
    method: "POST",
    body: JSON.stringify({ key: SETTINGS_ROW_ID, value: settings, updated_at: new Date().toISOString() }),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}
function mergeSettingsWithDefaults(value) {
  const saved = value || {};
  return {
    ...DEFAULT_SETTINGS, ...saved,
    stitchingTypes: Array.isArray(saved.stitchingTypes) && saved.stitchingTypes.length ? saved.stitchingTypes : DEFAULT_SETTINGS.stitchingTypes,
    linings: Array.isArray(saved.linings) && saved.linings.length ? saved.linings : DEFAULT_SETTINGS.linings,
    tracks: Array.isArray(saved.tracks) && saved.tracks.length ? saved.tracks : DEFAULT_SETTINGS.tracks,
    // ── NEW: preserve saved gstCategories or fall back to defaults
    gstCategories: Array.isArray(saved.gstCategories) && saved.gstCategories.length ? saved.gstCategories : DEFAULT_SETTINGS.gstCategories,
  };
}

/* =========================
   Global Fabric Processing Store
   ========================= */
function loadGlobalFabricProcessing() {
  try { return JSON.parse(localStorage.getItem(LS_FABRIC_PROCESSING_KEY) || '[]'); } catch { return []; }
}
function saveGlobalFabricProcessing(items) {
  localStorage.setItem(LS_FABRIC_PROCESSING_KEY, JSON.stringify(items));
}
async function loadRemoteFabricProcessing() {
  if (!hasSupabaseConfig()) return null;
  const rows = await supabaseFetch(
    `/rest/v1/${SUPABASE_APP_STATE_TABLE}?select=value&key=eq.${encodeURIComponent(LS_FABRIC_PROCESSING_KEY)}&limit=1`
  );
  return Array.isArray(rows?.[0]?.value) ? rows[0].value : null;
}
async function saveRemoteFabricProcessing(items) {
  if (!hasSupabaseConfig()) return null;
  const payload = {
    key: LS_FABRIC_PROCESSING_KEY,
    value: Array.isArray(items) ? items : [],
    updated_at: new Date().toISOString(),
  };
  const result = await supabaseFetch(`/rest/v1/${SUPABASE_APP_STATE_TABLE}?on_conflict=key`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return result;
}

function loadPaymentsStore() {
  try { return JSON.parse(localStorage.getItem(LS_PAYMENTS_KEY) || '{}'); } catch { return {}; }
}
function savePaymentsStore(value) {
  localStorage.setItem(LS_PAYMENTS_KEY, JSON.stringify(value || {}));
}
async function loadRemotePaymentsStore() {
  if (!hasSupabaseConfig()) return null;
  const rows = await supabaseFetch(
    `/rest/v1/${SUPABASE_APP_STATE_TABLE}?select=value&key=eq.${encodeURIComponent(LS_PAYMENTS_KEY)}&limit=1`
  );
  return rows?.[0]?.value || null;
}
async function saveRemotePaymentsStore(value) {
  if (!hasSupabaseConfig()) return null;
  const payload = { key: LS_PAYMENTS_KEY, value: value || {}, updated_at: new Date().toISOString() };
  return await supabaseFetch(`/rest/v1/${SUPABASE_APP_STATE_TABLE}?on_conflict=key`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
}

function getQuoteCustomerName(quote) {
  return String(
    quote?.customer?.name || quote?.customerName || quote?.quoteMeta?.customerName ||
    quote?.meta?.customerName || quote?.snapshot?.customerName || "Walk-in Customer"
  ).trim() || "Walk-in Customer";
}
function getQuoteFinalTotal(quote) {
  return Number(
    quote?.snapshot?.summary?.finalTotal || quote?.summary?.finalTotal ||
    quote?.all?.summary?.finalTotal || quote?.totals?.summary?.finalTotal ||
    quote?.finalTotal || quote?.total || 0
  );
}

/* =========================
   SETTINGS  (gstCategories added)
   ========================= */
const SETTINGS_KEY = "themes_pricing_settings_v1";
const DEFAULT_SETTINGS = {
  trackRatePerFt: 250,
  installationRatePerTrackFt: 400,
  stitchingTypes: [
    { id: "american", label: "American Pleat", ratePerPanel: 200 },
    { id: "eyelet", label: "Eyelet", ratePerPanel: 250 },
  ],
  linings: [
    { id: "none", label: "None", ratePerMeter: 0 },
    { id: "satin", label: "Satin", ratePerMeter: 100 },
    { id: "dimout", label: "Dimout", ratePerMeter: 250 },
    { id: "blackout", label: "Blackout", ratePerMeter: 300 },
  ],
  tracks: [
    { id: "std", label: "Standard Track", ratePerFt: 250 },
    { id: "heavy", label: "Heavy-Duty Track", ratePerFt: 350 },
    { id: "decor", label: "Decorative Track", ratePerFt: 450 },
  ],
  // ── NEW: per-category GST rates ──
  gstCategories: [
    { id: "fabric", label: "Fabric / Curtain", rate: 5 },
    { id: "wallpaper", label: "Wallpaper", rate: 18 },
    { id: "blind", label: "Blinds / Shades", rate: 12 },
    { id: "carpet", label: "Carpet / Flooring", rate: 12 },
    { id: "other", label: "Other / Miscellaneous", rate: 18 },
  ],
};

const UNIT_OPTIONS = [
  { id: "m", label: "Meters" },
  { id: "sqft", label: "Sq Ft" },
  { id: "nos", label: "Nos" },
  { id: "rolls", label: "Rolls" },
];

function getUnitLabel(unit) {
  return UNIT_OPTIONS.find(u => u.id === unit)?.label || unit || "Nos";
}

function getUnitShortLabel(unit) {
  if (unit === "m") return "m";
  if (unit === "sqft") return "sq ft";
  if (unit === "nos") return "nos";
  if (unit === "rolls") return "rolls";
  if (unit === "panels") return "panels";
  if (unit === "ft") return "ft";
  if (unit === "pcs") return "pcs";
  return unit || "nos";
}


function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      ...DEFAULT_SETTINGS, ...saved,
      stitchingTypes: Array.isArray(saved.stitchingTypes) && saved.stitchingTypes.length ? saved.stitchingTypes : DEFAULT_SETTINGS.stitchingTypes,
      linings: Array.isArray(saved.linings) && saved.linings.length ? saved.linings : DEFAULT_SETTINGS.linings,
      tracks: Array.isArray(saved.tracks) && saved.tracks.length ? saved.tracks : DEFAULT_SETTINGS.tracks,
      gstCategories: Array.isArray(saved.gstCategories) && saved.gstCategories.length ? saved.gstCategories : DEFAULT_SETTINGS.gstCategories,
    };
  } catch { return DEFAULT_SETTINGS; }
}

/* =========================
   Fabric entry factory  (gstCategory added)
   ========================= */
const BlankFabric = (settings = DEFAULT_SETTINGS, label = "Main", overrides = {}) => ({
  id: crypto.randomUUID(),
  label,
  lengthInch: "",
  lengthUnit: "in",
  widthInch: "",
  widthUnit: "in",
  panels: "",
  repeat: "no",
  repeatCm: "",
  materialName: "",
  materialPrice: "",
  clothMeters: "",
  isRomanBlind: false,
  romanBlindSqFt: "",
  blindType: "",
  blindSqFt: "",
  isWallpaper: false,
  wallpaperRollQty: "",
  wallpaperRollPrice: "",
  stitching: settings.stitchingTypes[0],
  lining: settings.linings[0],
  track: (settings.tracks && settings.tracks[0]) || { id: "std", label: "Standard Track", ratePerFt: settings.trackRatePerFt || 250 },
  // ── NEW: default GST category
  gstCategory: (settings.gstCategories && settings.gstCategories[0]) || DEFAULT_SETTINGS.gstCategories[0],
  ...overrides,
});

/* =========================
   PDF Helpers
   ========================= */
async function imageToDataURL(url) {
  if (!url) return null;
  url = googleDrivePdfUrl(url);
  if (url.startsWith('data:image')) return url;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    await new Promise((resolve, reject) => {
      img.onload = resolve; img.onerror = reject;
      img.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch { }
  try {
    const blob = await fetch(url, { mode: 'cors', cache: 'no-store' }).then(r => r.blob());
    return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  } catch { return null; }
}
async function fileToDataURL(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
}
const pdfColor = (hex) => { const n = hex.replace("#", ""); return [parseInt(n.slice(0,2),16), parseInt(n.slice(2,4),16), parseInt(n.slice(4,6),16)]; };

/* =========================
   Brand
   ========================= */
const BRAND = {
  primary: "#B70766", primaryDark: "#2E2E2E", accent: "#007E7C",
  header: "#F5EBDD", grid: "#E8E0D8", text: "#2B2A29", muted: "#6B6B6B", border: "#D6CFC9",
  logoUrl: normalizeImageUrl(DEFAULT_LOGO_URL),
  companyName: "Themes Furnishings & Decor",
  pdfCompanyName: "Themes Furnishings & Decor",
  website: "[www.themesfurnishings.com](https://www.themesfurnishings.com)",
  phone: "+91 9890299404",
  email: "themesfurnishings@hotmail.com",
  address: "141 MG Road, Pune 411040",
  gstin: "GSTIN: 27AAACT1234F1Z5",
  paymentQrUrl: normalizeImageUrl(DEFAULT_PAYMENT_QR_URL),
  paymentUpiId: DEFAULT_PAYMENT_UPI_ID,
};

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  :root {
    --primary: ${BRAND.primary}; --primary-dark: ${BRAND.primaryDark}; --accent: ${BRAND.accent};
    --bg: ${BRAND.header}; --border: ${BRAND.border}; --text: ${BRAND.text};
    --muted: ${BRAND.muted}; --shadow: rgba(0,0,0,0.08); --radius: 10px; --radius-sm: 8px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F7F8FA; color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; }
  .app-container { padding: 16px; }
  .app-inner { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .box { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 1px 3px var(--shadow); overflow: hidden; }
  .box-header { background: linear-gradient(90deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 12px 16px; font-weight: 700; font-size: 14px; }
  .box-body { padding: 16px; }
  .hero-box { background: white; border: 1px solid var(--border); padding: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px var(--shadow); border-radius: var(--radius); flex-wrap: wrap; gap: 12px; }
  .hero-brand { display: flex; gap: 12px; align-items: center; }
  .hero-logo { height: 42px; border-radius: 6px; }
  .hero-title { font-size: 18px; font-weight: 800; margin: 0; }
  .hero-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .tabs-box { display: flex; background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .tab { flex: 1; padding: 10px; text-align: center; font-weight: 700; font-size: 13px; color: var(--muted); cursor: pointer; border: none; background: none; }
  .tab:hover { background: #F3F4F6; }
  .tab-active { background: var(--primary); color: white; }
  .grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
  @media (max-width: 640px) { .grid-3, .grid-2 { grid-template-columns: 1fr; } .hero-actions { justify-content: center; } }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: 12px; font-weight: 700; color: var(--muted); }
  .field-hint { font-size: 10px; color: var(--muted); }
  .field-group { display: flex; flex-direction: column; gap: 4px; }
  .input, .select, .input-xs, .select-xs { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; font-size: 13px; background: white; outline: none; }
  .select { -webkit-appearance: menulist; appearance: auto; }
  .input:focus, .select:focus { border-color: var(--primary); }
  .unit-input { position: relative; }
  .unit-input__field { padding-right: 56px !important; width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; font-size: 13px; background: white; outline: none; }
  .unit-input__field:focus { border-color: var(--primary); }
  .unit-input__suffix { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: 700; color: white; background: var(--primary); padding: 1px 6px; border-radius: 4px; }
  .room-box { margin-bottom: 0; }
  .room-header { display: flex; align-items: center; padding: 8px 12px; background: #FBFBFC; border-bottom: 1px solid var(--border); gap: 8px; }
  .room-title-input { font-size: 15px; font-weight: 800; border: none; background: transparent; outline: none; flex: 1; }
  .room-actions { display: flex; gap: 4px; }
  .room-dims-grid { display: grid; grid-template-columns: repeat(3, minmax(180px,1fr)); gap: 12px; padding: 12px 12px 0; }
  @media (max-width: 640px) { .room-dims-grid { grid-template-columns: 1fr; } }
  .fabrics-section { padding: 12px; }
  .fabrics-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .fabrics-section-title { font-size: 12px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
  .fabric-row { background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 8px; }
  .fabric-row-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .fabric-label-badge { background: var(--primary); color: white; font-size: 11px; font-weight: 800; padding: 2px 10px; border-radius: 999px; letter-spacing: .3px; }
  .fabric-row-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  @media (max-width: 700px) { .fabric-row-grid { grid-template-columns: repeat(2,1fr); } }
  .fabric-cost-pill { font-size: 12px; font-weight: 800; color: var(--primary); margin-left: auto; }
  .btn-remove-fabric { padding: 3px 7px; font-size: 11px; font-weight: 800; border: 1px solid #fca5a5; color: #ef4444; background: white; border-radius: 6px; cursor: pointer; }
  .btn-remove-fabric:hover { background: #ef4444; color: white; }
  .stat-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; padding: 0 12px 12px; }
  @media (max-width: 640px) { .stat-grid { grid-template-columns: repeat(2,1fr); } }
  .stat { background: #F3F5F9; padding: 8px; border-radius: var(--radius-sm); text-align: center; border: 1px solid #EDF0F5; }
  .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 800; letter-spacing: .4px; }
  .stat-value { font-size: 13px; font-weight: 800; color: var(--primary); }
  .room-footer { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FBFBFC; border-top: 1px solid var(--border); }
  .pills { display: flex; gap: 6px; flex-wrap: wrap; }
  .pill { background: #E9EEF7; color: var(--text); font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 700; border: 1px solid #DDE6F4; }
  .total-group { display: flex; align-items: center; gap: 8px; }
  .total-amount { font-size: 18px; font-weight: 800; color: var(--primary); }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 13px; font-weight: 800; border-radius: var(--radius-sm); cursor: pointer; border: none; transition: all 0.2s; }
  .btn-primary { background: var(--primary); color: white; border: 1px solid var(--primary); }
  .btn-primary:hover { opacity: .9; }
  .btn-outline { border: 1px solid var(--primary); color: var(--primary); background: white; }
  .btn-outline:hover { background: var(--primary); color: white; }
  .btn-danger { border: 1px solid #fca5a5; color: #ef4444; background: white; }
  .btn-danger:hover { background: #ef4444; color: white; border-color: #ef4444; }
  .btn-icon { padding: 6px; background: #EEF2FF; border-radius: 8px; border: 1px solid #E0E7FF; color: var(--primary); }
  .btn-icon:hover { background: var(--primary); color: white; }
  .btn-sm { padding: 6px 10px; font-size: 12px; }
  .btn:disabled { opacity: .4; cursor: not-allowed; pointer-events: none; }
  .summary-inner { display: flex; flex-direction: column; gap: 12px; }
  .summary-list { display: flex; flex-direction: column; gap: 6px; }
  .summary-item { display: flex; justify-content: space-between; padding: 10px 12px; background: #FBFBFC; border-radius: var(--radius-sm); font-size: 13px; border: 1px solid #EFF1F4; }
  .summary-name { font-weight: 700; }
  .summary-total { font-weight: 800; color: var(--primary); }
  .commercial-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .commercial-card { padding: 12px; border-radius: var(--radius-sm); background: #FBFBFC; border: 1px solid var(--border); }
  .commercial-title { font-weight: 800; font-size: 13px; margin-bottom: 6px; }
  .commercial-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .commercial-amount { font-weight: 800; font-size: 13px; }
  .commercial-note { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .grand-total-box { background: #FBFBFC; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  .final-row { display: flex; justify-content: space-between; align-items: center; }
  .final-label { font-size: 15px; font-weight: 800; }
  .final-amount { font-size: 22px; font-weight: 900; color: var(--primary); }
  .save-bottom-bar { background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
  .save-bottom-label { font-size: 13px; color: var(--muted); font-weight: 700; }
  .empty-box { text-align: center; padding: 24px; color: var(--muted); font-size: 13px; background: #FBFBFC; border: 2px dashed var(--border); border-radius: var(--radius-sm); }
  .text-danger { color: #ef4444; }
  .add-room-between { display: flex; align-items: center; justify-content: center; padding: 8px 0; gap: 8px; }
  .add-room-between::before, .add-room-between::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .history-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  .history-search { flex: 1; min-width: 200px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 12px; font-size: 13px; background: white; outline: none; }
  .history-search:focus { border-color: var(--primary); }
  .history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .history-table th { text-align: left; padding: 9px 12px; background: var(--bg); border-bottom: 2px solid var(--border); font-weight: 800; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .history-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .history-table tr:last-child td { border-bottom: none; }
  .history-table tr:hover td { background: #FAFBFF; }
  .history-row-no { font-weight: 800; color: var(--primary); font-size: 12px; }
  .history-row-customer { font-weight: 700; }
  .history-row-date { color: var(--muted); font-size: 12px; }
  .history-row-total { font-weight: 800; color: var(--primary-dark); }
  .history-row-actions { display: flex; gap: 6px; }
  .loaded-banner { background: #d1fae5; border: 1px solid #6ee7b7; color: #065f46; border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .current-quote-badge { display: inline-flex; align-items: center; gap: 6px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 800; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; border: 1px solid; }
  .order-report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .order-report-table th { text-align: left; padding: 9px 12px; background: #FFF5FA; border-bottom: 2px solid var(--border); font-weight: 800; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .order-report-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .order-report-table tr:last-child td { border-bottom: none; }
  .order-report-table tr:hover td { background: #FFF9F2; }
  .dash-kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
  @media (max-width: 640px) { .dash-kpi-grid { grid-template-columns: repeat(2,1fr); } }
  .dash-kpi { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; text-align: center; }
  .dash-kpi-label { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
  .dash-kpi-value { font-size: 22px; font-weight: 900; color: var(--primary); }
  .dash-kpi-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .dash-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .dash-charts-grid { grid-template-columns: 1fr; } }
  .dash-chart-card { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
  .dash-chart-title { font-size: 13px; font-weight: 800; color: var(--primary-dark); margin-bottom: 12px; }
  html, body, #root { width: 100%; min-height: 100%; overflow-x: hidden; }
  .app-container { background: linear-gradient(180deg, #FAFAFB 0%, #F3F4F6 100%); width: 100%; max-width: 100vw; }
  .app-inner { width: 100%; max-width: 1080px; }
  .box, .hero-box, .tabs-box { max-width: 100%; border-color: #E7E2DC; box-shadow: 0 8px 24px rgba(46,46,46,0.06); }
  .box { background: #FFFFFF; }
  .box-header { background: #FFFFFF; color: var(--primary-dark); border-bottom: 1px solid #EFE9E2; padding: 14px 16px; }
  .box-header h3 { font-size: 14px; letter-spacing: 0.01em; display: flex; align-items: center; gap: 8px; }
  .box-header h3::before { content: ''; width: 4px; height: 18px; border-radius: 999px; background: var(--primary); display: inline-block; }
  .box-body { background: #FFFFFF; }
  .hero-box { background: linear-gradient(135deg,#FFFFFF 0%,#FFF9F2 100%); border: 1px solid #EFE3D8; }
  .hero-title { color: var(--primary-dark); }
  .tabs-box { padding: 5px; gap: 5px; background: #FFFFFF; border-radius: 14px; }
  .tab { border-radius: 10px; flex: 1 0 auto; }
  .tab-active { box-shadow: 0 6px 16px rgba(183,7,102,0.22); }
  .room-box { border-radius: 14px; border-color: #E8E1DA; overflow: hidden; }
  .room-header { background: #FFFFFF; padding: 12px 14px; }
  .room-title-input { color: var(--primary-dark); }
  .fabrics-section { background: #FBFAF8; padding: 14px; border-top: 1px solid #EFE7E0; }
  .fabrics-section-header { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; margin-bottom: 14px; padding: 0 0 12px; border-bottom: 1px solid #EFE7E0; }
  .fabrics-section-title { color: var(--primary-dark); font-size: 12px; font-weight: 900; letter-spacing: 0.06em; }
  .fabrics-section-header .btn { border-radius: 999px; padding: 7px 12px; white-space: nowrap; }
  .fabric-row { padding: 0; margin-bottom: 12px; overflow: hidden; border-radius: 14px; background: #FFFFFF; border: 1px solid #E7E0D8; box-shadow: 0 4px 14px rgba(46,46,46,0.045); }
  .fabric-row:last-child { margin-bottom: 0; }
  .fabric-row-header { display: grid; grid-template-columns: auto minmax(160px,220px) 1fr auto auto; align-items: center; gap: 10px; margin-bottom: 0; padding: 12px 14px; background: linear-gradient(90deg,#FFF8FC 0%,#FFFFFF 100%); border-bottom: 1px solid #EFE7E0; }
  .fabric-label-badge { min-width: 64px; text-align: center; border-radius: 999px; padding: 4px 10px; background: rgba(183,7,102,0.10); color: var(--primary); border: 1px solid rgba(183,7,102,0.18); }
  .fabric-row-header > .input { margin-left: 0 !important; max-width: none !important; height: 34px; }
  .fabric-cost-pill { justify-self: end; margin-left: 0; white-space: nowrap; font-size: 12px; background: #FFF5FA; border: 1px solid rgba(183,7,102,0.14); border-radius: 999px; padding: 5px 10px; }
  .btn-remove-fabric { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border-radius: 999px; font-size: 16px; line-height: 1; }
  .fabric-row-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; padding: 14px; }
  .fabric-row-grid .field { min-width: 0; background: #FBFAF8; border: 1px solid #EFE7E0; border-radius: 12px; padding: 10px; }
  .room-dims-grid { padding: 14px; background: #FFFFFF; border-top: 1px solid #EFE7E0; }
  .room-dims-grid .field { max-width: 280px; }
  .stat-grid { background: #FFFFFF; padding-top: 12px; }
  .room-footer { gap: 12px; }
  .history-table th { background: #FBFAF8; }
  .history-table tr:hover td { background: #FFF9F2; }
  .save-bottom-bar { border-color: #E8E1DA; box-shadow: 0 8px 24px rgba(46,46,46,0.05); }
  .input, .select, .unit-input, .unit-input__field { width: 100%; min-width: 0; }
  @media (max-width: 980px) { .fabric-row-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
  @media (max-width: 760px) {
    .app-container { padding: 10px; }
    .hero-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .hero-actions .btn { width: 100%; justify-content: center; }
    .fabric-row-header { grid-template-columns: auto 1fr auto; }
    .fabric-row-header > .input { grid-column: 1 / -1; order: 4; }
    .fabric-row-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .room-dims-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .room-dims-grid .field { max-width: none; }
    .dash-charts-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .app-container { padding: 8px; }
    .box-body, .fabrics-section, .room-dims-grid { padding: 10px; }
    .hero-actions { grid-template-columns: 1fr; }
    .fabric-row-header { grid-template-columns: 1fr auto; gap: 8px; }
    .fabric-row-grid, .room-dims-grid, .grid-3, .grid-2, .commercial-grid { grid-template-columns: 1fr; }
    .stat-grid { grid-template-columns: 1fr; }
    .room-footer { align-items: stretch; flex-direction: column; }
    .total-group { width: 100%; justify-content: space-between; }
    .btn { width: 100%; justify-content: center; }
    .room-actions .btn-icon, .btn-icon { width: auto; }
    .dash-kpi-grid { grid-template-columns: repeat(2,1fr); }
  }
  /* GST breakdown styles */
  .gst-breakdown-row { display: flex; justify-content: space-between; padding: 8px 12px; background: #F0FDF4; border-radius: var(--radius-sm); font-size: 12px; border: 1px solid #BBF7D0; }
  .gst-breakdown-label { font-weight: 700; color: #065F46; }
  .gst-breakdown-value { font-weight: 800; color: #059669; }
  .gst-category-badge { display: inline-block; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 800; }
  /* Order Processing */
  .op-banner { display: flex; align-items: center; gap: 12px; background: linear-gradient(90deg,#ECFDF5,#F0FFF4); border: 1px solid #6EE7B7; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; }
  .op-banner-icon { font-size: 28px; }
  .op-banner-text { flex: 1; }
  .op-banner-title { font-size: 15px; font-weight: 900; color: #065F46; }
  .op-banner-sub { font-size: 12px; color: #047857; margin-top: 2px; }
  .op-financials { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-bottom: 20px; }
  @media (max-width: 640px) { .op-financials { grid-template-columns: 1fr; } }
  .op-fin-card { border-radius: 14px; padding: 16px; border: 1px solid; text-align: center; }
  .op-fin-card.quote { background: #FFF5FA; border-color: rgba(229,9,127,0.18); }
  .op-fin-card.advance { background: #F0FDF4; border-color: #BBF7D0; }
  .op-fin-card.balance { background: #FFF7ED; border-color: #FED7AA; }
  .op-fin-card.balance.settled { background: #ECFDF5; border-color: #6EE7B7; }
  .op-fin-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .op-fin-card.quote .op-fin-label { color: var(--primary); }
  .op-fin-card.advance .op-fin-label { color: #059669; }
  .op-fin-card.balance .op-fin-label { color: #D97706; }
  .op-fin-card.balance.settled .op-fin-label { color: #065F46; }
  .op-fin-value { font-size: 22px; font-weight: 900; }
  .op-fin-card.quote .op-fin-value { color: var(--primary); }
  .op-fin-card.advance .op-fin-value { color: #059669; }
  .op-fin-card.balance .op-fin-value { color: #D97706; }
  .op-fin-card.balance.settled .op-fin-value { color: #065F46; }
  .op-fin-sub { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .op-advance-input { border: 1.5px solid #BBF7D0; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 700; width: 160px; outline: none; background: white; }
  .op-advance-input:focus { border-color: #059669; }
  .op-order-items { display: flex; flex-direction: column; gap: 12px; }
  .op-item-card { background: #FAFAFA; border: 1px solid #EFE7E0; border-radius: 14px; overflow: hidden; }
  .op-item-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: linear-gradient(90deg,#FFF8FC,#FFFFFF); border-bottom: 1px solid #EFE7E0; }
  .op-item-badge { background: rgba(183,7,102,0.10); color: var(--primary); border: 1px solid rgba(183,7,102,0.18); border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 800; }
  .op-item-room { font-size: 12px; color: var(--muted); font-weight: 700; }
  .op-item-cost { margin-left: auto; font-size: 13px; font-weight: 900; color: var(--primary); background: #FFF5FA; border: 1px solid rgba(229,9,127,0.14); border-radius: 999px; padding: 4px 12px; }
  .op-item-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; padding: 14px; }
  @media (max-width: 700px) { .op-item-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
  @media (max-width: 420px) { .op-item-grid { grid-template-columns: 1fr; } }
  .op-item-grid .field { background: white; border: 1px solid #EFE7E0; border-radius: 10px; padding: 10px; }
  .op-item-notes { padding: 0 14px 14px; }
  .op-item-notes .input { background: white; }
  .op-summary-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .op-summary-table th { text-align: left; padding: 9px 12px; background: #FFF5FA; border-bottom: 2px solid var(--border); font-weight: 800; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .op-summary-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .op-summary-table tr:last-child td { border-bottom: none; }
  .op-summary-table tr:hover td { background: #FFF9F2; }
  .op-not-approved { text-align: center; padding: 40px 24px; }
  .op-not-approved-icon { font-size: 48px; margin-bottom: 12px; }
  .op-not-approved-title { font-size: 18px; font-weight: 800; color: var(--primary-dark); margin-bottom: 8px; }
  .op-not-approved-sub { font-size: 13px; color: var(--muted); max-width: 380px; margin: 0 auto; line-height: 1.6; }
  .op-progress-bar-bg { height: 10px; background: #F3F4F6; border-radius: 999px; overflow: hidden; margin-top: 8px; }
  .op-progress-bar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
  /* Fabric Processing */
  .fp-kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; }
  @media (max-width: 640px) { .fp-kpi-grid { grid-template-columns: repeat(2,1fr); } }
  .fp-kpi { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; text-align: center; }
  .fp-kpi-label { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
  .fp-progress-card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .fp-progress-row { display: flex; flex-direction: column; gap: 4px; }
  .fp-progress-meta { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--muted); }
  .fp-progress-bar-bg { height: 8px; background: #F3F4F6; border-radius: 999px; overflow: hidden; }
  .fp-progress-bar-fill { height: 100%; border-radius: 999px; transition: width 0.35s ease; }
  .fp-bulk-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .fp-checklist-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 980px; }
  .fp-checklist-table th { text-align: left; padding: 9px 12px; background: #FFF5FA; border-bottom: 2px solid var(--border); font-weight: 800; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
  .fp-checklist-table th.center { text-align: center; }
  .fp-checklist-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; transition: background 0.2s; }
  .fp-checklist-table tr:last-child td { border-bottom: none; }
  .fp-legend { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
  .fp-legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .fp-legend-swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; border: 1px solid; }
  .process-order-cta { background: linear-gradient(135deg, #ECFDF5, #D1FAE5); border: 2px solid #6EE7B7; border-radius: 14px; padding: 20px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .process-order-cta-text { flex: 1; }
  .process-order-cta-title { font-size: 15px; font-weight: 900; color: #065F46; margin-bottom: 4px; }
  .process-order-cta-sub { font-size: 12px; color: #047857; }
  .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: linear-gradient(135deg, #F5EBDD 0%, #FFFFFF 48%, #FFF5FA 100%); }
  .auth-card { width: 100%; max-width: 420px; background: white; border: 1px solid #EFE3D8; border-radius: 18px; box-shadow: 0 18px 50px rgba(46,46,46,0.10); padding: 26px; }
  .auth-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .auth-logo { height: 44px; border-radius: 8px; }
  .auth-title { font-size: 20px; font-weight: 900; color: var(--primary-dark); }
  .auth-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .auth-form { display: flex; flex-direction: column; gap: 12px; }
  .auth-error { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; border-radius: 10px; padding: 10px 12px; font-size: 12px; font-weight: 800; }
  .user-pill { display: inline-flex; align-items: center; gap: 8px; background: #FBFAF8; border: 1px solid #EFE3D8; color: var(--primary-dark); border-radius: 999px; padding: 7px 12px; font-size: 12px; font-weight: 900; }
  .user-role { color: var(--primary); text-transform: capitalize; }

  /* =========================
     UI Refresh: cleaner long quote layout
     ========================= */
  :root {
    --primary: #B70766;
    --primary-dark: #2E2E2E;
    --accent: #007E7C;
    --cream: #F5EBDD;
    --surface: #FFFFFF;
    --surface-soft: #FFFCF8;
    --surface-muted: #F8F5F1;
    --line: #E9DED4;
    --line-soft: #F3ECE5;
    --text-soft: #5F5B57;
    --shadow-soft: 0 10px 30px rgba(46,46,46,0.06);
    --shadow-card: 0 8px 22px rgba(46,46,46,0.055);
  }

  body {
    background: #F6F3EF;
  }

  .app-container {
    background:
      radial-gradient(circle at top left, rgba(183,7,102,0.08), transparent 30%),
      linear-gradient(180deg, #FBF8F4 0%, #F4F1EC 100%);
    padding: 22px 16px 36px;
  }

  .app-inner {
    max-width: 1180px;
    gap: 18px;
  }

  .hero-box {
    position: sticky;
    top: 12px;
    z-index: 30;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(233,222,212,0.9);
    box-shadow: 0 14px 38px rgba(46,46,46,0.08);
    border-radius: 18px;
    padding: 14px 18px;
  }

  .hero-logo {
    height: 48px;
    width: 48px;
    object-fit: contain;
    background: white;
    border: 1px solid var(--line-soft);
    box-shadow: 0 4px 12px rgba(46,46,46,0.05);
  }

  .hero-title {
    font-size: 19px;
    letter-spacing: -0.02em;
  }

  .hero-subtitle {
    color: var(--text-soft);
    line-height: 1.4;
  }

  .tabs-box {
    position: sticky;
    top: 92px;
    z-index: 25;
    background: rgba(255,255,255,0.88);
    backdrop-filter: blur(14px);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 6px;
    gap: 6px;
    box-shadow: var(--shadow-soft);
    overflow-x: auto;
  }

  .tab {
    border-radius: 12px;
    padding: 11px 14px;
    min-width: max-content;
    color: #59544F;
    font-weight: 850;
  }

  .tab-active {
    background: linear-gradient(135deg, var(--primary), #8E054F);
    color: white;
    box-shadow: 0 8px 18px rgba(183,7,102,0.22);
  }

  .box {
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: var(--shadow-card);
    background: var(--surface);
    overflow: hidden;
  }

  .box + .box {
    margin-top: 2px;
  }

  .box-header {
    background: linear-gradient(90deg, #FFFFFF 0%, #FFF8FC 100%);
    border-bottom: 1px solid var(--line-soft);
    padding: 15px 18px;
  }

  .box-header h3 {
    font-size: 14px;
    color: var(--primary-dark);
    letter-spacing: 0.01em;
  }

  .box-header h3::before {
    width: 5px;
    height: 20px;
    background: linear-gradient(180deg, var(--primary), var(--accent));
  }

  .box-body {
    padding: 18px;
  }

  .grid-3,
  .grid-2,
  .commercial-grid {
    gap: 14px;
  }

  .field {
    gap: 6px;
  }

  .field-label {
    font-size: 11px;
    color: #6C625D;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .field-hint {
    color: #8A8179;
  }

  .input,
  .select,
  .input-xs,
  .select-xs,
  .unit-input__field {
    min-height: 38px;
    border: 1px solid #E5DCD3;
    border-radius: 11px;
    background: #FFFFFF;
    color: var(--primary-dark);
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }

  .input:hover,
  .select:hover,
  .unit-input__field:hover {
    border-color: #D7C7BB;
  }

  .input:focus,
  .select:focus,
  .unit-input__field:focus {
    border-color: rgba(183,7,102,0.55);
    box-shadow: 0 0 0 4px rgba(183,7,102,0.08);
  }

  .unit-input__suffix {
    background: rgba(183,7,102,0.10);
    color: var(--primary);
    border: 1px solid rgba(183,7,102,0.16);
    border-radius: 999px;
    padding: 2px 7px;
  }

  .btn {
    border-radius: 12px;
    min-height: 38px;
    box-shadow: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--primary), #910450);
    border-color: var(--primary);
  }

  .btn-outline {
    border-color: rgba(183,7,102,0.30);
    background: #FFFFFF;
  }

  .btn-outline:hover {
    background: #FFF5FA;
    color: var(--primary);
    border-color: var(--primary);
  }

  .btn-danger {
    border-color: #F3B8B8;
    background: #FFF8F8;
  }

  .room-box {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .room-box::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    background: linear-gradient(180deg, var(--primary), var(--accent));
  }

  .room-box:nth-of-type(even)::before {
    background: linear-gradient(180deg, var(--accent), var(--primary));
  }

  .room-header {
    background: linear-gradient(90deg, #FFFFFF 0%, #FFF9F2 100%);
    padding: 14px 16px 14px 20px;
    border-bottom: 1px solid var(--line-soft);
  }

  .room-title-input {
    font-size: 16px;
    color: var(--primary-dark);
  }

  .room-dims-grid {
    padding: 16px 18px 4px 22px;
    background: #FFFFFF;
  }

  .fabrics-section {
    margin: 14px 16px 16px 20px;
    padding: 14px;
    border: 1px solid var(--line-soft);
    border-radius: 16px;
    background: #FBF8F4;
  }

  .fabrics-section-header {
    background: transparent;
    border-bottom: 1px dashed #E1D4C8;
    padding-bottom: 12px;
  }

  .fabrics-section-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--primary-dark);
  }

  .fabrics-section-title::before {
    content: '▦';
    color: var(--primary);
    font-size: 13px;
  }

  .fabric-row {
    border-radius: 16px;
    border: 1px solid #E8DDD2;
    background: #FFFFFF;
    box-shadow: 0 6px 18px rgba(46,46,46,0.045);
  }

  .fabric-row + .fabric-row {
    margin-top: 12px;
  }

  .fabric-row-header {
    background: linear-gradient(90deg, #FFF8FC 0%, #FFFFFF 100%);
    padding: 12px 14px;
  }

  .fabric-label-badge {
    background: #FFF0F7;
    color: var(--primary);
    border-color: rgba(183,7,102,0.18);
    font-size: 10px;
    letter-spacing: 0.05em;
  }

  .fabric-cost-pill {
    color: var(--primary);
    background: #FFF5FA;
    border: 1px solid rgba(183,7,102,0.16);
  }

  .fabric-row-grid {
    gap: 12px;
    padding: 14px;
  }

  .fabric-row-grid .field,
  .room-dims-grid .field,
  .op-item-grid .field {
    background: var(--surface-soft);
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    padding: 11px;
  }

  .stat-grid {
    padding: 4px 18px 16px 22px;
    gap: 10px;
  }

  .stat {
    background: #FFFFFF;
    border: 1px solid var(--line-soft);
    border-radius: 14px;
    padding: 10px 8px;
  }

  .stat-label {
    color: #7C736C;
  }

  .stat-value {
    color: var(--primary-dark);
  }

  .room-footer {
    background: #FFFCF8;
    padding: 13px 18px 13px 22px;
  }

  .pill {
    background: #F6EFE8;
    border-color: #E8DCD0;
    color: #514B46;
  }

  .total-amount {
    color: var(--primary);
  }

  .summary-inner {
    gap: 14px;
  }

  .summary-list {
    gap: 8px;
  }

  .summary-item {
    background: #FFFFFF;
    border: 1px solid var(--line-soft);
    border-radius: 13px;
    padding: 11px 14px;
  }

  .summary-name {
    color: var(--primary-dark);
  }

  .summary-total {
    color: var(--primary);
  }

  .commercial-card {
    background: #FFFCF8;
    border: 1px solid var(--line-soft);
    border-radius: 16px;
    padding: 14px;
  }

  .commercial-title {
    color: var(--primary-dark);
    margin-bottom: 9px;
  }

  .commercial-note {
    color: #7C736C;
    line-height: 1.45;
  }

  .gst-breakdown-row {
    background: #F2FBFA;
    border-color: rgba(0,126,124,0.20);
    border-radius: 12px;
  }

  .gst-breakdown-label {
    color: #066B69;
  }

  .gst-breakdown-value {
    color: var(--accent);
  }

  .grand-total-box {
    border-radius: 18px;
    background: linear-gradient(135deg, #FFFFFF 0%, #FFF5FA 100%);
    border: 1px solid rgba(183,7,102,0.16);
    box-shadow: 0 10px 26px rgba(183,7,102,0.07);
  }

  .final-row {
    padding-top: 12px;
    border-top: 1px dashed rgba(183,7,102,0.26);
  }

  .final-label {
    color: var(--primary-dark);
  }

  .final-amount {
    color: var(--primary);
    font-size: 26px;
    letter-spacing: -0.03em;
  }

  .save-bottom-bar {
    position: sticky;
    bottom: 14px;
    z-index: 20;
    border-radius: 18px;
    border: 1px solid rgba(183,7,102,0.16);
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(14px);
    box-shadow: 0 16px 44px rgba(46,46,46,0.12);
  }

  .add-room-between {
    padding: 12px 0;
  }

  .add-room-between::before,
  .add-room-between::after {
    background: linear-gradient(90deg, transparent, #D9CEC4, transparent);
  }

  .history-table,
  .order-report-table,
  .op-summary-table,
  .fp-checklist-table {
    border-collapse: separate;
    border-spacing: 0;
    overflow: hidden;
  }

  .history-table th,
  .order-report-table th,
  .op-summary-table th,
  .fp-checklist-table th {
    background: #FBF4EE;
    color: #685F59;
  }

  .history-table td,
  .order-report-table td,
  .op-summary-table td,
  .fp-checklist-table td {
    background: #FFFFFF;
  }

  .history-table tr:hover td,
  .order-report-table tr:hover td,
  .op-summary-table tr:hover td,
  .fp-checklist-table tr:hover td {
    background: #FFFCF8;
  }

  .loaded-banner,
  .op-banner,
  .process-order-cta {
    border-radius: 16px;
  }

  @media (min-width: 900px) {
    .commercial-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .hero-box,
    .tabs-box,
    .save-bottom-bar {
      position: static;
    }

    .app-container {
      padding: 10px;
    }

    .box-body {
      padding: 14px;
    }

    .fabrics-section {
      margin: 12px 10px 12px 14px;
    }
  }

  /* =========================
     Dense UI polish for long quotes
     ========================= */
  .box {
    background: #FFFFFF;
  }

  .room-box,
  .commercial-card,
  .grand-total-box,
  .save-bottom-bar,
  .history-table,
  .order-report-table,
  .op-summary-table,
  .fp-checklist-table {
    background: #FFFFFF;
  }

  .room-box:nth-of-type(4n + 1) {
    background: linear-gradient(135deg, #FFFFFF 0%, #FFF9F2 100%);
  }

  .room-box:nth-of-type(4n + 2) {
    background: linear-gradient(135deg, #FFFFFF 0%, #F2FBFA 100%);
  }

  .room-box:nth-of-type(4n + 3) {
    background: linear-gradient(135deg, #FFFFFF 0%, #FFF5FA 100%);
  }

  .room-box:nth-of-type(4n + 4) {
    background: linear-gradient(135deg, #FFFFFF 0%, #F8F5F1 100%);
  }

  .room-header {
    background: rgba(255,255,255,0.78);
    backdrop-filter: blur(8px);
  }

  .fabrics-section {
    background: rgba(255,255,255,0.62);
    border: 1px solid rgba(225,212,200,0.95);
  }

  .fabric-row {
    background: rgba(255,255,255,0.92);
  }

  .fabric-row:nth-child(odd) .fabric-row-header {
    background: linear-gradient(90deg, #FFF4FA 0%, #FFFFFF 100%);
  }

  .fabric-row:nth-child(even) .fabric-row-header {
    background: linear-gradient(90deg, #EFFBFA 0%, #FFFFFF 100%);
  }

  .fabric-row-grid .field:nth-child(4n + 1),
  .room-dims-grid .field:nth-child(4n + 1) {
    background: #FFFCF8;
  }

  .fabric-row-grid .field:nth-child(4n + 2),
  .room-dims-grid .field:nth-child(4n + 2) {
    background: #F8FFFE;
  }

  .fabric-row-grid .field:nth-child(4n + 3),
  .room-dims-grid .field:nth-child(4n + 3) {
    background: #FFF8FC;
  }

  .fabric-row-grid .field:nth-child(4n + 4),
  .room-dims-grid .field:nth-child(4n + 4) {
    background: #FBF8F4;
  }

  /* Compact miscellaneous costs: each item stays in one line on desktop */
  .misc-costs-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .misc-cost-row,
  .misc-costs-list > .grid-3 {
    display: grid !important;
    grid-template-columns: minmax(220px, 1.5fr) minmax(120px, 0.7fr) minmax(150px, 0.9fr) minmax(130px, 0.75fr) minmax(130px, 0.75fr) auto;
    align-items: end !important;
    gap: 10px !important;
    padding: 12px;
    border: 1px solid var(--line-soft);
    border-left: 5px solid var(--accent);
    border-radius: 16px;
    background: linear-gradient(135deg, #FFFFFF 0%, #F8FFFE 100%);
    box-shadow: 0 6px 16px rgba(46,46,46,0.04);
  }

  .misc-cost-row:nth-child(odd),
  .misc-costs-list > .grid-3:nth-child(odd) {
    border-left-color: var(--primary);
    background: linear-gradient(135deg, #FFFFFF 0%, #FFF8FC 100%);
  }

  .misc-cost-row .field,
  .misc-costs-list > .grid-3 .field {
    min-width: 0;
    background: transparent !important;
    border: 0 !important;
    padding: 0 !important;
  }

  .misc-cost-row .field-label,
  .misc-costs-list > .grid-3 .field-label {
    font-size: 10px;
    margin-bottom: 2px;
  }

  .misc-cost-row .input,
  .misc-cost-row .select,
  .misc-cost-row .unit-input__field,
  .misc-costs-list > .grid-3 .input,
  .misc-costs-list > .grid-3 .select,
  .misc-costs-list > .grid-3 .unit-input__field {
    min-height: 36px;
    background: #FFFFFF;
  }

  .misc-cost-row .btn-danger,
  .misc-costs-list > .grid-3 .btn-danger {
    min-width: 42px;
    height: 38px;
    padding: 0 12px;
    justify-content: center;
  }

  .misc-total-row,
  .misc-total-box {
    background: linear-gradient(135deg, #FFF8FC 0%, #FFFFFF 100%);
    border: 1px solid rgba(183,7,102,0.14);
    border-radius: 16px;
    padding: 12px 16px;
  }

  .summary-list .summary-item:nth-child(odd) {
    background: #FFFCF8;
  }

  .summary-list .summary-item:nth-child(even) {
    background: #F8FFFE;
  }

  .commercial-card:nth-child(4n + 1) {
    background: #FFF8FC;
  }

  .commercial-card:nth-child(4n + 2) {
    background: #F8FFFE;
  }

  .commercial-card:nth-child(4n + 3) {
    background: #FFFCF8;
  }

  .commercial-card:nth-child(4n + 4) {
    background: #FBF8F4;
  }

  @media (max-width: 1100px) {
    .misc-cost-row,
    .misc-costs-list > .grid-3 {
      grid-template-columns: minmax(220px, 1.4fr) minmax(110px, 0.7fr) minmax(130px, 0.8fr) minmax(120px, 0.7fr) auto;
    }
  }

  @media (max-width: 760px) {
    .misc-cost-row,
    .misc-costs-list > .grid-3 {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 520px) {
    .misc-cost-row,
    .misc-costs-list > .grid-3 {
      grid-template-columns: 1fr;
    }
  }
    /* Miscellaneous Costs: compact single-line desktop layout */
.misc-costs-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
}

.misc-cost-row,
.misc-costs-list > .grid-3 {
  display: grid !important;
  grid-template-columns:
    minmax(260px, 2fr)
    minmax(120px, 0.6fr)
    minmax(170px, 0.9fr)
    minmax(150px, 0.75fr)
    minmax(170px, 0.85fr)
    auto !important;
  gap: 12px !important;
  align-items: end !important;
  padding: 12px 14px !important;
  border: 1px solid #E9DED4 !important;
  border-left: 5px solid var(--primary) !important;
  border-radius: 16px !important;
  background: linear-gradient(135deg, #FFFFFF 0%, #FFF8FC 100%) !important;
  box-shadow: 0 8px 20px rgba(46,46,46,0.045) !important;
}

.misc-cost-row:nth-child(even),
.misc-costs-list > .grid-3:nth-child(even) {
  border-left-color: var(--accent) !important;
  background: linear-gradient(135deg, #FFFFFF 0%, #F2FBFA 100%) !important;
}

.misc-cost-row .field,
.misc-costs-list > .grid-3 .field {
  min-width: 0 !important;
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  gap: 5px !important;
}

.misc-cost-row .field-label,
.misc-costs-list > .grid-3 .field-label {
  font-size: 10px !important;
  line-height: 1.1 !important;
  letter-spacing: 0.08em !important;
  margin: 0 !important;
  white-space: nowrap !important;
}

.misc-cost-row .input,
.misc-cost-row .select,
.misc-cost-row .unit-input__field,
.misc-costs-list > .grid-3 .input,
.misc-costs-list > .grid-3 .select,
.misc-costs-list > .grid-3 .unit-input__field {
  min-height: 38px !important;
  height: 38px !important;
  border-radius: 12px !important;
  background: #FFFFFF !important;
}

.misc-cost-row .btn-danger,
.misc-costs-list > .grid-3 .btn-danger {
  width: 42px !important;
  min-width: 42px !important;
  height: 38px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.misc-cost-row [style*="font-weight: 800"],
.misc-costs-list > .grid-3 [style*="font-weight: 800"] {
  white-space: nowrap !important;
}

@media (max-width: 1250px) {
  .misc-cost-row,
  .misc-costs-list > .grid-3 {
    grid-template-columns:
      minmax(220px, 1.5fr)
      minmax(110px, 0.6fr)
      minmax(140px, 0.8fr)
      minmax(130px, 0.7fr)
      minmax(140px, 0.8fr)
      auto !important;
  }
}

@media (max-width: 980px) {
  .misc-cost-row,
  .misc-costs-list > .grid-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 640px) {
  .misc-cost-row,
  .misc-costs-list > .grid-3 {
    grid-template-columns: 1fr !important;
  }
}
`;

/* =========================
   Utils
   ========================= */
function currency(n) {
  if (Number.isNaN(+n)) return "Rs.0";
  return "Rs." + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);
}
function numberWithCommas(x) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, minimumFractionDigits: 0, useGrouping: true }).format(Math.round(Number(x || 0)));
}
function safeFileNamePart(value, fallback = "Customer") {
  const cleaned = String(value || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-");
  return cleaned || fallback;
}
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ceilDiv = (a, b) => Math.ceil(a / b);

/* =========================
   Cost Engines
   ========================= */
function computeClothMeters(room, fabric = {}) {
  const widthVal = toNum(fabric.widthInch ?? room.widthInch);
  const lengthVal = toNum(fabric.lengthInch ?? room.lengthInch);
  const toInches = (val, unit) => {
    switch (unit || 'in') {
      case 'ft': return val * 12;
      case 'm': return val * 39;
      case 'cm': return val / 2.54;
      default: return val;
    }
  };
  const widthIn = toInches(widthVal, fabric.widthUnit || room.widthUnit || 'in');
  const lengthIn = toInches(lengthVal, fabric.lengthUnit || room.lengthUnit || 'in');
  const isRomanBlind = Boolean(fabric.isRomanBlind || room.isRomanBlind);
  const allowanceIn = isRomanBlind ? 10 : 12;
  const allowanceRep = isRomanBlind ? 10 : 8;
  const computedPanels = isRomanBlind ? ((widthIn || 0) / 50) : ((widthIn || 0) / 20);
  const panels = toNum(fabric.panels) ? toNum(fabric.panels) : computedPanels;
  let adjLen = lengthIn + allowanceIn;
  if ((fabric.repeat || room.repeat) === 'yes') {
    const repeatSizeCm = toNum(fabric.repeatCm ?? room.repeatCm);
    if (repeatSizeCm > 0) {
      const repeatInch = repeatSizeCm / 2.54;
      const v1 = adjLen / repeatInch;
      const decimal = v1 - Math.floor(v1);
      const v2 = Math.floor(v1) * repeatInch;
      let reqinch;
      if (decimal > 0.25) reqinch = Math.ceil(v1) * repeatInch;
      else if (decimal <= 0.25 && v2 >= (lengthIn + allowanceRep)) reqinch = Math.floor(v1) * repeatInch;
      else reqinch = Math.ceil(v1) * repeatInch;
      adjLen = Math.max(adjLen, reqinch);
    }
  }
  const autoMeters = isRomanBlind
    ? ((adjLen * panels) / 39)
    : Math.ceil((adjLen * panels / 39) * 2) / 2;
  let metersOfCloth = autoMeters;
  const override = toNum(fabric.clothMeters);
  if (override > 0 && Number.isFinite(override)) metersOfCloth = override;
  if (!Number.isFinite(metersOfCloth) || metersOfCloth < 0) metersOfCloth = 0;
  return { panels, metersOfCloth, trackFeet: Math.max(1, ceilDiv(widthIn || 0, 12)), widthFeet: (widthIn || 0) / 12 };
}
function computeFabricSquareFeet(room, fabric = {}) {
  const manualSqFt = toNum(fabric.romanBlindSqFt);
  if (manualSqFt > 0 && Number.isFinite(manualSqFt)) return manualSqFt;
  const widthVal = toNum(fabric.widthInch ?? room.widthInch);
  const lengthVal = toNum(fabric.lengthInch ?? room.lengthInch);
  const toInches = (val, unit) => {
    switch (unit || 'in') {
      case 'ft': return val * 12;
      case 'm': return val * 39.3701;
      case 'cm': return val / 2.54;
      default: return val;
    }
  };
  const widthIn = toInches(widthVal, fabric.widthUnit || room.widthUnit || 'in');
  const lengthIn = toInches(lengthVal, fabric.lengthUnit || room.lengthUnit || 'in');
  if (!widthIn || !lengthIn) return 0;
  return (widthIn * lengthIn) / 144;
}
function computeBlindSquareFeet(room, fabric = {}) {
  const manualSqFt = toNum(fabric.blindSqFt);
  if (manualSqFt > 0 && Number.isFinite(manualSqFt)) return manualSqFt;
  const widthVal = toNum(fabric.widthInch ?? room.widthInch);
  const lengthVal = toNum(fabric.lengthInch ?? room.lengthInch);
  const toInches = (val, unit) => {
    switch (unit || 'in') {
      case 'ft': return val * 12;
      case 'm': return val * 39.3701;
      case 'cm': return val / 2.54;
      default: return val;
    }
  };
  const widthIn = toInches(widthVal, fabric.widthUnit || room.widthUnit || 'in');
  const lengthIn = toInches(lengthVal, fabric.lengthUnit || room.lengthUnit || 'in');
  if (!widthIn || !lengthIn) return 0;
  const extraHeight = fabric.blindType === "roller" || fabric.blindType === "zebra" ? 10 : 0;
  const rawSqFt = ((lengthIn + extraHeight) * widthIn) / 144;
  return rawSqFt > 0 ? Math.max(11, rawSqFt) : 0;
}
function computeFabricCost(room, fabric) {
  const { panels, metersOfCloth, trackFeet, widthFeet } = computeClothMeters(room, fabric);
  if (fabric.isWallpaper) {
    const rollQty = toNum(fabric.wallpaperRollQty);
    const rollPrice = toNum(fabric.wallpaperRollPrice);
    return { panels: 0, metersOfCloth: 0, trackFeet: 0, widthFeet: 0, clothCost: rollQty * rollPrice, stitchingCost: 0, liningCost: 0, romanBlindSqFt: 0, blindSqFt: 0, blindRate: 0, blindType: "", isRomanBlind: false, isWallpaper: true, rollQty, rollPrice, stitchingRate: 0 };
  }
  if (fabric.blindType) {
    const blindSqFt = computeBlindSquareFeet(room, fabric);
    const blindRate = toNum(fabric.materialPrice);
    return { panels: 0, metersOfCloth: 0, trackFeet: 0, widthFeet: 0, clothCost: blindSqFt * blindRate, stitchingCost: 0, liningCost: 0, romanBlindSqFt: 0, blindSqFt, blindRate, blindType: fabric.blindType, isRomanBlind: false, isWallpaper: false, rollQty: 0, rollPrice: 0, stitchingRate: 0 };
  }
  const clothCost = metersOfCloth * toNum(fabric.materialPrice);
  const isRomanBlind = Boolean(fabric.isRomanBlind || room.isRomanBlind);
  const romanBlindSqFt = isRomanBlind ? computeFabricSquareFeet(room, fabric) : 0;
  const stitchingRate = fabric.stitching?.ratePerPanel || 0;
  const stitchingCost = isRomanBlind ? romanBlindSqFt * stitchingRate : panels * stitchingRate;
  const liningCost = metersOfCloth * (fabric.lining?.ratePerMeter || 0);
  return { panels, metersOfCloth, trackFeet, widthFeet, clothCost, stitchingCost, liningCost, romanBlindSqFt, isRomanBlind, isWallpaper: false, blindSqFt: 0, blindRate: 0, blindType: "", rollQty: 0, rollPrice: 0, stitchingRate };
}
function computeRoomCost(room, settings) {
  const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];
  let totalClothCost = 0, totalStitchingCost = 0, totalLiningCost = 0, totalMeters = 0, panels = 0, trackFeet = 0, totalTrackCost = 0;
  const fabricBreakdowns = fabrics.map((fab) => {
    const normalizedFab = { ...fab, track: fab.track || room.track || (settings.tracks && settings.tracks[0]) || { id: "std", label: "Standard Track", ratePerFt: settings.trackRatePerFt || 250 } };
    const fc = computeFabricCost(room, normalizedFab);
    const selectedTrackRate = normalizedFab.track?.ratePerFt;
    const trackRate = Number.isFinite(selectedTrackRate) ? selectedTrackRate : (settings?.trackRatePerFt || 0);
    const fabricTrackCost = (fc.isWallpaper || fc.blindType) ? 0 : (fc.isRomanBlind ? (fc.widthFeet || 0) * trackRate : (room.needInstallation ? fc.trackFeet * trackRate : 0));
    totalClothCost += fc.clothCost;
    totalStitchingCost += fc.stitchingCost;
    totalLiningCost += fc.liningCost;
    totalMeters += fc.metersOfCloth;
    totalTrackCost += fabricTrackCost;
    panels += fc.panels;
    trackFeet += fc.trackFeet;
    return { ...normalizedFab, ...fc, trackCost: fabricTrackCost };
  });
  let installationCost = 0, usedInstallQty = 0;
  if (room.needInstallation) {
    const qty = toNum(room.installQtyFt);
    usedInstallQty = qty > 0 ? qty : 1;
    installationCost = usedInstallQty * (settings?.installationRatePerTrackFt || 0);
  }
  const subtotal = totalClothCost + totalStitchingCost + totalLiningCost + totalTrackCost + installationCost;
  return { panels, totalMeters, trackFeet, usedInstallQty, clothCost: totalClothCost, stitchingCost: totalStitchingCost, liningCost: totalLiningCost, trackCost: totalTrackCost, installationCost, subtotal, fabricBreakdowns };
}

/* =========================
   GST Breakdown Helper  ── NEW
   Returns array of { categoryId, label, rate, base, amount }
   covering every fabric in included rooms.
   Fabric's taxable base = clothCost + stitchingCost + liningCost + trackCost
   (i.e. everything attributable to that fabric)
   ========================= */
function computeGstBreakdown(rooms, commercials, settings, miscellaneousCosts = []) {
  if (!commercials?.applyGst) return [];

  const effectiveRooms = rooms.filter(r => r.include !== false);
  const gstCategories = settings?.gstCategories || DEFAULT_SETTINGS.gstCategories;
  const fallbackCategory =
    gstCategories.find(c => c.id === "other") ||
    gstCategories[0] ||
    { id: "other", label: "Other", rate: 18 };

  const fabricCategory = gstCategories.find(c => c.id === "fabric") || fallbackCategory;
  const wallpaperCategory = gstCategories.find(c => c.id === "wallpaper") || fallbackCategory;
  const blindCategory = gstCategories.find(c => c.id === "blind") || fallbackCategory;
  const otherCategory = gstCategories.find(c => c.id === "other") || fallbackCategory;

  const categoryMap = {};

  const addToCategory = (category, taxableBase) => {
    const base = Number(taxableBase || 0);
    if (base <= 0) return;

    const resolvedCategory =
      gstCategories.find(c => c.id === category?.id) ||
      category ||
      fallbackCategory;

    const categoryId = resolvedCategory.id || "other";

    if (!categoryMap[categoryId]) {
      categoryMap[categoryId] = {
        categoryId,
        label: resolvedCategory.label || "Other",
        rate: Number(resolvedCategory.rate || 0),
        base: 0,
        amount: 0,
      };
    }

    categoryMap[categoryId].base += base;
  };

  const roomTotals = effectiveRooms.map(room => ({
    room,
    cost: computeRoomCost(room, settings),
  }));

  const clothTotal = roomTotals.reduce(
    (sum, item) => sum + Number(item.cost.clothCost || 0),
    0
  );

  const { discountType, discountValue } = commercials || {};
  const rawDiscountAmount =
    discountType === "percent"
      ? clothTotal * (Number(discountValue || 0) / 100)
      : Number(discountValue || 0);

  const discountAmount = Math.min(Math.max(0, rawDiscountAmount), clothTotal);

  const fabricDiscountRatio =
    clothTotal > 0
      ? Math.max(0, clothTotal - discountAmount) / clothTotal
      : 1;

  roomTotals.forEach(({ cost }) => {
    cost.fabricBreakdowns.forEach(fb => {
      let category = fb.gstCategory;

      if (!category || !category.id) {
        if (fb.isWallpaper) category = wallpaperCategory;
        else if (fb.blindType) category = blindCategory;
        else category = fabricCategory;
      }

      const discountedClothCost = Number(fb.clothCost || 0) * fabricDiscountRatio;

      addToCategory(category, discountedClothCost);

      const serviceBase =
        Number(fb.stitchingCost || 0) +
        Number(fb.liningCost || 0) +
        Number(fb.trackCost || 0);

      addToCategory(category, serviceBase);
    });

    addToCategory(otherCategory, Number(cost.installationCost || 0));
  });

  (miscellaneousCosts || []).forEach(item => {
    const miscBase = toNum(item.rate) * (toNum(item.quantity) || 1);

    const miscCategory = item.gstCategory?.id
      ? gstCategories.find(c => c.id === item.gstCategory.id) || item.gstCategory
      : otherCategory;

    addToCategory(miscCategory, miscBase);
  });

  return Object.values(categoryMap)
    .map(category => ({
      ...category,
      base: Math.round(category.base),
      amount: Math.round(category.base * (Number(category.rate || 0) / 100)),
    }))
    .filter(category => category.base > 0 || category.amount > 0);
}

function computeAllTotals(rooms, commercials, settings, miscellaneousCosts = []) {
  const effectiveRooms = rooms.filter(r => r.include !== false);
  const roomTotals = effectiveRooms.map(r => ({ room: r, cost: computeRoomCost(r, settings) }));
  const clothTotal = roomTotals.reduce((s, x) => s + x.cost.clothCost, 0);
  const stitchingTotal = roomTotals.reduce((s, x) => s + x.cost.stitchingCost, 0);
  const liningTotal = roomTotals.reduce((s, x) => s + x.cost.liningCost, 0);
  const trackTotal = roomTotals.reduce((s, x) => s + x.cost.trackCost, 0);
  const installTotal = roomTotals.reduce((s, x) => s + x.cost.installationCost, 0);
  const miscTotal = (miscellaneousCosts || []).reduce((sum, item) => sum + toNum(item.rate) * (toNum(item.quantity) || 1), 0);
  const otherTotal = stitchingTotal + liningTotal + trackTotal + installTotal + miscTotal;
  const { discountType, discountValue } = commercials;
  const roundOff = toNum(commercials?.roundOff);
  const discountAmount = discountType === "percent" ? clothTotal * (discountValue / 100) : (discountValue || 0);
  const netFabricTotal = Math.max(0, clothTotal - discountAmount);
  const afterDiscount = netFabricTotal + otherTotal;

  // ── NEW: per-category GST instead of flat GST ──
  let gstAmount = 0;
  let gstBreakdown = [];
  if (commercials?.applyGst) {
    gstBreakdown = computeGstBreakdown(rooms, commercials, settings, miscellaneousCosts);
    gstAmount = gstBreakdown.reduce((s, c) => s + c.amount, 0);
  }

  return {
    roomTotals,
    gstBreakdown,
    summary: {
      clothTotal: Math.round(clothTotal), stitchingTotal: Math.round(stitchingTotal), liningTotal: Math.round(liningTotal),
      trackTotal: Math.round(trackTotal), installTotal: Math.round(installTotal), miscTotal: Math.round(miscTotal),
      otherTotal: Math.round(otherTotal), base: Math.round(clothTotal + otherTotal),
      discountAmount: Math.round(discountAmount), netFabricTotal: Math.round(netFabricTotal),
      afterDiscount: Math.round(afterDiscount), gstAmount: Math.round(gstAmount),
      roundOff: Math.round(roundOff), finalTotal: Math.round(afterDiscount + gstAmount + roundOff),
      gstBreakdown,
    }
  };
}

/* =========================
   Room / Fabric factories
   ========================= */
const BlankRoom = (n = 1, settings = DEFAULT_SETTINGS) => ({
  id: crypto.randomUUID(),
  name: `Room ${n}`,
  widthInch: "", panels: "", clothMeters: "",
  widthUnit: "in", lengthUnit: "in", lengthInch: "",
  repeat: 'no', repeatCm: '',
  track: (settings.tracks && settings.tracks[0]) || { id: "std", label: "Standard Track", ratePerFt: settings.trackRatePerFt || 250 },
  needInstallation: false, installQtyFt: "",
  isRomanBlind: false, include: true,
  fabrics: [BlankFabric(settings, "Main")],
});
const BlankMiscCost = (settings = DEFAULT_SETTINGS) => ({
  id: crypto.randomUUID(),
  name: "",
  rate: "",
  quantity: "",
  unit: "nos",
  gstCategory:
    (settings.gstCategories || []).find(c => c.id === "other") ||
    DEFAULT_SETTINGS.gstCategories.find(c => c.id === "other") ||
    DEFAULT_SETTINGS.gstCategories[0],
});

/* =========================
   PDF helpers
   ========================= */
function pdfText(doc, text, x, y, options = {}) {
  const safeText = text == null ? '' : String(text);
  if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  doc.text(safeText, x, y, { baseline: 'alphabetic', ...options });
}
function drawHeader(doc, m, meta, logoDataURL) {
  const pw = doc.internal.pageSize.getWidth();
  const y = m;
  doc.setFillColor(255,255,255); doc.setDrawColor(...pdfColor(BRAND.border)); doc.setLineWidth(0.5);
  doc.roundedRect(m, y, pw-2*m, 70, 6, 6, "S");
  doc.setFillColor(...pdfColor(BRAND.primary)); doc.rect(m, y, 5, 70, "F");
  if (logoDataURL) { try { doc.addImage(logoDataURL,'PNG',m+12,y+11,48,48); } catch(e) { try { doc.addImage(logoDataURL,'JPEG',m+12,y+11,48,48); } catch(_) {} } }
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, meta.company.pdfCompanyName || meta.company.name || BRAND.pdfCompanyName, m+68, y+24);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, meta.company.address, m+68, y+40);
  pdfText(doc, `Phone: ${meta.company.phone} | Email: ${meta.company.email}`, m+68, y+54);
  const rightX = pw-m-10;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, `Date: ${new Date().toLocaleDateString('en-IN')}`, rightX, y+18, {align:'right'});
  pdfText(doc, `Customer: ${meta.customerName||'N/A'}`, rightX, y+32, {align:'right'});
  pdfText(doc, `Phone: ${meta.customerPhone||'N/A'}`, rightX, y+46, {align:'right'});
  if (meta.quoteNo) { doc.setFont('helvetica','bold'); doc.setTextColor(...pdfColor(BRAND.primary)); pdfText(doc, `Quote No: ${meta.quoteNo}`, rightX, y+60, {align:'right'}); }
  return y+80;
}
function drawSectionHeader(doc, m, y, title) {
  const pw = doc.internal.pageSize.getWidth(), tw = pw-2*m;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, tw, 24, 4, 4, "FD");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, title, m+10, y+16);
  return y+30;
}
function drawGstBlock(doc, m, y, meta) {
  if (!meta.commercials.needGstBill) return y;
  const pw = doc.internal.pageSize.getWidth(), w = pw-2*m;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, w, 22, 4, 4, "FD");
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  pdfText(doc, "GST BILL DETAILS", m+6, y+14);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(17,24,39);
  pdfText(doc, `GSTIN: ${meta.commercials.gstin||"N/A"}`, m+6, y+28);
  pdfText(doc, `Billing Address: ${meta.commercials.billingAddress||"N/A"}`, m+6, y+40);
  return y+48;
}
function drawPaymentTermsBlock(doc, m, y) {
  const pw = doc.internal.pageSize.getWidth();
  const w = pw - 2 * m;
  const blockH = 76;
  doc.setFillColor(255, 250, 245);
  doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, w, blockH, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, "PAYMENT TERMS", m + 8, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  const terms = [
    "50% advance payment is required to start order processing.",
    "Remaining 50% payment is due after installation.",
  ];
  terms.forEach((term, index) => {
    pdfText(doc, `• ${term}`, m + 10, y + 31 + index * 12);
  });
  return y + blockH + 12;
}
function buildFabricSummaryRows(rooms, settings) {
  const effectiveRooms = rooms.filter(r => r.include !== false);
  const map = new Map();
  effectiveRooms.forEach((room) => {
    const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];
    fabrics.forEach((fab) => {
      const fc = computeFabricCost(room, fab);
      const key = `${(fab.materialName||'N/A').trim().toLowerCase()}__${Number(fab.materialPrice||0)}`;
      if (!map.has(key)) map.set(key, { label: fab.materialName||'N/A', qtyMeters: 0, rate: Number(fab.materialPrice||0), amount: 0, roomNames: [] });
      const row = map.get(key);
      row.qtyMeters += fc.metersOfCloth;
      row.amount += fc.clothCost;
      row.roomNames.push(`${room.name||'Room'} (${fab.label||'Fabric'})`);
    });
  });
  return Array.from(map.values()).map(r => ({ ...r, qtyMeters: Math.round(r.qtyMeters*100)/100, amount: Math.round(r.amount), roomNames: Array.from(new Set(r.roomNames)) }));
}
function drawGroupedSummarySection(doc, m, y, rooms, settings, commercials, miscellaneousCosts = [], mergeFabricsRoomWise = false) {
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), tw = pw-2*m;
  const ensureSpace = (h) => { if ((y+h) > (ph-24)) { doc.addPage(); y=m; } return y; };
  const rightText = (text, x, lineY) => { const s=String(text??''); doc.text(s, x-doc.getTextWidth(s), lineY); };
  const fabricRows = buildFabricSummaryRows(rooms, settings);
  const fabricTotal = Math.round(fabricRows.reduce((s,r)=>s+r.amount,0));
  const {discountType, discountValue} = commercials||{};
  const discountAmount = discountType==="percent" ? fabricTotal*((discountValue||0)/100) : Math.round(discountValue||0);
  const netFabricTotal = Math.max(0, fabricTotal-discountAmount);
  const hasDiscount = Math.round(discountAmount)>0;
  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));
  const otherRows = [];
  { const smap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const isBlind=Boolean(fb.isRomanBlind||fb.romanBlindSqFt);const k=isBlind?`roman_blind_${fb.stitching?.id||'none'}`:(fb.stitching?.id||'none');if(!smap.has(k))smap.set(k,{label:isBlind?`Roman Blind - ${fb.stitching?.label||'Stitching'}`:`Stitching - ${fb.stitching?.label||'N/A'}`,qty:0,qtyUnit:isBlind?'sqft':'panels',rate:fb.stitching?.ratePerPanel||0,amount:0});const row=smap.get(k);row.qty+=isBlind?(fb.romanBlindSqFt||0):fb.panels;row.amount+=fb.stitchingCost;});}); smap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const lmap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const k=fb.lining?.id||'none';if(!lmap.has(k))lmap.set(k,{label:`Lining - ${fb.lining?.label||'N/A'}`,qty:0,qtyUnit:'m',rate:fb.lining?.ratePerMeter||0,amount:0});const row=lmap.get(k);row.qty+=fb.metersOfCloth;row.amount+=fb.liningCost;});}); lmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const tmap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{if(Math.round(fb.trackCost||0)<=0)return;const isBlind=Boolean(fb.isRomanBlind||fb.romanBlindSqFt);const k=isBlind?`roman_track_${fb.track?.id||'none'}`:(fb.track?.id||room.track?.id||'none');const rate=Number.isFinite(fb.track?.ratePerFt)?fb.track.ratePerFt:(Number.isFinite(room.track?.ratePerFt)?room.track.ratePerFt:(settings?.trackRatePerFt||0));if(!tmap.has(k))tmap.set(k,{label:isBlind?`Roman Track - ${fb.track?.label||'N/A'}`:`Track - ${fb.track?.label||room.track?.label||'N/A'}`,qty:0,qtyUnit:'ft',rate,amount:0});const row=tmap.get(k);row.qty+=isBlind?(fb.widthFeet||0):(fb.trackFeet||0);row.amount+=fb.trackCost;});}); tmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const ti=Math.round(roomCosts.reduce((s,x)=>s+x.cost.installationCost,0)),tq=roomCosts.reduce((s,x)=>s+(x.cost.usedInstallQty||0),0);if(ti>0)otherRows.push({label:'Installation',qty:tq,qtyUnit:'pcs',rate:settings?.installationRatePerTrackFt||0,amount:ti}); }
  (miscellaneousCosts||[]).forEach((item)=>{
  const name=String(item.name||'').trim();
  const rate=toNum(item.rate);
  const qty=toNum(item.quantity)||1;
  const unit=item.unit||'nos';
  const amount=rate*qty;

  if(name&&Math.round(amount)>0) {
    otherRows.push({label:name,qty,qtyUnit:unit,rate,amount});
  }
});
  const otherCostsTotal = Math.round(otherRows.reduce((s,r)=>s+r.amount,0));
  const headerH=22,baseRowH=22,lineH=11;
  const drawTableHeader=(startY,columns)=>{doc.setFillColor(...pdfColor(BRAND.header));doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,startY,tw,headerH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(80,80,80);columns.forEach(col=>{if(col.align==='right')rightText(col.title,col.x+col.w-8,startY+14);else pdfText(doc,col.title,col.x+8,startY+14);});columns.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+headerH));return startY+headerH;};
  const wrapText=(text,maxW)=>{const words=String(text??'').split(' '),lines=[];let cur='';words.forEach(word=>{const t=cur?`${cur} ${word}`:word;if(doc.getTextWidth(t)<=maxW)cur=t;else{if(cur)lines.push(cur);let w=word;while(doc.getTextWidth(w)>maxW&&w.length>4)w=w.slice(0,-2)+'...';cur=w;}});if(cur)lines.push(cur);return lines.length?lines:[''];};
  const drawDataRow=(startY,rowIdx,cells,colDefs)=>{let maxLines=1;const wc=cells.map((cell,i)=>{const l=wrapText(String(cell??''),colDefs[i].w-16);if(l.length>maxLines)maxLines=l.length;return l;});const rowH=Math.max(baseRowH,maxLines*lineH+8);doc.setFillColor(rowIdx%2===0?255:250,rowIdx%2===0?255:250,rowIdx%2===0?255:250);doc.rect(m,startY,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,startY,tw,rowH,'S');colDefs.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+rowH));doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(30,30,30);cells.forEach((_,i)=>{const col=colDefs[i];const lines=wc[i];const ty=startY+lineH;if(col.align==='right')lines.forEach((l,li)=>rightText(l,col.x+col.w-8,ty+li*lineH));else lines.forEach((l,li)=>pdfText(doc,l,col.x+8,ty+li*lineH));});return rowH;};
  y=ensureSpace(50); y=drawSectionHeader(doc,m,y,'FABRIC SUMMARY (ROOM-WISE)');
  const colRoomW2=110,colFabricW=130,colClothW=70,colRateW=80,colAmountW=tw-110-130-70-80;
  const colRoomX2=m,colFabricX=colRoomX2+colRoomW2,colClothX=colFabricX+colFabricW,colRateX2=colClothX+colClothW,colAmountX2=colRateX2+colRateW;
  const roomFabricColDefs=[{title:'Room',x:colRoomX2,w:colRoomW2,align:'left'},{title:'Fabric',x:colFabricX,w:colFabricW,align:'left'},{title:'Cloth (m)',x:colClothX,w:colClothW,align:'right'},{title:'Rate/m',x:colRateX2,w:colRateW,align:'right'},{title:'Amount',x:colAmountX2,w:colAmountW,align:'right'}];
  const totalFabricEntries=mergeFabricsRoomWise?effectiveRooms.length:effectiveRooms.reduce((s,r)=>s+Math.max(1,(r.fabrics||[]).length),0);
  y=ensureSpace(headerH+totalFabricEntries*baseRowH+60); y=drawTableHeader(y,roomFabricColDefs);
  let globalRowIdx=0;
  effectiveRooms.forEach((room)=>{
    const fabrics=room.fabrics&&room.fabrics.length?room.fabrics:[];
    if(!fabrics.length){const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room','—','—','—','—'],roomFabricColDefs);y+=rowH;return;}
    if(mergeFabricsRoomWise){
      const fabricCosts=fabrics.map((fab)=>({fab,fc:computeFabricCost(room,fab)}));
      const fabricLabel=fabricCosts.map(({fab})=>fab.label||'Fabric').join(' + ');
      const totalMeters=fabricCosts.reduce((sum,item)=>sum+Number(item.fc.metersOfCloth||0),0);
      const totalAmount=fabricCosts.reduce((sum,item)=>sum+Number(item.fc.clothCost||0),0);
      const rates=Array.from(new Set(fabricCosts.map(({fab})=>Number(fab.materialPrice||0)).filter(rate=>rate>0)));
      const rateText=rates.length===1?`Rs.${numberWithCommas(rates[0])}`:'Mixed';
      const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room',fabricLabel||'Fabric',`${totalMeters.toFixed(2)} m`,rateText,`Rs.${numberWithCommas(Math.round(totalAmount))}`],roomFabricColDefs);
      y+=rowH;
    } else {
      const fabRowHeights=fabrics.map((fab)=>{const fc=computeFabricCost(room,fab);const nameLines=wrapText(fab.materialName||'N/A',colFabricW-16);const roomLines=wrapText(room.name||'Room',colRoomW2-16);const maxL=Math.max(nameLines.length,roomLines.length,1);return Math.max(baseRowH,maxL*lineH+8);});
      const totalRoomH=fabRowHeights.reduce((s,h)=>s+h,0);
      const isAlt=globalRowIdx%2===0;
      const roomStartY=y;
      fabrics.forEach((fab,fi)=>{
        const fc=computeFabricCost(room,fab);const rowH=fabRowHeights[fi];const ry=y+fabRowHeights.slice(0,fi).reduce((s,h)=>s+h,0);
        doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'S');[colClothX,colRateX2,colAmountX2].forEach(x=>doc.line(x,ry,x,ry+rowH));
        doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(30,30,30);
        const nameText=fab.label||'Fabric';wrapText(nameText,colFabricW-16).forEach((l,li)=>pdfText(doc,l,colFabricX+8,ry+lineH+li*lineH));
        rightText(fab.isWallpaper?`${Number(fc.rollQty||0).toFixed(2)} rolls`:(fc.blindType?`${Number(fc.blindSqFt||0).toFixed(2)} sq ft`:`${fc.metersOfCloth.toFixed(2)} m`),colClothX+colClothW-8,ry+lineH);
        rightText(fab.isWallpaper?`Rs.${numberWithCommas(fc.rollPrice||0)}`:`Rs.${numberWithCommas(fc.blindType?fc.blindRate:(fab.materialPrice||0))}`,colRateX2+colRateW-8,ry+lineH);
        rightText(`Rs.${numberWithCommas(Math.round(fc.clothCost))}`,colAmountX2+colAmountW-8,ry+lineH);
      });
      doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'S');doc.line(colFabricX,roomStartY,colFabricX,roomStartY+totalRoomH);
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);
      const roomLines=wrapText(room.name||'Room',colRoomW2-16);const roomTextHeight=roomLines.length*lineH;const roomTextStartY=roomStartY+(totalRoomH-roomTextHeight)/2+lineH-2;
      roomLines.forEach((l,li)=>{pdfText(doc,l,colRoomX2+colRoomW2/2,roomTextStartY+li*lineH,{align:'center'});});
      y+=totalRoomH;globalRowIdx++;
    }
  });
  {const rowH=baseRowH;doc.setFillColor(...pdfColor('#FFF7ED'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);pdfText(doc,'Fabric Sub-Total',m+8,y+14);rightText(`Rs.${numberWithCommas(fabricTotal)}`,m+tw-8,y+14);y+=rowH;}
  if(hasDiscount){const rowH=baseRowH;const dl=discountType==="percent"?`Discount (${Number(discountValue||0)}%)`:'Discount';doc.setFillColor(255,240,240);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(180,30,30);pdfText(doc,dl,m+8,y+14);rightText(`-Rs.${numberWithCommas(discountAmount)}`,m+tw-8,y+14);y+=rowH;doc.setFillColor(...pdfColor('#E8F5E9'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(20,100,40);pdfText(doc,'Net Fabric Total (after discount)',m+8,y+15);rightText(`Rs.${numberWithCommas(netFabricTotal)}`,m+tw-8,y+15);y+=rowH;}
  y+=12;y=ensureSpace(50);y=drawSectionHeader(doc,m,y,'OTHER COSTS');
  const ocColDesc=tw-90-90-90,ocColQty=90,ocColRate=90,ocColAmount=90;
  const ocDescX=m,ocQtyX=ocDescX+ocColDesc,ocRateX=ocQtyX+ocColQty,ocAmountX=ocRateX+ocColRate;
  const otherColDefs=[{title:'Description',x:ocDescX,w:ocColDesc,align:'left'},{title:'Qty',x:ocQtyX,w:ocColQty,align:'right'},{title:'Rate',x:ocRateX,w:ocColRate,align:'right'},{title:'Amount',x:ocAmountX,w:ocColAmount,align:'right'}];
  y=ensureSpace(headerH+Math.max(1,otherRows.length)*baseRowH+baseRowH);y=drawTableHeader(y,otherColDefs);
  if(!otherRows.length){const rowH=baseRowH;doc.setFillColor(255,255,255);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);pdfText(doc,'No additional costs',m+8,y+14);y+=rowH;}
  else{
  otherRows.forEach((row,idx)=>{
    const unitShort=getUnitShortLabel(row.qtyUnit);
    const qtyText =
      row.qtyUnit==='m' || row.qtyUnit==='sqft'
        ? `${Number(row.qty).toFixed(2)} ${unitShort}`
        : `${Math.round(row.qty)} ${unitShort}`;

    const rowH=drawDataRow(
      y,
      idx,
      [
        row.label,
        qtyText,
        `Rs.${numberWithCommas(row.rate)}/${unitShort}`,
        `Rs.${numberWithCommas(Math.round(row.amount))}`
      ],
      otherColDefs
    );

    y+=rowH;
  });
}
  {const rowH=baseRowH;doc.setFillColor(...pdfColor('#FFF7ED'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);pdfText(doc,'Other Costs Total',m+8,y+14);rightText(`Rs.${numberWithCommas(otherCostsTotal)}`,m+tw-8,y+14);y+=rowH;}
  return y+6;
}

/* drawFinalSummaryPanel  — accepts gstBreakdown for per-category lines */
function drawFinalSummaryPanel(doc, m, y, meta, summary, sigDataURL) {
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),qrDataUrl=meta.company?.paymentQrUrl;
  const sectionW=pw-2*m,gap=16,halfW=(sectionW-gap)/2,leftX=m,rightX=m+halfW+gap,qrSize=132;

  // Build summary lines
  const lines = [
    { label: summary.discountAmount > 0 ? 'Net Fabric (after discount)' : 'Fabric Total', value: `Rs.${numberWithCommas(summary.netFabricTotal ?? summary.clothTotal)}`, bold: false, grandTotal: false },
    { label: 'Other Costs', value: `Rs.${numberWithCommas(summary.otherTotal)}`, bold: false, grandTotal: false },
  ];

  // ── NEW: per-category GST lines ──
  const gstBreakdown = summary.gstBreakdown || [];
  if (meta.commercials.applyGst) {
    if (gstBreakdown.length > 0) {
      gstBreakdown.forEach(cat => {
        lines.push({
          label: `GST — ${cat.label} (${cat.rate}%)`,
          value: `Rs.${numberWithCommas(cat.amount)}`,
          bold: false,
          grandTotal: false,
          isGst: true,
        });
      });
    } else if (summary.gstAmount > 0) {
      // Fallback for old quotes with no breakdown
      lines.push({ label: `GST`, value: `Rs.${numberWithCommas(summary.gstAmount)}`, bold: false, grandTotal: false, isGst: true });
    }
  }

  if (Number(summary.roundOff || 0) !== 0) {
    const roundOffValue = Number(summary.roundOff || 0);
    lines.push({ label: "Round Off / Adjustment", value: `${roundOffValue > 0 ? "" : "-"}Rs.${numberWithCommas(Math.abs(roundOffValue))}`, bold: false, grandTotal: false });
  }
  lines.push({ label: 'GRAND TOTAL', value: `Rs.${numberWithCommas(summary.finalTotal)}`, bold: true, grandTotal: true });

  const rowH=22,signatureH=62,blockH=Math.max(180,lines.length*rowH+signatureH+8);
  if(y+blockH>ph-24){y=Math.max(m,ph-blockH-24);}
  y=drawSectionHeader(doc,m,y,'GRAND TOTAL SUMMARY');
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.setLineWidth(0.5);doc.roundedRect(leftX,y,halfW,blockH,6,6,'S');
  doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc,'Scan to Pay',leftX+(halfW/2),y+18,{align:'center'});
  if(qrDataUrl){try{const qrBoxX=leftX+(halfW-qrSize)/2,qrBoxY=y+28;doc.roundedRect(qrBoxX,qrBoxY,qrSize,qrSize,6,6,'S');doc.addImage(qrDataUrl,'PNG',qrBoxX+4,qrBoxY+4,qrSize-8,qrSize-8);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.roundedRect(rightX,y,halfW,blockH,6,6,'S');
  const totalsStartY=y+8;
  lines.forEach((it,i)=>{const ry=totalsStartY+i*rowH;if(it.grandTotal){doc.setFillColor(...pdfColor(BRAND.primary));doc.rect(rightX,ry,halfW,rowH+4,'F');doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(255,255,255);pdfText(doc,it.label,rightX+8,ry+15);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}else{if(it.isGst){doc.setFillColor(240,253,244);}else if(i%2===0){doc.setFillColor(255,255,255);}else{doc.setFillColor(250,250,250);}doc.rect(rightX,ry,halfW,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(rightX,ry,halfW,rowH,'S');doc.setFont('helvetica',it.bold?'bold':'normal');doc.setFontSize(it.isGst?8.5:10);doc.setTextColor(it.isGst?5:50,it.isGst?100:50,it.isGst?60:50);pdfText(doc,it.label,rightX+8,ry+15);doc.setTextColor(30,30,30);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}});
  const sigTopY=y+blockH-signatureH+2;
  if(sigDataURL){try{doc.addImage(sigDataURL,'PNG',rightX+4,sigTopY,120,32);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.primary));doc.setLineWidth(0.8);doc.line(rightX+4,sigTopY+34,rightX+halfW-4,sigTopY+34);
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);
  pdfText(doc,meta.commercials.signatoryName||'Authorized Signatory',rightX+4,sigTopY+46);
  doc.setFont('helvetica','italic');
  pdfText(doc,meta.commercials.signatoryTitle||`For ${meta.company.pdfCompanyName||meta.company.name||'Themes Furnishings & Decor'}`,rightX+4,sigTopY+58);
  return y+blockH;
}

function estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts = []) {
  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const totalFabricEntries = effectiveRooms.reduce((s,r)=>s+Math.max(1,(r.fabrics||[]).length),0);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));
  const stitchKeys=new Set(),liningKeys=new Set(),trackKeys=new Set();let hasInstall=false;
  roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{if(Math.round(fb.stitchingCost||0)>0)stitchKeys.add(fb.stitching?.id||'none');if(Math.round(fb.liningCost||0)>0)liningKeys.add(fb.lining?.id||'none');});if(Math.round(cost.trackCost||0)>0)trackKeys.add(room.track?.id||'none');if(Math.round(cost.installationCost||0)>0)hasInstall=true;});
  const miscRowCount=(miscellaneousCosts||[]).filter(item=>String(item.name||'').trim()&&Math.round(toNum(item.rate)*(toNum(item.quantity)||1))>0).length;
  const otherRowCount=Math.max(1,stitchKeys.size+liningKeys.size+trackKeys.size+(hasInstall?1:0)+miscRowCount);
  const {discountType,discountValue}=meta?.commercials||{};
  const hasDiscount=discountType==="percent"?Number(discountValue||0)>0:Math.round(discountValue||0)>0;
  // Extra space for per-category GST lines
  const gstLineCount = meta?.commercials?.applyGst ? (settings?.gstCategories?.length || 3) : 0;
  return Math.max(842,Math.ceil(116+(meta?.commercials?.needGstBill?52:0)+34+30+22+totalFabricEntries*26+24+(hasDiscount?48:0)+42+22+otherRowCount*24+24+96+(220+gstLineCount*22)+28));
}

async function generateFullPDF(rooms, meta, settings, miscellaneousCosts = [], mergeFabricsRoomWise = false) {
  const logoDataURL = await imageToDataURL(meta.company.logoUrl);
  const paymentQrDataURL = await imageToDataURL(meta.company.paymentQrUrl);
  const sigDataURL = await imageToDataURL(meta.commercials.signatureUrl);
  if (paymentQrDataURL) meta = { ...meta, company: { ...meta.company, paymentQrUrl: paymentQrDataURL } };
  const m = 36, pageWidth = 595.28;
  const pageHeight = estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });
  let y = drawHeader(doc, m, meta, logoDataURL);
  y = drawGstBlock(doc, m, y, meta);
  y = drawSectionHeader(doc, m, y, meta.quoteNo ? `QUOTATION - ${meta.quoteNo}` : 'QUOTATION');
  const all = computeAllTotals(rooms, meta.commercials, settings, miscellaneousCosts);
  y = drawGroupedSummarySection(doc, m, y, rooms, settings, meta.commercials, miscellaneousCosts, mergeFabricsRoomWise);
  y = drawPaymentTermsBlock(doc, m, y);
  drawFinalSummaryPanel(doc, m, y, meta, all.summary, sigDataURL);
  return doc;
}

async function generateCombinedPDF(quotes, settings) {
  const allRooms = [];
  const quoteSnapshots = [];
  for (const quote of quotes) {
    const rooms = (quote.rooms || []).filter(r => r.include !== false);
    const commercials = quote.commercials || {};
    const misc = quote.miscellaneousCosts || [];
    const allTotals = computeAllTotals(rooms, commercials, settings, misc);
    quoteSnapshots.push({ quoteNo: quote.quoteNo, customer: quote.customer, commercials, misc, rooms, summary: allTotals.summary });
    rooms.forEach(r => allRooms.push({ ...r, _sourceQuote: quote.quoteNo }));
  }
  const firstQuote = quotes[0];
  const logoDataURL = await imageToDataURL(firstQuote.company?.logoUrl || BRAND.logoUrl);
  const paymentQrDataURL = await imageToDataURL(firstQuote.company?.paymentQrUrl || BRAND.paymentQrUrl);
  const sigDataURL = await imageToDataURL(firstQuote.commercials?.signatureUrl || normalizeImageUrl(DEFAULT_SIGNATURE_URL));
  const combinedGrandTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.finalTotal || 0), 0);
  const combinedBaseTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.base || 0), 0);
  const combinedNetFabricTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.netFabricTotal ?? qs.summary?.clothTotal ?? 0), 0);
  const combinedOtherTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.otherTotal || 0), 0);
  const combinedGstTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.gstAmount || 0), 0);
  const combinedRoundOffTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.roundOff || 0), 0);
  const m = 36, pageWidth = 595.28, pageHeight = 842;
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });
  const meta = {
    quoteNo: '',
    customerName: firstQuote.customer?.name || 'Customer',
    customerPhone: firstQuote.customer?.phone || '',
    projectTitle: firstQuote.customer?.project || 'Combined Quotation',
    company: { ...BRAND, ...(firstQuote.company || {}), paymentQrUrl: paymentQrDataURL || BRAND.paymentQrUrl },
    commercials: { ...(firstQuote.commercials || {}), applyGst: combinedGstTotal > 0, gstRate: '', signatureUrl: sigDataURL },
  };
  let y = drawHeader(doc, m, meta, logoDataURL);
  y = drawSectionHeader(doc, m, y, `COMBINED QUOTATION — ${firstQuote.customer?.name || 'Customer'}`);
  const pw = doc.internal.pageSize.getWidth(), tw = pw - 2 * m;
  const rowH = 24;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  pdfText(doc, 'Quote No', m + 8, y + 16);
  pdfText(doc, 'Project / Customer', m + 120, y + 16);
  const rightText = (text, x, lineY) => { const s = String(text ?? ''); doc.text(s, x - doc.getTextWidth(s), lineY); };
  rightText('Rooms', m + tw - 120, y + 16);
  rightText('Grand Total', m + tw - 8, y + 16);
  y += rowH;
  quoteSnapshots.forEach((qs, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
    doc.setFillColor(...bg); doc.rect(m, y, tw, rowH, 'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.primary));
    pdfText(doc, qs.quoteNo, m + 8, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    pdfText(doc, qs.customer?.project || qs.customer?.name || '—', m + 120, y + 16);
    doc.setFont('helvetica', 'bold');
    rightText(String(qs.rooms.length), m + tw - 120, y + 16);
    rightText(`Rs.${numberWithCommas(qs.summary.finalTotal)}`, m + tw - 8, y + 16);
    y += rowH;
  });
  doc.setFillColor(...pdfColor('#FFF7ED')); doc.rect(m, y, tw, rowH, 'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
  pdfText(doc, `${quotes.length} Quotes Combined`, m + 8, y + 16);
  rightText(`Rs.${numberWithCommas(combinedGrandTotal)}`, m + tw - 8, y + 16);
  y += rowH + 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'Each quotation is shown on a separate page after this summary for easier reading.', m + 8, y);
  y += 16;
  for (const qs of quoteSnapshots) {
    doc.addPage();
    const quoteMeta = { ...meta, quoteNo: qs.quoteNo, customerName: qs.customer?.name || meta.customerName || 'Customer', customerPhone: qs.customer?.phone || meta.customerPhone || '', projectTitle: qs.customer?.project || '', commercials: { ...meta.commercials, ...qs.commercials, signatureUrl: meta.commercials.signatureUrl } };
    y = drawHeader(doc, m, quoteMeta, logoDataURL);
    y = drawSectionHeader(doc, m, y, `QUOTE ${qs.quoteNo}${qs.customer?.project ? ` - ${qs.customer.project}` : ''}`);
    y = drawGroupedSummarySection(doc, m, y, qs.rooms, settings, qs.commercials, qs.misc, false);
  }
  doc.addPage();
  y = drawHeader(doc, m, meta, logoDataURL);
  y = drawSectionHeader(doc, m, y, 'COMBINED FINAL TOTAL & PAYMENT TERMS');
  y = drawPaymentTermsBlock(doc, m, y);
  drawFinalSummaryPanel(doc, m, y, meta, {
    netFabricTotal: combinedNetFabricTotal, clothTotal: combinedNetFabricTotal, otherTotal: combinedOtherTotal,
    base: combinedBaseTotal, discountAmount: 0, afterDiscount: combinedNetFabricTotal + combinedOtherTotal,
    gstAmount: combinedGstTotal, roundOff: combinedRoundOffTotal, finalTotal: combinedGrandTotal, gstBreakdown: [],
  }, sigDataURL);
  return doc;
}

/* =========================
   Small components
   ========================= */
function Box({ title, children }) {
  return <div className="box"><div className="box-header"><h3>{title}</h3></div><div className="box-body">{children}</div></div>;
}
const Field = React.memo(function Field({ label, hint, children }) {
  return <div className="field"><label className="field-label"><span>{label}</span>{hint&&<span className="field-hint"> — {hint}</span>}</label>{children}</div>;
});
const UnitInput = React.memo(function UnitInput({ value, onChange, onBlur, placeholder, unit="", disabled=false, inputMode="text" }) {
  return <div className="unit-input"><input className="unit-input__field" type="text" inputMode={inputMode} value={value||''} onChange={onChange} onBlur={onBlur} onFocus={e=>e.currentTarget.select()} placeholder={placeholder} disabled={disabled} autoComplete="off" />{unit&&<span className="unit-input__suffix">{unit}</span>}</div>;
});
const Pill = React.memo(function Pill({ children }) { return <span className="pill">{children}</span>; });
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return <span className="status-badge" style={{ background: s.bg, color: s.text, borderColor: s.border }}>{status || 'Draft'}</span>;
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    const found = AUTH_USERS.find(user => user.username === username.trim() && user.password === password);
    if (!found) { setError("Invalid username or password."); return; }
    const sessionUser = { username: found.username, role: found.role, label: found.label };
    localStorage.setItem(LS_AUTH_USER_KEY, JSON.stringify(sessionUser));
    onLogin(sessionUser);
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          {BRAND.logoUrl && <img className="auth-logo" src={BRAND.logoUrl} alt="Themes Furnishings & Decor" />}
          <div><div className="auth-title">Quotation App Login</div><div className="auth-subtitle">Themes Furnishings & Decor</div></div>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <Field label="Username"><input className="input" value={username} onChange={e => { setUsername(e.target.value); setError(""); }} placeholder="admin or staff" autoFocus /></Field>
          <Field label="Password"><input className="input" type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Enter password" /></Field>
          <button className="btn btn-primary" type="submit" style={{ justifyContent: "center" }}>Login</button>
        </form>
      </div>
    </div>
  );
}

/* =========================
   FabricRow  — GST Category selector added
   ========================= */
const FabricRow = React.memo(function FabricRow({ fabric, room, settings, commercials, onChange, onRemove, canRemove }) {
  const fc = useMemo(() => computeFabricCost(room, fabric), [room, fabric]);
  const gstCategories = settings?.gstCategories || DEFAULT_SETTINGS.gstCategories;
  const showGstPicker = commercials?.applyGst;

  return (
    <div className="fabric-row">
      <div className="fabric-row-header">
        <span className="fabric-label-badge">{fabric.label || "Fabric"}</span>
        <input className="input" value={fabric.label || ""} onChange={e => onChange({ label: e.target.value })} placeholder="Label e.g. Main / Sheer" style={{ flex: 1, marginLeft: 8, maxWidth: 180 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!fabric.isWallpaper} onChange={e => onChange({ isWallpaper: e.target.checked, isRomanBlind: false, romanBlindSqFt: "", panels: e.target.checked ? "" : fabric.panels, clothMeters: e.target.checked ? "" : fabric.clothMeters, blindType: e.target.checked ? "" : fabric.blindType, blindSqFt: e.target.checked ? "" : fabric.blindSqFt })} />
          Wallpaper
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Type
          <select className="select" style={{ width: 156, padding: '5px 8px', fontSize: 12 }} value={fabric.isRomanBlind ? "roman" : (fabric.blindType || "")} disabled={!!fabric.isWallpaper}
            onChange={e => { const value = e.target.value; const isRoman = value === "roman"; onChange({ blindType: isRoman ? "" : value, blindSqFt: value && !isRoman ? fabric.blindSqFt : "", isRomanBlind: isRoman, romanBlindSqFt: isRoman ? fabric.romanBlindSqFt : "", isWallpaper: false, panels: value ? "" : fabric.panels, clothMeters: value ? "" : fabric.clothMeters }); }}>
            <option value="">None</option>
            <option value="roman">Roman Blind</option>
            <option value="roller">Roller Blind</option>
            <option value="zebra">Zebra Blind</option>
            <option value="wooden">Wooden Blind</option>
          </select>
        </label>
        <span className="fabric-cost-pill">{fc.blindType ? `Blinds Cost: ${currency(fc.clothCost)}` : currency(fc.clothCost + fc.stitchingCost + fc.liningCost)}</span>
        {canRemove && <button className="btn-remove-fabric" onClick={onRemove} title="Remove fabric">×</button>}
      </div>
      <div className="fabric-row-grid">
        {fabric.isWallpaper ? (
          <>
            <Field label="Wallpaper Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder="e.g. Floral Wallpaper" /></Field>
            <Field label="Quantity" hint="rolls"><UnitInput unit="rolls" value={fabric.wallpaperRollQty ?? ""} onChange={e => onChange({ wallpaperRollQty: e.target.value })} inputMode="decimal" placeholder="e.g. 3" /></Field>
            <Field label="Price / Roll"><UnitInput unit="Rs" value={fabric.wallpaperRollPrice ?? ""} onChange={e => onChange({ wallpaperRollPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 2500" /></Field>
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="wallpaper")?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}
                </select>
              </Field>
            )}
          </>
        ) : fabric.blindType ? (
          <>
            <Field label="Blind Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder={fabric.blindType === "roller" ? "Roller Blind" : fabric.blindType === "zebra" ? "Zebra Blind" : "Wooden Blind"} /></Field>
            <Field label="Height" hint={fabric.blindType === "wooden" ? "value + unit" : "height + 10 inches used"}>
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.lengthUnit || 'in'} value={fabric.lengthInch} onChange={e => onChange({ lengthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 90" />
                <select className="select" style={{ width: 76 }} value={fabric.lengthUnit || 'in'} onChange={e => onChange({ lengthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Width" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.widthUnit || 'in'} value={fabric.widthInch} onChange={e => onChange({ widthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 60" />
                <select className="select" style={{ width: 76 }} value={fabric.widthUnit || 'in'} onChange={e => onChange({ widthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Sq Ft" hint="auto-calculated, min 11"><UnitInput unit="sq ft" value={fabric.blindSqFt ?? ""} onChange={e => onChange({ blindSqFt: e.target.value })} inputMode="decimal" placeholder={Number(fc.blindSqFt || 0).toFixed(2)} /></Field>
            <Field label="Price / Sq Ft"><UnitInput unit="Rs" value={fabric.materialPrice} onChange={e => onChange({ materialPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 250" /></Field>
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="blind")?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}
                </select>
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Length" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.lengthUnit || 'in'} value={fabric.lengthInch} onChange={e => onChange({ lengthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 90" />
                <select className="select" style={{ width: 76 }} value={fabric.lengthUnit || 'in'} onChange={e => onChange({ lengthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Width" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.widthUnit || 'in'} value={fabric.widthInch} onChange={e => onChange({ widthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 60" />
                <select className="select" style={{ width: 76 }} value={fabric.widthUnit || 'in'} onChange={e => onChange({ widthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Panels" hint={fabric.isRomanBlind || room.isRomanBlind ? "auto: width ÷ 50, editable" : "auto: width ÷ 20, editable"}><UnitInput unit="pcs" value={fabric.panels ?? ""} onChange={e => onChange({ panels: e.target.value })} inputMode="decimal" placeholder={Number(fc.panels || 0).toFixed(2)} /></Field>
            {(fabric.isRomanBlind || room.isRomanBlind) && <Field label="Sq Ft" hint="auto from length × width"><UnitInput unit="sq ft" value={fabric.romanBlindSqFt ?? ""} onChange={e => onChange({ romanBlindSqFt: e.target.value })} inputMode="decimal" placeholder={Number(fc.romanBlindSqFt || 0).toFixed(2)} /></Field>}
            <Field label="Repeat">
              <select className="select" value={fabric.repeat || 'no'} onChange={e => onChange({ repeat: e.target.value, ...(e.target.value === 'no' ? { repeatCm: '' } : {}) })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            {fabric.repeat === 'yes' && <Field label="Repeat Size" hint="cm"><UnitInput unit="cm" value={fabric.repeatCm} onChange={e => onChange({ repeatCm: e.target.value })} inputMode="decimal" placeholder="e.g. 25" /></Field>}
            <Field label="Track Type">
              <select className="select" value={fabric.track?.id || ""} onChange={e => onChange({ track: (settings.tracks || []).find(t => t.id === e.target.value) || null })}>
                {(settings.tracks || []).map(t => <option key={t.id} value={t.id}>{t.label} (Rs.{t.ratePerFt}/ft)</option>)}
              </select>
            </Field>
            <Field label="Price / m"><UnitInput unit="Rs/m" value={fabric.materialPrice} onChange={e => onChange({ materialPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 350" /></Field>
            <Field label="Cloth" hint={`auto: ${fc.metersOfCloth.toFixed(2)} m`}><UnitInput unit="m" value={fabric.clothMeters ?? ""} onChange={e => onChange({ clothMeters: e.target.value })} inputMode="decimal" placeholder={fc.metersOfCloth.toFixed(2)} /></Field>
            <Field label="Stitching">
              <select className="select" value={fabric.stitching?.id || ""} onChange={e => onChange({ stitching: settings.stitchingTypes.find(s => s.id === e.target.value) })}>
                {settings.stitchingTypes.map(s => <option key={s.id} value={s.id}>{s.label} (Rs.{s.ratePerPanel}/panel)</option>)}
              </select>
            </Field>
            <Field label="Lining">
              <select className="select" value={fabric.lining?.id || ""} onChange={e => onChange({ lining: settings.linings.find(l => l.id === e.target.value) })}>
                {settings.linings.map(l => <option key={l.id} value={l.id}>{l.label} (Rs.{l.ratePerMeter}/m)</option>)}
              </select>
            </Field>
            {/* ── NEW: GST Category picker — only shown when "Apply GST" is enabled ── */}
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select"
                  value={fabric.gstCategory?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
});

/* =========================
   Room Card  — passes commercials down to FabricRow
   ========================= */
const RoomCard = React.memo(function RoomCard({ room, onClone, onDelete, updateRoom, settings, commercials }) {
  const [localRoom, setLocalRoom] = useState(room);
  const localRoomRef = useRef(localRoom);
  const cost = useMemo(() => computeRoomCost(localRoom, settings), [localRoom, settings]);
  useEffect(() => { localRoomRef.current = localRoom; }, [localRoom]);
  const syncToParent = useCallback(() => { updateRoom(room.id, { ...localRoomRef.current }); }, [room.id, updateRoom]);
  const handleChange = useCallback((field, value) => setLocalRoom(prev => ({ ...prev, [field]: value })), []);
  const debounceRef = useRef(null);
  const scheduleSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { syncToParent(); debounceRef.current = null; }, 250);
  }, [syncToParent]);
  const handleSelectChange = useCallback((patch) => { setLocalRoom(prev => ({ ...prev, ...patch })); scheduleSync(); }, [scheduleSync]);
  useEffect(() => { return () => { if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; } syncToParent(); }; }, [syncToParent]);
  const prevRoomJson = useRef(JSON.stringify(room));
  useEffect(() => { const newJson = JSON.stringify(room); if (newJson !== prevRoomJson.current) { setLocalRoom(room); prevRoomJson.current = newJson; } }, [room]);
  const handleFabricChange = useCallback((fabricId, patch) => { setLocalRoom(prev => ({ ...prev, fabrics: prev.fabrics.map(f => f.id === fabricId ? { ...f, ...patch } : f) })); scheduleSync(); }, [scheduleSync]);
  const handleAddFabric = useCallback(() => { setLocalRoom(prev => ({ ...prev, fabrics: [...prev.fabrics, BlankFabric(settings, prev.fabrics.length === 1 ? "Sheer" : `Fabric ${prev.fabrics.length + 1}`)] })); scheduleSync(); }, [settings, scheduleSync]);
  const handleRemoveFabric = useCallback((fabricId) => { setLocalRoom(prev => ({ ...prev, fabrics: prev.fabrics.filter(f => f.id !== fabricId) })); scheduleSync(); }, [scheduleSync]);
  return (
    <div className="box room-box">
      <div className="room-header">
        <input type="checkbox" checked={localRoom.include !== false} onChange={e => handleSelectChange({ include: e.target.checked })} style={{ transform: 'scale(1.2)', flexShrink: 0 }} />
        <input value={localRoom.name || ''} onChange={e => handleChange('name', e.target.value)} onBlur={syncToParent} onFocus={e => e.currentTarget.select()} className="room-title-input" placeholder="Room Name" />
        <div className="room-actions">
          <button className="btn-icon" onClick={() => onClone(room.id)} title="Duplicate"><Copy size={15} /></button>
          <button className="btn-icon text-danger" onClick={() => onDelete(room.id)} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="fabrics-section">
        <div className="fabrics-section-header">
          <span className="fabrics-section-title">Fabrics ({localRoom.fabrics?.length || 0})</span>
          <button className="btn btn-outline btn-sm" onClick={handleAddFabric} style={{ fontSize: 11 }}><Plus size={12} /> Add Fabric</button>
        </div>
        {(localRoom.fabrics || []).map(fabric => (
          <FabricRow
            key={fabric.id}
            fabric={fabric}
            room={localRoom}
            settings={settings}
            commercials={commercials}
            onChange={patch => handleFabricChange(fabric.id, patch)}
            onRemove={() => handleRemoveFabric(fabric.id)}
            canRemove={(localRoom.fabrics || []).length > 1}
          />
        ))}
      </div>
      <div className="room-dims-grid" style={{ paddingTop: 0 }}>
        <Field label="Installation">
          <select className="select" value={localRoom.needInstallation ? "yes" : "no"} onChange={e => { const yes = e.target.value === 'yes'; handleSelectChange({ needInstallation: yes, installQtyFt: yes ? localRoom.installQtyFt : "" }); }}>
            <option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
        {localRoom.needInstallation && <Field label="Install Qty" hint="pcs"><UnitInput value={localRoom.installQtyFt} onChange={e => handleChange("installQtyFt", e.target.value)} onBlur={syncToParent} inputMode="decimal" placeholder="e.g. 45" unit="pcs" /></Field>}
      </div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Cloth</div><div className="stat-value">{currency(cost.clothCost)}</div></div>
        <div className="stat"><div className="stat-label">{(cost.fabricBreakdowns || []).some(f => f.isRomanBlind) ? 'Blind Stitch' : 'Stitch'}</div><div className="stat-value">{currency(cost.stitchingCost)}</div></div>
        <div className="stat"><div className="stat-label">Lining</div><div className="stat-value">{currency(cost.liningCost)}</div></div>
        <div className="stat"><div className="stat-label">Track</div><div className="stat-value">{currency(cost.trackCost)}</div></div>
        <div className="stat"><div className="stat-label">Install</div><div className="stat-value">{currency(cost.installationCost)}</div></div>
      </div>
      <div className="room-footer">
        <div className="pills">
          <Pill>{(cost.fabricBreakdowns || []).some(f => f.isRomanBlind) ? `${Number((cost.fabricBreakdowns || []).reduce((s, f) => s + Number(f.romanBlindSqFt || 0), 0)).toFixed(2)} sq ft` : `${Number(cost.panels).toFixed(2)} panels`}</Pill>
          <Pill>{cost.totalMeters.toFixed(1)} m total</Pill>
          <Pill>{cost.trackFeet} ft</Pill>
          <Pill>{(localRoom.fabrics || []).length} fabric{(localRoom.fabrics || []).length !== 1 ? 's' : ''}</Pill>
        </div>
        <div className="total-group">
          <div className="total-amount" style={{ opacity: localRoom.include !== false ? 1 : 0.45 }}>{currency(cost.subtotal)}</div>
        </div>
      </div>
    </div>
  );
});

/* =========================
   Order Processing Tab
   ========================= */
function OrderProcessingTab({ rooms, quoteMeta, quoteNo, currentQuoteStatus, allQuotes, onSaveOrderData, onProcessToFabricProcessing }) {
  const savedRecord = allQuotes?.[quoteNo];
  const isApproved = currentQuoteStatus === 'Approved' || savedRecord?.status === 'Approved';
  const defaultOrderItems = useMemo(() => {
    const items = [];
    rooms.filter(r => r.include !== false).forEach(room => {
      (room.fabrics || []).forEach(fab => {
        const fc = computeFabricCost(room, fab);
        let typeLabel = 'Curtain';
        if (fab.isWallpaper) typeLabel = 'Wallpaper';
        else if (fab.blindType) typeLabel = fab.blindType.charAt(0).toUpperCase() + fab.blindType.slice(1) + ' Blind';
        else if (fab.isRomanBlind) typeLabel = 'Roman Blind';
        let defaultQty = '';
        if (fab.isWallpaper) defaultQty = String(fc.rollQty || '');
        else if (fab.blindType) defaultQty = String(Number(fc.blindSqFt || 0).toFixed(2));
        else defaultQty = String(fc.metersOfCloth.toFixed(2));
        items.push({ id: `${room.id}__${fab.id}`, fabricLabel: fab.label || '', roomName: room.name || 'Room', fabricName: fab.materialName || '', supplier: '', metersToOrder: defaultQty, panels: String(Math.round(fc.panels) || ''), clothWidthInch: '', ratePerMeter: String(fab.materialPrice || ''), type: typeLabel, unit: fab.isWallpaper ? 'rolls' : fab.blindType ? 'sq ft' : 'm', notes: '' });
      });
    });
    return items;
  }, [rooms]);
  const [orderItems, setOrderItems] = useState(() => {
    const saved = savedRecord?.orderProcessing?.items;
    if (saved && saved.length) { const savedMap = Object.fromEntries(saved.map(i => [i.id, i])); return defaultOrderItems.map(di => savedMap[di.id] ? { ...di, ...savedMap[di.id] } : di); }
    return defaultOrderItems;
  });
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  useEffect(() => { setOrderItems(prev => { const prevMap = Object.fromEntries(prev.map(i => [i.id, i])); return defaultOrderItems.map(di => prevMap[di.id] ? { ...di, ...prevMap[di.id], type: di.type, unit: di.unit } : di); }); }, [defaultOrderItems]);
  const updateItem = (id, patch) => setOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  const addItem = () => setOrderItems(prev => [...prev, { id: crypto.randomUUID(), fabricLabel: 'Extra', roomName: '', fabricName: '', supplier: '', metersToOrder: '', panels: '', clothWidthInch: '', ratePerMeter: '', type: 'Curtain', unit: 'm', notes: '' }]);
  const removeItem = (id) => setOrderItems(prev => prev.filter(i => i.id !== id));
  const handleSave = () => { onSaveOrderData({ items: orderItems }); setSavedSuccessfully(true); };
  const handleProcessOrder = () => { onProcessToFabricProcessing(orderItems, quoteNo, quoteMeta.customerName || ''); };
  const totalOrderValue = orderItems.reduce((s, item) => s + (toNum(item.metersToOrder) * toNum(item.ratePerMeter)), 0);
  if (!isApproved) {
    return (
      <div className="box"><div className="box-header"><h3><Package size={15} style={{ marginRight: 4 }} /> Order Processing</h3></div>
        <div className="box-body"><div className="op-not-approved">
          <div className="op-not-approved-icon">🔒</div>
          <div className="op-not-approved-title">Quote Not Yet Approved</div>
          <div className="op-not-approved-sub">Order Processing is available only after a quote is <strong>Approved</strong>.<br /><br />Go to <strong>Saved Quotes</strong> and change the status of quote <strong>{quoteNo || '—'}</strong> to <strong>Approved</strong>, then return here.</div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}><StatusBadge status={currentQuoteStatus || savedRecord?.status || 'Draft'} /></div>
        </div></div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="op-banner"><div className="op-banner-icon">✅</div><div className="op-banner-text"><div className="op-banner-title">Quote Approved — Processing Order</div><div className="op-banner-sub">{quoteNo} · {quoteMeta.customerName || 'Customer'} · {quoteMeta.projectTitle || ''}</div></div></div>
      <Box title="Fabric & Material Orders">
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', marginBottom: 16 }}>Fill in the actual quantities, supplier names and rates for each fabric. Then save and click <strong>"Process Order → Fabric Processing"</strong> to send everything to the global Fabric Processing checklist.</div>
        <div className="op-order-items">
          {orderItems.map((item, idx) => (
            <div key={item.id} className="op-item-card">
              <div className="op-item-header">
                <span className="op-item-badge">{item.fabricLabel || `Item ${idx + 1}`}</span>
                <span className="op-item-room" style={{ marginLeft: 4 }}>{item.roomName || ''}</span>
                <span style={{ marginLeft: 8, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{item.type}</span>
                {toNum(item.metersToOrder) > 0 && toNum(item.ratePerMeter) > 0 && (<span className="op-item-cost">{currency(toNum(item.metersToOrder) * toNum(item.ratePerMeter))}</span>)}
                <button className="btn-remove-fabric" onClick={() => removeItem(item.id)} title="Remove item" style={{ marginLeft: 'auto' }}>×</button>
              </div>
              <div className="op-item-grid">
                <Field label="Fabric / Material Name"><input className="input" value={item.fabricName || ''} onChange={e => updateItem(item.id, { fabricName: e.target.value })} placeholder="e.g. Velvet Maroon" /></Field>
                <Field label="Supplier Name"><input className="input" value={item.supplier || ''} onChange={e => updateItem(item.id, { supplier: e.target.value })} placeholder="e.g. Arvind Mills" /></Field>
                <Field label={`Qty to Order (${item.unit})`}><UnitInput unit={item.unit} value={item.metersToOrder || ''} onChange={e => updateItem(item.id, { metersToOrder: e.target.value })} inputMode="decimal" placeholder={item.unit === 'm' ? 'e.g. 12' : item.unit === 'rolls' ? 'e.g. 3' : 'e.g. 15'} /></Field>
                {item.unit === 'm' && <Field label="Panels to Cut"><UnitInput unit="pcs" value={item.panels || ''} onChange={e => updateItem(item.id, { panels: e.target.value })} inputMode="decimal" placeholder="e.g. 4" /></Field>}
                {item.unit === 'm' && <Field label="Cloth Width" hint="inches"><UnitInput unit="in" value={item.clothWidthInch || ''} onChange={e => updateItem(item.id, { clothWidthInch: e.target.value })} inputMode="decimal" placeholder='e.g. 54"' /></Field>}
                <Field label={`Rate / ${item.unit}`}><UnitInput unit="Rs" value={item.ratePerMeter || ''} onChange={e => updateItem(item.id, { ratePerMeter: e.target.value })} inputMode="decimal" placeholder="e.g. 350" /></Field>
              </div>
              <div className="op-item-notes"><input className="input" value={item.notes || ''} onChange={e => updateItem(item.id, { notes: e.target.value })} placeholder="Notes / special instructions for this fabric..." style={{ fontSize: 12 }} /></div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={addItem}><Plus size={13} /> Add Item</button>
          {totalOrderValue > 0 && <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--primary)' }}>Total Purchase Value: {currency(totalOrderValue)}</div>}
        </div>
        {orderItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--primary)', borderBottom: '2px solid var(--border)', paddingBottom: 6, marginBottom: 10 }}>Order Summary</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="op-summary-table">
                <thead><tr><th>Room</th><th>Fabric / Material</th><th>Supplier</th><th>Type</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Panels</th><th style={{ textAlign: 'right' }}>Width (in)</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {orderItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700, fontSize: 12 }}>{item.roomName || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{item.fabricName || item.fabricLabel || '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{item.supplier || <span style={{ color: '#EF4444', fontWeight: 700 }}>Not set</span>}</td>
                      <td><span style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{item.type}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.metersToOrder || '—'} {item.unit}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.panels || '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.clothWidthInch ? `${item.clothWidthInch}"` : '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.ratePerMeter ? currency(toNum(item.ratePerMeter)) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{toNum(item.metersToOrder) > 0 && toNum(item.ratePerMeter) > 0 ? currency(toNum(item.metersToOrder) * toNum(item.ratePerMeter)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {totalOrderValue > 0 && (<tfoot><tr style={{ background: '#FFF5FA' }}><td colSpan={8} style={{ fontWeight: 900, padding: '10px 12px' }}>Total Purchase Value</td><td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--primary)', fontSize: 15, padding: '10px 12px' }}>{currency(totalOrderValue)}</td></tr></tfoot>)}
              </table>
            </div>
          </div>
        )}
      </Box>
      <div className="save-bottom-bar">
        <span className="save-bottom-label">Save order data first, then process to Fabric Processing.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleSave}><FileText size={15} /> Save Order Data</button>
          <button className="btn btn-primary" onClick={handleProcessOrder} style={{ background: '#059669', borderColor: '#059669' }}><Package size={15} /> Process Order → Fabric Processing</button>
        </div>
      </div>
      {savedSuccessfully && (<div className="process-order-cta"><div style={{ fontSize: 28 }}>🚀</div><div className="process-order-cta-text"><div className="process-order-cta-title">Order data saved! Ready to process.</div><div className="process-order-cta-sub">Click "Process Order → Fabric Processing" above to send all fabrics to the global Fabric Processing checklist.</div></div></div>)}
    </div>
  );
}

/* =========================
   Fabric Processing Tab
   ========================= */
function FabricProcessingTab({ globalFabricItems, onUpdateGlobalItems, onClearAll }) {
  const items = globalFabricItems;
  const setItems = onUpdateGlobalItems;
  const [manualFabric, setManualFabric] = useState({ roomName: "", fabricName: "", supplier: "", metersToOrder: "", unit: "m", receivedDate: "", supplierBillNo: "" });
  const [showManualFabricForm, setShowManualFabricForm] = useState(false);
  const orderedCount = items.filter(i => i.ordered).length;
  const receivedCount = items.filter(i => i.received).length;
  const total = items.length;
  const quoteGroups = useMemo(() => {
    const groups = {};
    items.forEach(item => { const key = item.quoteNo || 'Unknown'; if (!groups[key]) groups[key] = { quoteNo: key, customerName: item.customerName || '', items: [] }; groups[key].items.push(item); });
    return Object.values(groups);
  }, [items]);
  const toggle = useCallback((id, field) => { setItems(prev => prev.map(i => { if (i.id !== id) return i; const updated = { ...i, [field]: !i[field] }; if (field === 'received' && updated.received) updated.ordered = true; if (field === 'ordered' && !updated.ordered) updated.received = false; return updated; })); }, [setItems]);
  const updateItem = useCallback((id, patch) => { setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i)); }, [setItems]);
  const markAllOrdered = () => setItems(prev => prev.map(i => ({ ...i, ordered: true })));
  const markAllReceived = () => setItems(prev => prev.map(i => ({ ...i, ordered: true, received: true })));
  const resetAll = () => setItems(prev => prev.map(i => ({ ...i, ordered: false, received: false })));
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const saveFabricProcessingOnlineNow = useCallback(async () => { try { saveGlobalFabricProcessing(items); await saveRemoteFabricProcessing(items); alert(`Fabric Processing saved online — ${items.length} item${items.length !== 1 ? "s" : ""}`); } catch (err) { alert(err?.message ? `Online save failed: ${err.message}` : "Online save failed."); } }, [items]);
  const addManualFabric = useCallback(() => {
    const fabricName = String(manualFabric.fabricName || "").trim();
    if (!fabricName && !manualFabric.supplier && !manualFabric.metersToOrder) return;
    const newItem = { id: `manual-${crypto.randomUUID()}`, quoteNo: "Manual", customerName: "Manual Entry", roomName: manualFabric.roomName || "Manual", fabricName: fabricName || "Manual Fabric", materialName: fabricName || "Manual Fabric", supplier: manualFabric.supplier, metersToOrder: manualFabric.metersToOrder, unit: manualFabric.unit || "m", ordered: false, received: false, receivedDate: manualFabric.receivedDate || "", supplierBillNo: manualFabric.supplierBillNo || "", isManual: true, createdAt: new Date().toISOString() };
    setItems(prev => [newItem, ...prev]);
    setManualFabric({ roomName: "", fabricName: "", supplier: "", metersToOrder: "", unit: "m", receivedDate: "", supplierBillNo: "" });
    setShowManualFabricForm(false);
  }, [manualFabric, setItems]);
  const downloadFabricProcessingExcel = useCallback(() => {
    const rows = (items || []).map(item => ({ "Quote No": item.quoteNo || "", "Customer": item.customerName || "", "Room": item.roomName || "", "Material Name": item.fabricName || item.materialName || "", "Supplier": item.supplier || "", "Qty": item.metersToOrder || item.qty || "", "Unit": item.unit || "", "Ordered": item.ordered ? "Yes" : "No", "Received": item.received ? "Yes" : "No", "Received Date": item.receivedDate || "", "Supplier Bill No.": item.supplierBillNo || "", "Entry Type": item.isManual ? "Manual" : "Quote" }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const tableRows = rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8" /><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;}th{background:#B70766;color:#ffffff;font-weight:bold;border:1px solid #d8d8d8;padding:8px;text-align:left;}td{border:1px solid #d8d8d8;padding:8px;}tr:nth-child(even) td{background:#F5EBDD;}</style></head><body><table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `fabric-processing-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  }, [items]);

  const manualFabricForm = (
    <Box title="Fabric Processing Actions">
      {!showManualFabricForm ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" type="button" onClick={() => setShowManualFabricForm(true)}><Plus size={15} /> Add Fabric</button></div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--primary-dark)" }}>Add Fabric Manually</div>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowManualFabricForm(false)}>Cancel</button>
          </div>
          <div className="grid-3">
            <Field label="Room / Area"><input className="input" value={manualFabric.roomName} onChange={e => setManualFabric(prev => ({ ...prev, roomName: e.target.value }))} placeholder="e.g. Living Room" /></Field>
            <Field label="Material Name"><input className="input" value={manualFabric.fabricName} onChange={e => setManualFabric(prev => ({ ...prev, fabricName: e.target.value }))} placeholder="e.g. Blue Jacquard" /></Field>
            <Field label="Supplier"><input className="input" value={manualFabric.supplier} onChange={e => setManualFabric(prev => ({ ...prev, supplier: e.target.value }))} placeholder="Supplier name" /></Field>
            <Field label="Qty"><input className="input" value={manualFabric.metersToOrder} onChange={e => setManualFabric(prev => ({ ...prev, metersToOrder: e.target.value }))} placeholder="e.g. 12.5" inputMode="decimal" /></Field>
            <Field label="Unit"><select className="select" value={manualFabric.unit} onChange={e => setManualFabric(prev => ({ ...prev, unit: e.target.value }))}><option value="m">m</option><option value="rolls">rolls</option><option value="sq ft">sq ft</option><option value="pcs">pcs</option></select></Field>
            <Field label="Received Date"><input className="input" type="date" value={manualFabric.receivedDate} onChange={e => setManualFabric(prev => ({ ...prev, receivedDate: e.target.value }))} /></Field>
            <Field label="Supplier Bill No."><input className="input" value={manualFabric.supplierBillNo} onChange={e => setManualFabric(prev => ({ ...prev, supplierBillNo: e.target.value }))} placeholder="Bill no." /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={addManualFabric}><Plus size={15} /> Add Fabric</button></div>
        </>
      )}
    </Box>
  );

  if (!items.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {manualFabricForm}
        <Box title="Fabric Processing — Global">
          <div className="empty-box" style={{ padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary-dark)', marginBottom: 8 }}>No fabrics in processing yet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Go to an approved quote → <strong>Order Processing</strong> → fill in fabric details → click <strong>"Process Order → Fabric Processing"</strong> to populate this list, or add a fabric manually above.</div>
          </div>
        </Box>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {manualFabricForm}
      <div className="fp-kpi-grid">
        {[{ label: 'Total Fabrics', value: total, color: 'var(--primary)' }, { label: 'Quotes', value: quoteGroups.length, color: '#7C3AED' }, { label: 'Ordered', value: `${orderedCount} / ${total}`, color: '#1D4ED8' }, { label: 'Received', value: `${receivedCount} / ${total}`, color: '#059669' }].map(k => (
          <div key={k.label} className="fp-kpi"><div className="fp-kpi-label">{k.label}</div><div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div></div>
        ))}
      </div>
      <div className="fp-progress-card">
        {[{ label: 'Ordered', count: orderedCount, color: '#3B82F6' }, { label: 'Received', count: receivedCount, color: '#059669' }].map(bar => (
          <div key={bar.label} className="fp-progress-row">
            <div className="fp-progress-meta"><span>{bar.label}</span><span>{total > 0 ? Math.round((bar.count / total) * 100) : 0}%</span></div>
            <div className="fp-progress-bar-bg"><div className="fp-progress-bar-fill" style={{ width: `${total > 0 ? (bar.count / total) * 100 : 0}%`, background: bar.color }} /></div>
          </div>
        ))}
      </div>
      <div className="fp-bulk-actions">
        <button className="btn btn-outline btn-sm" onClick={markAllOrdered}>✓ Mark All Ordered</button>
        <button className="btn btn-outline btn-sm" style={{ borderColor: '#059669', color: '#059669' }} onClick={markAllReceived}>✓ Mark All Received</button>
        <button className="btn btn-outline btn-sm" style={{ borderColor: '#9CA3AF', color: '#6B7280' }} onClick={resetAll}>↺ Reset Checkboxes</button>
        <button className="btn btn-outline btn-sm" type="button" onClick={downloadFabricProcessingExcel}><Download size={13} /> Download Excel</button>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveFabricProcessingOnlineNow}>Save Online</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { if (window.confirm('Clear ALL fabric processing items? This cannot be undone.')) onClearAll(); }}><Trash2 size={13} /> Clear All</button>
      </div>
      {quoteGroups.map(group => (
        <Box key={group.quoteNo} title={`${group.quoteNo}${group.customerName ? ` — ${group.customerName}` : ''}`}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fp-checklist-table">
              <thead><tr><th>Room</th><th>Material Name</th><th>Supplier</th><th className="center">Qty</th><th className="center">Ordered</th><th className="center">Received</th><th>Received Date</th><th>Supplier Bill No.</th><th className="center">Remove</th></tr></thead>
              <tbody>
                {group.items.map((item, idx) => {
                  let rowBg = idx % 2 === 0 ? 'white' : '#FAFAFA';
                  if (item.received) rowBg = '#F0FDF4'; else if (item.ordered) rowBg = '#EFF6FF';
                  return (
                    <tr key={item.id}>
                      <td style={{ background: rowBg, fontWeight: 700 }}>{item.roomName || '—'}</td>
                      <td style={{ background: rowBg, fontWeight: item.fabricName ? 700 : 400, color: item.fabricName ? 'var(--text)' : 'var(--muted)', fontStyle: item.fabricName ? 'normal' : 'italic' }}>{item.fabricName || item.materialName || 'Not named'}</td>
                      <td style={{ background: rowBg, color: item.supplier ? 'var(--text)' : '#EF4444', fontWeight: item.supplier ? 600 : 700, fontStyle: item.supplier ? 'normal' : 'italic' }}>{item.supplier || 'Not set'}</td>
                      <td style={{ background: rowBg, textAlign: 'center', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{item.metersToOrder || item.qty || '—'} {item.unit || ''}</td>
                      <td style={{ background: rowBg, textAlign: 'center' }}><label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><input type="checkbox" checked={!!item.ordered} onChange={() => toggle(item.id, 'ordered')} style={{ width: 18, height: 18, accentColor: '#3B82F6', cursor: 'pointer' }} /></label></td>
                      <td style={{ background: rowBg, textAlign: 'center' }}><label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><input type="checkbox" checked={!!item.received} onChange={() => toggle(item.id, 'received')} style={{ width: 18, height: 18, accentColor: '#059669', cursor: 'pointer' }} /></label></td>
                      <td style={{ background: rowBg }}><input className="input" type="date" value={item.receivedDate || ""} onChange={e => updateItem(item.id, { receivedDate: e.target.value })} style={{ minWidth: 140 }} /></td>
                      <td style={{ background: rowBg }}><input className="input" value={item.supplierBillNo || ""} onChange={e => updateItem(item.id, { supplierBillNo: e.target.value })} placeholder="Bill no." style={{ minWidth: 140 }} /></td>
                      <td style={{ background: rowBg, textAlign: 'center' }}><button className="btn-remove-fabric" onClick={() => removeItem(item.id)} title="Remove from processing">×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>
            <span>{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
            <span>{group.items.filter(i => i.ordered).length} ordered</span>
            <span>{group.items.filter(i => i.received).length} received</span>
          </div>
        </Box>
      ))}
      <div className="fp-legend" style={{ padding: '0 4px' }}>
        <span className="fp-legend-item"><span className="fp-legend-swatch" style={{ background: '#EFF6FF', borderColor: '#BFDBFE' }} /> Ordered</span>
        <span className="fp-legend-item"><span className="fp-legend-swatch" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }} /> Received</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Checking "Received" auto-checks "Ordered". Data is saved automatically.</span>
      </div>
    </div>
  );
}

/* =========================
   Payments Tab
   ========================= */
function PaymentsTab({ allQuotes, paymentsStore, setPaymentsStore, settings }) {
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "UPI", date: new Date().toISOString().slice(0, 10), note: "" });
  const customerGroups = useMemo(() => {
    const map = {};
    Object.values(allQuotes || {}).forEach(quote => {
      const customerName = getQuoteCustomerName(quote);
      if (!map[customerName]) map[customerName] = { customerName, quotes: [], totalValue: 0 };
      const value = getQuoteFinalTotal(quote);
      map[customerName].quotes.push({ quoteNo: quote.quoteNo || quote.quote_no || "Unknown", status: quote.status || quote.quoteStatus || "Draft", value, date: quote.updatedAt || quote.createdAt || "" });
      map[customerName].totalValue += value;
    });
    return Object.values(map).sort((a, b) => b.totalValue - a.totalValue || a.customerName.localeCompare(b.customerName));
  }, [allQuotes]);
  useEffect(() => { if (!selectedCustomer && customerGroups.length) setSelectedCustomer(customerGroups[0].customerName); }, [customerGroups, selectedCustomer]);
  const selectedGroup = customerGroups.find(group => group.customerName === selectedCustomer) || customerGroups[0];
  const customerKey = selectedGroup?.customerName || "";
  const payments = Array.isArray(paymentsStore?.[customerKey]) ? paymentsStore[customerKey] : [];
  const totalValue = selectedGroup?.totalValue || 0;
  const totalReceived = payments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const balance = Math.max(0, totalValue - totalReceived);
  const addPayment = useCallback(() => {
    if (!customerKey) return;
    const amount = toNum(paymentForm.amount);
    if (amount <= 0) { alert("Enter a payment amount first."); return; }
    const payment = { id: crypto.randomUUID(), amount, mode: paymentForm.mode || "UPI", date: paymentForm.date || new Date().toISOString().slice(0, 10), note: paymentForm.note || "", createdAt: new Date().toISOString() };
    setPaymentsStore(prev => ({ ...(prev || {}), [customerKey]: [payment, ...(Array.isArray(prev?.[customerKey]) ? prev[customerKey] : [])] }));
    setPaymentForm({ amount: "", mode: "UPI", date: new Date().toISOString().slice(0, 10), note: "" });
  }, [customerKey, paymentForm, setPaymentsStore]);
  const removePayment = useCallback((paymentId) => {
    if (!customerKey) return;
    setPaymentsStore(prev => ({ ...(prev || {}), [customerKey]: (Array.isArray(prev?.[customerKey]) ? prev[customerKey] : []).filter(payment => payment.id !== paymentId) }));
  }, [customerKey, setPaymentsStore]);
  if (!customerGroups.length) return <Box title="Payments"><div className="empty-box">No saved quotes yet. Save quotes first, then customer-wise payments will appear here.</div></Box>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Box title="Payments — Customer Wise">
        <div className="grid-3">
          <Field label="Customer / Name">
            <select className="select" value={customerKey} onChange={e => setSelectedCustomer(e.target.value)}>
              {customerGroups.map(group => <option key={group.customerName} value={group.customerName}>{group.customerName}</option>)}
            </select>
          </Field>
          <div className="op-fin-card quote"><div className="op-fin-label">Total Quote Value</div><div className="op-fin-value">{currency(totalValue)}</div><div className="op-fin-sub">Across {selectedGroup?.quotes.length || 0} quote{(selectedGroup?.quotes.length || 0) !== 1 ? "s" : ""}</div></div>
          <div className={`op-fin-card balance ${balance <= 0 ? "settled" : ""}`}><div className="op-fin-label">Balance Due</div><div className="op-fin-value">{currency(balance)}</div><div className="op-fin-sub">Received: {currency(totalReceived)}</div></div>
        </div>
      </Box>
      <Box title="Quotes Included">
        <div style={{ overflowX: "auto" }}>
          <table className="history-table">
            <thead><tr><th>Quote No</th><th>Status</th><th>Date</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
            <tbody>
              {(selectedGroup?.quotes || []).map(quote => (
                <tr key={quote.quoteNo}>
                  <td className="history-row-no">{quote.quoteNo}</td>
                  <td><StatusBadge status={quote.status} /></td>
                  <td className="history-row-date">{quote.date ? new Date(quote.date).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="history-row-total" style={{ textAlign: "right" }}>{currency(quote.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(selectedGroup?.quotes || []).length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={async () => {
                try {
                  const quoteRecords = (selectedGroup?.quotes || []).map(q => allQuotes[q.quoteNo]).filter(Boolean);
                  if (quoteRecords.length < 2) { alert("Need at least 2 saved quotes."); return; }
                  const doc = await generateCombinedPDF(quoteRecords, settings);
                  doc.save(`Combined_${customerKey}_${new Date().toISOString().slice(0,10)}.pdf`);
                } catch (err) { console.error(err); alert("Could not generate combined PDF."); }
              }}><Download size={14} /> Combined PDF (All Quotes)</button>
            </div>
          )}
        </div>
      </Box>
      <Box title="Add Payment Received">
        <div className="grid-3">
          <Field label="Amount Received"><input className="input" value={paymentForm.amount} onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="e.g. 10000" inputMode="decimal" /></Field>
          <Field label="Payment Type"><select className="select" value={paymentForm.mode} onChange={e => setPaymentForm(prev => ({ ...prev, mode: e.target.value }))}><option value="UPI">UPI</option><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="Card">Card</option><option value="Cheque">Cheque</option><option value="Other">Other</option></select></Field>
          <Field label="Payment Date"><input className="input" type="date" value={paymentForm.date} onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))} /></Field>
          <Field label="Note / Reference"><input className="input" value={paymentForm.note} onChange={e => setPaymentForm(prev => ({ ...prev, note: e.target.value }))} placeholder="Txn ID, cheque no., remarks" /></Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={addPayment}>+ Add Payment</button></div>
      </Box>
      <Box title="Payment History">
        {!payments.length ? <div className="empty-box">No payments received for this customer yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="history-table">
              <thead><tr><th>Date</th><th>Type</th><th>Note</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "center" }}>Remove</th></tr></thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td className="history-row-date">{payment.date ? new Date(payment.date).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="history-row-customer">{payment.mode || "—"}</td>
                    <td>{payment.note || "—"}</td>
                    <td className="history-row-total" style={{ textAlign: "right" }}>{currency(payment.amount)}</td>
                    <td style={{ textAlign: "center" }}><button className="btn-remove-fabric" type="button" onClick={() => removePayment(payment.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </div>
  );
}

/* =========================
   Dashboard Tab
   ========================= */
function DashboardTab({ allQuotes }) {
  const canvasRefs = { monthly: useRef(null), status: useRef(null), topCustomers: useRef(null), roomDist: useRef(null) };
  const chartInstances = useRef({});
  const stats = useMemo(() => {
    const quotes = Object.values(allQuotes || {});
    const approved = quotes.filter(q => q.status === 'Approved');
    const totalRevenue = approved.reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0);
    const avgQuote = quotes.length ? quotes.reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0) / quotes.length : 0;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisMonthQuotes = quotes.filter(q => (q.updatedAt || '').slice(0, 7) === thisMonth);
    return { total: quotes.length, approved: approved.length, totalRevenue, avgQuote, thisMonthQuotes: thisMonthQuotes.length };
  }, [allQuotes]);
  const chartData = useMemo(() => {
    const quotes = Object.values(allQuotes || {});
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    const monthlyRevenue = months.map(m => ({ label: new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), value: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0), count: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).length }));
    const statusCounts = QUOTE_STATUSES.reduce((acc, s) => { acc[s] = quotes.filter(q => (q.status || 'Draft') === s).length; return acc; }, {});
    const custMap = {};
    quotes.forEach(q => { const name = q.customer?.name || 'Unknown'; if (!custMap[name]) custMap[name] = 0; custMap[name] += q.snapshot?.summary?.finalTotal || 0; });
    const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const roomCounts = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    quotes.forEach(q => { const n = q.rooms?.length || 0; if (n <= 4) roomCounts[String(n)] = (roomCounts[String(n)] || 0) + 1; else roomCounts['5+'] = (roomCounts['5+'] || 0) + 1; });
    return { monthlyRevenue, statusCounts, topCustomers, roomCounts };
  }, [allQuotes]);
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload = () => renderCharts();
    document.head.appendChild(script);
    return () => { Object.values(chartInstances.current).forEach(c => { try { c.destroy(); } catch(e) {} }); chartInstances.current = {}; };
  }, []);
  useEffect(() => { if (window.Chart) renderCharts(); }, [chartData]);
  function renderCharts() {
    if (!window.Chart) return;
    const pink = '#E5097F', pinkLight = 'rgba(229,9,127,0.15)';
    const statusColors = { Draft: '#6B7280', Sent: '#3B82F6', Approved: '#10B981', Rejected: '#EF4444', Cancelled: '#F59E0B' };
    const makeChart = (key, config) => { if (chartInstances.current[key]) { try { chartInstances.current[key].destroy(); } catch(e) {} } const canvas = canvasRefs[key]?.current; if (!canvas) return; chartInstances.current[key] = new window.Chart(canvas, config); };
    makeChart('monthly', { type: 'bar', data: { labels: chartData.monthlyRevenue.map(m => m.label), datasets: [{ label: 'Revenue (Rs)', data: chartData.monthlyRevenue.map(m => m.value), backgroundColor: pinkLight, borderColor: pink, borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => 'Rs.' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) } } } } });
    makeChart('status', { type: 'doughnut', data: { labels: QUOTE_STATUSES, datasets: [{ data: QUOTE_STATUSES.map(s => chartData.statusCounts[s] || 0), backgroundColor: QUOTE_STATUSES.map(s => statusColors[s]), borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } } });
    makeChart('topCustomers', { type: 'bar', data: { labels: chartData.topCustomers.map(([name]) => name.length > 14 ? name.slice(0, 12) + '…' : name), datasets: [{ label: 'Total (Rs)', data: chartData.topCustomers.map(([, val]) => val), backgroundColor: pink, borderRadius: 6 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => 'Rs.' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) } } } } });
    makeChart('roomDist', { type: 'bar', data: { labels: Object.keys(chartData.roomCounts).map(k => `${k} room${k === '1' ? '' : 's'}`), datasets: [{ label: 'Quotes', data: Object.values(chartData.roomCounts), backgroundColor: ['#3B82F6','#10B981','#F59E0B',pink,'#8B5CF6'], borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 1 } } } } });
  }
  const noData = !allQuotes || Object.keys(allQuotes).length === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="dash-kpi-grid">
        <div className="dash-kpi"><div className="dash-kpi-label">Total Quotes</div><div className="dash-kpi-value">{stats.total}</div></div>
        <div className="dash-kpi"><div className="dash-kpi-label">Approved</div><div className="dash-kpi-value" style={{ color: '#059669' }}>{stats.approved}</div></div>
        <div className="dash-kpi"><div className="dash-kpi-label">Approved Revenue</div><div className="dash-kpi-value">{currency(stats.totalRevenue)}</div></div>
        <div className="dash-kpi"><div className="dash-kpi-label">Avg Quote Value</div><div className="dash-kpi-value">{currency(stats.avgQuote)}</div><div className="dash-kpi-sub">across all quotes</div></div>
      </div>
      {noData ? <div className="empty-box">No saved quotes yet. Save some quotes to see your dashboard.</div> : (
        <>
          <div className="dash-charts-grid">
            <div className="dash-chart-card"><div className="dash-chart-title">Monthly Revenue (last 6 months)</div><canvas ref={canvasRefs.monthly} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Quote Status Distribution</div><canvas ref={canvasRefs.status} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Top Customers by Quote Value</div><canvas ref={canvasRefs.topCustomers} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Quotes by Room Count</div><canvas ref={canvasRefs.roomDist} height="200"></canvas></div>
          </div>
          <div className="box">
            <div className="box-header"><h3>Recent Activity</h3></div>
            <div className="box-body">
              <table className="history-table">
                <thead><tr><th>Quote No</th><th>Customer</th><th>Status</th><th>Value</th><th>Date</th></tr></thead>
                <tbody>
                  {Object.values(allQuotes || {}).slice(0, 8).map(rec => (
                    <tr key={rec.quoteNo}>
                      <td className="history-row-no">{rec.quoteNo}</td>
                      <td className="history-row-customer">{rec.customer?.name || '—'}</td>
                      <td><StatusBadge status={rec.status || 'Draft'} /></td>
                      <td className="history-row-total">{rec.snapshot?.summary?.finalTotal != null ? currency(rec.snapshot.summary.finalTotal) : '—'}</td>
                      <td className="history-row-date">{rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* =========================
   Main App
   ========================= */
export default function CurtainQuotationApp() {
  const [authUser, setAuthUser] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_AUTH_USER_KEY) || "null"); } catch { return null; } });
  const [settings, setSettings] = useState(loadSettings);
  const [settingsReady, setSettingsReady] = useState(!hasSupabaseConfig());
  const [paymentsStore, setPaymentsStoreRaw] = useState(() => loadPaymentsStore());

  useEffect(() => {
    let cancelled = false;
    async function hydratePaymentsStore() {
      if (!hasSupabaseConfig()) return;
      try {
        const remotePayments = await loadRemotePaymentsStore();
        if (cancelled) return;
        if (remotePayments && typeof remotePayments === "object") { setPaymentsStoreRaw(remotePayments); savePaymentsStore(remotePayments); }
        else { const localPayments = loadPaymentsStore(); await saveRemotePaymentsStore(localPayments); }
      } catch (err) { console.error("Could not load payments online", err); }
    }
    hydratePaymentsStore();
    return () => { cancelled = true; };
  }, []);

  const setPaymentsStore = useCallback((updater) => {
    setPaymentsStoreRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      savePaymentsStore(next);
      if (hasSupabaseConfig()) saveRemotePaymentsStore(next).catch(err => console.error("Could not save payments online", err));
      return next;
    });
  }, []);

  const logout = useCallback(() => { localStorage.removeItem(LS_AUTH_USER_KEY); setAuthUser(null); }, []);
  const settingsHydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function hydrateSettings() {
      if (!hasSupabaseConfig()) { settingsHydratedRef.current = true; setSettingsReady(true); return; }
      try {
        const remoteSettings = await loadRemoteSettings();
        if (cancelled) return;
        if (remoteSettings) { const merged = mergeSettingsWithDefaults(remoteSettings); setSettings(merged); localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); }
        else await saveRemoteSettings(settings);
      } catch (err) { console.error("Could not load shared settings", err); }
      finally { if (!cancelled) { settingsHydratedRef.current = true; setSettingsReady(true); } }
    }
    hydrateSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (!settingsHydratedRef.current || !hasSupabaseConfig()) return;
    const timer = setTimeout(() => { saveRemoteSettings(settings).catch(err => console.error(err)); }, 500);
    return () => clearTimeout(timer);
  }, [settings]);

  const [rooms, setRooms] = useState(() => [BlankRoom(1, loadSettings())]);
  const [miscellaneousCosts, setMiscellaneousCosts] = useState([]);
  const [quoteNo, setQuoteNo] = useState("");
  const [loadedBanner, setLoadedBanner] = useState("");
  const [currentQuoteStatus, setCurrentQuoteStatus] = useState("Draft");
  const [quoteMeta, setQuoteMeta] = useState({
    customerName: "", customerPhone: "", projectTitle: "Curtain Quotation",
    company: { name: BRAND.companyName, pdfCompanyName: BRAND.pdfCompanyName, address: BRAND.address, phone: BRAND.phone, email: BRAND.email, logoUrl: BRAND.logoUrl, website: BRAND.website, gstin: BRAND.gstin, paymentQrUrl: BRAND.paymentQrUrl, paymentUpiId: BRAND.paymentUpiId },
    currency: "INR",
    notes: "Prices are exclusive of taxes. Valid for 7 days.",
    commercials: { applyGst: false, gstRate: 0, discountType: "percent", discountValue: 0, place: "Pune", signatoryName: "Authorized Signatory", signatoryTitle: "", signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL), needGstBill: false, gstin: "", billingAddress: "" },
  });

  const [globalFabricItems, setGlobalFabricItemsRaw] = useState(() => loadGlobalFabricProcessing());
  const fabricProcessingHydratedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function hydrateFabricProcessing() {
      if (!hasSupabaseConfig()) { fabricProcessingHydratedRef.current = true; return; }
      try {
        const remoteItems = await loadRemoteFabricProcessing();
        if (cancelled) return;
        if (Array.isArray(remoteItems)) { setGlobalFabricItemsRaw(remoteItems); saveGlobalFabricProcessing(remoteItems); }
        else { const localItems = loadGlobalFabricProcessing(); await saveRemoteFabricProcessing(localItems); }
      } catch (err) { console.error('Could not load fabric processing online', err); }
      finally { if (!cancelled) fabricProcessingHydratedRef.current = true; }
    }
    hydrateFabricProcessing();
    return () => { cancelled = true; };
  }, []);

  const setGlobalFabricItems = useCallback((updater) => {
    setGlobalFabricItemsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveGlobalFabricProcessing(next);
      if (hasSupabaseConfig()) saveRemoteFabricProcessing(next).catch(err => console.error("Could not save fabric processing online", err));
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    generateQuoteNo().then(no => { if (!cancelled) setQuoteNo(no); }).catch(err => { console.error(err); });
    return () => { cancelled = true; };
  }, []);

  const [activeTab, setActiveTab] = useState('quote');
  useEffect(() => { if (!authUser) return; if (!canAccessTab(authUser, activeTab)) setActiveTab('quote'); }, [authUser, activeTab]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("All");
  const [allQuotes, setAllQuotes] = useState({});
  const metaRef = useRef(quoteMeta);
  useEffect(() => { metaRef.current = quoteMeta; }, [quoteMeta]);
  const quoteNoRef = useRef(quoteNo);
  useEffect(() => { quoteNoRef.current = quoteNo; }, [quoteNo]);

  const refreshQuoteList = useCallback(async () => { try { const map = await loadAllQuotes(); setAllQuotes(map || {}); } catch (err) { console.error(err); } }, []);
  useEffect(() => { refreshQuoteList(); }, [refreshQuoteList]);
  const allQuotesArr = useMemo(() => { const arr = Object.values(allQuotes || {}); arr.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)); return arr; }, [allQuotes]);

  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'global-curtain-css';
    styleEl.textContent = GLOBAL_CSS;
    document.head.appendChild(styleEl);
    return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); };
  }, []);

  const filteredQuotes = useMemo(() => {
    let arr = allQuotesArr;
    if (historyStatusFilter !== 'All') arr = arr.filter(rec => (rec.status || 'Draft') === historyStatusFilter);
    if (historySearch.trim()) { const q = historySearch.trim().toLowerCase(); arr = arr.filter(rec => String(rec.quoteNo || '').toLowerCase().includes(q) || String(rec.customer?.name || '').toLowerCase().includes(q)); }
    return arr;
  }, [allQuotesArr, historySearch, historyStatusFilter]);

  const loadQuoteRecord = useCallback((rec) => {
    if (!rec) return;
    setQuoteNo(rec.quoteNo);
    setCurrentQuoteStatus(rec.status || 'Draft');
    const migratedRooms = (rec.rooms && rec.rooms.length ? rec.rooms : [BlankRoom(1, settings)]).map(r => {
      if (r.fabrics && r.fabrics.length) return r;
      return { ...r, fabrics: [BlankFabric(settings, "Main", { materialName: r.materialName || "", materialPrice: r.materialPrice || "", clothMeters: r.clothMeters || "", stitching: r.stitching || settings.stitchingTypes[0], lining: r.lining || settings.linings[0] })] };
    });
    setRooms(migratedRooms);
    setMiscellaneousCosts(Array.isArray(rec.miscellaneousCosts) ? rec.miscellaneousCosts : []);
    setQuoteMeta(prev => ({ ...prev, customerName: rec.customer?.name || '', customerPhone: rec.customer?.phone || '', projectTitle: rec.customer?.project || 'Curtain Quotation', company: rec.company ? { ...prev.company, ...rec.company } : prev.company, commercials: { ...prev.commercials, ...(rec.commercials || {}), signatoryTitle: rec.commercials?.signatoryTitle === 'For Themes Furnishings and Linens' ? '' : (rec.commercials?.signatoryTitle || '') } }));
    setLoadedBanner(`Loaded ${rec.quoteNo}${rec.customer?.name ? ` — ${rec.customer.name}` : ''}`);
    setActiveTab('quote');
    setTimeout(() => setLoadedBanner(''), 4000);
  }, [settings]);

  const handleUpdateQuoteStatus = useCallback(async (quoteNo, newStatus) => {
    try {
      const map = await loadAllQuotes();
      if (map[quoteNo]) {
        map[quoteNo] = { ...map[quoteNo], status: newStatus, updatedAt: new Date().toISOString() };
        if (hasSupabaseConfig()) await saveQuoteRecord(quoteNo, map[quoteNo]); else await saveAllQuotes(map);
        await refreshQuoteList();
        if (quoteNo === quoteNoRef.current) setCurrentQuoteStatus(newStatus);
      }
    } catch (err) { console.error(err); }
  }, [refreshQuoteList]);

  const handleSaveQuote = useCallback(async () => {
    try {
      const allTotals = computeAllTotals(rooms, quoteMeta.commercials, settings, miscellaneousCosts);
      const finalNo = quoteNo || await generateQuoteNo();
      setQuoteNo(finalNo);
      const existingRec = allQuotes[finalNo];
      await saveQuoteRecord(finalNo, { customer: { name: quoteMeta.customerName, phone: quoteMeta.customerPhone, project: quoteMeta.projectTitle }, company: quoteMeta.company, commercials: quoteMeta.commercials, rooms, miscellaneousCosts, settingsSnapshot: settings, snapshot: allTotals, status: existingRec?.status || currentQuoteStatus || 'Draft', orderProcessing: existingRec?.orderProcessing || null, createdAt: existingRec?.createdAt || new Date().toISOString() });
      await refreshQuoteList();
      setLoadedBanner(`Saved as ${finalNo}${hasSupabaseConfig() ? " online" : " on this browser"}`);
      setTimeout(() => setLoadedBanner(''), 3000);
    } catch (err) { console.error(err); setLoadedBanner("Could not save quote."); }
  }, [quoteNo, rooms, miscellaneousCosts, quoteMeta, settings, allQuotes, currentQuoteStatus, refreshQuoteList]);

  const handleSaveOrderData = useCallback(async (orderProcessingData) => {
    try {
      const finalNo = quoteNo || await generateQuoteNo();
      const existingRec = allQuotes[finalNo];
      if (!existingRec) { alert("Please save the quote first before saving order data."); return; }
      await saveQuoteRecord(finalNo, { ...existingRec, orderProcessing: orderProcessingData, updatedAt: new Date().toISOString() });
      await refreshQuoteList();
      setLoadedBanner("Order data saved!");
      setTimeout(() => setLoadedBanner(''), 3000);
    } catch (err) { console.error(err); alert("Could not save order data."); }
  }, [quoteNo, allQuotes, refreshQuoteList]);

  const handleProcessToFabricProcessing = useCallback((orderItems, srcQuoteNo, customerName) => {
    const newItems = orderItems.map(item => ({ id: `${srcQuoteNo}__${item.id}`, quoteNo: srcQuoteNo, customerName, roomName: item.roomName || '', fabricLabel: item.fabricLabel || '', fabricName: item.fabricName || '', supplier: item.supplier || '', metersToOrder: item.metersToOrder || '', panels: item.panels || '', clothWidthInch: item.clothWidthInch || '', ratePerMeter: item.ratePerMeter || '', type: item.type || 'Curtain', unit: item.unit || 'm', notes: item.notes || '', ordered: false, received: false, receivedDate: "", supplierBillNo: "" }));
    setGlobalFabricItems(prev => {
      const existingForThisQuote = Object.fromEntries(prev.filter(i => i.quoteNo === srcQuoteNo).map(i => [i.id, i]));
      const otherItems = prev.filter(i => i.quoteNo !== srcQuoteNo);
      const merged = newItems.map(ni => ({ ...ni, ordered: existingForThisQuote[ni.id]?.ordered ?? false, received: existingForThisQuote[ni.id]?.received ?? false, receivedDate: existingForThisQuote[ni.id]?.receivedDate || ni.receivedDate || "", supplierBillNo: existingForThisQuote[ni.id]?.supplierBillNo || ni.supplierBillNo || "" }));
      return [...otherItems, ...merged];
    });
    setLoadedBanner(`✅ ${newItems.length} fabric${newItems.length !== 1 ? 's' : ''} sent to Fabric Processing!`);
    setTimeout(() => setLoadedBanner(''), 4000);
    setActiveTab('fabric-processing');
  }, [setGlobalFabricItems]);

  const handleClearAllFabricProcessing = useCallback(() => { setGlobalFabricItems([]); }, [setGlobalFabricItems]);

  const handleNewQuote = useCallback(async () => {
    const newNo = await generateQuoteNo();
    setQuoteNo(newNo); setCurrentQuoteStatus('Draft'); setRooms([BlankRoom(1, settings)]); setMiscellaneousCosts([]); setHistorySearch("");
    setQuoteMeta({ customerName: "", customerPhone: "", projectTitle: "Curtain Quotation", company: { name: BRAND.companyName, pdfCompanyName: BRAND.pdfCompanyName, address: BRAND.address, phone: BRAND.phone, email: BRAND.email, logoUrl: BRAND.logoUrl, website: BRAND.website, gstin: BRAND.gstin, paymentQrUrl: BRAND.paymentQrUrl, paymentUpiId: BRAND.paymentUpiId }, currency: "INR", notes: "Prices are exclusive of taxes. Valid for 7 days.", commercials: { applyGst: false, gstRate: 0, discountType: "percent", discountValue: 0, place: "Pune", signatoryName: "Authorized Signatory", signatoryTitle: "", signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL), needGstBill: false, gstin: "", billingAddress: "" } });
    setLoadedBanner(`Started new quote ${newNo}`); setActiveTab("quote"); setTimeout(() => setLoadedBanner(""), 3000);
  }, [settings]);

  const handleDeleteQuote = useCallback(async (no) => {
    if (!window.confirm(`Delete quote ${no}?`)) return;
    try { await deleteQuoteRecord(no); await refreshQuoteList(); if (quoteNo === no) { setQuoteNo(await generateQuoteNo()); setCurrentQuoteStatus('Draft'); setRooms([BlankRoom(1, settings)]); setMiscellaneousCosts([]); } } catch (err) { console.error(err); }
  }, [quoteNo, settings, refreshQuoteList]);

  const updateRoom = useCallback((id, patch) => { setRooms(prev => { let changed = false; const next = prev.map(r => { if (r.id !== id) return r; const merged = { ...r, ...patch }; if (JSON.stringify(merged) !== JSON.stringify(r)) changed = true; return merged; }); return changed ? next : prev; }); }, []);
  const addRoomAfter = useCallback((afterIndex = -1) => { setRooms(prev => { const newRoom = BlankRoom(prev.length + 1, settings); if (afterIndex < 0 || afterIndex >= prev.length - 1) return [...prev, newRoom]; const next = [...prev]; next.splice(afterIndex + 1, 0, newRoom); return next; }); }, [settings]);
  const addRoom = useCallback(() => addRoomAfter(-1), [addRoomAfter]);
  const cloneRoom = useCallback((id) => { setRooms(prev => { const r = prev.find(x => x.id === id); if (!r) return prev; return [...prev, { ...r, id: crypto.randomUUID(), name: `${r.name} (Copy)` }]; }); }, []);
  const deleteRoom = useCallback((id) => setRooms(prev => prev.filter(r => r.id !== id)), []);

  const roomsIncluded = useMemo(() => rooms.filter(r => r.include !== false), [rooms]);

  // ── NEW: use computeAllTotals for everything (includes per-category GST) ──
  const allTotalsLive = useMemo(() => computeAllTotals(rooms, quoteMeta.commercials, settings, miscellaneousCosts), [rooms, quoteMeta.commercials, settings, miscellaneousCosts]);
  const { summary: liveSummary, gstBreakdown: liveGstBreakdown } = allTotalsLive;

  // Keep legacy computed vars for UI
  const grandTotal = liveSummary.base;
  const totalClothCost = liveSummary.clothTotal;
  const totalOther = liveSummary.otherTotal;
  const miscTotal = liveSummary.miscTotal;
  const finalTotals = {
    discountAmount: liveSummary.discountAmount,
    afterDiscount: liveSummary.afterDiscount,
    gstAmount: liveSummary.gstAmount,
    roundOff: liveSummary.roundOff,
    finalTotal: liveSummary.finalTotal,
  };

  const handleAddMiscCost = useCallback(
  () => setMiscellaneousCosts(prev => [...prev, BlankMiscCost(settings)]),
  [settings]
);
  const handleMiscCostChange = useCallback((id, patch) => setMiscellaneousCosts(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item)), []);
  const handleDeleteMiscCost = useCallback((id) => setMiscellaneousCosts(prev => prev.filter(item => item.id !== id)), []);

  // Settings handlers
  const handleAddStitch = useCallback(() => setSettings(s => ({ ...s, stitchingTypes: [...(s.stitchingTypes || []), { id: crypto.randomUUID(), label: "New Stitch", ratePerPanel: 0 }] })), []);
  const handleStitchChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.stitchingTypes || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, stitchingTypes: arr }; }), []);
  const handleDeleteStitch = useCallback((idx) => setSettings(s => { const arr = [...(s.stitchingTypes || [])]; arr.splice(idx, 1); return { ...s, stitchingTypes: arr }; }), []);
  const handleAddLining = useCallback(() => setSettings(s => ({ ...s, linings: [...(s.linings || []), { id: crypto.randomUUID(), label: "New Lining", ratePerMeter: 0 }] })), []);
  const handleLiningChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.linings || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, linings: arr }; }), []);
  const handleDeleteLining = useCallback((idx) => setSettings(s => { const arr = [...(s.linings || [])]; arr.splice(idx, 1); return { ...s, linings: arr }; }), []);
  const handleAddTrack = useCallback(() => setSettings(s => ({ ...s, tracks: [...(s.tracks || []), { id: crypto.randomUUID(), label: "New Track", ratePerFt: 0 }] })), []);
  const handleTrackChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.tracks || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, tracks: arr }; }), []);
  const handleDeleteTrack = useCallback((idx) => setSettings(s => { const arr = [...(s.tracks || [])]; arr.splice(idx, 1); return { ...s, tracks: arr }; }), []);
  // ── NEW: GST category settings handlers ──
  const handleAddGstCategory = useCallback(() => setSettings(s => ({ ...s, gstCategories: [...(s.gstCategories || []), { id: crypto.randomUUID(), label: "New Category", rate: 18 }] })), []);
  const handleGstCategoryChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.gstCategories || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, gstCategories: arr }; }), []);
  const handleDeleteGstCategory = useCallback((idx) => setSettings(s => { const arr = [...(s.gstCategories || [])]; arr.splice(idx, 1); return { ...s, gstCategories: arr }; }), []);

  const fpTotal = globalFabricItems.length;
  const fpReceived = globalFabricItems.filter(i => i.received).length;
  const fpPending = globalFabricItems.filter(i => i.ordered && !i.received).length;
  const fpAllReceived = fpTotal > 0 && fpReceived === fpTotal;

  if (!authUser) return <LoginScreen onLogin={setAuthUser} />;

  return (
    <div className="app-container">
      <div className="app-inner">
        {/* Header */}
        <div className="hero-box">
          <div className="hero-brand">
            {quoteMeta.company.logoUrl && <img src={normalizeImageUrl(quoteMeta.company.logoUrl)} alt="Logo" className="hero-logo" onError={e => { const id = getGoogleDriveFileId(quoteMeta.company.logoUrl); const fb = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : quoteMeta.company.logoUrl; if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }} />}
            <div><h1 className="hero-title">Curtain Quotation</h1><p className="hero-subtitle">Themes Furnishings & Decor</p></div>
          </div>
          <div className="hero-actions">
            <span className="user-pill">Logged in as <span className="user-role">{authUser.role}</span></span>
            <button className="btn btn-outline" onClick={logout}>Logout</button>
            {activeTab === 'quote' && <>
              <button onClick={handleNewQuote} className="btn btn-outline btn-sm"><Plus size={15} /> New Quote</button>
              <button onClick={addRoom} className="btn btn-primary btn-sm"><Plus size={15} /> Room</button>
              <button onClick={async () => { try { const meta = { ...quoteMeta, quoteNo }; const mergeFabricsRoomWise = window.confirm("Merge all fabrics room-wise?\n\nOK = Show Main + Sheer in one row\nCancel = Show each separately"); const doc = await generateFullPDF(rooms, meta, settings, miscellaneousCosts, mergeFabricsRoomWise); doc.save(`Quote_${quoteMeta.customerName || "Customer"}_${quoteNo || "Draft"}.pdf`); } catch (err) { console.error(err); setLoadedBanner("Could not download PDF."); } }} className="btn btn-outline btn-sm"><Download size={15} /> Full PDF</button>
              <button onClick={handleSaveQuote} className="btn btn-primary btn-sm">Save</button>
            </>}
            {(activeTab === 'history' || activeTab === 'dashboard') && <button onClick={handleNewQuote} className="btn btn-primary btn-sm"><Plus size={15} /> New Quote</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-box">
          {[['quote','Quote'],['order-processing','Order Processing'],['fabric-processing','Fabric Processing'],['payments','Payments'],['history','Saved Quotes'],['dashboard','Dashboard'],['company','Company'],['settings','Settings']].filter(([id]) => canAccessTab(authUser, id)).map(([id, label]) => (
            <button key={id} className={`tab ${activeTab === id ? 'tab-active' : ''}`} onClick={() => setActiveTab(id)}>
              {id === 'order-processing' && (currentQuoteStatus === 'Approved' || allQuotes[quoteNo]?.status === 'Approved') ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, background: '#10B981', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />{label}</span>)
                : id === 'fabric-processing' && fpAllReceived ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, background: '#059669', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />{label}</span>)
                : id === 'fabric-processing' && fpTotal > 0 ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 18, background: fpPending > 0 ? '#F59E0B' : '#3B82F6', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 900, color: 'white' }}>{fpTotal}</span>{label}</span>)
                : label}
            </button>
          ))}
        </div>

        {/* QUOTE TAB */}
        {activeTab === 'quote' && <>
          {loadedBanner && <div className="loaded-banner">{loadedBanner}</div>}
          <Box title="Customer Details">
            <div className="grid-3">
              <div className="field-group"><label className="field-label">Customer Name</label><input className="input" value={quoteMeta.customerName} onChange={e => setQuoteMeta(o => ({ ...o, customerName: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="Customer Name" /></div>
              <div className="field-group"><label className="field-label">Phone</label><input className="input" value={quoteMeta.customerPhone} onChange={e => setQuoteMeta(o => ({ ...o, customerPhone: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="+91 98765 43210" /></div>
              <div className="field-group"><label className="field-label">Project</label><input className="input" value={quoteMeta.projectTitle} onChange={e => setQuoteMeta(o => ({ ...o, projectTitle: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="e.g. Living Room" /></div>
            </div>
            {quoteNo && (<div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="current-quote-badge">{quoteNo}</span>
              <StatusBadge status={currentQuoteStatus || allQuotes[quoteNo]?.status || 'Draft'} />
              {(currentQuoteStatus === 'Approved' || allQuotes[quoteNo]?.status === 'Approved') && (<button className="btn btn-outline btn-sm" style={{ borderColor: '#10B981', color: '#10B981', fontSize: 11 }} onClick={() => setActiveTab('order-processing')}><Package size={12} /> Process Order →</button>)}
            </div>)}
          </Box>

          <Box title="Rooms">
            {rooms.length === 0 && <div className="empty-box">No rooms yet. Click "+ Room" above to add.</div>}
            {rooms.map((r, idx) => (
              <React.Fragment key={r.id}>
                <RoomCard room={r} onClone={cloneRoom} onDelete={deleteRoom} updateRoom={updateRoom} settings={settings} commercials={quoteMeta.commercials} />
                <div className="add-room-between">
                  <button className="btn btn-outline btn-sm" onClick={() => addRoomAfter(idx)} style={{ borderStyle: 'dashed', fontSize: 12 }}><Plus size={13} /> Add Room here</button>
                </div>
              </React.Fragment>
            ))}
          </Box>

          <Box title="Miscellaneous Costs">
            <div className="summary-inner">
              {miscellaneousCosts.length === 0 ? <div className="empty-box">No miscellaneous costs added.</div> : (
                <div className="misc-costs-list">
                  {miscellaneousCosts.map((item) => {
                    const amount = toNum(item.rate) * (toNum(item.quantity) || 1);
                    return (
                      <div key={item.id} className="misc-cost-row">
  <Field label="Cost Name">
    <input
      className="input"
      value={item.name || ''}
      onChange={e => handleMiscCostChange(item.id, { name: e.target.value })}
      placeholder="e.g. Transport, Labour, Hardware"
    />
  </Field>

  <Field label="Unit">
    <select
      className="select"
      value={item.unit || "nos"}
      onChange={e => handleMiscCostChange(item.id, { unit: e.target.value })}
    >
      {UNIT_OPTIONS.map(u => (
        <option key={u.id} value={u.id}>{u.label}</option>
      ))}
    </select>
  </Field>

  <Field label={`Cost / ${getUnitLabel(item.unit || "nos")}`}>
    <UnitInput
      unit="Rs"
      value={item.rate}
      onChange={e => handleMiscCostChange(item.id, { rate: e.target.value })}
      inputMode="decimal"
      placeholder="e.g. 500"
    />
  </Field>

  <Field label="Quantity">
    <UnitInput
      unit={getUnitShortLabel(item.unit || "nos")}
      value={item.quantity}
      onChange={e => handleMiscCostChange(item.id, { quantity: e.target.value })}
      inputMode="decimal"
      placeholder="1"
    />
  </Field>

  {quoteMeta.commercials.applyGst && (
    <Field label="GST Category">
      <select
        className="select"
        value={
          item.gstCategory?.id ||
          (settings.gstCategories || []).find(c => c.id === "other")?.id ||
          settings.gstCategories?.[0]?.id ||
          ""
        }
        onChange={e =>
          handleMiscCostChange(item.id, {
            gstCategory: (settings.gstCategories || []).find(c => c.id === e.target.value),
          })
        }
      >
        {(settings.gstCategories || []).map(c => (
          <option key={c.id} value={c.id}>
            {c.label} ({c.rate}%)
          </option>
        ))}
      </select>
    </Field>
  )}

  <Field label="Amount">
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ minWidth: 90, fontWeight: 800, color: 'var(--primary)' }}>
        {currency(amount)}
      </div>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDeleteMiscCost(item.id)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  </Field>
</div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={handleAddMiscCost}><Plus size={13} /> Add Miscellaneous Cost</button>
                <div style={{ fontWeight: 900, color: 'var(--primary)' }}>Total: {currency(miscTotal)}</div>
              </div>
            </div>
          </Box>

          <Box title="Summary & Grand Total">
            <div className="summary-inner">
              <div className="summary-list">
                <div className="summary-item"><div className="summary-name">Total Cloth Cost</div><div className="summary-total">{currency(totalClothCost)}</div></div>
                <div className="summary-item"><div className="summary-name">Total Other Costs (Stitching, Lining, Track, Install, Misc)</div><div className="summary-total">{currency(totalOther)}</div></div>
                {Number(finalTotals.roundOff || 0) !== 0 && (<div className="summary-item"><span className="summary-name">Round Off / Adjustment</span><span className="summary-total">{Number(finalTotals.roundOff || 0) > 0 ? "+" : "-"}{currency(Math.abs(Number(finalTotals.roundOff || 0)))}</span></div>)}
              </div>

              <div className="commercial-grid">
                <div className="commercial-card">
                  <div className="commercial-title">Discount (on Fabric)</div>
                  <div className="commercial-controls">
                    <select className="select-xs" value={quoteMeta.commercials.discountType} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, discountType: e.target.value } }))}><option value="percent">%</option><option value="fixed">Rs</option></select>
                    <input type="number" className="input-xs" value={quoteMeta.commercials.discountValue} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, discountValue: +e.target.value } }))} />
                    <span className="commercial-amount text-danger">-{currency(finalTotals.discountAmount)}</span>
                  </div>
                  <div className="commercial-note">After Discount: {currency(finalTotals.afterDiscount)}</div>
                </div>

                {/* ── NEW GST card: just a toggle, no single rate ── */}
                <div className="commercial-card">
                  <div className="commercial-title">GST (per-category)</div>
                  <div className="commercial-controls">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={quoteMeta.commercials.applyGst} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, applyGst: e.target.checked } }))} />
                      Apply GST
                    </label>
                  </div>
                  {quoteMeta.commercials.applyGst && liveGstBreakdown.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {liveGstBreakdown.map(cat => (
                        <div key={cat.categoryId} className="gst-breakdown-row">
                          <span className="gst-breakdown-label">
                            {cat.label} ({cat.rate}%)
                          </span>
                          <span className="gst-breakdown-value">
                            {currency(cat.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {quoteMeta.commercials.applyGst && liveGstBreakdown.length === 0 && (
                    <div className="commercial-note">
                      GST is enabled. Add product rows or costs to see GST breakup.
                    </div>
                  )}

                  {!quoteMeta.commercials.applyGst && (
                    <div className="commercial-note">
                      GST is calculated category-wise when enabled.
                    </div>
                  )}
                </div>

                <div className="commercial-card">
                  <div className="commercial-title">Round Off / Adjustment</div>
                  <div className="commercial-controls">
                    <input
                      type="number"
                      className="input-xs"
                      value={quoteMeta.commercials.roundOff || ""}
                      onChange={e =>
                        setQuoteMeta(o => ({
                          ...o,
                          commercials: {
                            ...o.commercials,
                            roundOff: e.target.value,
                          },
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="commercial-amount">
                      {currency(finalTotals.roundOff)}
                    </span>
                  </div>
                  <div className="commercial-note">
                    Use negative value for reduction, positive for addition.
                  </div>
                </div>
              </div>

              <div className="grand-total-box">
                <div className="summary-list">
                  <div className="summary-item">
                    <span className="summary-name">Base Total</span>
                    <span className="summary-total">{currency(grandTotal)}</span>
                  </div>

                  {finalTotals.discountAmount > 0 && (
                    <div className="summary-item">
                      <span className="summary-name">Discount</span>
                      <span className="summary-total text-danger">
                        -{currency(finalTotals.discountAmount)}
                      </span>
                    </div>
                  )}

                  {quoteMeta.commercials.applyGst && liveGstBreakdown.map(cat => (
                    <div key={cat.categoryId} className="summary-item">
                      <span className="summary-name">
                        GST — {cat.label} ({cat.rate}%)
                      </span>
                      <span className="summary-total">
                        {currency(cat.amount)}
                      </span>
                    </div>
                  ))}

                  {Number(finalTotals.roundOff || 0) !== 0 && (
                    <div className="summary-item">
                      <span className="summary-name">Round Off / Adjustment</span>
                      <span className="summary-total">
                        {Number(finalTotals.roundOff || 0) > 0 ? "+" : "-"}
                        {currency(Math.abs(Number(finalTotals.roundOff || 0)))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="final-row" style={{ marginTop: 12 }}>
                  <div className="final-label">Grand Total</div>
                  <div className="final-amount">{currency(finalTotals.finalTotal)}</div>
                </div>
              </div>

              <div className="save-bottom-bar">
                <span className="save-bottom-label">
                  Save this quotation before processing the order.
                </span>
                <button className="btn btn-primary" onClick={handleSaveQuote}>
                  Save Quote
                </button>
              </div>
            </div>
          </Box>
        </>}

        {/* ORDER PROCESSING TAB */}
        {activeTab === 'order-processing' && (
          <OrderProcessingTab
            rooms={rooms}
            quoteMeta={quoteMeta}
            quoteNo={quoteNo}
            currentQuoteStatus={currentQuoteStatus}
            allQuotes={allQuotes}
            onSaveOrderData={handleSaveOrderData}
            onProcessToFabricProcessing={handleProcessToFabricProcessing}
          />
        )}

        {/* FABRIC PROCESSING TAB */}
        {activeTab === 'fabric-processing' && (
          <FabricProcessingTab
            globalFabricItems={globalFabricItems}
            onUpdateGlobalItems={setGlobalFabricItems}
            onClearAll={handleClearAllFabricProcessing}
          />
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <PaymentsTab
            allQuotes={allQuotes}
            paymentsStore={paymentsStore}
            setPaymentsStore={setPaymentsStore}
            settings={settings}
          />
        )}

        {/* SAVED QUOTES TAB */}
        {activeTab === 'history' && (
          <Box title="Saved Quotes">
            <div className="history-toolbar">
              <input
                className="history-search"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search by quote no or customer..."
              />
              <select
                className="select"
                style={{ maxWidth: 180 }}
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                {QUOTE_STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button className="btn btn-outline btn-sm" onClick={refreshQuoteList}>
                Refresh
              </button>
            </div>

            {!filteredQuotes.length ? (
              <div className="empty-box">No saved quotes found.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Quote No</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(rec => (
                      <tr key={rec.quoteNo}>
                        <td className="history-row-no">{rec.quoteNo}</td>
                        <td className="history-row-customer">{rec.customer?.name || "—"}</td>
                        <td>
                          <select
                            className="select-xs"
                            value={rec.status || "Draft"}
                            onChange={e => handleUpdateQuoteStatus(rec.quoteNo, e.target.value)}
                          >
                            {QUOTE_STATUSES.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td className="history-row-date">
                          {rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="history-row-total" style={{ textAlign: "right" }}>
                          {currency(rec.snapshot?.summary?.finalTotal || getQuoteFinalTotal(rec))}
                        </td>
                        <td>
                          <div className="history-row-actions">
                            <button className="btn btn-outline btn-sm" onClick={() => loadQuoteRecord(rec)}>
                              Load
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={async () => {
                                try {
                                  const meta = {
                                    ...quoteMeta,
                                    quoteNo: rec.quoteNo,
                                    customerName: rec.customer?.name || "",
                                    customerPhone: rec.customer?.phone || "",
                                    projectTitle: rec.customer?.project || "",
                                    company: rec.company || quoteMeta.company,
                                    commercials: rec.commercials || quoteMeta.commercials,
                                  };
                                  const doc = await generateFullPDF(
                                    rec.rooms || [],
                                    meta,
                                    rec.settingsSnapshot || settings,
                                    rec.miscellaneousCosts || [],
                                    false
                                  );
                                  doc.save(`Quote_${rec.customer?.name || "Customer"}_${rec.quoteNo}.pdf`);
                                } catch (err) {
                                  console.error(err);
                                  alert("Could not download PDF.");
                                }
                              }}
                            >
                              PDF
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteQuote(rec.quoteNo)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Box>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <DashboardTab allQuotes={allQuotes} />
        )}

        {/* COMPANY TAB */}
        {activeTab === 'company' && (
          <Box title="Company Details">
            <div className="grid-2">
              <Field label="Company Name">
                <input
                  className="input"
                  value={quoteMeta.company.name || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, name: e.target.value },
                  }))}
                />
              </Field>

              <Field label="PDF Company Name">
                <input
                  className="input"
                  value={quoteMeta.company.pdfCompanyName || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, pdfCompanyName: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Phone">
                <input
                  className="input"
                  value={quoteMeta.company.phone || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, phone: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Email">
                <input
                  className="input"
                  value={quoteMeta.company.email || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, email: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Address">
                <input
                  className="input"
                  value={quoteMeta.company.address || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, address: e.target.value },
                  }))}
                />
              </Field>

              <Field label="GSTIN">
                <input
                  className="input"
                  value={quoteMeta.company.gstin || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, gstin: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Logo URL">
                <input
                  className="input"
                  value={quoteMeta.company.logoUrl || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, logoUrl: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Payment QR URL">
                <input
                  className="input"
                  value={quoteMeta.company.paymentQrUrl || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, paymentQrUrl: e.target.value },
                  }))}
                />
              </Field>
            </div>
          </Box>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Box title="General Rates">
              <div className="grid-2">
                <Field label="Default Track Rate / ft">
                  <input
                    className="input"
                    type="number"
                    value={settings.trackRatePerFt}
                    onChange={e => setSettings(s => ({ ...s, trackRatePerFt: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Installation Rate / pcs">
                  <input
                    className="input"
                    type="number"
                    value={settings.installationRatePerTrackFt}
                    onChange={e => setSettings(s => ({ ...s, installationRatePerTrackFt: Number(e.target.value) }))}
                  />
                </Field>
              </div>
            </Box>

            <Box title="Stitching Types">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(settings.stitchingTypes || []).map((item, idx) => (
                  <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                    <Field label="Label">
                      <input
                        className="input"
                        value={item.label}
                        onChange={e => handleStitchChange(idx, { label: e.target.value })}
                      />
                    </Field>
                    <Field label="Rate / Panel">
                      <input
                        className="input"
                        type="number"
                        value={item.ratePerPanel}
                        onChange={e => handleStitchChange(idx, { ratePerPanel: Number(e.target.value) })}
                      />
                    </Field>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteStitch(idx)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={handleAddStitch}>
                  <Plus size={13} /> Add Stitching
                </button>
              </div>
            </Box>

            <Box title="Linings">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(settings.linings || []).map((item, idx) => (
                  <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                    <Field label="Label">
                      <input
                        className="input"
                        value={item.label}
                        onChange={e => handleLiningChange(idx, { label: e.target.value })}
                      />
                    </Field>
                    <Field label="Rate / Meter">
                      <input
                        className="input"
                        type="number"
                        value={item.ratePerMeter}
                        onChange={e => handleLiningChange(idx, { ratePerMeter: Number(e.target.value) })}
                      />
                    </Field>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLining(idx)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={handleAddLining}>
                  <Plus size={13} /> Add Lining
                </button>
              </div>
            </Box>

            <Box title="Tracks">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(settings.tracks || []).map((item, idx) => (
                  <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                    <Field label="Label">
                      <input
                        className="input"
                        value={item.label}
                        onChange={e => handleTrackChange(idx, { label: e.target.value })}
                      />
                    </Field>
                    <Field label="Rate / ft">
                      <input
                        className="input"
                        type="number"
                        value={item.ratePerFt}
                        onChange={e => handleTrackChange(idx, { ratePerFt: Number(e.target.value) })}
                      />
                    </Field>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTrack(idx)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={handleAddTrack}>
                  <Plus size={13} /> Add Track
                </button>
              </div>
            </Box>

            <Box title="GST Categories">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(settings.gstCategories || []).map((item, idx) => (
                  <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                    <Field label="Category Label">
                      <input
                        className="input"
                        value={item.label}
                        onChange={e => handleGstCategoryChange(idx, { label: e.target.value })}
                      />
                    </Field>
                    <Field label="GST Rate %">
                      <input
                        className="input"
                        type="number"
                        value={item.rate}
                        onChange={e => handleGstCategoryChange(idx, { rate: Number(e.target.value) })}
                      />
                    </Field>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGstCategory(idx)}>
                      Delete
                    </button>
                  </div>
                ))}
                <button className="btn btn-outline btn-sm" onClick={handleAddGstCategory}>
                  <Plus size={13} /> Add GST Category
                </button>
              </div>
            </Box>
          </div>
        )}
      </div>
    </div>
  );
}