import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Download, Plus, Trash2, Copy, FileText, BarChart2, ShoppingCart } from "lucide-react";
import { jsPDF } from "jspdf";
/* =========================
   Quote Storage & Numbering
   ========================= */
const LS_QUOTES_KEY = "themes_quotes_v1";
const LS_SEQ_PREFIX = "themes_seq_";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_QUOTES_TABLE = "themes_quotes";
const SUPABASE_SETTINGS_TABLE = "themes_app_settings";
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
async function getQuoteRecord(quoteNo) {
  if (hasSupabaseConfig()) {
    const rows = await supabaseFetch(`/rest/v1/${SUPABASE_QUOTES_TABLE}?select=quote_no,data,created_at,updated_at&quote_no=eq.${encodeURIComponent(quoteNo)}&limit=1`);
    return rowToQuoteRecord(rows?.[0]) || null;
  }
  const map = await loadAllQuotes();
  return map[quoteNo] || null;
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
  };
}
/* =========================
   SETTINGS
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
};
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      ...DEFAULT_SETTINGS, ...saved,
      stitchingTypes: Array.isArray(saved.stitchingTypes) && saved.stitchingTypes.length ? saved.stitchingTypes : DEFAULT_SETTINGS.stitchingTypes,
      linings: Array.isArray(saved.linings) && saved.linings.length ? saved.linings : DEFAULT_SETTINGS.linings,
      tracks: Array.isArray(saved.tracks) && saved.tracks.length ? saved.tracks : DEFAULT_SETTINGS.tracks,
    };
  } catch { return DEFAULT_SETTINGS; }
}
/* =========================
   Fabric entry factory
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
  track: (settings.tracks && settings.tracks[0]) || {
    id: "std",
    label: "Standard Track",
    ratePerFt: settings.trackRatePerFt || 250,
  },
  // CHANGED: orderReductionQty (whole number) instead of orderReductionPct (%)
  orderReductionQty: 0,
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
  primary: "#E5097F", primaryDark: "#2B2A29", accent: "#007E7C",
  header: "#F5EBDD", grid: "#E8E0D8", text: "#2B2A29", muted: "#6B6B6B", border: "#D6CFC9",
  logoUrl: normalizeImageUrl(DEFAULT_LOGO_URL),
  companyName: "Themes Furnishings & Decor",
  pdfCompanyName: "Themes Furnishings & Decor",
  website: "www.themesfurnishings.com",
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
  .order-section-title { font-size: 13px; font-weight: 800; color: var(--primary); margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--border); }
  .reduction-input { width: 72px; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 12px; text-align: right; }
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
const toNum = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ceilDiv = (a, b) => Math.ceil(a / b);
function useStableRefMap() {
  const mapRef = React.useRef({});
  const get = React.useCallback((key) => {
    if (!mapRef.current[key]) mapRef.current[key] = (el) => { mapRef.current.__store = mapRef.current.__store || {}; mapRef.current.__store[key] = el; };
    return mapRef.current[key];
  }, []);
  const read = React.useCallback((key) => (mapRef.current.__store || {})[key], []);
  return { get, read };
}
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
function computeFinalTotals(grandTotal, commercials, clothCost) {
  const { discountType, discountValue, gstRate, applyGst } = commercials;
  const roundOff = toNum(commercials?.roundOff);
  const discountAmount = discountType === "percent" ? clothCost * (discountValue / 100) : (discountValue || 0);
  const afterDiscount = Math.max(0, grandTotal - discountAmount);
  const gstAmount = applyGst ? afterDiscount * ((gstRate || 0) / 100) : 0;
  const beforeRoundOff = afterDiscount + gstAmount;
  return { base: Math.round(grandTotal), discountAmount: Math.round(discountAmount), afterDiscount: Math.round(afterDiscount), gstAmount: Math.round(gstAmount), roundOff: Math.round(roundOff), finalTotal: Math.round(beforeRoundOff + roundOff) };
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
  const { discountType, discountValue, gstRate, applyGst } = commercials;
  const roundOff = toNum(commercials?.roundOff);
  const discountAmount = discountType === "percent" ? clothTotal * (discountValue / 100) : (discountValue || 0);
  const netFabricTotal = Math.max(0, clothTotal - discountAmount);
  const afterDiscount = netFabricTotal + otherTotal;
  const gstAmount = applyGst ? afterDiscount * ((gstRate || 0) / 100) : 0;
  return {
    roomTotals,
    summary: {
      clothTotal: Math.round(clothTotal), stitchingTotal: Math.round(stitchingTotal), liningTotal: Math.round(liningTotal),
      trackTotal: Math.round(trackTotal), installTotal: Math.round(installTotal), miscTotal: Math.round(miscTotal),
      otherTotal: Math.round(otherTotal), base: Math.round(clothTotal + otherTotal),
      discountAmount: Math.round(discountAmount), netFabricTotal: Math.round(netFabricTotal),
      afterDiscount: Math.round(afterDiscount), gstAmount: Math.round(gstAmount),
      roundOff: Math.round(roundOff), finalTotal: Math.round(afterDiscount + gstAmount + roundOff),
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
const BlankMiscCost = () => ({ id: crypto.randomUUID(), name: "", rate: "", quantity: "" });
/* =========================
   Order Report Helpers  — CHANGED: qty-based reduction instead of %
   ========================= */
function buildOrderRows(rooms, orderReductions = {}) {
  const effectiveRooms = rooms.filter(r => r.include !== false);
  const rows = [];
  effectiveRooms.forEach(room => {
    const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];
    fabrics.forEach(fab => {
      const fc = computeFabricCost(room, fab);
      if (fab.isWallpaper) {
        const key = `${room.id}__${fab.id}`;
        // CHANGED: use reductionQty (whole rolls) instead of reductionPct
        const reductionQty = toNum(orderReductions[key] ?? fab.orderReductionQty ?? 0);
        const quotedQty = toNum(fab.wallpaperRollQty);
        const orderQty = Math.max(0, quotedQty - reductionQty);
        const roundedOrderQty = Math.ceil(orderQty * 10) / 10;
        rows.push({
          key, roomName: room.name, fabricLabel: fab.label || 'Fabric',
          materialName: fab.materialName || 'Wallpaper', type: 'Wallpaper',
          quotedQty, quotedUnit: 'rolls',
          orderQty: roundedOrderQty, orderUnit: 'rolls',
          rate: toNum(fab.wallpaperRollPrice),
          quotedAmount: toNum(fab.wallpaperRollQty) * toNum(fab.wallpaperRollPrice),
          orderAmount: roundedOrderQty * toNum(fab.wallpaperRollPrice),
          reductionQty,
        });
        return;
      }
      if (fab.blindType) {
        rows.push({
          key: `${room.id}__${fab.id}`, roomName: room.name, fabricLabel: fab.label || 'Fabric',
          materialName: fab.materialName || fab.blindType + ' Blind', type: 'Blind',
          quotedQty: fc.blindSqFt, quotedUnit: 'sq ft',
          orderQty: fc.blindSqFt, orderUnit: 'sq ft',
          rate: fc.blindRate, quotedAmount: fc.clothCost, orderAmount: fc.clothCost,
          reductionQty: 0,
        });
        return;
      }
      const key = `${room.id}__${fab.id}`;
      // CHANGED: use reductionQty (whole metres) instead of reductionPct
      const reductionQty = toNum(orderReductions[key] ?? fab.orderReductionQty ?? 0);
      const quotedMeters = fc.metersOfCloth;
      const orderMeters = Math.max(0, quotedMeters - reductionQty);
      const roundedOrderMeters = Math.ceil(orderMeters * 2) / 2;
      rows.push({
        key, roomName: room.name, fabricLabel: fab.label || 'Fabric',
        materialName: fab.materialName || 'Fabric',
        type: fab.isRomanBlind ? 'Roman Blind' : 'Curtain',
        quotedQty: quotedMeters, quotedUnit: 'm',
        orderQty: roundedOrderMeters, orderUnit: 'm',
        rate: toNum(fab.materialPrice),
        quotedAmount: fc.clothCost,
        orderAmount: roundedOrderMeters * toNum(fab.materialPrice),
        reductionQty,
      });
    });
  });
  return rows;
}
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
  (miscellaneousCosts||[]).forEach((item)=>{const name=String(item.name||'').trim();const rate=toNum(item.rate);const qty=toNum(item.quantity)||1;const amount=rate*qty;if(name&&Math.round(amount)>0)otherRows.push({label:name,qty,qtyUnit:'pcs',rate,amount});});
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
  if(mergeFabricsRoomWise){effectiveRooms.forEach((room)=>{const fabrics=room.fabrics&&room.fabrics.length?room.fabrics:[];if(!fabrics.length){const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room','—','—','—','—'],roomFabricColDefs);y+=rowH;return;}const fabricCosts=fabrics.map((fab)=>({fab,fc:computeFabricCost(room,fab)}));const fabricLabel=fabricCosts.map(({fab})=>fab.label||'Fabric').join(' + ');const totalMeters=fabricCosts.reduce((sum,item)=>sum+Number(item.fc.metersOfCloth||0),0);const totalAmount=fabricCosts.reduce((sum,item)=>sum+Number(item.fc.clothCost||0),0);const rates=Array.from(new Set(fabricCosts.map(({fab})=>Number(fab.materialPrice||0)).filter(rate=>rate>0)));const rateText=rates.length===1?`Rs.${numberWithCommas(rates[0])}`:'Mixed';const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room',fabricLabel||'Fabric',`${totalMeters.toFixed(2)} m`,rateText,`Rs.${numberWithCommas(Math.round(totalAmount))}`],roomFabricColDefs);y+=rowH;});}
  else{effectiveRooms.forEach((room)=>{const fabrics=room.fabrics&&room.fabrics.length?room.fabrics:[];if(!fabrics.length){const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room','—','—','—','—'],roomFabricColDefs);y+=rowH;return;}const fabRowHeights=fabrics.map((fab)=>{const fc=computeFabricCost(room,fab);const nameLines=wrapText(fab.materialName||'N/A',colFabricW-16);const roomLines=wrapText(room.name||'Room',colRoomW2-16);const maxL=Math.max(nameLines.length,roomLines.length,1);return Math.max(baseRowH,maxL*lineH+8);});const totalRoomH=fabRowHeights.reduce((s,h)=>s+h,0);const isAlt=globalRowIdx%2===0;const roomStartY=y;fabrics.forEach((fab,fi)=>{const fc=computeFabricCost(room,fab);const rowH=fabRowHeights[fi];const ry=y+fabRowHeights.slice(0,fi).reduce((s,h)=>s+h,0);doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'S');[colClothX,colRateX2,colAmountX2].forEach(x=>doc.line(x,ry,x,ry+rowH));doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(30,30,30);const nameText=fab.label||'Fabric';wrapText(nameText,colFabricW-16).forEach((l,li)=>pdfText(doc,l,colFabricX+8,ry+lineH+li*lineH));rightText(fab.isWallpaper?`${Number(fc.rollQty||0).toFixed(2)} rolls`:(fc.blindType?`${Number(fc.blindSqFt||0).toFixed(2)} sq ft`:`${fc.metersOfCloth.toFixed(2)} m`),colClothX+colClothW-8,ry+lineH);rightText(fab.isWallpaper?`Rs.${numberWithCommas(fc.rollPrice||0)}`:`Rs.${numberWithCommas(fc.blindType?fc.blindRate:(fab.materialPrice||0))}`,colRateX2+colRateW-8,ry+lineH);rightText(`Rs.${numberWithCommas(Math.round(fc.clothCost))}`,colAmountX2+colAmountW-8,ry+lineH);});doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'S');doc.line(colFabricX,roomStartY,colFabricX,roomStartY+totalRoomH);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);const roomLines=wrapText(room.name||'Room',colRoomW2-16);const roomTextHeight=roomLines.length*lineH;const roomTextStartY=roomStartY+(totalRoomH-roomTextHeight)/2+lineH-2;roomLines.forEach((l,li)=>{pdfText(doc,l,colRoomX2+colRoomW2/2,roomTextStartY+li*lineH,{align:'center'});});y+=totalRoomH;globalRowIdx++;});}
  {const rowH=baseRowH;doc.setFillColor(...pdfColor('#FFF7ED'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);pdfText(doc,'Fabric Sub-Total',m+8,y+14);rightText(`Rs.${numberWithCommas(fabricTotal)}`,m+tw-8,y+14);y+=rowH;}
  if(hasDiscount){const rowH=baseRowH;const dl=discountType==="percent"?`Discount (${Number(discountValue||0)}%)`:'Discount';doc.setFillColor(255,240,240);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(180,30,30);pdfText(doc,dl,m+8,y+14);rightText(`-Rs.${numberWithCommas(discountAmount)}`,m+tw-8,y+14);y+=rowH;doc.setFillColor(...pdfColor('#E8F5E9'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(20,100,40);pdfText(doc,'Net Fabric Total (after discount)',m+8,y+15);rightText(`Rs.${numberWithCommas(netFabricTotal)}`,m+tw-8,y+15);y+=rowH;}
  y+=12;y=ensureSpace(50);y=drawSectionHeader(doc,m,y,'OTHER COSTS');
  const ocColDesc=tw-90-90-90,ocColQty=90,ocColRate=90,ocColAmount=90;
  const ocDescX=m,ocQtyX=ocDescX+ocColDesc,ocRateX=ocQtyX+ocColQty,ocAmountX=ocRateX+ocColRate;
  const otherColDefs=[{title:'Description',x:ocDescX,w:ocColDesc,align:'left'},{title:'Qty',x:ocQtyX,w:ocColQty,align:'right'},{title:'Rate',x:ocRateX,w:ocColRate,align:'right'},{title:'Amount',x:ocAmountX,w:ocColAmount,align:'right'}];
  y=ensureSpace(headerH+Math.max(1,otherRows.length)*baseRowH+baseRowH);y=drawTableHeader(y,otherColDefs);
  if(!otherRows.length){const rowH=baseRowH;doc.setFillColor(255,255,255);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);pdfText(doc,'No additional costs',m+8,y+14);y+=rowH;}
  else{otherRows.forEach((row,idx)=>{const qtyText=row.qtyUnit==='m'?`${row.qty.toFixed(2)} m`:row.qtyUnit==='panels'?`${Math.round(row.qty)} panels`:row.qtyUnit==='sqft'?`${Number(row.qty).toFixed(2)} sq ft`:row.qtyUnit==='ft'?`${Math.round(row.qty)} ft`:`${Math.round(row.qty)} pcs`;const rowH=drawDataRow(y,idx,[row.label,qtyText,`Rs.${numberWithCommas(row.rate)}`,`Rs.${numberWithCommas(Math.round(row.amount))}`],otherColDefs);y+=rowH;});}
  {const rowH=baseRowH;doc.setFillColor(...pdfColor('#FFF7ED'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);pdfText(doc,'Other Costs Total',m+8,y+14);rightText(`Rs.${numberWithCommas(otherCostsTotal)}`,m+tw-8,y+14);y+=rowH;}
  return y+6;
}
function drawFinalSummaryPanel(doc, m, y, meta, summary, sigDataURL) {
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),qrDataUrl=meta.company?.paymentQrUrl;
  const sectionW=pw-2*m,gap=16,halfW=(sectionW-gap)/2,leftX=m,rightX=m+halfW+gap,qrSize=132;
  const lines=[
    {label:summary.discountAmount>0?'Net Fabric (after discount)':'Fabric Total',value:`Rs.${numberWithCommas(summary.netFabricTotal??summary.clothTotal)}`,bold:false,grandTotal:false},
    {label:'Other Costs',value:`Rs.${numberWithCommas(summary.otherTotal)}`,bold:false,grandTotal:false},
  ];
  if(meta.commercials.applyGst&&summary.gstAmount>0)lines.push({label:`GST (${meta.commercials.gstRate||0}%)`,value:`Rs.${numberWithCommas(summary.gstAmount)}`,bold:false,grandTotal:false});
  if(Number(summary.roundOff||0)!==0){const roundOffValue=Number(summary.roundOff||0);lines.push({label:"Round Off / Adjustment",value:`${roundOffValue>0?"":"-"}Rs.${numberWithCommas(Math.abs(roundOffValue))}`,bold:false,grandTotal:false});}
  lines.push({label:'GRAND TOTAL',value:`Rs.${numberWithCommas(summary.finalTotal)}`,bold:true,grandTotal:true});
  const rowH=22,signatureH=62,blockH=Math.max(180,lines.length*rowH+signatureH+8);
  if(y+blockH>ph-24){y=Math.max(m,ph-blockH-24);}
  y=drawSectionHeader(doc,m,y,'GRAND TOTAL SUMMARY');
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.setLineWidth(0.5);doc.roundedRect(leftX,y,halfW,blockH,6,6,'S');
  doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc,'Scan to Pay',leftX+(halfW/2),y+18,{align:'center'});
  if(qrDataUrl){try{const qrBoxX=leftX+(halfW-qrSize)/2,qrBoxY=y+28;doc.roundedRect(qrBoxX,qrBoxY,qrSize,qrSize,6,6,'S');doc.addImage(qrDataUrl,'PNG',qrBoxX+4,qrBoxY+4,qrSize-8,qrSize-8);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.roundedRect(rightX,y,halfW,blockH,6,6,'S');
  const totalsStartY=y+8;
  lines.forEach((it,i)=>{const ry=totalsStartY+i*rowH;if(it.grandTotal){doc.setFillColor(...pdfColor(BRAND.primary));doc.rect(rightX,ry,halfW,rowH+4,'F');doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(255,255,255);pdfText(doc,it.label,rightX+8,ry+15);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}else{if(i%2===0)doc.setFillColor(255,255,255);else doc.setFillColor(250,250,250);doc.rect(rightX,ry,halfW,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(rightX,ry,halfW,rowH,'S');doc.setFont('helvetica',it.bold?'bold':'normal');doc.setFontSize(10);doc.setTextColor(50,50,50);pdfText(doc,it.label,rightX+8,ry+15);doc.setTextColor(30,30,30);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}});
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
  return Math.max(842,Math.ceil(116+(meta?.commercials?.needGstBill?52:0)+34+30+22+totalFabricEntries*26+24+(hasDiscount?48:0)+42+22+otherRowCount*24+24+220+28));
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
  drawFinalSummaryPanel(doc, m, y, meta, all.summary, sigDataURL);
  return doc;
}
async function generateOrderPDF(orderRows, meta) {
  const logoDataURL = await imageToDataURL(meta.company.logoUrl);
  const m = 36, pageWidth = 595.28;
  const rowH = 22, headerH = 22, topH = 90, sectionH = 34, bottomPad = 40;
  const pageHeight = Math.max(842, topH + sectionH + headerH + orderRows.length * rowH + 100 + bottomPad);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });
  const tw = pageWidth - 2 * m;
  drawHeader(doc, m, meta, logoDataURL);
  let y = topH + m;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, tw, 24, 4, 4, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, `ORDER REPORT — ${meta.quoteNo || 'DRAFT'} — ${meta.customerName || ''}`, m + 10, y + 16);
  y += 30;
  const colRoom = 95;
  const colFabric = 110;
  const colType = 85;
  const colQQuoted = 95;
  const colQOrder = 95;
  const colRed = tw - colRoom - colFabric - colType - colQQuoted - colQOrder;
  const cols = [
    { title: 'Room', w: colRoom, x: m, align: 'left' },
    { title: 'Fabric', w: colFabric, x: m + colRoom, align: 'left' },
    { title: 'Type', w: colType, x: m + colRoom + colFabric, align: 'left' },
    { title: 'Quoted', w: colQQuoted, x: m + colRoom + colFabric + colType, align: 'right' },
    { title: 'Order', w: colQOrder, x: m + colRoom + colFabric + colType + colQQuoted, align: 'right' },
    { title: 'Less', w: colRed, x: m + colRoom + colFabric + colType + colQQuoted + colQOrder, align: 'right' },
  ];
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.rect(m, y, tw, headerH, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  cols.forEach(col => {
    const s = col.title;
    if (col.align === 'right') doc.text(s, col.x + col.w - 6 - doc.getTextWidth(s), y + 14);
    else pdfText(doc, s, col.x + 6, y + 14);
  });
  cols.slice(0, -1).forEach(col => doc.line(col.x + col.w, y, col.x + col.w, y + headerH));
  y += headerH;
  orderRows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
    doc.setFillColor(...bg); doc.rect(m, y, tw, rowH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
    cols.slice(0, -1).forEach(col => doc.line(col.x + col.w, y, col.x + col.w, y + rowH));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    const cells = [
      row.roomName,
      row.fabricLabel,
      row.type,
      `${Number(row.quotedQty || 0).toFixed(2)} ${row.quotedUnit}`,
      `${Number(row.orderQty || 0).toFixed(2)} ${row.orderUnit}`,
      row.type === 'Blind' ? '—' : `${Number(row.reductionQty || 0).toFixed(2)} ${row.orderUnit}`,
    ];
    const fitCell = (value, maxChars) => {
      const s = String(value ?? '');
      return s.length > maxChars ? `${s.slice(0, Math.max(0, maxChars - 3))}...` : s;
    };
    cells.forEach((cell, i) => {
      const col = cols[i];
      const maxChars = i === 0 ? 16 : i === 1 ? 18 : i === 2 ? 14 : i === 3 ? 14 : i === 4 ? 14 : 18;
      const s = fitCell(cell, maxChars);
      if (col.align === 'right') {
        doc.text(s, col.x + col.w - 8 - doc.getTextWidth(s), y + 14);
      } else {
        pdfText(doc, s, col.x + 6, y + 14);
      }
    });
    y += rowH;
  });
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
  return (
    <span className="status-badge" style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      {status || 'Draft'}
    </span>
  );
}
/* =========================
   FabricRow sub-component
   ========================= */
const FabricRow = React.memo(function FabricRow({ fabric, room, settings, onChange, onRemove, canRemove }) {
  const fc = useMemo(() => computeFabricCost(room, fabric), [room, fabric]);
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
            {/* CHANGED: rolls less to order (whole number) */}
            <Field label="Order Reduction" hint="rolls less to order"><UnitInput unit="rolls" value={fabric.orderReductionQty ?? ""} onChange={e => onChange({ orderReductionQty: e.target.value })} inputMode="decimal" placeholder="0" /></Field>
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
            <Field label="Material Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder="e.g. Velvet, Sheer" /></Field>
            <Field label="Price / m"><UnitInput unit="Rs/m" value={fabric.materialPrice} onChange={e => onChange({ materialPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 350" /></Field>
            <Field label="Cloth" hint={`auto: ${fc.metersOfCloth.toFixed(2)} m`}><UnitInput unit="m" value={fabric.clothMeters ?? ""} onChange={e => onChange({ clothMeters: e.target.value })} inputMode="decimal" placeholder={fc.metersOfCloth.toFixed(2)} /></Field>
            {/* CHANGED: metres less to actually order (whole number) */}
            <Field label="Order Reduction" hint="metres less to actually order"><UnitInput unit="m" value={fabric.orderReductionQty ?? ""} onChange={e => onChange({ orderReductionQty: e.target.value })} inputMode="decimal" placeholder="0" /></Field>
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
          </>
        )}
      </div>
    </div>
  );
});
/* =========================
   Room Card
   ========================= */
const RoomCard = React.memo(function RoomCard({ room, onClone, onDelete, updateRoom, settings }) {
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
          <FabricRow key={fabric.id} fabric={fabric} room={localRoom} settings={settings} onChange={patch => handleFabricChange(fabric.id, patch)} onRemove={() => handleRemoveFabric(fabric.id)} canRemove={(localRoom.fabrics || []).length > 1} />
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
   Order Report Tab  — CHANGED: qty-based UI
   ========================= */
function OrderReportTab({ rooms, quoteMeta, quoteNo }) {
  const [orderReductions, setOrderReductions] = useState({});
  const orderRows = useMemo(() => buildOrderRows(rooms, orderReductions), [rooms, orderReductions]);
  const totalQuotedAmt = orderRows.reduce((s, r) => s + r.quotedAmount, 0);
  const totalOrderAmt = orderRows.reduce((s, r) => s + r.orderAmount, 0);
  const savings = totalQuotedAmt - totalOrderAmt;
  const setReduction = (key, val) => setOrderReductions(prev => ({ ...prev, [key]: val }));
  const handleDownloadPDF = async () => {
    try {
      const meta = { ...quoteMeta, quoteNo };
      const doc = await generateOrderPDF(orderRows, meta);
      doc.save(`Order_${quoteMeta.customerName || 'Customer'}_${quoteNo || 'Draft'}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Could not generate Order PDF.");
    }
  };
  return (
    <div className="box">
      <div className="box-header">
        <h3><ShoppingCart size={15} style={{ marginRight: 4 }} /> Order Report — What to Actually Order</h3>
      </div>
      <div className="box-body">
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', marginBottom: 16 }}>
          {/* CHANGED: updated description to reflect whole-number qty */}
          The quote gives customers a higher cloth quantity (with allowances). Use <strong>Order Reduction</strong> per fabric to enter how many metres (or rolls) less you actually need to order. The table below shows your real purchase quantities and costs.
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="dash-kpi" style={{ flex: 1, minWidth: 140 }}>
            <div className="dash-kpi-label">Quoted Fabric Amount</div>
            <div className="dash-kpi-value">{currency(totalQuotedAmt)}</div>
          </div>
          <div className="dash-kpi" style={{ flex: 1, minWidth: 140 }}>
            <div className="dash-kpi-label">Actual Order Amount</div>
            <div className="dash-kpi-value">{currency(totalOrderAmt)}</div>
          </div>
          <div className="dash-kpi" style={{ flex: 1, minWidth: 140 }}>
            <div className="dash-kpi-label">Margin on Fabric</div>
            <div className="dash-kpi-value" style={{ color: savings >= 0 ? '#059669' : '#DC2626' }}>{currency(savings)}</div>
            <div className="dash-kpi-sub">{totalQuotedAmt > 0 ? ((savings / totalQuotedAmt) * 100).toFixed(1) + '% margin' : '—'}</div>
          </div>
        </div>
        {orderRows.length === 0 ? (
          <div className="empty-box">No fabric entries yet. Add rooms and fabrics in the Quote tab.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="order-report-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Fabric / Label</th>
                  <th>Material</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Quoted Qty</th>
                  {/* CHANGED: column header */}
                  <th style={{ textAlign: 'right' }}>Reduction (qty)</th>
                  <th style={{ textAlign: 'right' }}>To Order</th>
                  <th style={{ textAlign: 'right' }}>Order Amount</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((row) => (
                  <tr key={row.key}>
                    <td style={{ fontWeight: 700 }}>{row.roomName}</td>
                    <td>{row.fabricLabel}</td>
                    <td style={{ color: 'var(--muted)' }}>{row.materialName}</td>
                    <td>
                      <span style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                        {row.type}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {row.quotedQty.toFixed(2)} {row.quotedUnit}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {row.type === 'Blind' ? (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>N/A</span>
                      ) : (
                        /* CHANGED: plain number input, no % cap, no % symbol */
                        <input
                          type="number"
                          className="reduction-input"
                          min="0"
                          step="0.5"
                          value={orderReductions[row.key] ?? row.reductionQty ?? 0}
                          onChange={e => setReduction(row.key, Math.max(0, Number(e.target.value)))}
                          style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, textAlign: 'right', width: 72 }}
                        />
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                      {row.orderQty.toFixed(2)} {row.orderUnit}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                      {currency(row.orderAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#FFF5FA' }}>
                  <td colSpan={4} style={{ fontWeight: 900, padding: '10px 12px' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 12px', color: 'var(--muted)' }}>{currency(totalQuotedAmt)}</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: 'right', fontWeight: 900, padding: '10px 12px', color: 'var(--primary)', fontSize: 15 }}>{currency(totalOrderAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={handleDownloadPDF}>
            <Download size={15} /> Download Order PDF
          </button>
        </div>
        {/* CHANGED: updated how-to-use description */}
        <div style={{ marginTop: 20, padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
          <strong>How to use:</strong> Set "Reduction (qty)" for each fabric row — e.g. entering <strong>1</strong> means you quoted 10 m but will order 9 m. Enter <strong>2</strong> for rolls to order 2 rolls fewer. The reduction accounts for extra allowance included in the customer's quote. Blind quantities are not reduced since they're area-based.
        </div>
      </div>
    </div>
  );
}
/* =========================
   Dashboard Tab
   ========================= */
function DashboardTab({ allQuotes }) {
  const canvasRefs = {
    monthly: useRef(null),
    status: useRef(null),
    topCustomers: useRef(null),
    roomDist: useRef(null),
  };
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
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    const monthlyRevenue = months.map(m => ({
      label: new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      value: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0),
      count: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).length,
    }));
    const statusCounts = QUOTE_STATUSES.reduce((acc, s) => { acc[s] = quotes.filter(q => (q.status || 'Draft') === s).length; return acc; }, {});
    const custMap = {};
    quotes.forEach(q => {
      const name = q.customer?.name || 'Unknown';
      if (!custMap[name]) custMap[name] = 0;
      custMap[name] += q.snapshot?.summary?.finalTotal || 0;
    });
    const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const roomCounts = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    quotes.forEach(q => {
      const n = q.rooms?.length || 0;
      if (n <= 4) roomCounts[String(n)] = (roomCounts[String(n)] || 0) + 1;
      else roomCounts['5+'] = (roomCounts['5+'] || 0) + 1;
    });
    return { monthlyRevenue, statusCounts, topCustomers, roomCounts };
  }, [allQuotes]);
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload = () => renderCharts();
    document.head.appendChild(script);
    return () => {
      Object.values(chartInstances.current).forEach(c => { try { c.destroy(); } catch(e) {} });
      chartInstances.current = {};
    };
  }, []);
  useEffect(() => {
    if (window.Chart) renderCharts();
  }, [chartData]);
  function renderCharts() {
    if (!window.Chart) return;
    const pink = '#E5097F', pinkLight = 'rgba(229,9,127,0.15)';
    const statusColors = { Draft: '#6B7280', Sent: '#3B82F6', Approved: '#10B981', Rejected: '#EF4444', Cancelled: '#F59E0B' };
    const makeChart = (key, config) => {
      if (chartInstances.current[key]) { try { chartInstances.current[key].destroy(); } catch(e) {} }
      const canvas = canvasRefs[key]?.current;
      if (!canvas) return;
      chartInstances.current[key] = new window.Chart(canvas, config);
    };
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
      {noData ? (
        <div className="empty-box">No saved quotes yet. Save some quotes to see your dashboard.</div>
      ) : (
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
  const [settings, setSettings] = useState(loadSettings);
  const [settingsReady, setSettingsReady] = useState(!hasSupabaseConfig());
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
  const [quoteMeta, setQuoteMeta] = useState({
    customerName: "", customerPhone: "", projectTitle: "Curtain Quotation",
    company: { name: BRAND.companyName, pdfCompanyName: BRAND.pdfCompanyName, address: BRAND.address, phone: BRAND.phone, email: BRAND.email, logoUrl: BRAND.logoUrl, website: BRAND.website, gstin: BRAND.gstin, paymentQrUrl: BRAND.paymentQrUrl, paymentUpiId: BRAND.paymentUpiId },
    currency: "INR",
    notes: "Prices are exclusive of taxes. Valid for 7 days.",
    commercials: { applyGst: false, gstRate: 0, discountType: "percent", discountValue: 0, place: "Pune", signatoryName: "Authorized Signatory", signatoryTitle: "", signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL), needGstBill: false, gstin: "", billingAddress: "" },
  });
  useEffect(() => {
    let cancelled = false;
    generateQuoteNo().then(no => { if (!cancelled) setQuoteNo(no); }).catch(err => { console.error(err); });
    return () => { cancelled = true; };
  }, []);
  const [activeTab, setActiveTab] = useState('quote');
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("All");
  const [allQuotes, setAllQuotes] = useState({});
  const metaRef = useRef(quoteMeta);
  useEffect(() => { metaRef.current = quoteMeta; }, [quoteMeta]);
  const quoteNoRef = useRef(quoteNo);
  useEffect(() => { quoteNoRef.current = quoteNo; }, [quoteNo]);
  const refreshQuoteList = useCallback(async () => {
    try { const map = await loadAllQuotes(); setAllQuotes(map || {}); }
    catch (err) { console.error(err); }
  }, []);
  useEffect(() => { refreshQuoteList(); }, [refreshQuoteList]);
  const allQuotesArr = useMemo(() => {
    const arr = Object.values(allQuotes || {});
    arr.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return arr;
  }, [allQuotes]);
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
    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();
      arr = arr.filter(rec => String(rec.quoteNo || '').toLowerCase().includes(q) || String(rec.customer?.name || '').toLowerCase().includes(q));
    }
    return arr;
  }, [allQuotesArr, historySearch, historyStatusFilter]);
  const loadQuoteRecord = useCallback((rec) => {
    if (!rec) return;
    setQuoteNo(rec.quoteNo);
    const migratedRooms = (rec.rooms && rec.rooms.length ? rec.rooms : [BlankRoom(1, settings)]).map(r => {
      if (r.fabrics && r.fabrics.length) return r;
      return { ...r, fabrics: [BlankFabric(settings, "Main", { materialName: r.materialName || "", materialPrice: r.materialPrice || "", clothMeters: r.clothMeters || "", stitching: r.stitching || settings.stitchingTypes[0], lining: r.lining || settings.linings[0] })] };
    });
    setRooms(migratedRooms);
    setMiscellaneousCosts(Array.isArray(rec.miscellaneousCosts) ? rec.miscellaneousCosts : []);
    setQuoteMeta(prev => ({
      ...prev,
      customerName: rec.customer?.name || '',
      customerPhone: rec.customer?.phone || '',
      projectTitle: rec.customer?.project || 'Curtain Quotation',
      company: rec.company ? { ...prev.company, ...rec.company } : prev.company,
      commercials: { ...prev.commercials, ...(rec.commercials || {}), signatoryTitle: rec.commercials?.signatoryTitle === 'For Themes Furnishings and Linens' ? '' : (rec.commercials?.signatoryTitle || '') },
    }));
    setLoadedBanner(`Loaded ${rec.quoteNo}${rec.customer?.name ? ` — ${rec.customer.name}` : ''}`);
    setActiveTab('quote');
    setTimeout(() => setLoadedBanner(''), 4000);
  }, [settings]);
  const handleUpdateQuoteStatus = useCallback(async (quoteNo, newStatus) => {
    try {
      const map = await loadAllQuotes();
      if (map[quoteNo]) {
        map[quoteNo] = { ...map[quoteNo], status: newStatus, updatedAt: new Date().toISOString() };
        if (hasSupabaseConfig()) { await saveQuoteRecord(quoteNo, map[quoteNo]); }
        else { await saveAllQuotes(map); }
        await refreshQuoteList();
      }
    } catch (err) { console.error(err); }
  }, [refreshQuoteList]);
  const handleSaveQuote = useCallback(async () => {
    try {
      const allTotals = computeAllTotals(rooms, quoteMeta.commercials, settings, miscellaneousCosts);
      const finalNo = quoteNo || await generateQuoteNo();
      setQuoteNo(finalNo);
      const existingRec = allQuotes[finalNo];
      await saveQuoteRecord(finalNo, {
        customer: { name: quoteMeta.customerName, phone: quoteMeta.customerPhone, project: quoteMeta.projectTitle },
        company: quoteMeta.company,
        commercials: quoteMeta.commercials,
        rooms,
        miscellaneousCosts,
        settingsSnapshot: settings,
        snapshot: allTotals,
        status: existingRec?.status || 'Draft',
        createdAt: existingRec?.createdAt || new Date().toISOString(),
      });
      await refreshQuoteList();
      setLoadedBanner(`Saved as ${finalNo}${hasSupabaseConfig() ? " online" : " on this browser"}`);
      setTimeout(() => setLoadedBanner(''), 3000);
    } catch (err) { console.error(err); setLoadedBanner("Could not save quote."); }
  }, [quoteNo, rooms, miscellaneousCosts, quoteMeta, settings, allQuotes, refreshQuoteList]);
  const handleNewQuote = useCallback(async () => {
    const newNo = await generateQuoteNo();
    setQuoteNo(newNo);
    setRooms([BlankRoom(1, settings)]);
    setMiscellaneousCosts([]);
    setHistorySearch("");
    setQuoteMeta({ customerName: "", customerPhone: "", projectTitle: "Curtain Quotation", company: { name: BRAND.companyName, pdfCompanyName: BRAND.pdfCompanyName, address: BRAND.address, phone: BRAND.phone, email: BRAND.email, logoUrl: BRAND.logoUrl, website: BRAND.website, gstin: BRAND.gstin, paymentQrUrl: BRAND.paymentQrUrl, paymentUpiId: BRAND.paymentUpiId }, currency: "INR", notes: "Prices are exclusive of taxes. Valid for 7 days.", commercials: { applyGst: false, gstRate: 0, discountType: "percent", discountValue: 0, place: "Pune", signatoryName: "Authorized Signatory", signatoryTitle: "", signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL), needGstBill: false, gstin: "", billingAddress: "" } });
    setLoadedBanner(`Started new quote ${newNo}`);
    setActiveTab("quote");
    setTimeout(() => setLoadedBanner(""), 3000);
  }, [settings]);
  const handleDeleteQuote = useCallback(async (no) => {
    if (!window.confirm(`Delete quote ${no}?`)) return;
    try { await deleteQuoteRecord(no); await refreshQuoteList(); if (quoteNo === no) { setQuoteNo(await generateQuoteNo()); setRooms([BlankRoom(1, settings)]); setMiscellaneousCosts([]); } }
    catch (err) { console.error(err); }
  }, [quoteNo, settings, refreshQuoteList]);
  const updateRoom = useCallback((id, patch) => {
    setRooms(prev => { let changed = false; const next = prev.map(r => { if (r.id !== id) return r; const merged = { ...r, ...patch }; if (JSON.stringify(merged) !== JSON.stringify(r)) changed = true; return merged; }); return changed ? next : prev; });
  }, []);
  const addRoomAfter = useCallback((afterIndex = -1) => {
    setRooms(prev => { const newRoom = BlankRoom(prev.length + 1, settings); if (afterIndex < 0 || afterIndex >= prev.length - 1) return [...prev, newRoom]; const next = [...prev]; next.splice(afterIndex + 1, 0, newRoom); return next; });
  }, [settings]);
  const addRoom = useCallback(() => addRoomAfter(-1), [addRoomAfter]);
  const cloneRoom = useCallback((id) => { setRooms(prev => { const r = prev.find(x => x.id === id); if (!r) return prev; return [...prev, { ...r, id: crypto.randomUUID(), name: `${r.name} (Copy)` }]; }); }, []);
  const deleteRoom = useCallback((id) => setRooms(prev => prev.filter(r => r.id !== id)), []);
  const roomsIncluded = useMemo(() => rooms.filter(r => r.include !== false), [rooms]);
  const totals = useMemo(() => roomsIncluded.map(r => ({ roomId: r.id, ...computeRoomCost(r, settings) })), [roomsIncluded, settings]);
  const grandTotal = useMemo(() => totals.reduce((s, t) => s + t.subtotal, 0), [totals]);
  const totalClothCost = useMemo(() => totals.reduce((s, t) => s + t.clothCost, 0), [totals]);
  const totalOther = useMemo(() => grandTotal - totalClothCost, [grandTotal, totalClothCost]);
  const miscTotal = useMemo(() => miscellaneousCosts.reduce((sum, item) => sum + (toNum(item.rate) * (toNum(item.quantity) || 1)), 0), [miscellaneousCosts]);
  const finalTotals = useMemo(() => computeFinalTotals(grandTotal + miscTotal, quoteMeta.commercials, totalClothCost), [grandTotal, miscTotal, quoteMeta.commercials, totalClothCost]);
  const handleAddMiscCost = useCallback(() => setMiscellaneousCosts(prev => [...prev, BlankMiscCost()]), []);
  const handleMiscCostChange = useCallback((id, patch) => setMiscellaneousCosts(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item)), []);
  const handleDeleteMiscCost = useCallback((id) => setMiscellaneousCosts(prev => prev.filter(item => item.id !== id)), []);
  const handleAddStitch = useCallback(() => setSettings(s => ({ ...s, stitchingTypes: [...(s.stitchingTypes || []), { id: crypto.randomUUID(), label: "New Stitch", ratePerPanel: 0 }] })), []);
  const handleStitchChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.stitchingTypes || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, stitchingTypes: arr }; }), []);
  const handleDeleteStitch = useCallback((idx) => setSettings(s => { const arr = [...(s.stitchingTypes || [])]; arr.splice(idx, 1); return { ...s, stitchingTypes: arr }; }), []);
  const handleAddLining = useCallback(() => setSettings(s => ({ ...s, linings: [...(s.linings || []), { id: crypto.randomUUID(), label: "New Lining", ratePerMeter: 0 }] })), []);
  const handleLiningChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.linings || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, linings: arr }; }), []);
  const handleDeleteLining = useCallback((idx) => setSettings(s => { const arr = [...(s.linings || [])]; arr.splice(idx, 1); return { ...s, linings: arr }; }), []);
  const handleAddTrack = useCallback(() => setSettings(s => ({ ...s, tracks: [...(s.tracks || []), { id: crypto.randomUUID(), label: "New Track", ratePerFt: 0 }] })), []);
  const handleTrackChange = useCallback((idx, patch) => setSettings(s => { const arr = [...(s.tracks || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...s, tracks: arr }; }), []);
  const handleDeleteTrack = useCallback((idx) => setSettings(s => { const arr = [...(s.tracks || [])]; arr.splice(idx, 1); return { ...s, tracks: arr }; }), []);
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
            {activeTab === 'quote' && <>
              <button onClick={handleNewQuote} className="btn btn-outline btn-sm"><Plus size={15} /> New Quote</button>
              <button onClick={addRoom} className="btn btn-primary btn-sm"><Plus size={15} /> Room</button>
              <button onClick={async () => { try { const meta = { ...quoteMeta, quoteNo }; const mergeFabricsRoomWise = window.confirm("Do you want to merge all fabrics room-wise in the PDF?\n\nOK = Show Main + Sheer in one room row\nCancel = Show each fabric separately"); const doc = await generateFullPDF(rooms, meta, settings, miscellaneousCosts, mergeFabricsRoomWise); doc.save(`Quote_${quoteMeta.customerName || "Customer"}_${quoteNo || "Draft"}.pdf`); } catch (err) { console.error(err); setLoadedBanner("Could not download PDF."); } }} className="btn btn-outline btn-sm"><Download size={15} /> Full PDF</button>
              <button onClick={handleSaveQuote} className="btn btn-primary btn-sm">Save</button>
            </>}
            {(activeTab === 'history' || activeTab === 'dashboard') && <button onClick={handleNewQuote} className="btn btn-primary btn-sm"><Plus size={15} /> New Quote</button>}
          </div>
        </div>
        {/* Tabs */}
        <div className="tabs-box">
          {[
            ['quote', 'Quote'],
            ['order', 'Order Report'],
            ['history', 'Saved Quotes'],
            ['dashboard', 'Dashboard'],
            ['company', 'Company'],
            ['settings', 'Settings'],
          ].map(([id, label]) => (
            <button key={id} className={`tab ${activeTab === id ? 'tab-active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>
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
            {quoteNo && <div style={{ marginTop: 10 }}><span className="current-quote-badge">{quoteNo}</span></div>}
          </Box>
          <Box title="Rooms">
            {rooms.length === 0 && <div className="empty-box">No rooms yet. Click "+ Room" above to add.</div>}
            {rooms.map((r, idx) => (
              <React.Fragment key={r.id}>
                <RoomCard room={r} onClone={cloneRoom} onDelete={deleteRoom} updateRoom={updateRoom} settings={settings} />
                <div className="add-room-between">
                  <button className="btn btn-outline btn-sm" onClick={() => addRoomAfter(idx)} style={{ borderStyle: 'dashed', fontSize: 12 }}>
                    <Plus size={13} /> Add Room here
                  </button>
                </div>
              </React.Fragment>
            ))}
          </Box>
          <Box title="Miscellaneous Costs">
            <div className="summary-inner">
              {miscellaneousCosts.length === 0 ? (
                <div className="empty-box">No miscellaneous costs added.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {miscellaneousCosts.map((item) => {
                    const amount = toNum(item.rate) * (toNum(item.quantity) || 1);
                    return (
                      <div key={item.id} className="grid-3" style={{ alignItems: 'end' }}>
                        <Field label="Cost Name"><input className="input" value={item.name || ''} onChange={e => handleMiscCostChange(item.id, { name: e.target.value })} placeholder="e.g. Transport, Labour, Hardware" /></Field>
                        <Field label="Cost / Unit"><UnitInput unit="Rs" value={item.rate} onChange={e => handleMiscCostChange(item.id, { rate: e.target.value })} inputMode="decimal" placeholder="e.g. 500" /></Field>
                        <Field label="Quantity">
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <UnitInput unit="qty" value={item.quantity} onChange={e => handleMiscCostChange(item.id, { quantity: e.target.value })} inputMode="decimal" placeholder="1" />
                            <div style={{ minWidth: 90, fontWeight: 800, color: 'var(--primary)' }}>{currency(amount)}</div>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMiscCost(item.id)}><Trash2 size={13} /></button>
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
                <div className="summary-item"><div className="summary-name">Total Other Costs (Stitching, Lining, Track, Install)</div><div className="summary-total">{currency(totalOther + miscTotal)}</div></div>
                {Number(finalTotals.roundOff || 0) !== 0 && (
                  <div className="summary-item">
                    <span className="summary-name">Round Off / Adjustment</span>
                    <span className="summary-total">{Number(finalTotals.roundOff || 0) > 0 ? "+" : "-"}{currency(Math.abs(Number(finalTotals.roundOff || 0)))}</span>
                  </div>
                )}
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
                <div className="commercial-card">
                  <div className="commercial-title">GST</div>
                  <div className="commercial-controls">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={quoteMeta.commercials.applyGst} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, applyGst: e.target.checked } }))} />Apply GST
                    </label>
                    {quoteMeta.commercials.applyGst && <>
                      <input type="number" className="input-xs" style={{ width: 52 }} value={quoteMeta.commercials.gstRate} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, gstRate: +e.target.value } }))} />
                      <span style={{ fontSize: 12 }}>% = {currency(finalTotals.gstAmount)}</span>
                    </>}
                  </div>
                </div>
                <div className="commercial-card">
                  <div className="commercial-title">Round Off / Adjustment</div>
                  <div className="commercial-controls"><UnitInput unit="Rs" value={quoteMeta.commercials.roundOff ?? ""} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, roundOff: e.target.value } }))} inputMode="decimal" placeholder="e.g. 50 or -50" /></div>
                  <div className="commercial-note">Positive adds, negative subtracts from grand total.</div>
                </div>
              </div>
              <div className="grand-total-box">
                <div className="final-row"><span className="final-label">Grand Total</span><span className="final-amount">{currency(finalTotals.finalTotal)}</span></div>
              </div>
              <div className="save-bottom-bar">
                <span className="save-bottom-label">{quoteNo ? `Quote: ${quoteNo}` : 'Not yet saved'}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={async () => { const meta = { ...quoteMeta, quoteNo }; const mergeFabricsRoomWise = window.confirm("Do you want to merge all fabrics room-wise in the PDF?\n\nOK = Show Main + Sheer in one room row\nCancel = Show each fabric separately"); const doc = await generateFullPDF(rooms, meta, settings, miscellaneousCosts, mergeFabricsRoomWise); const customerFileName = safeFileNamePart(meta.customerName || quoteMeta.customerName);
doc.save(`${meta.quoteNo || quoteNo || "quotation"}-${customerFileName}.pdf`); }} className="btn btn-outline"><Download size={15} /> Full PDF</button>
                  <button onClick={handleSaveQuote} className="btn btn-primary"><FileText size={15} /> Save Quote</button>
                </div>
              </div>
            </div>
          </Box>
        </>}
        {/* ORDER REPORT TAB */}
        {activeTab === 'order' && (
          <OrderReportTab rooms={rooms} quoteMeta={quoteMeta} quoteNo={quoteNo} />
        )}
        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <Box title="Saved Quotes">
            <div className="history-toolbar">
              <input className="history-search" placeholder="Search by quote no or customer name…" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
              <select className="select" style={{ width: 140 }} value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-outline btn-sm" onClick={() => refreshQuoteList()}>↻ Refresh</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {QUOTE_STATUSES.map(s => {
                const count = allQuotesArr.filter(q => (q.status || 'Draft') === s).length;
                if (!count) return null;
                const sc = STATUS_COLORS[s];
                return (
                  <span key={s} onClick={() => setHistoryStatusFilter(historyStatusFilter === s ? 'All' : s)}
                    style={{ background: sc.bg, color: sc.text, borderColor: sc.border, border: '1px solid', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: historyStatusFilter !== 'All' && historyStatusFilter !== s ? 0.45 : 1 }}>
                    {s} ({count})
                  </span>
                );
              })}
            </div>
            {filteredQuotes.length === 0 ? (
              <div className="empty-box">{historySearch || historyStatusFilter !== 'All' ? 'No matching quotes.' : hasSupabaseConfig() ? 'No online quotes yet.' : 'No saved quotes yet on this browser.'}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="history-table">
                  <thead><tr><th>Quote No</th><th>Customer</th><th>Project</th><th>Rooms</th><th>Grand Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredQuotes.map(rec => {
                      const total = rec.snapshot?.summary?.finalTotal;
                      const date = rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString('en-IN') : '—';
                      const roomCount = rec.rooms?.length || 0;
                      const isActive = rec.quoteNo === quoteNo;
                      return (
                        <tr key={rec.quoteNo} style={isActive ? { background: '#fff7ed' } : {}}>
                          <td>
                            <span className="history-row-no">{rec.quoteNo}</span>
                            {isActive && <span style={{ marginLeft: 6, fontSize: 10, background: '#fed7aa', color: '#9a3412', borderRadius: 4, padding: '1px 5px', fontWeight: 800 }}>current</span>}
                          </td>
                          <td className="history-row-customer">{rec.customer?.name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ color: 'var(--muted)', fontSize: 12 }}>{rec.customer?.project || '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{roomCount}</td>
                          <td className="history-row-total">{total != null ? currency(total) : '—'}</td>
                          <td>
                            <select
                              value={rec.status || 'Draft'}
                              onChange={e => handleUpdateQuoteStatus(rec.quoteNo, e.target.value)}
                              style={{ border: `1px solid ${STATUS_COLORS[rec.status || 'Draft'].border}`, background: STATUS_COLORS[rec.status || 'Draft'].bg, color: STATUS_COLORS[rec.status || 'Draft'].text, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', outline: 'none' }}
                            >
                              {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="history-row-date">{date}</td>
                          <td>
                            <div className="history-row-actions">
                              <button className="btn btn-primary btn-sm" onClick={() => loadQuoteRecord(rec)}>Load</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteQuote(rec.quoteNo)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>{filteredQuotes.length} quote{filteredQuotes.length !== 1 ? 's' : ''}{historySearch || historyStatusFilter !== 'All' ? ' found' : ' total'}</div>
          </Box>
        )}
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <Box title="Dashboard">
            <div className="box-body" style={{ padding: 0 }}>
              <div style={{ padding: 16 }}>
                <DashboardTab allQuotes={allQuotes} />
              </div>
            </div>
          </Box>
        )}
        {/* COMPANY TAB */}
        {activeTab === 'company' && (
          <Box title="Company Branding">
            <div className="grid-2">
              <div className="field-group"><label className="field-label">Company Name</label><input className="input" value={quoteMeta.company.name} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, name: e.target.value } }))} /></div>
              <div className="field-group">
                <label className="field-label">Logo</label>
                {quoteMeta.company.logoUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}><img src={quoteMeta.company.logoUrl} alt="Logo" style={{ height: 48, borderRadius: 6, border: '1px solid var(--border)', padding: 4, background: '#fff' }} /><button className="btn btn-outline btn-sm" onClick={() => setQuoteMeta(o => ({ ...o, company: { ...o.company, logoUrl: '' } }))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const d = await fileToDataURL(f); setQuoteMeta(o => ({ ...o, company: { ...o.company, logoUrl: d } })); } catch { } }} />
                <input className="input" style={{ marginTop: 8 }} placeholder="https://…/logo.png" value={quoteMeta.company.logoUrl} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, logoUrl: e.target.value } }))} />
              </div>
              <div className="field-group"><label className="field-label">Website</label><input className="input" value={quoteMeta.company.website} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, website: e.target.value } }))} /></div>
              <div className="field-group"><label className="field-label">GSTIN</label><input className="input" value={quoteMeta.company.gstin} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, gstin: e.target.value } }))} /></div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}><label className="field-label">Address</label><input className="input" value={quoteMeta.company.address} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, address: e.target.value } }))} /></div>
              <div className="field-group"><label className="field-label">Phone</label><input className="input" value={quoteMeta.company.phone} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, phone: e.target.value } }))} /></div>
              <div className="field-group"><label className="field-label">Email</label><input className="input" value={quoteMeta.company.email} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, email: e.target.value } }))} /></div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}>
                <label className="field-label">Payment QR Image</label>
                {quoteMeta.company.paymentQrUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}><img src={quoteMeta.company.paymentQrUrl} alt="QR" style={{ height: 100, borderRadius: 6, border: '1px solid var(--border)', padding: 4, background: '#fff' }} /><button className="btn btn-outline btn-sm" onClick={() => setQuoteMeta(o => ({ ...o, company: { ...o.company, paymentQrUrl: '' } }))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const d = await fileToDataURL(f); setQuoteMeta(o => ({ ...o, company: { ...o.company, paymentQrUrl: d } })); } catch { } }} />
                <input className="input" style={{ marginTop: 8 }} placeholder="https://…/qr.png" value={quoteMeta.company.paymentQrUrl || ''} onChange={e => setQuoteMeta(o => ({ ...o, company: { ...o.company, paymentQrUrl: e.target.value } }))} />
              </div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}>
                <label className="field-label">Signature Image</label>
                {quoteMeta.commercials.signatureUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}><img src={quoteMeta.commercials.signatureUrl} alt="Sig" style={{ height: 48, borderRadius: 6, border: '1px solid var(--border)', padding: 4, background: '#fff' }} /><button className="btn btn-outline btn-sm" onClick={() => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, signatureUrl: '' } }))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const d = await fileToDataURL(f); setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, signatureUrl: d } })); } catch { } }} />
                <input className="input" style={{ marginTop: 8 }} placeholder="https://…/signature.png" value={quoteMeta.commercials.signatureUrl} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, signatureUrl: e.target.value } }))} />
              </div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}><label className="field-label">Signatory Name</label><input className="input" value={quoteMeta.commercials.signatoryName || ''} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, signatoryName: e.target.value } }))} placeholder="Authorized Signatory" /></div>
              <div className="field-group" style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
                  <input type="checkbox" checked={quoteMeta.commercials.needGstBill ?? false} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, needGstBill: e.target.checked } }))} /> Need GST Bill?
                </label>
                {quoteMeta.commercials.needGstBill && <div className="grid-2" style={{ marginTop: 8 }}>
                  <div className="field-group"><label className="field-label">Customer GSTIN</label><input className="input" placeholder="27AAACT1234F1Z5" value={quoteMeta.commercials.gstin || ''} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, gstin: e.target.value } }))} /></div>
                  <div className="field-group"><label className="field-label">Billing Address</label><input className="input" placeholder="Full billing address" value={quoteMeta.commercials.billingAddress || ''} onChange={e => setQuoteMeta(o => ({ ...o, commercials: { ...o.commercials, billingAddress: e.target.value } }))} /></div>
                </div>}
              </div>
            </div>
          </Box>
        )}
        {/* SETTINGS TAB */}
        {activeTab === 'settings' && <>
          <Box title="Stitching Types">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F3F4F6' }}>{['No.', 'Label', 'Rate (Rs/panel)', 'Actions'].map(h => <th key={h} style={{ textAlign: h === 'Rate (Rs/panel)' ? 'right' : h === 'Actions' ? 'center' : 'left', padding: '8px', border: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.stitchingTypes || []).map((t, idx) => <tr key={t.id}><td style={{ padding: '8px', border: '1px solid var(--border)' }}>{idx + 1}</td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input className="input" value={t.label || ''} onChange={e => handleStitchChange(idx, { label: e.target.value })} /></td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input type="number" className="input" inputMode="decimal" value={t.ratePerPanel ?? 0} onChange={e => handleStitchChange(idx, { ratePerPanel: +e.target.value })} style={{ textAlign: 'right' }} /></td><td style={{ padding: '8px', border: '1px solid var(--border)', textAlign: 'center' }}><button className="btn btn-danger btn-sm" onClick={() => handleDeleteStitch(idx)}>Remove</button></td></tr>)}
                  {!settings.stitchingTypes?.length && <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', border: '1px solid var(--border)' }}>No stitching types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={handleAddStitch}><Plus size={14} /> Add Stitching</button></div>
          </Box>
          <Box title="Lining Types">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F3F4F6' }}>{['No.', 'Label', 'Rate (Rs/m)', 'Actions'].map(h => <th key={h} style={{ textAlign: h === 'Rate (Rs/m)' ? 'right' : h === 'Actions' ? 'center' : 'left', padding: '8px', border: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.linings || []).map((l, idx) => <tr key={l.id}><td style={{ padding: '8px', border: '1px solid var(--border)' }}>{idx + 1}</td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input className="input" value={l.label || ''} onChange={e => handleLiningChange(idx, { label: e.target.value })} /></td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input type="number" className="input" inputMode="decimal" value={l.ratePerMeter ?? 0} onChange={e => handleLiningChange(idx, { ratePerMeter: +e.target.value })} style={{ textAlign: 'right' }} /></td><td style={{ padding: '8px', border: '1px solid var(--border)', textAlign: 'center' }}><button className="btn btn-danger btn-sm" onClick={() => handleDeleteLining(idx)}>Remove</button></td></tr>)}
                  {!settings.linings?.length && <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', border: '1px solid var(--border)' }}>No lining types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={handleAddLining}><Plus size={14} /> Add Lining</button></div>
          </Box>
          <Box title="Track Types">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F3F4F6' }}>{['No.', 'Label', 'Rate (Rs/ft)', 'Actions'].map(h => <th key={h} style={{ textAlign: h === 'Rate (Rs/ft)' ? 'right' : h === 'Actions' ? 'center' : 'left', padding: '8px', border: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.tracks || []).map((t, idx) => <tr key={t.id}><td style={{ padding: '8px', border: '1px solid var(--border)' }}>{idx + 1}</td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input className="input" value={t.label || ''} onChange={e => handleTrackChange(idx, { label: e.target.value })} /></td><td style={{ padding: '8px', border: '1px solid var(--border)' }}><input type="number" className="input" inputMode="decimal" value={t.ratePerFt ?? 0} onChange={e => handleTrackChange(idx, { ratePerFt: +e.target.value })} style={{ textAlign: 'right' }} /></td><td style={{ padding: '8px', border: '1px solid var(--border)', textAlign: 'center' }}><button className="btn btn-danger btn-sm" onClick={() => handleDeleteTrack(idx)}>Remove</button></td></tr>)}
                  {!settings.tracks?.length && <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', border: '1px solid var(--border)' }}>No track types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={handleAddTrack}><Plus size={14} /> Add Track</button></div>
          </Box>
          <Box title="Installation Rate">
            <div className="grid-3">
              <div className="field-group"><label className="field-label">Rate (Rs / track-ft)</label><input type="number" className="input" value={settings.installationRatePerTrackFt || 0} onChange={e => setSettings(s => ({ ...s, installationRatePerTrackFt: +e.target.value }))} inputMode="decimal" /></div>
            </div>
          </Box>
        </>}
      </div>
    </div>
  );
}