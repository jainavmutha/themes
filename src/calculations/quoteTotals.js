import { toNum } from "../utils/formatting.js";
import { computeRoomCost } from "./curtainCalculations.js";
import { computeGstBreakdown } from "./gstCalculations.js";

function getFabricRawCost(fabric) {
  if (!fabric) return 0;

  const explicitCost = toNum(fabric.clothCost);
  if (explicitCost > 0) return explicitCost;

  return (
    toNum(fabric.materialPrice) *
    toNum(fabric.clothMeters)
  );
}

function computeLinewiseFabricDiscount(rooms) {
  return (rooms || []).reduce((roomSum, room) => {
    if (room?.include === false) return roomSum;

    const fabrics = Array.isArray(room?.fabrics)
      ? room.fabrics
      : [];

    const roomDiscount = fabrics.reduce(
      (fabricSum, fabric) => {
        const rawCost = getFabricRawCost(fabric);
        const discountPercent = Math.min(
          100,
          Math.max(0, toNum(fabric?.discountPercent))
        );

        return (
          fabricSum +
          rawCost * (discountPercent / 100)
        );
      },
      0
    );

    return roomSum + roomDiscount;
  }, 0);
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
  ).reduce(
    (sum, item) =>
      sum +
      toNum(item.rate) *
        (toNum(item.quantity) || 1),
    0
  );

  const discountMode =
    commercials?.discountMode === "linewise"
      ? "linewise"
      : "same";

  const sameDiscountAmount =
    commercials?.discountType === "percent"
      ? clothTotal *
        (toNum(commercials?.discountValue) / 100)
      : toNum(commercials?.discountValue);

  const linewiseDiscountAmount =
    computeLinewiseFabricDiscount(effectiveRooms);

  const rawProfitDiscountAmount =
    discountMode === "linewise"
      ? linewiseDiscountAmount
      : sameDiscountAmount;

  const profitDiscountAmount = Math.min(
    Math.max(0, rawProfitDiscountAmount),
    clothTotal
  );

  const discountedFabricBase = Math.max(
    0,
    clothTotal - profitDiscountAmount
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
        ? clothTotal *
          (toNum(discountValue) / 100)
        : toNum(discountValue);

  const netFabricTotal = Math.max(
    0,
    clothTotal - discountAmount
  );

  const afterDiscount =
    netFabricTotal + otherTotal;

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
        Math.round(clothTotal),

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
        Math.round(otherTotal),

      base:
        Math.round(
          clothTotal +
            otherTotal
        ),

      discountAmount:
        Math.round(
          discountAmount
        ),

      discountMode,

      netFabricTotal:
        Math.round(
          netFabricTotal
        ),

      afterDiscount:
        Math.round(
          afterDiscount
        ),

      gstAmount:
        Math.round(
          gstAmount
        ),

      roundOff:
        Math.round(
          roundOff
        ),

      finalTotal:
        Math.round(
          afterDiscount +
            gstAmount +
            roundOff
        ),

      gstBreakdown,

      discountedFabricBase,

      otherBaseForProfit:
        otherTotal,

      estimatedFabricProfit:
        Math.round(
          clothTotal * 0.47 -
            profitDiscountAmount
        ),

      estimatedOtherProfit:
        Math.round(
          otherTotal * 0.56
        ),

      estimatedProfit:
        Math.round(
          clothTotal * 0.47 -
            profitDiscountAmount +
            otherTotal * 0.56
        ),
    },
  };
}