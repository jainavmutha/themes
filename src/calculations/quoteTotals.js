import { toNum } from "../utils/formatting.js";
import { computeRoomCost } from "./curtainCalculations.js";
import { computeGstBreakdown } from "./gstCalculations.js";

function getFabricRawCost(fabric) {
  if (!fabric) return 0;

  const explicitCost = toNum(fabric.clothCost);
  if (explicitCost > 0) return explicitCost;

  const mattressQty = toNum(fabric.mattressQty);
  const mattressPrice = toNum(fabric.mattressPrice);
  const mattressCost = mattressQty * mattressPrice;
  if (mattressCost > 0) return mattressCost;

  return (
    toNum(fabric.materialPrice) *
    toNum(fabric.clothMeters)
  );
}

function computeLinewiseFabricDiscount(roomTotals) {
  return (roomTotals || []).reduce(
    (sum, entry) =>
      sum + toNum(entry?.cost?.lineDiscountTotal),
    0
  );
}

export function computeAllTotals(
  rooms,
  commercials,
  settings,
  miscellaneousCosts = []
) {
  const effectiveRooms = rooms.filter(
    (r) => r.include !== false
  );

  const roomTotals = effectiveRooms.map(
    (r) => ({
      room: r,
      cost: computeRoomCost(r, settings),
    })
  );

  const clothTotal = roomTotals.reduce(
    (s, x) => s + x.cost.clothCost,
    0
  );

  // computeRoomCost already applies each fabric/wallpaper/mattress line discount
  // to clothCost. Keep the discount separately so the summary can show the
  // original base value and the full discount without subtracting it twice.
  const linewiseDiscountAmount =
    computeLinewiseFabricDiscount(roomTotals);

  const rawClothTotal =
    clothTotal + linewiseDiscountAmount;

  const stitchingTotal = roomTotals.reduce(
    (s, x) => s + x.cost.stitchingCost,
    0
  );

  const liningTotal = roomTotals.reduce(
    (s, x) => s + x.cost.liningCost,
    0
  );

  const trackTotal = roomTotals.reduce(
    (s, x) => s + x.cost.trackCost,
    0
  );

  const installTotal = roomTotals.reduce(
    (s, x) => s + x.cost.installationCost,
    0
  );

  const miscTotal = (
    miscellaneousCosts || []
  ).reduce((sum, item) => {
    const grossAmount =
      toNum(item.rate) *
      (toNum(item.quantity) || 1);

    const discountPercent = Math.min(
      100,
      Math.max(0, toNum(item?.discountPercent))
    );

    const discountAmount =
      grossAmount *
      (discountPercent / 100);

    return sum + Math.max(
      0,
      grossAmount - discountAmount
    );
  }, 0);

  const discountMode =
    commercials?.discountMode === "linewise"
      ? "linewise"
      : "same";

  const sameDiscountAmount =
    commercials?.discountType === "percent"
      ? rawClothTotal *
        (toNum(commercials?.discountValue) / 100)
      : toNum(commercials?.discountValue);

  const rawProfitDiscountAmount =
    discountMode === "linewise"
      ? linewiseDiscountAmount
      : sameDiscountAmount;

  const profitDiscountAmount = Math.min(
    Math.max(0, rawProfitDiscountAmount),
    rawClothTotal
  );

  const discountedFabricBase = Math.max(
    0,
    rawClothTotal - profitDiscountAmount
  );

  const otherTotal =
    stitchingTotal +
    liningTotal +
    trackTotal +
    installTotal +
    miscTotal;

  const {
    discountType,
    discountValue,
  } = commercials;

  const roundOff = toNum(
    commercials?.roundOff
  );

  const discountAmount =
    discountMode === "linewise"
      ? linewiseDiscountAmount
      : discountType === "percent"
        ? rawClothTotal *
          (toNum(discountValue) / 100)
        : toNum(discountValue);

  const netFabricTotal =
    discountMode === "linewise"
      ? Math.max(0, clothTotal)
      : Math.max(
          0,
          rawClothTotal - discountAmount
        );

  const roundedNetFabricTotal = Math.round(netFabricTotal);
  const roundedOtherTotal = Math.round(otherTotal);

  const afterDiscount =
    roundedNetFabricTotal + roundedOtherTotal;

  let gstAmount = 0;
  let gstBreakdown = [];

  if (commercials?.applyGst) {
    gstBreakdown =
      computeGstBreakdown(
        rooms,
        commercials,
        settings,
        miscellaneousCosts
      );

    gstAmount =
      gstBreakdown.reduce(
        (s, c) =>
          s + c.amount,
        0
      );
  }

  return {
    roomTotals,
    gstBreakdown,

    summary: {
      clothTotal:
        Math.round(rawClothTotal),

      stitchingTotal:
        Math.round(stitchingTotal),

      liningTotal:
        Math.round(liningTotal),

      trackTotal:
        Math.round(trackTotal),

      installTotal:
        Math.round(installTotal),

      miscTotal:
        Math.round(miscTotal),

      otherTotal:
        roundedOtherTotal,

      base:
        Math.round(
          rawClothTotal +
            otherTotal
        ),

      discountAmount:
        Math.round(
          discountAmount
        ),

      discountMode,

      netFabricTotal:
        roundedNetFabricTotal,

      afterDiscount,

      gstAmount:
        Math.round(
          gstAmount
        ),

      roundOff:
        Math.round(
          roundOff
        ),

      finalTotal:
        afterDiscount +
          Math.round(gstAmount) +
          Math.round(roundOff),

      gstBreakdown,

      discountedFabricBase,

      otherBaseForProfit:
        otherTotal,

      estimatedFabricProfit:
        Math.round(
          rawClothTotal * 0.47 -
            profitDiscountAmount
        ),

      estimatedOtherProfit:
        Math.round(
          otherTotal * 0.56
        ),

      estimatedProfit:
        Math.round(
          rawClothTotal * 0.47 -
            profitDiscountAmount +
            otherTotal * 0.56
        ),
    },
  };
}