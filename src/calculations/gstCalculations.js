import { DEFAULT_SETTINGS } from "../constants/settings.js";
import { toNum } from "../utils/formatting.js";
import { computeRoomCost } from "./curtainCalculations.js";

function computeGstBreakdown(
  rooms,
  commercials,
  settings,
  miscellaneousCosts = []
) {
  if (!commercials?.applyGst) return [];

  const effectiveRooms = rooms.filter(
    (r) => r.include !== false
  );

  const gstCategories =
    settings?.gstCategories ||
    DEFAULT_SETTINGS.gstCategories;

  const fallbackCategory =
    gstCategories.find((c) => c.id === "other") ||
    gstCategories[0] || {
      id: "other",
      label: "Other",
      rate: 18,
    };

  const fabricCategory =
    gstCategories.find((c) => c.id === "fabric") ||
    fallbackCategory;

  const serviceCategory = {
    id: "service_18",
    label: "Services / Miscellaneous",
    rate: 18,
  };

  const wallpaperCategory =
    gstCategories.find((c) => c.id === "wallpaper") ||
    fallbackCategory;

  const blindCategory =
    gstCategories.find((c) => c.id === "blind") ||
    fallbackCategory;

  const categoryMap = {};

  const addToCategory = (category, taxableBase) => {
    const base = Number(taxableBase || 0);

    if (base <= 0) return;

    const resolvedCategory =
      gstCategories.find(
        (c) => c.id === category?.id
      ) ||
      category ||
      fallbackCategory;

    const categoryId =
      resolvedCategory.id || "other";

    if (!categoryMap[categoryId]) {
      categoryMap[categoryId] = {
        categoryId,
        label:
          resolvedCategory.label || "Other",
        rate: Number(
          resolvedCategory.rate || 0
        ),
        base: 0,
        amount: 0,
      };
    }

    categoryMap[categoryId].base += base;
  };

  const roomTotals = effectiveRooms.map(
    (room) => ({
      room,
      cost: computeRoomCost(
        room,
        settings
      ),
    })
  );

  const clothTotal = roomTotals.reduce(
    (sum, item) =>
      sum +
      Number(
        item.cost.clothCost || 0
      ),
    0
  );

  const {
    discountType,
    discountValue,
  } = commercials || {};

  const rawDiscountAmount =
    discountType === "percent"
      ? clothTotal *
        (Number(
          discountValue || 0
        ) /
          100)
      : Number(
          discountValue || 0
        );

  const discountAmount =
    Math.min(
      Math.max(
        0,
        rawDiscountAmount
      ),
      clothTotal
    );

  const fabricDiscountRatio =
    clothTotal > 0
      ? Math.max(
          0,
          clothTotal -
            discountAmount
        ) / clothTotal
      : 1;

  roomTotals.forEach(
    ({ cost }) => {
      cost.fabricBreakdowns.forEach(
        (fb) => {
          let materialCategory =
            fb.gstCategory;

          if (
            !materialCategory ||
            !materialCategory.id
          ) {
            if (fb.isWallpaper) {
              materialCategory =
                wallpaperCategory;
            } else if (
              fb.blindType
            ) {
              materialCategory =
                blindCategory;
            } else {
              materialCategory =
                fabricCategory;
            }
          }

          const discountedMaterialCost =
            Number(
              fb.clothCost || 0
            ) *
            fabricDiscountRatio;

          addToCategory(
            materialCategory,
            discountedMaterialCost
          );

          const serviceBase =
            Number(
              fb.stitchingCost ||
                0
            ) +
            Number(
              fb.liningCost || 0
            ) +
            Number(
              fb.trackCost || 0
            );

          addToCategory(
            serviceCategory,
            serviceBase
          );
        }
      );

      addToCategory(
        serviceCategory,
        Number(
          cost.installationCost ||
            0
        )
      );
    }
  );

  (miscellaneousCosts || []).forEach(
    (item) => {
      const grossMiscBase =
        toNum(item.rate) *
        (toNum(
          item.quantity
        ) || 1);

      const discountPercent = Math.min(
        100,
        Math.max(
          0,
          toNum(item?.discountPercent)
        )
      );

      const miscBase = Math.max(
        0,
        grossMiscBase -
          grossMiscBase *
            (discountPercent / 100)
      );

      addToCategory(
        serviceCategory,
        miscBase
      );
    }
  );

  return Object.values(
    categoryMap
  )
    .map((category) => ({
      ...category,

      base: Math.round(
        category.base
      ),

      amount: Math.round(
        category.base *
          (Number(
            category.rate || 0
          ) /
            100)
      ),
    }))
    .filter(
      (category) =>
        category.base > 0 ||
        category.amount > 0
    );
}

export { computeGstBreakdown };