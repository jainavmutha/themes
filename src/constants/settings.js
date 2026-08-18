export const SETTINGS_KEY = "themes_pricing_settings_v1";

export const QUOTE_STATUSES = [
  "Draft",
  "Sent",
  "Approved",
  "Rejected",
  "Cancelled",
];

export const STATUS_COLORS = {
  Draft:     { bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" },
  Sent:      { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  Approved:  { bg: "#ECFDF5", text: "#065F46", border: "#6EE7B7" },
  Rejected:  { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  Cancelled: { bg: "#FFF7ED", text: "#92400E", border: "#FED7AA" },
};

export const DEFAULT_SETTINGS = {
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

  gstCategories: [
    { id: "fabric", label: "Fabric / Curtain", rate: 5 },
    { id: "wallpaper", label: "Wallpaper", rate: 18 },
    { id: "blind", label: "Blinds / Shades", rate: 12 },
    { id: "carpet", label: "Carpet / Flooring", rate: 12 },
    { id: "other", label: "Other / Miscellaneous", rate: 18 },
  ],
};

export const UNIT_OPTIONS = [
  { id: "m", label: "Meters" },
  { id: "sqft", label: "Sq Ft" },
  { id: "nos", label: "Nos" },
  { id: "rolls", label: "Rolls" },
];

export function getUnitLabel(unit) {
  return UNIT_OPTIONS.find((u) => u.id === unit)?.label || unit || "Nos";
}

export function getUnitShortLabel(unit) {
  if (unit === "m") return "m";
  if (unit === "sqft") return "sq ft";
  if (unit === "nos") return "nos";
  if (unit === "rolls") return "rolls";
  if (unit === "panels") return "panels";
  if (unit === "ft") return "ft";
  if (unit === "pcs") return "pcs";

  return unit || "nos";
}

export function mergeSettingsWithDefaults(value) {
  const saved = value || {};

  return {
    ...DEFAULT_SETTINGS,
    ...saved,

    stitchingTypes:
      Array.isArray(saved.stitchingTypes) && saved.stitchingTypes.length
        ? saved.stitchingTypes
        : DEFAULT_SETTINGS.stitchingTypes,

    linings:
      Array.isArray(saved.linings) && saved.linings.length
        ? saved.linings
        : DEFAULT_SETTINGS.linings,

    tracks:
      Array.isArray(saved.tracks) && saved.tracks.length
        ? saved.tracks
        : DEFAULT_SETTINGS.tracks,

    gstCategories:
      Array.isArray(saved.gstCategories) && saved.gstCategories.length
        ? saved.gstCategories
        : DEFAULT_SETTINGS.gstCategories,
  };
}

export function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}"
    );

    return mergeSettingsWithDefaults(saved);
  } catch {
    return DEFAULT_SETTINGS;
  }
}