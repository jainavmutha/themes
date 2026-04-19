import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Download, Plus, Trash2, Copy, FileText } from "lucide-react";
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
  stitching: settings.stitchingTypes[0],
  lining: settings.linings[0],
  track: (settings.tracks && settings.tracks[0]) || {
    id: "std",
    label: "Standard Track",
    ratePerFt: settings.trackRatePerFt || 250,
  },
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
  
  /* Room card */
  .room-box { margin-bottom: 0; }
  .room-header { display: flex; align-items: center; padding: 8px 12px; background: #FBFBFC; border-bottom: 1px solid var(--border); gap: 8px; }
  .room-title-input { font-size: 15px; font-weight: 800; border: none; background: transparent; outline: none; flex: 1; }
  .room-actions { display: flex; gap: 4px; }
  .room-dims-grid { display: grid; grid-template-columns: repeat(3, minmax(180px,1fr)); gap: 12px; padding: 12px 12px 0; }
  @media (max-width: 640px) { .room-dims-grid { grid-template-columns: 1fr; } }

  /* Multi-fabric section */
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

  /* Stats / footer */
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

  /* Buttons */
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

  /* Summary */
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

  /* History */
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

/**
 * Compute cloth meters needed for a room's given dimensions + panels,
 * optionally with repeat. Used per-fabric entry.
 */
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

  const allowanceIn = room.isRomanBlind ? 10 : 12;
  const allowanceRep = room.isRomanBlind ? 10 : 8;

  const computedPanels = (widthIn || 0) / 20;
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

  const autoMeters = Math.ceil((adjLen * panels / 39) * 2) / 2;

  let metersOfCloth = autoMeters;
  const override = toNum(fabric.clothMeters);

  if (override > 0 && Number.isFinite(override)) metersOfCloth = override;
  if (!Number.isFinite(metersOfCloth) || metersOfCloth < 0) metersOfCloth = 0;

  return {
    panels,
    metersOfCloth,
    trackFeet: Math.max(1, ceilDiv(widthIn || 0, 12)),
  };
}

/**
 * Compute costs for a single fabric entry within a room.
 */
function computeFabricCost(room, fabric) {
  const { panels, metersOfCloth, trackFeet } = computeClothMeters(room, fabric);
  const clothCost = metersOfCloth * toNum(fabric.materialPrice);
  const stitchingCost = panels * (fabric.stitching?.ratePerPanel || 0);
  const liningCost = metersOfCloth * (fabric.lining?.ratePerMeter || 0);
  return { panels, metersOfCloth, trackFeet, clothCost, stitchingCost, liningCost };
}

/**
 * Compute full room cost across all fabrics + track + installation.
 */
function computeRoomCost(room, settings) {
  const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];

  let totalClothCost = 0;
  let totalStitchingCost = 0;
  let totalLiningCost = 0;
  let totalMeters = 0;
  let panels = 0;
  let trackFeet = 0;
  let totalTrackCost = 0;

  const fabricBreakdowns = fabrics.map((fab) => {
    const normalizedFab = {
      ...fab,
      track: fab.track || room.track || (settings.tracks && settings.tracks[0]) || {
        id: "std",
        label: "Standard Track",
        ratePerFt: settings.trackRatePerFt || 250,
      },
    };

    const fc = computeFabricCost(room, normalizedFab);

    const selectedTrackRate = normalizedFab.track?.ratePerFt;
    const trackRate = Number.isFinite(selectedTrackRate)
      ? selectedTrackRate
      : (settings?.trackRatePerFt || 0);

    const fabricTrackCost = room.needInstallation ? fc.trackFeet * trackRate : 0;

    totalClothCost += fc.clothCost;
    totalStitchingCost += fc.stitchingCost;
    totalLiningCost += fc.liningCost;
    totalMeters += fc.metersOfCloth;
    totalTrackCost += fabricTrackCost;
    panels += fc.panels;
    trackFeet += fc.trackFeet;

    return {
      ...normalizedFab,
      ...fc,
      trackCost: fabricTrackCost,
    };
  });

  let installationCost = 0;
  let usedInstallQty = 0;

  if (room.needInstallation) {
    const qty = toNum(room.installQtyFt);
    usedInstallQty = qty > 0 ? qty : 1;
    installationCost = usedInstallQty * (settings?.installationRatePerTrackFt || 0);
  }

  const subtotal =
    totalClothCost +
    totalStitchingCost +
    totalLiningCost +
    totalTrackCost +
    installationCost;

  return {
    panels,
    totalMeters,
    trackFeet,
    usedInstallQty,
    clothCost: totalClothCost,
    stitchingCost: totalStitchingCost,
    liningCost: totalLiningCost,
    trackCost: totalTrackCost,
    installationCost,
    subtotal,
    fabricBreakdowns,
  };
}

function computeFinalTotals(grandTotal, commercials, clothCost) {
  const { discountType, discountValue, gstRate, applyGst } = commercials;
  const discountAmount = discountType === "percent" ? clothCost * (discountValue / 100) : (discountValue || 0);
  const afterDiscount = Math.max(0, grandTotal - discountAmount);
  const gstAmount = applyGst ? afterDiscount * ((gstRate || 0) / 100) : 0;
  return { base: Math.round(grandTotal), discountAmount: Math.round(discountAmount), afterDiscount: Math.round(afterDiscount), gstAmount: Math.round(gstAmount), finalTotal: Math.round(afterDiscount + gstAmount) };
}

function computeAllTotals(rooms, commercials, settings, miscellaneousCosts = []) {
  const effectiveRooms = rooms.filter(r => r.include !== false);
  const roomTotals = effectiveRooms.map(r => ({ room: r, cost: computeRoomCost(r, settings) }));
  const clothTotal = roomTotals.reduce((s, x) => s + x.cost.clothCost, 0);
  const stitchingTotal = roomTotals.reduce((s, x) => s + x.cost.stitchingCost, 0);
  const liningTotal = roomTotals.reduce((s, x) => s + x.cost.liningCost, 0);
  const trackTotal = roomTotals.reduce((s, x) => s + x.cost.trackCost, 0);
  const installTotal = roomTotals.reduce((s, x) => s + x.cost.installationCost, 0);
  const miscTotal = (miscellaneousCosts || []).reduce((sum, item) => {
    const rate = toNum(item.rate);
    const qty = toNum(item.quantity) || 1;
    return sum + (rate * qty);
  }, 0);
  const otherTotal = stitchingTotal + liningTotal + trackTotal + installTotal + miscTotal;
  const { discountType, discountValue, gstRate, applyGst } = commercials;
  const discountAmount = discountType === "percent" ? clothTotal * (discountValue / 100) : (discountValue || 0);
  const netFabricTotal = Math.max(0, clothTotal - discountAmount);
  const afterDiscount = netFabricTotal + otherTotal;
  const gstAmount = applyGst ? afterDiscount * ((gstRate || 0) / 100) : 0;

  return {
    roomTotals,
    summary: {
      clothTotal: Math.round(clothTotal),
      stitchingTotal: Math.round(stitchingTotal),
      liningTotal: Math.round(liningTotal),
      trackTotal: Math.round(trackTotal),
      installTotal: Math.round(installTotal),
      miscTotal: Math.round(miscTotal),
      otherTotal: Math.round(otherTotal),
      base: Math.round(clothTotal + otherTotal),
      discountAmount: Math.round(discountAmount),
      netFabricTotal: Math.round(netFabricTotal),
      afterDiscount: Math.round(afterDiscount),
      gstAmount: Math.round(gstAmount),
      finalTotal: Math.round(afterDiscount + gstAmount),
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

const BlankMiscCost = () => ({
  id: crypto.randomUUID(),
  name: "",
  rate: "",
  quantity: "",
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
  pdfText(doc, `Quotation For: ${meta.customerName||'N/A'}`, rightX, y+32, {align:'right'});
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

/* ── NEW: Grouped summary with multi-fabric support ── */
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

function drawGroupedSummarySection(doc, m, y, rooms, settings, commercials, miscellaneousCosts = []) {
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), tw = pw-2*m;
  const ensureSpace = (h) => { if ((y+h) > (ph-24)) { doc.addPage(); y=m; } return y; };
  const rightText = (text, x, lineY) => { const s=String(text??''); doc.text(s, x-doc.getTextWidth(s), lineY); };

  const colAmount=90, colRate=90, colQty=90, colRoom=tw-colQty-colRate-colAmount;
  const colRoomX=m, colQtyX=colRoomX+colRoom, colRateX=colQtyX+colQty, colAmountX=colRateX+colRate;

  const fabricRows = buildFabricSummaryRows(rooms, settings);
  const fabricTotal = Math.round(fabricRows.reduce((s,r)=>s+r.amount,0));
  const {discountType, discountValue} = commercials||{};
  const discountAmount = discountType==="percent" ? fabricTotal*((discountValue||0)/100) : Math.round(discountValue||0);
  const netFabricTotal = Math.max(0, fabricTotal-discountAmount);
  const hasDiscount = Math.round(discountAmount)>0;

  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));

  const otherRows = [];
  // stitching (per fabric)
  { const smap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const k=fb.stitching?.id||'none';if(!smap.has(k))smap.set(k,{label:`Stitching - ${fb.stitching?.label||'N/A'}`,qty:0,qtyUnit:'panels',rate:fb.stitching?.ratePerPanel||0,amount:0});const row=smap.get(k);row.qty+=fb.panels;row.amount+=fb.stitchingCost;});}); smap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  // lining
  { const lmap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const k=fb.lining?.id||'none';if(!lmap.has(k))lmap.set(k,{label:`Lining - ${fb.lining?.label||'N/A'}`,qty:0,qtyUnit:'m',rate:fb.lining?.ratePerMeter||0,amount:0});const row=lmap.get(k);row.qty+=fb.metersOfCloth;row.amount+=fb.liningCost;});}); lmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  // track
  { const tmap=new Map(); roomCosts.forEach(({room,cost})=>{const k=room.track?.id||'none';if(!tmap.has(k))tmap.set(k,{label:`Track - ${room.track?.label||'N/A'}`,qty:0,qtyUnit:'ft',rate:Number.isFinite(room.track?.ratePerFt)?room.track.ratePerFt:(settings?.trackRatePerFt||0),amount:0});const row=tmap.get(k);row.qty+=cost.trackFeet;row.amount+=cost.trackCost;}); tmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  // installation
    // installation
  { const ti=Math.round(roomCosts.reduce((s,x)=>s+x.cost.installationCost,0)), tq=roomCosts.reduce((s,x)=>s+(x.cost.usedInstallQty||0),0); if(ti>0)otherRows.push({label:'Installation',qty:tq,qtyUnit:'pcs',rate:settings?.installationRatePerTrackFt||0,amount:ti}); }

  // miscellaneous costs
  (miscellaneousCosts || []).forEach((item) => {
    const name = String(item.name || '').trim();
    const rate = toNum(item.rate);
    const qty = toNum(item.quantity) || 1;
    const amount = rate * qty;
    if (name && Math.round(amount) > 0) {
      otherRows.push({ label: name, qty, qtyUnit: 'pcs', rate, amount });
    }
  });

  const otherCostsTotal = Math.round(otherRows.reduce((s,r)=>s+r.amount,0));

  const headerH=22, baseRowH=22, lineH=11;

  const drawTableHeader = (startY, columns) => {
    doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,startY,tw,headerH,'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    columns.forEach(col=>{if(col.align==='right')rightText(col.title,col.x+col.w-8,startY+14);else pdfText(doc,col.title,col.x+8,startY+14);});
    columns.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+headerH));
    return startY+headerH;
  };

  const wrapText = (text, maxW) => {
    const words=String(text??'').split(' '), lines=[];let cur='';
    words.forEach(word=>{const t=cur?`${cur} ${word}`:word;if(doc.getTextWidth(t)<=maxW)cur=t;else{if(cur)lines.push(cur);let w=word;while(doc.getTextWidth(w)>maxW&&w.length>4)w=w.slice(0,-2)+'...';cur=w;}});
    if(cur)lines.push(cur);return lines.length?lines:[''];
  };

  const drawDataRow = (startY, rowIdx, cells, colDefs) => {
    let maxLines=1;
    const wc=cells.map((cell,i)=>{const l=wrapText(String(cell??''),colDefs[i].w-16);if(l.length>maxLines)maxLines=l.length;return l;});
    const rowH=Math.max(baseRowH,maxLines*lineH+8);
    doc.setFillColor(rowIdx%2===0?255:250,rowIdx%2===0?255:250,rowIdx%2===0?255:250);
    doc.rect(m,startY,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,startY,tw,rowH,'S');
    colDefs.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+rowH));
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(30,30,30);
    cells.forEach((_,i)=>{const col=colDefs[i];const lines=wc[i];const ty=startY+lineH;if(col.align==='right')lines.forEach((l,li)=>rightText(l,col.x+col.w-8,ty+li*lineH));else lines.forEach((l,li)=>pdfText(doc,l,col.x+8,ty+li*lineH));});
    return rowH;
  };

  /* ── NEW: Room-wise fabric table ── */
  y = ensureSpace(50);
  y = drawSectionHeader(doc, m, y, 'FABRIC SUMMARY (ROOM-WISE)');

  // Columns: Room | Fabric Type | Cloth | Rate/m | Amount
  const colRoomW2 = 110, colFabricW = 130, colClothW = 70, colRateW = 80, colAmountW = tw - colRoomW2 - colFabricW - colClothW - colRateW;
  const colRoomX2 = m, colFabricX = colRoomX2+colRoomW2, colClothX = colFabricX+colFabricW, colRateX2 = colClothX+colClothW, colAmountX2 = colRateX2+colRateW;

  const roomFabricColDefs = [
    { title: 'Room',        x: colRoomX2,  w: colRoomW2,  align: 'left'  },
    { title: 'Fabric',      x: colFabricX, w: colFabricW, align: 'left'  },
    { title: 'Cloth (m)',   x: colClothX,  w: colClothW,  align: 'right' },
    { title: 'Rate/m',      x: colRateX2,  w: colRateW,   align: 'right' },
    { title: 'Amount',      x: colAmountX2,w: colAmountW, align: 'right' },
  ];

  // Estimate height
  const totalFabricEntries = effectiveRooms.reduce((s, r) => s + Math.max(1, (r.fabrics||[]).length), 0);
  y = ensureSpace(headerH + totalFabricEntries * baseRowH + 60);
  y = drawTableHeader(y, roomFabricColDefs);

  let globalRowIdx = 0;
  effectiveRooms.forEach((room) => {
    const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];
    if (!fabrics.length) {
      const rowH = drawDataRow(y, globalRowIdx++, [room.name||'Room', '—', '—', '—', '—'], roomFabricColDefs);
      y += rowH;
      return;
    }

    // Draw fabrics, spanning the room name across all fabric rows using manual row drawing
    const fabRowHeights = fabrics.map((fab) => {
      const fc = computeFabricCost(room, fab);
      const nameLines = wrapText(fab.materialName||'N/A', colFabricW-16);
      const roomLines = wrapText(room.name||'Room', colRoomW2-16);
      const maxL = Math.max(nameLines.length, roomLines.length, 1);
      return Math.max(baseRowH, maxL*lineH+8);
    });
    const totalRoomH = fabRowHeights.reduce((s,h)=>s+h, 0);

    // room name cell spans entire room height
    const isAlt = globalRowIdx % 2 === 0;
    const roomStartY = y;
    fabrics.forEach((fab, fi) => {
      const fc = computeFabricCost(room, fab);
      const rowH = fabRowHeights[fi];
      const ry = y + fabRowHeights.slice(0,fi).reduce((s,h)=>s+h,0);

      // bg
      doc.setFillColor(isAlt ? 255 : 250, isAlt ? 255 : 250, isAlt ? 255 : 250);
      doc.rect(colFabricX, ry, tw - colRoomW2, rowH, 'F');
      doc.setDrawColor(...pdfColor(BRAND.grid));
      doc.rect(colFabricX, ry, tw - colRoomW2, rowH, 'S');
      // column dividers
      [colClothX, colRateX2, colAmountX2].forEach(x => doc.line(x, ry, x, ry+rowH));

      // fabric type only
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(30,30,30);
      const nameText = fab.label || 'Fabric';
      wrapText(nameText, colFabricW-16).forEach((l,li)=>pdfText(doc,l,colFabricX+8,ry+lineH+li*lineH));

      // cloth qty, rate, amount
      rightText(`${fc.metersOfCloth.toFixed(2)} m`, colClothX+colClothW-8, ry+lineH);
      rightText(`Rs.${numberWithCommas(fab.materialPrice||0)}`, colRateX2+colRateW-8, ry+lineH);
      rightText(`Rs.${numberWithCommas(Math.round(fc.clothCost))}`, colAmountX2+colAmountW-8, ry+lineH);
    });

    // merged room cell with centered room name
    doc.setFillColor(isAlt ? 255 : 250, isAlt ? 255 : 250, isAlt ? 255 : 250);
    doc.rect(colRoomX2, roomStartY, colRoomW2, totalRoomH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid));
    doc.rect(colRoomX2, roomStartY, colRoomW2, totalRoomH, 'S');
    doc.line(colFabricX, roomStartY, colFabricX, roomStartY + totalRoomH);

    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(30,30,30);
    const roomLines = wrapText(room.name || 'Room', colRoomW2 - 16);
    const roomTextHeight = roomLines.length * lineH;
    const roomTextStartY = roomStartY + (totalRoomH - roomTextHeight) / 2 + lineH - 2;
    roomLines.forEach((l, li) => {
      pdfText(doc, l, colRoomX2 + colRoomW2 / 2, roomTextStartY + li * lineH, { align: 'center' });
    });

    y += totalRoomH;
    globalRowIdx++;
  });

  // Fabric subtotal
  { const rowH=baseRowH; doc.setFillColor(...pdfColor('#FFF7ED')); doc.rect(m,y,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,y,tw,rowH,'S'); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30); pdfText(doc,'Fabric Sub-Total',m+8,y+14); rightText(`Rs.${numberWithCommas(fabricTotal)}`,m+tw-8,y+14); y+=rowH; }
  if (hasDiscount) {
    const rowH=baseRowH; const dl=discountType==="percent"?`Discount (${Number(discountValue||0)}%)`:'Discount';
    doc.setFillColor(255,240,240); doc.rect(m,y,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,y,tw,rowH,'S'); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(180,30,30); pdfText(doc,dl,m+8,y+14); rightText(`-Rs.${numberWithCommas(discountAmount)}`,m+tw-8,y+14); y+=rowH;
    doc.setFillColor(...pdfColor('#E8F5E9')); doc.rect(m,y,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,y,tw,rowH,'S'); doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,100,40); pdfText(doc,'Net Fabric Total (after discount)',m+8,y+15); rightText(`Rs.${numberWithCommas(netFabricTotal)}`,m+tw-8,y+15); y+=rowH;
  }

  // Other costs
  y+=12; y=ensureSpace(50); y=drawSectionHeader(doc,m,y,'OTHER COSTS');
  const ocColDesc=tw-90-90-90, ocColQty=90, ocColRate=90, ocColAmount=90;
  const ocDescX=m, ocQtyX=ocDescX+ocColDesc, ocRateX=ocQtyX+ocColQty, ocAmountX=ocRateX+ocColRate;
  const otherColDefs=[{title:'Description',x:ocDescX,w:ocColDesc,align:'left'},{title:'Qty',x:ocQtyX,w:ocColQty,align:'right'},{title:'Rate',x:ocRateX,w:ocColRate,align:'right'},{title:'Amount',x:ocAmountX,w:ocColAmount,align:'right'}];
  y=ensureSpace(headerH+Math.max(1,otherRows.length)*baseRowH+baseRowH); y=drawTableHeader(y,otherColDefs);
  if(!otherRows.length){
    const rowH=baseRowH; doc.setFillColor(255,255,255); doc.rect(m,y,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,y,tw,rowH,'S'); doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80); pdfText(doc,'No additional costs',m+8,y+14); y+=rowH;
  } else {
    otherRows.forEach((row,idx)=>{
      const qtyText=row.qtyUnit==='m'?`${row.qty.toFixed(2)} m`:row.qtyUnit==='panels'?`${Math.round(row.qty)} panels`:row.qtyUnit==='ft'?`${Math.round(row.qty)} ft`:`${Math.round(row.qty)} pcs`;
      const rowH=drawDataRow(y,idx,[row.label,qtyText,`Rs.${numberWithCommas(row.rate)}`,`Rs.${numberWithCommas(Math.round(row.amount))}`],otherColDefs);
      y+=rowH;
    });
  }
  { const rowH=baseRowH; doc.setFillColor(...pdfColor('#FFF7ED')); doc.rect(m,y,tw,rowH,'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m,y,tw,rowH,'S'); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30); pdfText(doc,'Other Costs Total',m+8,y+14); rightText(`Rs.${numberWithCommas(otherCostsTotal)}`,m+tw-8,y+14); y+=rowH; }
  return y+6;
}

function drawFinalSummaryPanel(doc, m, y, meta, summary, sigDataURL) {
  const pw=doc.internal.pageSize.getWidth(), ph=doc.internal.pageSize.getHeight(), qrDataUrl=meta.company?.paymentQrUrl;
  const sectionW=pw-2*m, gap=16, halfW=(sectionW-gap)/2, leftX=m, rightX=m+halfW+gap, qrSize=132;
  const lines=[
    {label:summary.discountAmount>0?'Net Fabric (after discount)':'Fabric Total',value:`Rs.${numberWithCommas(summary.netFabricTotal??summary.clothTotal)}`,bold:false,grandTotal:false},
    {label:'Other Costs',value:`Rs.${numberWithCommas(summary.otherTotal)}`,bold:false,grandTotal:false},
  ];
  if(meta.commercials.applyGst&&summary.gstAmount>0) lines.push({label:`GST (${meta.commercials.gstRate||0}%)`,value:`Rs.${numberWithCommas(summary.gstAmount)}`,bold:false,grandTotal:false});
  lines.push({label:'GRAND TOTAL',value:`Rs.${numberWithCommas(summary.finalTotal)}`,bold:true,grandTotal:true});
  const rowH=22, signatureH=62, blockH=Math.max(180,lines.length*rowH+signatureH+8);
  if(y+blockH>ph-24){y=Math.max(m,ph-blockH-24);}
  y=drawSectionHeader(doc,m,y,'GRAND TOTAL SUMMARY');
  doc.setDrawColor(...pdfColor(BRAND.grid)); doc.setLineWidth(0.5); doc.roundedRect(leftX,y,halfW,blockH,6,6,'S');
  doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc,'Scan to Pay',leftX+(halfW/2),y+18,{align:'center'});
  if(qrDataUrl){try{const qrBoxX=leftX+(halfW-qrSize)/2,qrBoxY=y+28;doc.roundedRect(qrBoxX,qrBoxY,qrSize,qrSize,6,6,'S');doc.addImage(qrDataUrl,'PNG',qrBoxX+4,qrBoxY+4,qrSize-8,qrSize-8);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.grid)); doc.roundedRect(rightX,y,halfW,blockH,6,6,'S');
  const totalsStartY=y+8;
  lines.forEach((it,i)=>{
    const ry=totalsStartY+i*rowH;
    if(it.grandTotal){doc.setFillColor(...pdfColor(BRAND.primary));doc.rect(rightX,ry,halfW,rowH+4,'F');doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(255,255,255);pdfText(doc,it.label,rightX+8,ry+15);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}
    else{if(i%2===0)doc.setFillColor(255,255,255);else doc.setFillColor(250,250,250);doc.rect(rightX,ry,halfW,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(rightX,ry,halfW,rowH,'S');doc.setFont('helvetica',it.bold?'bold':'normal');doc.setFontSize(10);doc.setTextColor(50,50,50);pdfText(doc,it.label,rightX+8,ry+15);doc.setTextColor(30,30,30);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}
  });
  const sigTopY=y+blockH-signatureH+2;
  if(sigDataURL){try{doc.addImage(sigDataURL,'PNG',rightX+4,sigTopY,120,32);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.primary)); doc.setLineWidth(0.8); doc.line(rightX+4,sigTopY+34,rightX+halfW-4,sigTopY+34);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  pdfText(doc,meta.commercials.signatoryName||'Authorized Signatory',rightX+4,sigTopY+46);
  doc.setFont('helvetica','italic');
  pdfText(doc,meta.commercials.signatoryTitle||`For ${meta.company.pdfCompanyName||meta.company.name||'Themes Furnishings & Decor'}`,rightX+4,sigTopY+58);
  return y+blockH;
}

function estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts = []) {
  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const totalFabricEntries = effectiveRooms.reduce((s,r)=>s+Math.max(1,(r.fabrics||[]).length),0);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));
  const stitchKeys=new Set(), liningKeys=new Set(), trackKeys=new Set();
  let hasInstall=false;
  roomCosts.forEach(({room,cost})=>{
    cost.fabricBreakdowns.forEach(fb=>{if(Math.round(fb.stitchingCost||0)>0)stitchKeys.add(fb.stitching?.id||'none');if(Math.round(fb.liningCost||0)>0)liningKeys.add(fb.lining?.id||'none');});
    if(Math.round(cost.trackCost||0)>0)trackKeys.add(room.track?.id||'none');
    if(Math.round(cost.installationCost||0)>0)hasInstall=true;
  });
  const miscRowCount = (miscellaneousCosts || []).filter(item => String(item.name || '').trim() && Math.round(toNum(item.rate) * (toNum(item.quantity) || 1)) > 0).length;
  const otherRowCount=Math.max(1,stitchKeys.size+liningKeys.size+trackKeys.size+(hasInstall?1:0)+miscRowCount);
  const {discountType,discountValue}=meta?.commercials||{};
  const hasDiscount=discountType==="percent"?Number(discountValue||0)>0:Math.round(discountValue||0)>0;
  return Math.max(842, Math.ceil(
    116 + (meta?.commercials?.needGstBill?52:0) + 34 +
    30 + 22 + totalFabricEntries*26 + 24 + (hasDiscount?48:0) +
    42 + 22 + otherRowCount*24 + 24 +
    220 + 28
  ));
}

async function generateFullPDF(rooms, meta, settings, miscellaneousCosts = []) {
  const logoDataURL = await imageToDataURL(meta.company.logoUrl);
  const paymentQrDataURL = await imageToDataURL(meta.company.paymentQrUrl);
  const sigDataURL = await imageToDataURL(meta.commercials.signatureUrl);

  if (paymentQrDataURL) {
    meta = { ...meta, company: { ...meta.company, paymentQrUrl: paymentQrDataURL } };
  }

  const m = 36;
  const pageWidth = 595.28;
  const pageHeight = estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });

  let y = drawHeader(doc, m, meta, logoDataURL);
  y = drawGstBlock(doc, m, y, meta);
  y = drawSectionHeader(doc, m, y, meta.quoteNo ? `QUOTATION - ${meta.quoteNo}` : 'QUOTATION');

  const all = computeAllTotals(rooms, meta.commercials, settings, miscellaneousCosts);
  y = drawGroupedSummarySection(doc, m, y, rooms, settings, meta.commercials, miscellaneousCosts);

  drawFinalSummaryPanel(doc, m, y, meta, all.summary, sigDataURL);
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

/* =========================
   FabricRow sub-component
   ========================= */
const FabricRow = React.memo(function FabricRow({ fabric, room, settings, onChange, onRemove, canRemove }) {
  const fc = useMemo(() => computeFabricCost(room, fabric), [room, fabric]);

  return (
    <div className="fabric-row">
      <div className="fabric-row-header">
        <span className="fabric-label-badge">{fabric.label || "Fabric"}</span>

        <input
          className="input"
          value={fabric.label || ""}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Label e.g. Main / Sheer"
          style={{ flex: 1, marginLeft: 8, maxWidth: 180 }}
        />

        <span className="fabric-cost-pill">
          {currency(fc.clothCost + fc.stitchingCost + fc.liningCost)}
        </span>

        {canRemove && (
          <button className="btn-remove-fabric" onClick={onRemove} title="Remove fabric">
            ×
          </button>
        )}
      </div>

      <div className="fabric-row-grid">
        <Field label="Length" hint="value + unit">
          <div style={{ display: 'flex', gap: 8 }}>
            <UnitInput
              unit={fabric.lengthUnit || 'in'}
              value={fabric.lengthInch}
              onChange={e => onChange({ lengthInch: e.target.value })}
              inputMode="decimal"
              placeholder="e.g. 90"
            />

            <select
              className="select"
              style={{ width: 76 }}
              value={fabric.lengthUnit || 'in'}
              onChange={e => onChange({ lengthUnit: e.target.value })}
            >
              <option value="in">in</option>
              <option value="ft">ft</option>
              <option value="m">m</option>
            </select>
          </div>
        </Field>

        <Field label="Width" hint="value + unit">
          <div style={{ display: 'flex', gap: 8 }}>
            <UnitInput
              unit={fabric.widthUnit || 'in'}
              value={fabric.widthInch}
              onChange={e => onChange({ widthInch: e.target.value })}
              inputMode="decimal"
              placeholder="e.g. 60"
            />

            <select
              className="select"
              style={{ width: 76 }}
              value={fabric.widthUnit || 'in'}
              onChange={e => onChange({ widthUnit: e.target.value })}
            >
              <option value="in">in</option>
              <option value="ft">ft</option>
              <option value="m">m</option>
            </select>
          </div>
        </Field>

        <Field label="Panels" hint="auto-calculated">
          <UnitInput
            unit="pcs"
            value={fabric.panels ?? ""}
            onChange={e => onChange({ panels: e.target.value })}
            inputMode="decimal"
            placeholder={Number(fc.panels).toFixed(2)}
          />
        </Field>

        <Field label="Repeat">
          <select
            className="select"
            value={fabric.repeat || 'no'}
            onChange={e => onChange({
              repeat: e.target.value,
              ...(e.target.value === 'no' ? { repeatCm: '' } : {}),
            })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>

        {fabric.repeat === 'yes' && (
          <Field label="Repeat Size" hint="cm">
            <UnitInput
              unit="cm"
              value={fabric.repeatCm}
              onChange={e => onChange({ repeatCm: e.target.value })}
              inputMode="decimal"
              placeholder="e.g. 25"
            />
          </Field>
        )}

        <Field label="Track Type">
          <select
            className="select"
            value={fabric.track?.id || ""}
            onChange={e => onChange({
              track: (settings.tracks || []).find(t => t.id === e.target.value) || null,
            })}
          >
            {(settings.tracks || []).map(t => (
              <option key={t.id} value={t.id}>
                {t.label} (Rs.{t.ratePerFt}/ft)
              </option>
            ))}
          </select>
        </Field>

        <Field label="Material Name">
          <input
            className="input"
            value={fabric.materialName || ""}
            onChange={e => onChange({ materialName: e.target.value })}
            placeholder="e.g. Velvet, Sheer"
          />
        </Field>

        <Field label="Price / m">
          <UnitInput
            unit="Rs/m"
            value={fabric.materialPrice}
            onChange={e => onChange({ materialPrice: e.target.value })}
            inputMode="decimal"
            placeholder="e.g. 350"
          />
        </Field>

        <Field label="Cloth" hint={`auto: ${fc.metersOfCloth.toFixed(2)} m`}>
          <UnitInput
            unit="m"
            value={fabric.clothMeters ?? ""}
            onChange={e => onChange({ clothMeters: e.target.value })}
            inputMode="decimal"
            placeholder={fc.metersOfCloth.toFixed(2)}
          />
        </Field>

        <Field label="Stitching">
          <select
            className="select"
            value={fabric.stitching?.id || ""}
            onChange={e => onChange({
              stitching: settings.stitchingTypes.find(s => s.id === e.target.value),
            })}
          >
            {settings.stitchingTypes.map(s => (
              <option key={s.id} value={s.id}>
                {s.label} (Rs.{s.ratePerPanel}/panel)
              </option>
            ))}
          </select>
        </Field>

        <Field label="Lining">
          <select
            className="select"
            value={fabric.lining?.id || ""}
            onChange={e => onChange({
              lining: settings.linings.find(l => l.id === e.target.value),
            })}
          >
            {settings.linings.map(l => (
              <option key={l.id} value={l.id}>
                {l.label} (Rs.{l.ratePerMeter}/m)
              </option>
            ))}
          </select>
        </Field>
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

  useEffect(() => {
    return () => { if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; } syncToParent(); };
  }, [syncToParent]);

  // Sync when room prop changes from outside (quote load)
  const prevRoomJson = useRef(JSON.stringify(room));
  useEffect(() => {
    const newJson = JSON.stringify(room);
    if (newJson !== prevRoomJson.current) { setLocalRoom(room); prevRoomJson.current = newJson; }
  }, [room]);

  const metaRef = useRef(null); // will be set from parent via prop if needed
  const quoteNoRef = useRef(null);

  const handleDownload = useCallback(async () => {
    syncToParent();
    // Generate a simple single-room PDF
    const { jsPDF: J } = await import("jspdf");
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const m = 36, pw = doc.internal.pageSize.getWidth(), tw = pw - 2 * m;
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...pdfColor(BRAND.primary));
    pdfText(doc, BRAND.pdfCompanyName, m, m + 14);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(...pdfColor(BRAND.muted));
    pdfText(doc, `Room: ${localRoomRef.current.name||"Room"}  |  Date: ${new Date().toLocaleDateString('en-IN')}`, m, m + 28);
    doc.save(`${(localRoomRef.current.name || "Room").replace(/\s+/g, "_")}.pdf`);
  }, [syncToParent]);

  // Fabric handlers
  const handleFabricChange = useCallback((fabricId, patch) => {
    setLocalRoom(prev => ({
      ...prev,
      fabrics: prev.fabrics.map(f => f.id === fabricId ? { ...f, ...patch } : f)
    }));
    scheduleSync();
  }, [scheduleSync]);

  const handleAddFabric = useCallback(() => {
    setLocalRoom(prev => ({
      ...prev,
      fabrics: [...prev.fabrics, BlankFabric(settings, prev.fabrics.length === 1 ? "Sheer" : `Fabric ${prev.fabrics.length + 1}`)]
    }));
    scheduleSync();
  }, [settings, scheduleSync]);

  const handleRemoveFabric = useCallback((fabricId) => {
    setLocalRoom(prev => ({
      ...prev,
      fabrics: prev.fabrics.filter(f => f.id !== fabricId)
    }));
    scheduleSync();
  }, [scheduleSync]);

  return (
    <div className="box room-box">
      {/* Room header */}
      <div className="room-header">
        <input type="checkbox" checked={localRoom.include !== false} onChange={e => handleSelectChange({ include: e.target.checked })} style={{ transform: 'scale(1.2)', flexShrink: 0 }} />
        <input value={localRoom.name || ''} onChange={e => handleChange('name', e.target.value)} onBlur={syncToParent} onFocus={e => e.currentTarget.select()} className="room-title-input" placeholder="Room Name" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginRight: 8, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!localRoom.isRomanBlind} onChange={e => handleSelectChange({ isRomanBlind: e.target.checked })} /> Roman Blind
        </label>
        <div className="room-actions">
          <button className="btn-icon" onClick={() => onClone(room.id)} title="Duplicate"><Copy size={15} /></button>
          <button className="btn-icon text-danger" onClick={() => onDelete(room.id)} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>

      

      {/* Fabrics section */}
      <div className="fabrics-section">
        <div className="fabrics-section-header">
          <span className="fabrics-section-title">Fabrics ({localRoom.fabrics?.length || 0})</span>
          <button className="btn btn-outline btn-sm" onClick={handleAddFabric} style={{ fontSize: 11 }}>
            <Plus size={12} /> Add Fabric
          </button>
        </div>
        {(localRoom.fabrics || []).map(fabric => (
          <FabricRow
            key={fabric.id}
            fabric={fabric}
            room={localRoom}
            settings={settings}
            onChange={patch => handleFabricChange(fabric.id, patch)}
            onRemove={() => handleRemoveFabric(fabric.id)}
            canRemove={(localRoom.fabrics || []).length > 1}
          />
        ))}
      </div>

      <div className="room-dims-grid" style={{ paddingTop: 0 }}>
  <Field label="Installation">
    <select
      className="select"
      value={localRoom.needInstallation ? "yes" : "no"}
      onChange={e => {
        const yes = e.target.value === 'yes';
        handleSelectChange({
          needInstallation: yes,
          installQtyFt: yes ? localRoom.installQtyFt : "",
        });
      }}
    >
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </Field>

  {localRoom.needInstallation && (
    <Field label="Install Qty" hint="pcs">
      <UnitInput
        value={localRoom.installQtyFt}
        onChange={e => handleChange("installQtyFt", e.target.value)}
        onBlur={syncToParent}
        inputMode="decimal"
        placeholder="e.g. 45"
        unit="pcs"
      />
    </Field>
  )}
</div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Cloth</div><div className="stat-value">{currency(cost.clothCost)}</div></div>
        <div className="stat"><div className="stat-label">Stitch</div><div className="stat-value">{currency(cost.stitchingCost)}</div></div>
        <div className="stat"><div className="stat-label">Lining</div><div className="stat-value">{currency(cost.liningCost)}</div></div>
        <div className="stat"><div className="stat-label">Track</div><div className="stat-value">{currency(cost.trackCost)}</div></div>
        <div className="stat"><div className="stat-label">Install</div><div className="stat-value">{currency(cost.installationCost)}</div></div>
      </div>

      <div className="room-footer">
        <div className="pills">
          <Pill>{Number(cost.panels).toFixed(2)} panels</Pill>
          <Pill>{cost.totalMeters.toFixed(1)} m total</Pill>
          <Pill>{cost.trackFeet} ft</Pill>
          <Pill>{(localRoom.fabrics||[]).length} fabric{(localRoom.fabrics||[]).length !== 1 ? 's' : ''}</Pill>
        </div>
        <div className="total-group">
          <div className="total-amount" style={{ opacity: localRoom.include !== false ? 1 : 0.45 }}>
            {currency(cost.subtotal)}
          </div>
        </div>
      </div>
    </div>
  );
});
RoomCard.displayName = 'RoomCard';

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
      } catch (err) { console.error("Could not load shared settings", err); if (!cancelled) setLoadedBanner("Could not load shared settings."); }
      finally { if (!cancelled) { settingsHydratedRef.current = true; setSettingsReady(true); } }
    }
    hydrateSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (!settingsHydratedRef.current || !hasSupabaseConfig()) return;
    const timer = setTimeout(() => { saveRemoteSettings(settings).catch(err => { console.error(err); setLoadedBanner("Could not save settings online."); }); }, 500);
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
    generateQuoteNo().then(no => { if (!cancelled) setQuoteNo(no); }).catch(err => { console.error(err); if (!cancelled) setLoadedBanner("Draft mode (no database)."); });
    return () => { cancelled = true; };
  }, []);

  const [activeTab, setActiveTab] = useState('quote');
  const [historySearch, setHistorySearch] = useState("");
  const [allQuotes, setAllQuotes] = useState([]);

  const metaRef = useRef(quoteMeta);
  useEffect(() => { metaRef.current = quoteMeta; }, [quoteMeta]);
  const quoteNoRef = useRef(quoteNo);
  useEffect(() => { quoteNoRef.current = quoteNo; }, [quoteNo]);
  const printableRefMap = useStableRefMap();

  const refreshQuoteList = useCallback(async () => {
    try { const map = await loadAllQuotes(); const arr = Object.values(map||{}); arr.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0)); setAllQuotes(arr); }
    catch (err) { console.error(err); setLoadedBanner("Could not load saved quotes."); }
  }, []);

  useEffect(() => { refreshQuoteList(); }, [refreshQuoteList]);

  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'global-curtain-css';
    styleEl.textContent = GLOBAL_CSS;
    document.head.appendChild(styleEl);
    return () => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); };
  }, []);

  const filteredQuotes = useMemo(() => {
    if (!historySearch.trim()) return allQuotes;
    const q = historySearch.trim().toLowerCase();
    return allQuotes.filter(rec => String(rec.quoteNo||'').toLowerCase().includes(q) || String(rec.customer?.name||'').toLowerCase().includes(q));
  }, [allQuotes, historySearch]);

  const loadQuoteRecord = useCallback((rec) => {
    if (!rec) return;
    setQuoteNo(rec.quoteNo);
    // Migrate old rooms (no fabrics array) to new format
    const migratedRooms = (rec.rooms && rec.rooms.length ? rec.rooms : [BlankRoom(1, settings)]).map(r => {
      if (r.fabrics && r.fabrics.length) return r;
      // old format: single fabric, migrate materialName/materialPrice/stitching/lining to fabrics array
      return {
        ...r,
        fabrics: [BlankFabric(settings, "Main", {
          materialName: r.materialName || "",
          materialPrice: r.materialPrice || "",
          clothMeters: r.clothMeters || "",
          stitching: r.stitching || settings.stitchingTypes[0],
          lining: r.lining || settings.linings[0],
        })],
      };
    });
    setRooms(migratedRooms);
setMiscellaneousCosts(Array.isArray(rec.miscellaneousCosts) ? rec.miscellaneousCosts : []);
    setQuoteMeta(prev => ({
      ...prev,
      customerName: rec.customer?.name || '',
      customerPhone: rec.customer?.phone || '',
      projectTitle: rec.customer?.project || 'Curtain Quotation',
      company: rec.company ? { ...prev.company, ...rec.company } : prev.company,
      commercials: { ...prev.commercials, ...(rec.commercials||{}), signatoryTitle: rec.commercials?.signatoryTitle === 'For Themes Furnishings and Linens' ? '' : (rec.commercials?.signatoryTitle||'') },
    }));
    setLoadedBanner(`Loaded ${rec.quoteNo}${rec.customer?.name ? ` — ${rec.customer.name}` : ''}`);
    setActiveTab('quote');
    setTimeout(() => setLoadedBanner(''), 4000);
  }, [settings]);

  const handleSaveQuote = useCallback(async () => {
  try {
    const allTotals = computeAllTotals(rooms, quoteMeta.commercials, settings, miscellaneousCosts);
    const finalNo = quoteNo || await generateQuoteNo();
    setQuoteNo(finalNo);

    await saveQuoteRecord(finalNo, {
      customer: {
        name: quoteMeta.customerName,
        phone: quoteMeta.customerPhone,
        project: quoteMeta.projectTitle,
      },
      company: quoteMeta.company,
      commercials: quoteMeta.commercials,
      rooms,
      miscellaneousCosts,
      settingsSnapshot: settings,
      snapshot: allTotals,
      createdAt: new Date().toISOString(),
    });

    await refreshQuoteList();
    setLoadedBanner(`Saved as ${finalNo}${hasSupabaseConfig() ? " online" : " on this browser"}`);
    setTimeout(() => setLoadedBanner(''), 3000);
  } catch (err) {
    console.error(err);
    setLoadedBanner("Could not save quote.");
  }
}, [quoteNo, rooms, miscellaneousCosts, quoteMeta, settings, refreshQuoteList]);

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
    catch (err) { console.error(err); setLoadedBanner("Could not delete quote."); }
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
  const miscTotal = useMemo(
  () => miscellaneousCosts.reduce((sum, item) => sum + (toNum(item.rate) * (toNum(item.quantity) || 1)), 0),
  [miscellaneousCosts]
);

const finalTotals = useMemo(
  () => computeFinalTotals(grandTotal + miscTotal, quoteMeta.commercials, totalClothCost),
  [grandTotal, miscTotal, quoteMeta.commercials, totalClothCost]
);

const handleAddMiscCost = useCallback(() => {
  setMiscellaneousCosts(prev => [...prev, BlankMiscCost()]);
}, []);

const handleMiscCostChange = useCallback((id, patch) => {
  setMiscellaneousCosts(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
}, []);

const handleDeleteMiscCost = useCallback((id) => {
  setMiscellaneousCosts(prev => prev.filter(item => item.id !== id));
}, []);

  const handleAddStitch = useCallback(() => setSettings(s => ({ ...s, stitchingTypes: [...(s.stitchingTypes||[]), { id: crypto.randomUUID(), label: "New Stitch", ratePerPanel: 0 }] })), []);
  const handleStitchChange = useCallback((idx, patch) => setSettings(s => { const arr=[...(s.stitchingTypes||[])]; arr[idx]={...arr[idx],...patch}; return {...s,stitchingTypes:arr}; }), []);
  const handleDeleteStitch = useCallback((idx) => setSettings(s => { const arr=[...(s.stitchingTypes||[])]; arr.splice(idx,1); return {...s,stitchingTypes:arr}; }), []);
  const handleAddLining = useCallback(() => setSettings(s => ({ ...s, linings: [...(s.linings||[]), { id: crypto.randomUUID(), label: "New Lining", ratePerMeter: 0 }] })), []);
  const handleLiningChange = useCallback((idx, patch) => setSettings(s => { const arr=[...(s.linings||[])]; arr[idx]={...arr[idx],...patch}; return {...s,linings:arr}; }), []);
  const handleDeleteLining = useCallback((idx) => setSettings(s => { const arr=[...(s.linings||[])]; arr.splice(idx,1); return {...s,linings:arr}; }), []);
  const handleAddTrack = useCallback(() => setSettings(s => ({ ...s, tracks: [...(s.tracks||[]), { id: crypto.randomUUID(), label: "New Track", ratePerFt: 0 }] })), []);
  const handleTrackChange = useCallback((idx, patch) => setSettings(s => { const arr=[...(s.tracks||[])]; arr[idx]={...arr[idx],...patch}; return {...s,tracks:arr}; }), []);
  const handleDeleteTrack = useCallback((idx) => setSettings(s => { const arr=[...(s.tracks||[])]; arr.splice(idx,1); return {...s,tracks:arr}; }), []);

  return (
    <div className="app-container">
      <div className="app-inner">
        {/* Header */}
        <div className="hero-box">
          <div className="hero-brand">
            {quoteMeta.company.logoUrl && <img src={normalizeImageUrl(quoteMeta.company.logoUrl)} alt="Logo" className="hero-logo" onError={e=>{const id=getGoogleDriveFileId(quoteMeta.company.logoUrl);const fb=id?`https://drive.google.com/thumbnail?id=${id}&sz=w1000`:quoteMeta.company.logoUrl;if(e.currentTarget.src!==fb)e.currentTarget.src=fb;}} />}
            <div><h1 className="hero-title">Curtain Quotation</h1><p className="hero-subtitle">Themes Furnishings & Decor</p></div>
          </div>
          <div className="hero-actions">
            {activeTab === 'quote' && <>
              <button onClick={handleNewQuote} className="btn btn-outline btn-sm"><Plus size={15} /> New Quote</button>
              <button onClick={addRoom} className="btn btn-primary btn-sm"><Plus size={15} /> Room</button>
              <button onClick={async()=>{try{const meta={...quoteMeta,quoteNo};const doc=await generateFullPDF(rooms,meta,settings,miscellaneousCosts);doc.save(`Quote_${quoteMeta.customerName||"Customer"}_${quoteNo||"Draft"}.pdf`);}catch(err){console.error(err);setLoadedBanner("Could not download PDF.");}}} className="btn btn-outline btn-sm"><Download size={15} /> Full PDF</button>
              <button onClick={handleSaveQuote} className="btn btn-primary btn-sm">Save</button>
            </>}
            {activeTab === 'history' && <button onClick={handleNewQuote} className="btn btn-primary btn-sm"><Plus size={15} /> New Quote</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-box">
          {[['quote','Quote'],['history','Saved Quotes'],['company','Company'],['settings','Settings']].map(([id,label])=>(
            <button key={id} className={`tab ${activeTab===id?'tab-active':''}`} onClick={()=>setActiveTab(id)}>{label}</button>
          ))}
        </div>

        {/* QUOTE TAB */}
        {activeTab === 'quote' && <>
          {loadedBanner && <div className="loaded-banner">{loadedBanner}</div>}
          <Box title="Customer Details">
            <div className="grid-3">
              <div className="field-group"><label className="field-label">Customer Name</label><input className="input" value={quoteMeta.customerName} onChange={e=>setQuoteMeta(o=>({...o,customerName:e.target.value}))} onFocus={e=>e.currentTarget.select()} placeholder="Customer Name" /></div>
              <div className="field-group"><label className="field-label">Phone</label><input className="input" value={quoteMeta.customerPhone} onChange={e=>setQuoteMeta(o=>({...o,customerPhone:e.target.value}))} onFocus={e=>e.currentTarget.select()} placeholder="+91 98765 43210" /></div>
              <div className="field-group"><label className="field-label">Project</label><input className="input" value={quoteMeta.projectTitle} onChange={e=>setQuoteMeta(o=>({...o,projectTitle:e.target.value}))} onFocus={e=>e.currentTarget.select()} placeholder="e.g. Living Room" /></div>
            </div>
            {quoteNo && <div style={{marginTop:10}}><span className="current-quote-badge">{quoteNo}</span></div>}
          </Box>

          <Box title="Rooms">
            {rooms.length === 0 && <div className="empty-box">No rooms yet. Click "+ Room" above to add.</div>}
            {rooms.map((r, idx) => (
              <React.Fragment key={r.id}>
                <RoomCard room={r} onClone={cloneRoom} onDelete={deleteRoom} updateRoom={updateRoom} settings={settings} />
                <div className="add-room-between">
                  <button className="btn btn-outline btn-sm" onClick={()=>addRoomAfter(idx)} style={{borderStyle:'dashed',fontSize:12}}>
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
              <Field label="Cost Name">
                <input
                  className="input"
                  value={item.name || ''}
                  onChange={e => handleMiscCostChange(item.id, { name: e.target.value })}
                  placeholder="e.g. Transport, Labour, Hardware"
                />
              </Field>

              <Field label="Cost / Unit">
                <UnitInput
                  unit="Rs"
                  value={item.rate}
                  onChange={e => handleMiscCostChange(item.id, { rate: e.target.value })}
                  inputMode="decimal"
                  placeholder="e.g. 500"
                />
              </Field>

              <Field label="Quantity">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <UnitInput
                    unit="qty"
                    value={item.quantity}
                    onChange={e => handleMiscCostChange(item.id, { quantity: e.target.value })}
                    inputMode="decimal"
                    placeholder="1"
                  />

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
      <button className="btn btn-outline btn-sm" onClick={handleAddMiscCost}>
        <Plus size={13} /> Add Miscellaneous Cost
      </button>

      <div style={{ fontWeight: 900, color: 'var(--primary)' }}>
        Total: {currency(miscTotal)}
      </div>
    </div>
  </div>
</Box>

          <Box title="Summary & Grand Total">
            <div className="summary-inner">
              <div className="summary-list">
                <div className="summary-item"><div className="summary-name">Total Cloth Cost</div><div className="summary-total">{currency(totalClothCost)}</div></div>
                <div className="summary-item"><div className="summary-name">Total Other Costs (Stitching, Lining, Track, Install)</div><div className="summary-total">{currency(totalOther + miscTotal)}</div></div>
              </div>
              <div className="commercial-grid">
                <div className="commercial-card">
                  <div className="commercial-title">Discount (on Fabric)</div>
                  <div className="commercial-controls">
                    <select className="select-xs" value={quoteMeta.commercials.discountType} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,discountType:e.target.value}}))}>
                      <option value="percent">%</option><option value="fixed">Rs</option>
                    </select>
                    <input type="number" className="input-xs" value={quoteMeta.commercials.discountValue} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,discountValue:+e.target.value}}))} />
                    <span className="commercial-amount text-danger">-{currency(finalTotals.discountAmount)}</span>
                  </div>
                  <div className="commercial-note">After Discount: {currency(finalTotals.afterDiscount)}</div>
                </div>
                <div className="commercial-card">
                  <div className="commercial-title">GST</div>
                  <div className="commercial-controls">
                    <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13}}>
                      <input type="checkbox" checked={quoteMeta.commercials.applyGst} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,applyGst:e.target.checked}}))} /> Apply GST
                    </label>
                    {quoteMeta.commercials.applyGst && <>
                      <input type="number" className="input-xs" style={{width:52}} value={quoteMeta.commercials.gstRate} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,gstRate:+e.target.value}}))} />
                      <span style={{fontSize:12}}>% = {currency(finalTotals.gstAmount)}</span>
                    </>}
                  </div>
                </div>
              </div>
              <div className="grand-total-box">
                <div className="final-row"><span className="final-label">Grand Total</span><span className="final-amount">{currency(finalTotals.finalTotal)}</span></div>
              </div>
              <div className="save-bottom-bar">
                <span className="save-bottom-label">{quoteNo ? `Quote: ${quoteNo}` : 'Not yet saved'}</span>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button onClick={async()=>{const meta={...quoteMeta,quoteNo};const doc=await generateFullPDF(rooms,meta,settings,miscellaneousCosts);doc.save(`Quote_${quoteMeta.customerName||"Customer"}_${quoteNo||"Draft"}.pdf`);}} className="btn btn-outline btn-sm"><Download size={14} /> Download PDF</button>
                  <button onClick={handleSaveQuote} className="btn btn-primary">Save Quote</button>
                </div>
              </div>
            </div>
          </Box>
        </>}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <Box title="Saved Quotes">
            <div className="history-toolbar">
              <input className="history-search" placeholder="Search by quote no or customer name…" value={historySearch} onChange={e=>setHistorySearch(e.target.value)} />
              <button className="btn btn-outline btn-sm" onClick={()=>refreshQuoteList()}>↻ Refresh</button>
            </div>
            {filteredQuotes.length === 0 ? (
              <div className="empty-box">{historySearch?`No quotes matching "${historySearch}"`:hasSupabaseConfig()?'No online quotes yet.':'No saved quotes yet on this browser.'}</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table className="history-table">
                  <thead><tr><th>Quote No</th><th>Customer</th><th>Project</th><th>Rooms</th><th>Grand Total</th><th>Date</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredQuotes.map(rec=>{
                      const total=rec.snapshot?.summary?.finalTotal, date=rec.updatedAt?new Date(rec.updatedAt).toLocaleDateString('en-IN'):'—', roomCount=rec.rooms?.length||0, isActive=rec.quoteNo===quoteNo;
                      return (
                        <tr key={rec.quoteNo} style={isActive?{background:'#fff7ed'}:{}}>
                          <td><span className="history-row-no">{rec.quoteNo}</span>{isActive&&<span style={{marginLeft:6,fontSize:10,background:'#fed7aa',color:'#9a3412',borderRadius:4,padding:'1px 5px',fontWeight:800}}>current</span>}</td>
                          <td className="history-row-customer">{rec.customer?.name||<span style={{color:'var(--muted)'}}>—</span>}</td>
                          <td style={{color:'var(--muted)',fontSize:12}}>{rec.customer?.project||'—'}</td>
                          <td style={{textAlign:'center',fontWeight:700}}>{roomCount}</td>
                          <td className="history-row-total">{total!=null?currency(total):'—'}</td>
                          <td className="history-row-date">{date}</td>
                          <td><div className="history-row-actions"><button className="btn btn-primary btn-sm" onClick={()=>loadQuoteRecord(rec)}>Load</button><button className="btn btn-danger btn-sm" onClick={()=>handleDeleteQuote(rec.quoteNo)}><Trash2 size={13} /></button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{marginTop:12,fontSize:12,color:'var(--muted)'}}>{filteredQuotes.length} quote{filteredQuotes.length!==1?'s':''}{historySearch?' found':' total'}</div>
          </Box>
        )}

        {/* COMPANY TAB */}
        {activeTab === 'company' && (
          <Box title="Company Branding">
            <div className="grid-2">
              <div className="field-group"><label className="field-label">Company Name</label><input className="input" value={quoteMeta.company.name} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,name:e.target.value}}))} /></div>
              <div className="field-group">
                <label className="field-label">Logo</label>
                {quoteMeta.company.logoUrl&&<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}><img src={quoteMeta.company.logoUrl} alt="Logo" style={{height:48,borderRadius:6,border:'1px solid var(--border)',padding:4,background:'#fff'}} /><button className="btn btn-outline btn-sm" onClick={()=>setQuoteMeta(o=>({...o,company:{...o.company,logoUrl:''}}))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=await fileToDataURL(f);setQuoteMeta(o=>({...o,company:{...o.company,logoUrl:d}}));}catch{}}} />
                <input className="input" style={{marginTop:8}} placeholder="https://…/logo.png" value={quoteMeta.company.logoUrl} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,logoUrl:e.target.value}}))} />
              </div>
              <div className="field-group"><label className="field-label">Website</label><input className="input" value={quoteMeta.company.website} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,website:e.target.value}}))} /></div>
              <div className="field-group"><label className="field-label">GSTIN</label><input className="input" value={quoteMeta.company.gstin} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,gstin:e.target.value}}))} /></div>
              <div className="field-group" style={{gridColumn:'1/-1'}}><label className="field-label">Address</label><input className="input" value={quoteMeta.company.address} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,address:e.target.value}}))} /></div>
              <div className="field-group"><label className="field-label">Phone</label><input className="input" value={quoteMeta.company.phone} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,phone:e.target.value}}))} /></div>
              <div className="field-group"><label className="field-label">Email</label><input className="input" value={quoteMeta.company.email} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,email:e.target.value}}))} /></div>
              <div className="field-group" style={{gridColumn:'1/-1'}}>
                <label className="field-label">Payment QR Image</label>
                {quoteMeta.company.paymentQrUrl&&<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}><img src={quoteMeta.company.paymentQrUrl} alt="QR" style={{height:100,borderRadius:6,border:'1px solid var(--border)',padding:4,background:'#fff'}} /><button className="btn btn-outline btn-sm" onClick={()=>setQuoteMeta(o=>({...o,company:{...o.company,paymentQrUrl:''}}))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=await fileToDataURL(f);setQuoteMeta(o=>({...o,company:{...o.company,paymentQrUrl:d}}));}catch{}}} />
                <input className="input" style={{marginTop:8}} placeholder="https://…/qr.png" value={quoteMeta.company.paymentQrUrl||''} onChange={e=>setQuoteMeta(o=>({...o,company:{...o.company,paymentQrUrl:e.target.value}}))} />
              </div>
              <div className="field-group" style={{gridColumn:'1/-1'}}>
                <label className="field-label">Signature Image</label>
                {quoteMeta.commercials.signatureUrl&&<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}><img src={quoteMeta.commercials.signatureUrl} alt="Sig" style={{height:48,borderRadius:6,border:'1px solid var(--border)',padding:4,background:'#fff'}} /><button className="btn btn-outline btn-sm" onClick={()=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,signatureUrl:''}}))}>Clear</button></div>}
                <input type="file" accept="image/*" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=await fileToDataURL(f);setQuoteMeta(o=>({...o,commercials:{...o.commercials,signatureUrl:d}}));}catch{}}} />
                <input className="input" style={{marginTop:8}} placeholder="https://…/signature.png" value={quoteMeta.commercials.signatureUrl} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,signatureUrl:e.target.value}}))} />
              </div>
              <div className="field-group" style={{gridColumn:'1/-1'}}><label className="field-label">Signatory Name</label><input className="input" value={quoteMeta.commercials.signatoryName||''} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,signatoryName:e.target.value}}))} placeholder="Authorized Signatory" /></div>
              <div className="field-group" style={{gridColumn:'1/-1'}}>
                <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,fontWeight:700,color:'var(--muted)'}}>
                  <input type="checkbox" checked={quoteMeta.commercials.needGstBill??false} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,needGstBill:e.target.checked}}))} /> Need GST Bill?
                </label>
                {quoteMeta.commercials.needGstBill&&<div className="grid-2" style={{marginTop:8}}>
                  <div className="field-group"><label className="field-label">Customer GSTIN</label><input className="input" placeholder="27AAACT1234F1Z5" value={quoteMeta.commercials.gstin||''} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,gstin:e.target.value}}))} /></div>
                  <div className="field-group"><label className="field-label">Billing Address</label><input className="input" placeholder="Full billing address" value={quoteMeta.commercials.billingAddress||''} onChange={e=>setQuoteMeta(o=>({...o,commercials:{...o.commercials,billingAddress:e.target.value}}))} /></div>
                </div>}
              </div>
            </div>
          </Box>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && <>
          <Box title="Stitching Types">
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#F3F4F6'}}>{['No.','Label','Rate (Rs/panel)','Actions'].map(h=><th key={h} style={{textAlign:h==='Rate (Rs/panel)'?'right':h==='Actions'?'center':'left',padding:'8px',border:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.stitchingTypes||[]).map((t,idx)=><tr key={t.id}><td style={{padding:'8px',border:'1px solid var(--border)'}}>{idx+1}</td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input className="input" value={t.label||''} onChange={e=>handleStitchChange(idx,{label:e.target.value})} /></td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input type="number" className="input" inputMode="decimal" value={t.ratePerPanel??0} onChange={e=>handleStitchChange(idx,{ratePerPanel:+e.target.value})} style={{textAlign:'right'}} /></td><td style={{padding:'8px',border:'1px solid var(--border)',textAlign:'center'}}><button className="btn btn-danger btn-sm" onClick={()=>handleDeleteStitch(idx)}>Remove</button></td></tr>)}
                  {!settings.stitchingTypes?.length&&<tr><td colSpan={4} style={{padding:12,textAlign:'center',color:'var(--muted)',border:'1px solid var(--border)'}}>No stitching types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn btn-primary btn-sm" onClick={handleAddStitch}><Plus size={14} /> Add Stitching</button></div>
          </Box>
          <Box title="Lining Types">
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#F3F4F6'}}>{['No.','Label','Rate (Rs/m)','Actions'].map(h=><th key={h} style={{textAlign:h==='Rate (Rs/m)'?'right':h==='Actions'?'center':'left',padding:'8px',border:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.linings||[]).map((l,idx)=><tr key={l.id}><td style={{padding:'8px',border:'1px solid var(--border)'}}>{idx+1}</td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input className="input" value={l.label||''} onChange={e=>handleLiningChange(idx,{label:e.target.value})} /></td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input type="number" className="input" inputMode="decimal" value={l.ratePerMeter??0} onChange={e=>handleLiningChange(idx,{ratePerMeter:+e.target.value})} style={{textAlign:'right'}} /></td><td style={{padding:'8px',border:'1px solid var(--border)',textAlign:'center'}}><button className="btn btn-danger btn-sm" onClick={()=>handleDeleteLining(idx)}>Remove</button></td></tr>)}
                  {!settings.linings?.length&&<tr><td colSpan={4} style={{padding:12,textAlign:'center',color:'var(--muted)',border:'1px solid var(--border)'}}>No lining types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn btn-primary btn-sm" onClick={handleAddLining}><Plus size={14} /> Add Lining</button></div>
          </Box>
          <Box title="Track Types">
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:'#F3F4F6'}}>{['No.','Label','Rate (Rs/ft)','Actions'].map(h=><th key={h} style={{textAlign:h==='Rate (Rs/ft)'?'right':h==='Actions'?'center':'left',padding:'8px',border:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {(settings.tracks||[]).map((t,idx)=><tr key={t.id}><td style={{padding:'8px',border:'1px solid var(--border)'}}>{idx+1}</td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input className="input" value={t.label||''} onChange={e=>handleTrackChange(idx,{label:e.target.value})} /></td><td style={{padding:'8px',border:'1px solid var(--border)'}}><input type="number" className="input" inputMode="decimal" value={t.ratePerFt??0} onChange={e=>handleTrackChange(idx,{ratePerFt:+e.target.value})} style={{textAlign:'right'}} /></td><td style={{padding:'8px',border:'1px solid var(--border)',textAlign:'center'}}><button className="btn btn-danger btn-sm" onClick={()=>handleDeleteTrack(idx)}>Remove</button></td></tr>)}
                  {!settings.tracks?.length&&<tr><td colSpan={4} style={{padding:12,textAlign:'center',color:'var(--muted)',border:'1px solid var(--border)'}}>No track types yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className="btn btn-primary btn-sm" onClick={handleAddTrack}><Plus size={14} /> Add Track</button></div>
          </Box>
          <Box title="Installation Rate">
            <div className="grid-3">
              <div className="field-group"><label className="field-label">Rate (Rs / track-ft)</label><input type="number" className="input" value={settings.installationRatePerTrackFt||0} onChange={e=>setSettings(s=>({...s,installationRatePerTrackFt:+e.target.value}))} inputMode="decimal" /></div>
            </div>
          </Box>
        </>}
      </div>
    </div>
  );
}