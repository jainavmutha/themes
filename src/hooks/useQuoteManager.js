import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DEFAULT_SIGNATURE_URL } from "../constants/brand.js";
import { normalizeImageUrl } from "../utils/images.js";

import {
  BlankFabric,
  BlankRoom,
  BlankMiscCost,
} from "../utils/factories.js";

import { computeAllTotals } from "../calculations/quoteTotals.js";

import { hasSupabaseConfig } from "../services/supabase.js";

import {
  loadAllQuotes,
  saveAllQuotes,
  generateQuoteNo,
  saveQuoteRecord,
  deleteQuoteRecord,
} from "../services/quoteStorage.js";


export default function useQuoteManager({
  settings,
  brand,
  setActiveTab,
  setGlobalFabricItems,
}) {
  const [rooms, setRooms] = useState(() => [BlankRoom(1, settings)]);
  const [miscellaneousCosts, setMiscellaneousCosts] = useState([]);
  const [quoteNo, setQuoteNo] = useState("");
  const [loadedBanner, setLoadedBanner] = useState("");
  const [currentQuoteStatus, setCurrentQuoteStatus] = useState("Draft");

  const [quoteMeta, setQuoteMeta] = useState({
    customerName: "",
    customerPhone: "",
    projectTitle: "Curtain Quotation",
    company: {
      name: brand.companyName,
      pdfCompanyName: brand.pdfCompanyName,
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      logoUrl: brand.logoUrl,
      website: brand.website,
      gstin: brand.gstin,
      paymentQrUrl: brand.paymentQrUrl,
      paymentUpiId: brand.paymentUpiId,
    },
    currency: "INR",
    notes: "Prices are exclusive of taxes. Valid for 7 days.",
    commercials: {
      applyGst: false,
      gstRate: 0,
      discountType: "percent",
      discountValue: 0,
      place: "Pune",
      signatoryName: "Authorized Signatory",
      signatoryTitle: "",
      signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL),
      needGstBill: false,
      gstin: "",
      billingAddress: "",
    },
  });

  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("All");
  const [allQuotes, setAllQuotes] = useState({});

  const quoteNoRef = useRef(quoteNo);

  useEffect(() => {
    quoteNoRef.current = quoteNo;
  }, [quoteNo]);

  useEffect(() => {
    let cancelled = false;

    generateQuoteNo()
      .then((no) => {
        if (!cancelled) setQuoteNo(no);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshQuoteList = useCallback(async () => {
    try {
      const map = await loadAllQuotes();
      setAllQuotes(map || {});
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshQuoteList();
  }, [refreshQuoteList]);

  const allQuotesArr = useMemo(() => {
    const arr = Object.values(allQuotes || {});
    arr.sort(
      (a, b) =>
        new Date(b.updatedAt || 0) -
        new Date(a.updatedAt || 0)
    );
    return arr;
  }, [allQuotes]);

  const filteredQuotes = useMemo(() => {
    let arr = allQuotesArr;

    if (historyStatusFilter !== "All") {
      arr = arr.filter(
        (rec) =>
          (rec.status || "Draft") === historyStatusFilter
      );
    }

    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();

      arr = arr.filter(
        (rec) =>
          String(rec.quoteNo || "")
            .toLowerCase()
            .includes(q) ||
          String(rec.customer?.name || "")
            .toLowerCase()
            .includes(q)
      );
    }

    return arr;
  }, [allQuotesArr, historySearch, historyStatusFilter]);

  const loadQuoteRecord = useCallback(
    (rec) => {
      if (!rec) return;

      setQuoteNo(rec.quoteNo);
      setCurrentQuoteStatus(rec.status || "Draft");

      const migratedRooms = (
        rec.rooms && rec.rooms.length
          ? rec.rooms
          : [BlankRoom(1, settings)]
      ).map((r) => {
        if (r.fabrics && r.fabrics.length) return r;

        return {
          ...r,
          fabrics: [
            BlankFabric(settings, "Main", {
              materialName: r.materialName || "",
              materialPrice: r.materialPrice || "",
              clothMeters: r.clothMeters || "",
              stitching:
                r.stitching || settings.stitchingTypes[0],
              lining:
                r.lining || settings.linings[0],
            }),
          ],
        };
      });

      setRooms(migratedRooms);
      setMiscellaneousCosts(
        Array.isArray(rec.miscellaneousCosts)
          ? rec.miscellaneousCosts
          : []
      );

      setQuoteMeta((prev) => ({
        ...prev,
        customerName: rec.customer?.name || "",
        customerPhone: rec.customer?.phone || "",
        projectTitle:
          rec.customer?.project || "Curtain Quotation",
        company: rec.company
          ? { ...prev.company, ...rec.company }
          : prev.company,
        commercials: {
          ...prev.commercials,
          ...(rec.commercials || {}),
          signatoryTitle:
            rec.commercials?.signatoryTitle ===
            "For Themes Furnishings and Linens"
              ? ""
              : rec.commercials?.signatoryTitle || "",
        },
      }));

      setLoadedBanner(
        `Loaded ${rec.quoteNo}${
          rec.customer?.name
            ? ` — ${rec.customer.name}`
            : ""
        }`
      );

      setActiveTab("quote");
      setTimeout(() => setLoadedBanner(""), 4000);
    },
    [settings, setActiveTab]
  );

  const handleUpdateQuoteStatus = useCallback(
    async (no, newStatus) => {
      try {
        const map = await loadAllQuotes();

        if (map[no]) {
          map[no] = {
            ...map[no],
            status: newStatus,
            updatedAt: new Date().toISOString(),
          };

          if (hasSupabaseConfig()) {
            await saveQuoteRecord(no, map[no]);
          } else {
            await saveAllQuotes(map);
          }

          await refreshQuoteList();

          if (no === quoteNoRef.current) {
            setCurrentQuoteStatus(newStatus);
          }
        }
      } catch (err) {
        console.error(err);
      }
    },
    [refreshQuoteList]
  );

  const handleSaveQuote = useCallback(async () => {
    try {
      const allTotals = computeAllTotals(
        rooms,
        quoteMeta.commercials,
        settings,
        miscellaneousCosts
      );

      const finalNo = quoteNo || (await generateQuoteNo());
      setQuoteNo(finalNo);

      const existingRec = allQuotes[finalNo];

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
        status:
          existingRec?.status ||
          currentQuoteStatus ||
          "Draft",
        orderProcessing:
          existingRec?.orderProcessing || null,
        createdAt:
          existingRec?.createdAt ||
          new Date().toISOString(),
      });

      await refreshQuoteList();

      setLoadedBanner(
        `Saved as ${finalNo}${
          hasSupabaseConfig()
            ? " online"
            : " on this browser"
        }`
      );

      setTimeout(() => setLoadedBanner(""), 3000);
    } catch (err) {
      console.error(err);
      setLoadedBanner("Could not save quote.");
    }
  }, [
    quoteNo,
    rooms,
    miscellaneousCosts,
    quoteMeta,
    settings,
    allQuotes,
    currentQuoteStatus,
    refreshQuoteList,
  ]);

  const handleSaveOrderData = useCallback(
    async (orderProcessingData) => {
      try {
        const finalNo = quoteNo || (await generateQuoteNo());
        const existingRec = allQuotes[finalNo];

        if (!existingRec) {
          alert(
            "Please save the quote first before saving order data."
          );
          return;
        }

        await saveQuoteRecord(finalNo, {
          ...existingRec,
          orderProcessing: orderProcessingData,
          updatedAt: new Date().toISOString(),
        });

        await refreshQuoteList();
        setLoadedBanner("Order data saved!");
        setTimeout(() => setLoadedBanner(""), 3000);
      } catch (err) {
        console.error(err);
        alert("Could not save order data.");
      }
    },
    [quoteNo, allQuotes, refreshQuoteList]
  );

  const handleProcessToFabricProcessing = useCallback(
    (orderItems, srcQuoteNo, customerName) => {
      const newItems = orderItems.map((item) => ({
        id: `${srcQuoteNo}__${item.id}`,
        quoteNo: srcQuoteNo,
        customerName,
        roomName: item.roomName || "",
        fabricLabel: item.fabricLabel || "",
        fabricName: item.fabricName || "",
        supplier: item.supplier || "",
        metersToOrder: item.metersToOrder || "",
        panels: item.panels || "",
        clothWidthInch: item.clothWidthInch || "",
        ratePerMeter: item.ratePerMeter || "",
        type: item.type || "Curtain",
        unit: item.unit || "m",
        notes: item.notes || "",
        ordered: false,
        received: false,
        receivedDate: "",
        supplierBillNo: "",
      }));

      setGlobalFabricItems((prev) => {
        const existingForThisQuote = Object.fromEntries(
          prev
            .filter((i) => i.quoteNo === srcQuoteNo)
            .map((i) => [i.id, i])
        );

        const otherItems = prev.filter(
          (i) => i.quoteNo !== srcQuoteNo
        );

        const merged = newItems.map((ni) => ({
          ...ni,
          ordered:
            existingForThisQuote[ni.id]?.ordered ?? false,
          received:
            existingForThisQuote[ni.id]?.received ?? false,
          receivedDate:
            existingForThisQuote[ni.id]?.receivedDate ||
            ni.receivedDate ||
            "",
          supplierBillNo:
            existingForThisQuote[ni.id]?.supplierBillNo ||
            ni.supplierBillNo ||
            "",
        }));

        return [...otherItems, ...merged];
      });

      setLoadedBanner(
        `✅ ${newItems.length} fabric${
          newItems.length !== 1 ? "s" : ""
        } sent to Fabric Processing!`
      );

      setTimeout(() => setLoadedBanner(""), 4000);
      setActiveTab("fabric-processing");
    },
    [setGlobalFabricItems, setActiveTab]
  );

  const handleClearAllFabricProcessing = useCallback(() => {
    setGlobalFabricItems([]);
  }, [setGlobalFabricItems]);

  const handleNewQuote = useCallback(async () => {
    const newNo = await generateQuoteNo();

    setQuoteNo(newNo);
    setCurrentQuoteStatus("Draft");
    setRooms([BlankRoom(1, settings)]);
    setMiscellaneousCosts([]);
    setHistorySearch("");

    setQuoteMeta({
      customerName: "",
      customerPhone: "",
      projectTitle: "Curtain Quotation",
      company: {
        name: brand.companyName,
        pdfCompanyName: brand.pdfCompanyName,
        address: brand.address,
        phone: brand.phone,
        email: brand.email,
        logoUrl: brand.logoUrl,
        website: brand.website,
        gstin: brand.gstin,
        paymentQrUrl: brand.paymentQrUrl,
        paymentUpiId: brand.paymentUpiId,
      },
      currency: "INR",
      notes: "Prices are exclusive of taxes. Valid for 7 days.",
      commercials: {
        applyGst: false,
        gstRate: 0,
        discountType: "percent",
        discountValue: 0,
        place: "Pune",
        signatoryName: "Authorized Signatory",
        signatoryTitle: "",
        signatureUrl: normalizeImageUrl(DEFAULT_SIGNATURE_URL),
        needGstBill: false,
        gstin: "",
        billingAddress: "",
      },
    });

    setLoadedBanner(`Started new quote ${newNo}`);
    setActiveTab("quote");
    setTimeout(() => setLoadedBanner(""), 3000);
  }, [settings, brand, setActiveTab]);

  const handleDeleteQuote = useCallback(
    async (no) => {
      if (!window.confirm(`Delete quote ${no}?`)) return;

      try {
        await deleteQuoteRecord(no);
        await refreshQuoteList();

        if (quoteNo === no) {
          setQuoteNo(await generateQuoteNo());
          setCurrentQuoteStatus("Draft");
          setRooms([BlankRoom(1, settings)]);
          setMiscellaneousCosts([]);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [quoteNo, settings, refreshQuoteList]
  );

  const updateRoom = useCallback((id, patch) => {
    setRooms((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        if (JSON.stringify(merged) !== JSON.stringify(r)) {
          changed = true;
        }
        return merged;
      });
      return changed ? next : prev;
    });
  }, []);

  const addRoomAfter = useCallback(
    (afterIndex = -1) => {
      setRooms((prev) => {
        const newRoom = BlankRoom(prev.length + 1, settings);

        if (afterIndex < 0 || afterIndex >= prev.length - 1) {
          return [...prev, newRoom];
        }

        const next = [...prev];
        next.splice(afterIndex + 1, 0, newRoom);
        return next;
      });
    },
    [settings]
  );

  const addRoom = useCallback(
    () => addRoomAfter(-1),
    [addRoomAfter]
  );

  const cloneRoom = useCallback((id) => {
    setRooms((prev) => {
      const room = prev.find((item) => item.id === id);
      if (!room) return prev;

      return [
        ...prev,
        {
          ...room,
          id: crypto.randomUUID(),
          name: `${room.name} (Copy)`,
        },
      ];
    });
  }, []);

  const deleteRoom = useCallback((id) => {
    setRooms((prev) => prev.filter((room) => room.id !== id));
  }, []);

  const allTotalsLive = useMemo(
    () =>
      computeAllTotals(
        rooms,
        quoteMeta.commercials,
        settings,
        miscellaneousCosts
      ),
    [rooms, quoteMeta.commercials, settings, miscellaneousCosts]
  );

  const {
    summary: liveSummary,
    gstBreakdown: liveGstBreakdown,
  } = allTotalsLive;

  const grandTotal = liveSummary.base;
  const totalClothCost = liveSummary.clothTotal;
  const totalOther = liveSummary.otherTotal;
  const miscTotal = liveSummary.miscTotal;

  const finalTotals = {
    discountAmount: liveSummary.discountAmount,
    afterDiscount: liveSummary.afterDiscount,
    gstAmount: liveSummary.gstAmount,
    roundOff: liveSummary.roundOff,
    finalTotal: liveSummary.finalTotal,
  };

  const handleAddMiscCost = useCallback(() => {
    setMiscellaneousCosts((prev) => [
      ...prev,
      BlankMiscCost(settings),
    ]);
  }, [settings]);

  const handleMiscCostChange = useCallback((id, patch) => {
    setMiscellaneousCosts((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    );
  }, []);

  const handleDeleteMiscCost = useCallback((id) => {
    setMiscellaneousCosts((prev) =>
      prev.filter((item) => item.id !== id)
    );
  }, []);

  return {
    rooms,
    setRooms,
    miscellaneousCosts,
    setMiscellaneousCosts,
    quoteNo,
    setQuoteNo,
    loadedBanner,
    setLoadedBanner,
    currentQuoteStatus,
    setCurrentQuoteStatus,
    quoteMeta,
    setQuoteMeta,

    historySearch,
    setHistorySearch,
    historyStatusFilter,
    setHistoryStatusFilter,
    allQuotes,
    filteredQuotes,
    refreshQuoteList,

    loadQuoteRecord,
    handleUpdateQuoteStatus,
    handleSaveQuote,
    handleSaveOrderData,
    handleProcessToFabricProcessing,
    handleClearAllFabricProcessing,
    handleNewQuote,
    handleDeleteQuote,

    updateRoom,
    addRoomAfter,
    addRoom,
    cloneRoom,
    deleteRoom,

    liveGstBreakdown,
    grandTotal,
    totalClothCost,
    totalOther,
    miscTotal,
    finalTotals,

    handleAddMiscCost,
    handleMiscCostChange,
    handleDeleteMiscCost,
  };
}

