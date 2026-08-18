import {
  DEFAULT_SETTINGS,
  mergeSettingsWithDefaults,
} from "../constants/settings.js";

import {
  computeAllTotals,
} from "../calculations/quoteTotals.js";

export function getQuoteCustomerName(quote) {
  return String(
    quote?.customer?.name ||
    quote?.customerName ||
    quote?.quoteMeta?.customerName ||
    quote?.meta?.customerName ||
    quote?.snapshot?.customerName ||
    "Walk-in Customer"
  ).trim() || "Walk-in Customer";
}

export function getQuoteFinalTotal(quote) {
  return Number(
    quote?.snapshot?.summary?.finalTotal ||
    quote?.summary?.finalTotal ||
    quote?.all?.summary?.finalTotal ||
    quote?.totals?.summary?.finalTotal ||
    quote?.finalTotal ||
    quote?.total ||
    0
  );
}

export function getQuoteEstimatedProfit(quote) {
  try {
    const directProfit = Number(
      quote?.snapshot?.summary?.estimatedProfit ||
      quote?.summary?.estimatedProfit ||
      quote?.all?.summary?.estimatedProfit ||
      quote?.totals?.summary?.estimatedProfit ||
      quote?.snapshot?.estimatedProfit ||
      quote?.estimatedProfit ||
      0
    );

    if (
      Number.isFinite(directProfit) &&
      directProfit > 0
    ) {
      return Math.round(directProfit);
    }

    const rooms =
      Array.isArray(quote?.rooms)
        ? quote.rooms
        : Array.isArray(
            quote?.snapshot?.rooms
          )
        ? quote.snapshot.rooms
        : Array.isArray(
            quote?.all?.rooms
          )
        ? quote.all.rooms
        : Array.isArray(
            quote?.totals?.rooms
          )
        ? quote.totals.rooms
        : [];

    const commercials =
      quote?.commercials ||
      quote?.snapshot?.commercials ||
      quote?.all?.commercials ||
      quote?.totals?.commercials ||
      {};

    const miscellaneousCosts =
      Array.isArray(
        quote?.miscellaneousCosts
      )
        ? quote.miscellaneousCosts
        : Array.isArray(
            quote?.snapshot
              ?.miscellaneousCosts
          )
        ? quote.snapshot.miscellaneousCosts
        : Array.isArray(
            quote?.all
              ?.miscellaneousCosts
          )
        ? quote.all.miscellaneousCosts
        : Array.isArray(
            quote?.totals
              ?.miscellaneousCosts
          )
        ? quote.totals.miscellaneousCosts
        : [];

    const quoteSettings =
      mergeSettingsWithDefaults(
        quote?.settings ||
        quote?.snapshot?.settings ||
        quote?.all?.settings ||
        quote?.totals?.settings ||
        DEFAULT_SETTINGS
      );

    if (
      rooms.length &&
      typeof computeAllTotals === "function"
    ) {
      const totals =
        computeAllTotals(
          rooms,
          commercials,
          quoteSettings,
          miscellaneousCosts
        );

      return Math.round(
        Number(
          totals?.estimatedProfit ||
          totals?.summary
            ?.estimatedProfit ||
          0
        )
      );
    }

    return 0;
  } catch (error) {
    console.error(
      "Estimated profit calculation failed",
      error
    );

    return 0;
  }
}