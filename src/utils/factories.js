import { DEFAULT_SETTINGS } from "../constants/settings.js";

export const BlankFabric = (
  settings = DEFAULT_SETTINGS,
  label = "Main",
  overrides = {}
) => ({
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
  isMattress: false,
  mattressQty: "",
  mattressPrice: "",
  hsnCode: "",
  stitching: settings.stitchingTypes[0],
  lining: settings.linings[0],
  track:
    (settings.tracks && settings.tracks[0]) || {
      id: "std",
      label: "Standard Track",
      ratePerFt:
        settings.trackRatePerFt || 250,
    },
  gstCategory:
    (settings.gstCategories &&
      settings.gstCategories[0]) ||
    DEFAULT_SETTINGS.gstCategories[0],
  ...overrides,
});

export const BlankRoom = (
  n = 1,
  settings = DEFAULT_SETTINGS
) => ({
  id: crypto.randomUUID(),
  name: `Room ${n}`,
  widthInch: "",
  panels: "",
  clothMeters: "",
  widthUnit: "in",
  lengthUnit: "in",
  lengthInch: "",
  repeat: "no",
  repeatCm: "",
  track:
    (settings.tracks &&
      settings.tracks[0]) || {
      id: "std",
      label: "Standard Track",
      ratePerFt:
        settings.trackRatePerFt ||
        250,
    },
  needInstallation: false,
  installQtyFt: "",
  isRomanBlind: false,
  include: true,
  fabrics: [
    BlankFabric(
      settings,
      "Main"
    ),
  ],
});

export const BlankMiscCost = (
  settings = DEFAULT_SETTINGS
) => ({
  id: crypto.randomUUID(),
  name: "",
  rate: "",
  quantity: "",
  unit: "nos",
  gstCategory:
    (
      settings.gstCategories ||
      []
    ).find(
      (c) =>
        c.id === "other"
    ) ||
    DEFAULT_SETTINGS.gstCategories.find(
      (c) =>
        c.id === "other"
    ) ||
    DEFAULT_SETTINGS.gstCategories[0],
});