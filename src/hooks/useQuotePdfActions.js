
import { useCallback } from "react";

import {
  generateFullPDF,
  generatePerformaInvoice,
} from "../pdf/quotePdf.js";

export default function useQuotePdfActions({
  rooms,
  quoteMeta,
  quoteNo,
  settings,
  miscellaneousCosts,
  setLoadedBanner,
}) {
  const handleDownloadFullPdf = useCallback(async () => {
    try {
      const meta = {
        ...quoteMeta,
        quoteNo,
      };

      const mergeFabricsRoomWise = window.confirm(
        "Merge all fabrics room-wise?\n\nOK = Show Main + Sheer in one row\nCancel = Show each separately"
      );

      const doc = await generateFullPDF(
        rooms,
        meta,
        settings,
        miscellaneousCosts,
        mergeFabricsRoomWise
      );

      doc.save(
        `Quote_${quoteMeta.customerName || "Customer"}_${quoteNo || "Draft"}.pdf`
      );
    } catch (err) {
      console.error(err);
      setLoadedBanner("Could not download PDF.");
    }
  }, [
    quoteMeta,
    quoteNo,
    rooms,
    settings,
    miscellaneousCosts,
    setLoadedBanner,
  ]);

  const handleGeneratePerforma = useCallback(async () => {
    try {
      const meta = {
        ...quoteMeta,
        quoteNo,
      };

      const doc = await generatePerformaInvoice(
        rooms,
        meta,
        settings,
        miscellaneousCosts
      );

      doc.save(
        `PerformaInvoice_${quoteMeta.customerName || "Customer"}_${quoteNo || "Draft"}.pdf`
      );
    } catch (err) {
      console.error(err);
      setLoadedBanner("Could not generate Performa Invoice.");
    }
  }, [
    quoteMeta,
    quoteNo,
    rooms,
    settings,
    miscellaneousCosts,
    setLoadedBanner,
  ]);

  return {
    handleDownloadFullPdf,
    handleGeneratePerforma,
  };
}