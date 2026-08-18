import { toNum, ceilDiv } from "../utils/formatting.js";

export function computeClothMeters(room, fabric = {}) {
  const widthVal = toNum(fabric.widthInch ?? room.widthInch);
  const lengthVal = toNum(fabric.lengthInch ?? room.lengthInch);

  const toInches = (val, unit) => {
    switch (unit || "in") {
      case "ft":
        return val * 12;
      case "m":
        return val * 39;
      case "cm":
        return val / 2.54;
      default:
        return val;
    }
  };

  const widthIn = toInches(
    widthVal,
    fabric.widthUnit || room.widthUnit || "in"
  );

  const lengthIn = toInches(
    lengthVal,
    fabric.lengthUnit || room.lengthUnit || "in"
  );

  const isRomanBlind = Boolean(
    fabric.isRomanBlind || room.isRomanBlind
  );

  const allowanceIn = isRomanBlind ? 10 : 12;
  const allowanceRep = isRomanBlind ? 10 : 8;

  const computedPanels = isRomanBlind
    ? (widthIn || 0) / 50
    : (widthIn || 0) / 20;

  const panels = toNum(fabric.panels)
    ? toNum(fabric.panels)
    : computedPanels;

  let adjLen = lengthIn + allowanceIn;

  if ((fabric.repeat || room.repeat) === "yes") {
    const repeatSizeCm = toNum(
      fabric.repeatCm ?? room.repeatCm
    );

    if (repeatSizeCm > 0) {
      const repeatInch = repeatSizeCm / 2.54;
      const v1 = adjLen / repeatInch;
      const decimal = v1 - Math.floor(v1);
      const v2 = Math.floor(v1) * repeatInch;

      let reqinch;

      if (decimal > 0.25) {
        reqinch = Math.ceil(v1) * repeatInch;
      } else if (
        decimal <= 0.25 &&
        v2 >= lengthIn + allowanceRep
      ) {
        reqinch = Math.floor(v1) * repeatInch;
      } else {
        reqinch = Math.ceil(v1) * repeatInch;
      }

      adjLen = Math.max(adjLen, reqinch);
    }
  }

  const autoMeters = isRomanBlind
    ? (adjLen * panels) / 39
    : Math.ceil(((adjLen * panels) / 39) * 2) / 2;

  let metersOfCloth = autoMeters;

  const override = toNum(fabric.clothMeters);

  if (
    override > 0 &&
    Number.isFinite(override)
  ) {
    metersOfCloth = override;
  }

  if (
    !Number.isFinite(metersOfCloth) ||
    metersOfCloth < 0
  ) {
    metersOfCloth = 0;
  }

  return {
    panels,
    metersOfCloth,
    trackFeet: Math.max(
      1,
      ceilDiv(widthIn || 0, 12)
    ),
    widthFeet: (widthIn || 0) / 12,
  };
}

export function computeFabricSquareFeet(
  room,
  fabric = {}
) {
  const manualSqFt = toNum(
    fabric.romanBlindSqFt
  );

  if (
    manualSqFt > 0 &&
    Number.isFinite(manualSqFt)
  ) {
    return manualSqFt;
  }

  const widthVal = toNum(
    fabric.widthInch ?? room.widthInch
  );

  const lengthVal = toNum(
    fabric.lengthInch ?? room.lengthInch
  );

  const toInches = (val, unit) => {
    switch (unit || "in") {
      case "ft":
        return val * 12;
      case "m":
        return val * 39.3701;
      case "cm":
        return val / 2.54;
      default:
        return val;
    }
  };

  const widthIn = toInches(
    widthVal,
    fabric.widthUnit || room.widthUnit || "in"
  );

  const lengthIn = toInches(
    lengthVal,
    fabric.lengthUnit || room.lengthUnit || "in"
  );

  if (!widthIn || !lengthIn) {
    return 0;
  }

  return (widthIn * lengthIn) / 144;
}

export function computeBlindSquareFeet(
  room,
  fabric = {}
) {
  const manualSqFt = toNum(
    fabric.blindSqFt
  );

  if (
    manualSqFt > 0 &&
    Number.isFinite(manualSqFt)
  ) {
    return manualSqFt;
  }

  const widthVal = toNum(
    fabric.widthInch ?? room.widthInch
  );

  const lengthVal = toNum(
    fabric.lengthInch ?? room.lengthInch
  );

  const toInches = (val, unit) => {
    switch (unit || "in") {
      case "ft":
        return val * 12;
      case "m":
        return val * 39.3701;
      case "cm":
        return val / 2.54;
      default:
        return val;
    }
  };

  const widthIn = toInches(
    widthVal,
    fabric.widthUnit || room.widthUnit || "in"
  );

  const lengthIn = toInches(
    lengthVal,
    fabric.lengthUnit || room.lengthUnit || "in"
  );

  if (!widthIn || !lengthIn) {
    return 0;
  }

  const extraHeight =
    fabric.blindType === "roller" ||
    fabric.blindType === "zebra"
      ? 10
      : 0;

  const rawSqFt =
    ((lengthIn + extraHeight) * widthIn) /
    144;

  return rawSqFt > 0
    ? Math.max(11, rawSqFt)
    : 0;
}

export function computeFabricCost(
  room,
  fabric
) {
  const {
    panels,
    metersOfCloth,
    trackFeet,
    widthFeet,
  } = computeClothMeters(
    room,
    fabric
  );

  if (fabric.isWallpaper) {
    const rollQty = toNum(
      fabric.wallpaperRollQty
    );

    const rollPrice = toNum(
      fabric.wallpaperRollPrice
    );

    return {
      panels: 0,
      metersOfCloth: 0,
      trackFeet: 0,
      widthFeet: 0,
      clothCost: rollQty * rollPrice,
      stitchingCost: 0,
      liningCost: 0,
      romanBlindSqFt: 0,
      blindSqFt: 0,
      blindRate: 0,
      blindType: "",
      isRomanBlind: false,
      isWallpaper: true,
      isMattress: false,
      rollQty,
      rollPrice,
      stitchingRate: 0,
    };
  }

  if (fabric.isMattress) {
    const mattressQty = toNum(
      fabric.mattressQty
    );

    const mattressPrice = toNum(
      fabric.mattressPrice
    );

    return {
      panels: 0,
      metersOfCloth: 0,
      trackFeet: 0,
      widthFeet: 0,
      clothCost:
        mattressQty *
        mattressPrice,
      stitchingCost: 0,
      liningCost: 0,
      romanBlindSqFt: 0,
      blindSqFt: 0,
      blindRate: 0,
      blindType: "",
      isRomanBlind: false,
      isWallpaper: false,
      isMattress: true,
      mattressQty,
      mattressPrice,
      rollQty: 0,
      rollPrice: 0,
      stitchingRate: 0,
    };
  }

  if (fabric.blindType) {
    const blindSqFt =
      computeBlindSquareFeet(
        room,
        fabric
      );

    const blindRate = toNum(
      fabric.materialPrice
    );

    return {
      panels: 0,
      metersOfCloth: 0,
      trackFeet: 0,
      widthFeet: 0,
      clothCost:
        blindSqFt *
        blindRate,
      stitchingCost: 0,
      liningCost: 0,
      romanBlindSqFt: 0,
      blindSqFt,
      blindRate,
      blindType:
        fabric.blindType,
      isRomanBlind: false,
      isWallpaper: false,
      rollQty: 0,
      rollPrice: 0,
      stitchingRate: 0,
    };
  }

  const clothCost =
    metersOfCloth *
    toNum(fabric.materialPrice);

  const isRomanBlind = Boolean(
    fabric.isRomanBlind ||
    room.isRomanBlind
  );

  const romanBlindSqFt =
    isRomanBlind
      ? computeFabricSquareFeet(
          room,
          fabric
        )
      : 0;

  const stitchingRate =
    fabric.stitching
      ?.ratePerPanel || 0;

  const stitchingCost =
    isRomanBlind
      ? romanBlindSqFt *
        stitchingRate
      : panels *
        stitchingRate;

  const liningCost =
    metersOfCloth *
    (fabric.lining
      ?.ratePerMeter || 0);

  return {
    panels,
    metersOfCloth,
    trackFeet,
    widthFeet,
    clothCost,
    stitchingCost,
    liningCost,
    romanBlindSqFt,
    isRomanBlind,
    isWallpaper: false,
    blindSqFt: 0,
    blindRate: 0,
    blindType: "",
    rollQty: 0,
    rollPrice: 0,
    stitchingRate,
  };
}

export function computeRoomCost(
  room,
  settings
) {
  const fabrics =
    room.fabrics &&
    room.fabrics.length
      ? room.fabrics
      : [];

  let totalClothCost = 0;
  let totalStitchingCost = 0;
  let totalLiningCost = 0;
  let totalMeters = 0;
  let panels = 0;
  let trackFeet = 0;
  let totalTrackCost = 0;

  const fabricBreakdowns =
    fabrics.map((fab) => {
      const normalizedFab = {
        ...fab,

        track:
          fab.track ||
          room.track ||
          (settings.tracks &&
            settings.tracks[0]) || {
            id: "std",
            label:
              "Standard Track",
            ratePerFt:
              settings.trackRatePerFt ||
              250,
          },
      };

      const fc =
        computeFabricCost(
          room,
          normalizedFab
        );

      const selectedTrackRate =
        normalizedFab.track
          ?.ratePerFt;

      const trackRate =
        Number.isFinite(
          selectedTrackRate
        )
          ? selectedTrackRate
          : settings
              ?.trackRatePerFt ||
            0;

      const fabricTrackCost =
        fc.isWallpaper ||
        fc.isMattress ||
        fc.blindType
          ? 0
          : fc.isRomanBlind
          ? (fc.trackFeet || 0) *
            trackRate
          : room.needInstallation
          ? fc.trackFeet *
            trackRate
          : 0;

      totalClothCost +=
        fc.clothCost;

      totalStitchingCost +=
        fc.stitchingCost;

      totalLiningCost +=
        fc.liningCost;

      totalMeters +=
        fc.metersOfCloth;

      totalTrackCost +=
        fabricTrackCost;

      panels += fc.panels;

      trackFeet +=
        fc.trackFeet;

      return {
        ...normalizedFab,
        ...fc,
        trackCost:
          fabricTrackCost,
      };
    });

  let installationCost = 0;
  let usedInstallQty = 0;

  if (room.needInstallation) {
    const qty = toNum(
      room.installQtyFt
    );

    usedInstallQty =
      qty > 0 ? qty : 1;

    installationCost =
      usedInstallQty *
      (settings
        ?.installationRatePerTrackFt ||
        0);
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

    clothCost:
      totalClothCost,

    stitchingCost:
      totalStitchingCost,

    liningCost:
      totalLiningCost,

    trackCost:
      totalTrackCost,

    installationCost,

    subtotal,

    fabricBreakdowns,
  };
}