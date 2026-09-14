
import { useEffect, useMemo, useState } from "react";
import {
  getPricelistBrands,
  getPricelistCatalogues,
  getPricelistItems,
  searchPricelistItems,
  updatePricelistItems,
  setPricelistPrice,
  createPricelistBrand,
  createPricelistCatalogue,
  createPricelistItems,
  deletePricelistBrand,
  deletePricelistCatalogue,
  deletePricelistItem,
  importParsedPricelist,
  parsePricelistExcel,
} from "../services/pricelistService";
import { generatePricelistPdf } from "../pdf/pricelistPdf";

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0));

const formatPrice = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(number)}`;
};

export default function Pricelists() {
  const [brands, setBrands] = useState([]);
  const [catalogues, setCatalogues] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedCatalogueId, setSelectedCatalogueId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCatalogueIds, setSelectedCatalogueIds] = useState([]);
  const [selectedCatalogueItems, setSelectedCatalogueItems] = useState([]);
  const [isLoadingSelectedDesigns, setIsLoadingSelectedDesigns] = useState(false);
  const [markupPercent, setMarkupPercent] = useState(0);
  const [priceUpdateMode, setPriceUpdateMode] = useState("percent");
  const [priceUpdateScope, setPriceUpdateScope] = useState("all");
  const [priceUpdateValue, setPriceUpdateValue] = useState(0);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [manualPrices, setManualPrices] = useState({});
  const [designPrices, setDesignPrices] = useState({});
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [dbBrandMode, setDbBrandMode] = useState("existing");
  const [dbBrandId, setDbBrandId] = useState("");
  const [dbNewBrandName, setDbNewBrandName] = useState("");
  const [dbCatalogueMode, setDbCatalogueMode] = useState("existing");
  const [dbCatalogueId, setDbCatalogueId] = useState("");
  const [dbNewCatalogueName, setDbNewCatalogueName] = useState("");
  const [dbCatalogues, setDbCatalogues] = useState([]);
  const [dbDesignRows, setDbDesignRows] = useState([
    { design_code: "", width: "", hsn: "", gst_percent: "", rrp: "" },
  ]);
  const [isSavingDbEntry, setIsSavingDbEntry] = useState(false);

  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [progress, setProgress] = useState(null);

  const loadBrands = async () => {
    const data = await getPricelistBrands();
    setBrands(data);
  };

  const loadCatalogues = async (brandId = null) => {
    const data = await getPricelistCatalogues(brandId || null);
    setCatalogues(data);
  };

  const loadItems = async (catalogueId = null) => {
    const data = await getPricelistItems(catalogueId || null);
    setItems(data);
  };

  const refreshPricelistData = async () => {
    try {
      setIsLoadingData(true);
      setError("");
      await Promise.all([loadBrands(), loadCatalogues(), loadItems()]);
    } catch (err) {
      console.error("Failed to load pricelist data", err);
      setError(err?.message || "Could not load pricelist data from Supabase.");
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    refreshPricelistData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDbCatalogues = async () => {
      if (!dbBrandId || dbBrandMode !== "existing") {
        setDbCatalogues([]);
        setDbCatalogueId("");
        return;
      }

      try {
        const data = await getPricelistCatalogues(dbBrandId);
        if (!cancelled) {
          setDbCatalogues(data || []);
          setDbCatalogueId("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load database-manager catalogues", err);
          setError(err?.message || "Could not load catalogues for this brand.");
        }
      }
    };

    loadDbCatalogues();

    return () => {
      cancelled = true;
    };
  }, [dbBrandId, dbBrandMode]);

  useEffect(() => {
    const updateCatalogues = async () => {
      try {
        setSelectedCatalogueId("");
        await loadCatalogues(selectedBrandId || null);
      } catch (err) {
        console.error("Failed to load catalogues", err);
        setError(err?.message || "Could not load catalogues.");
      }
    };

    updateCatalogues();
  }, [selectedBrandId]);

  useEffect(() => {
    const updateItems = async () => {
      try {
        await loadItems(selectedCatalogueId || null);
      } catch (err) {
        console.error("Failed to load pricelist items", err);
        setError(err?.message || "Could not load catalogue prices.");
      }
    };

    updateItems();
  }, [selectedCatalogueId]);

  useEffect(() => {
    if (!selectedCatalogueId) {
      setManualPrices({});
      return;
    }

    const nextPrices = {};
    items
      .filter(
        (item) => String(item.catalogue_id) === String(selectedCatalogueId)
      )
      .forEach((item) => {
        nextPrices[String(item.id)] = String(item.rrp ?? "");
      });

    setManualPrices(nextPrices);
  }, [items, selectedCatalogueId]);

  const brandById = useMemo(
    () => new Map(brands.map((brand) => [String(brand.id), brand])),
    [brands]
  );

  const catalogueById = useMemo(
    () => new Map(catalogues.map((catalogue) => [String(catalogue.id), catalogue])),
    [catalogues]
  );

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim();
    if (term) return searchResults;
    return items;
  }, [items, searchResults, searchTerm]);

  const browserItems = useMemo(() => {
    const term = searchTerm.trim();

    // When a search is active, show only actual search results.
    // Never fall back to selected catalogue rows, otherwise a failed search
    // can misleadingly show unrelated data.
    if (term) {
      return searchResults;
    }

    if (selectedCatalogueItems.length > 0) {
      return selectedCatalogueItems;
    }

    if (selectedCatalogueId) {
      return items.filter(
        (item) => String(item.catalogue_id) === String(selectedCatalogueId)
      );
    }

    return items;
  }, [
    searchTerm,
    searchResults,
    selectedCatalogueItems,
    selectedCatalogueId,
    items,
  ]);

  useEffect(() => {
    const term = searchTerm.trim();

    if (!term) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setIsSearching(true);
        setError("");

        const normalizeSearchText = (value) =>
          String(value ?? "")
            .normalize("NFKD")
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const normalizedTerm = normalizeSearchText(term);
        const searchTokens = normalizedTerm
          .split(" ")
          .filter((token) => token.length >= 2 && token !== "and");

        const textMatches = (value) => {
          const normalizedValue = normalizeSearchText(value);
          if (!normalizedValue || !normalizedTerm) return false;
          if (normalizedValue.includes(normalizedTerm)) return true;

          return (
            searchTokens.length > 0 &&
            searchTokens.every((token) => normalizedValue.includes(token))
          );
        };

        const [allBrands, allCatalogues, directItemMatches] = await Promise.all([
          getPricelistBrands(),
          getPricelistCatalogues(),
          searchPricelistItems(term),
        ]);

        if (cancelled) return;

        const brandMap = new Map(
          allBrands.map((brand) => [String(brand.id), brand])
        );
        const catalogueMap = new Map(
          allCatalogues.map((catalogue) => [String(catalogue.id), catalogue])
        );

        const matchingBrandIds = new Set(
          allBrands
            .filter((brand) => textMatches(brand.name))
            .map((brand) => String(brand.id))
        );

        const matchingCatalogues = allCatalogues.filter((catalogue) => {
          const brand = brandMap.get(String(catalogue.brand_id));
          return (
            textMatches(catalogue.name) ||
            matchingBrandIds.has(String(catalogue.brand_id)) ||
            textMatches(brand?.name)
          );
        });

        // If the search matches a catalogue name such as "Silk & Satin",
        // load every design in that catalogue, not just rows whose own text matches.
        const matchedCatalogueGroups = await Promise.all(
          matchingCatalogues.map(async (catalogue) => {
            const rows = await getPricelistItems(catalogue.id);
            const brand = brandMap.get(String(catalogue.brand_id));

            return (rows || []).map((item) => ({
              ...item,
              _catalogueName: catalogue.name || "",
              _brandName: brand?.name || "",
            }));
          })
        );

        if (cancelled) return;

        const normalizedDirectMatches = (directItemMatches || []).map((item) => {
          const catalogue = catalogueMap.get(String(item.catalogue_id));
          const brand = catalogue
            ? brandMap.get(String(catalogue.brand_id))
            : null;

          return {
            ...item,
            _catalogueName: catalogue?.name || "",
            _brandName: brand?.name || "",
          };
        });

        const combined = [
          ...matchedCatalogueGroups.flat(),
          ...normalizedDirectMatches,
        ];

        const unique = Array.from(
          new Map(combined.map((item) => [String(item.id), item])).values()
        );

        setSearchResults(unique);
      } catch (err) {
        if (!cancelled) {
          console.error("Pricelist search failed", err);
          setError(err?.message || "Could not search the pricelist database.");
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  const selectedBrandName = selectedBrandId
    ? brandById.get(String(selectedBrandId))?.name || ""
    : "All Brands";

  const selectedCatalogueName = selectedCatalogueId
    ? catalogueById.get(String(selectedCatalogueId))?.name || ""
    : "All Catalogues";

  const visibleCatalogueIds = useMemo(
    () => catalogues.map((catalogue) => String(catalogue.id)),
    [catalogues]
  );

  const selectedCatalogueIdSet = useMemo(
    () => new Set(selectedCatalogueIds.map(String)),
    [selectedCatalogueIds]
  );

  const selectedCatalogues = useMemo(
    () =>
      catalogues.filter((catalogue) =>
        selectedCatalogueIdSet.has(String(catalogue.id))
      ),
    [catalogues, selectedCatalogueIdSet]
  );

  const selectedItems = useMemo(
    () => selectedCatalogueItems,
    [selectedCatalogueItems]
  );

  useEffect(() => {
    let cancelled = false;

    const loadSelectedCatalogueItems = async () => {
      if (selectedCatalogueIds.length === 0) {
        setSelectedCatalogueItems([]);
        setIsLoadingSelectedDesigns(false);
        return;
      }

      try {
        setIsLoadingSelectedDesigns(true);
        const groups = await Promise.all(
          selectedCatalogueIds.map((catalogueId) =>
            getPricelistItems(catalogueId)
          )
        );

        if (!cancelled) {
          setSelectedCatalogueItems(groups.flat());
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load selected catalogue designs", err);
          setError(err?.message || "Could not load designs for the selected catalogues.");
          setSelectedCatalogueItems([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelectedDesigns(false);
        }
      }
    };

    loadSelectedCatalogueItems();

    return () => {
      cancelled = true;
    };
  }, [selectedCatalogueIds]);

  useEffect(() => {
    const nextPrices = {};
    selectedItems.forEach((item) => {
      nextPrices[String(item.id)] = String(item.rrp ?? "");
    });
    setDesignPrices(nextPrices);
  }, [selectedItems]);

  const allVisibleSelected =
    visibleCatalogueIds.length > 0 &&
    visibleCatalogueIds.every((id) => selectedCatalogueIdSet.has(id));

  const toggleCatalogueSelection = (catalogueId) => {
    const id = String(catalogueId);

    setSelectedCatalogueIds((current) =>
      current.map(String).includes(id)
        ? current.filter((value) => String(value) !== id)
        : [...current, id]
    );
  };

  const toggleSelectAllVisibleCatalogues = () => {
    setSelectedCatalogueIds((current) => {
      const currentSet = new Set(current.map(String));
      const shouldRemove = visibleCatalogueIds.every((id) => currentSet.has(id));

      if (shouldRemove) {
        return current.filter((id) => !visibleCatalogueIds.includes(String(id)));
      }

      return Array.from(new Set([...current.map(String), ...visibleCatalogueIds]));
    });
  };

  const clearCatalogueSelection = () => {
    setSelectedCatalogueIds([]);
  };

  const toggleItemSelection = (itemId) => {
    const id = String(itemId);
    setSelectedItemIds((current) =>
      current.map(String).includes(id)
        ? current.filter((value) => String(value) !== id)
        : [...current, id]
    );
  };

  const selectAllVisibleItems = () => {
    setSelectedItemIds(
      filteredItems.slice(0, 500).map((item) => String(item.id))
    );
  };

  const clearItemSelection = () => {
    setSelectedItemIds([]);
  };

  const handleDesignPriceChange = (itemId, value) => {
    setDesignPrices((current) => ({
      ...current,
      [String(itemId)]: value,
    }));
  };

  const handleSaveDesignPrices = async () => {
    if (selectedCatalogueIds.length === 0) {
      setError("Select at least one catalogue first.");
      return;
    }

    const changedItems = selectedItems
      .map((item) => {
        const enteredValue = designPrices[String(item.id)];
        const nextPrice = Number(enteredValue);

        if (!Number.isFinite(nextPrice) || nextPrice < 0) return null;
        if (nextPrice === Number(item.rrp)) return null;

        return {
          ...item,
          rrp: Math.ceil(nextPrice),
        };
      })
      .filter(Boolean);

    if (changedItems.length === 0) {
      setSuccess("No design price changes to save.");
      return;
    }

    try {
      setIsSavingPrices(true);
      setError("");
      setSuccess("");

      await updatePricelistItems(changedItems);
      setSuccess(
        `Saved ${formatNumber(changedItems.length)} design price${
          changedItems.length === 1 ? "" : "s"
        } to Supabase.`
      );

      await refreshPricelistData();
      const refreshedGroups = await Promise.all(
        selectedCatalogueIds.map((catalogueId) => getPricelistItems(catalogueId))
      );
      setSelectedCatalogueItems(refreshedGroups.flat());
    } catch (err) {
      console.error("Failed to save design-wise prices", err);
      setError(err?.message || "Could not save the design prices.");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const adjustedPrice = (rrp) => {
    const base = Number(rrp || 0);
    const percent = Number(markupPercent || 0);
    return Math.ceil(base * (1 + percent / 100));
  };

  const handleGeneratePdf = async () => {
    if (selectedCatalogueIds.length === 0) {
      setError("Select at least one catalogue before generating the PDF.");
      return;
    }

    try {
      setError("");
      setSuccess("");

      // Use the exact catalogue selection visible in the UI as the source of truth.
      // This prevents a selected catalogue from disappearing during a second lookup.
      const selectedSet = new Set(selectedCatalogueIds.map(String));

      let pdfCatalogues = catalogues.filter((catalogue) =>
        selectedSet.has(String(catalogue.id))
      );

      // Fallback to a fresh catalogue load only if the current UI list does not
      // contain every selected id (for example after changing filters quickly).
      if (pdfCatalogues.length !== selectedSet.size) {
        const allCatalogues = await getPricelistCatalogues();
        pdfCatalogues = allCatalogues.filter((catalogue) =>
          selectedSet.has(String(catalogue.id))
        );
      }

      if (pdfCatalogues.length !== selectedSet.size) {
        const foundIds = new Set(pdfCatalogues.map((catalogue) => String(catalogue.id)));
        const missingIds = selectedCatalogueIds.filter(
          (id) => !foundIds.has(String(id))
        );
        throw new Error(
          `Could not resolve ${missingIds.length} selected catalogue${
            missingIds.length === 1 ? "" : "s"
          } for the PDF.`
        );
      }

      // Fetch every selected catalogue independently at generation time.
      // We also compare with selectedCatalogueItems, which is what the design
      // editor below is displaying, so anything visible there cannot be silently lost.
      const loadedByCatalogue = new Map();
      selectedCatalogueItems.forEach((item) => {
        const key = String(item.catalogue_id);
        if (!loadedByCatalogue.has(key)) loadedByCatalogue.set(key, []);
        loadedByCatalogue.get(key).push(item);
      });

      const catalogueResults = await Promise.all(
        pdfCatalogues.map(async (catalogue) => {
          let rows = loadedByCatalogue.get(String(catalogue.id)) || [];

          if (rows.length === 0) {
            const freshRows = await getPricelistItems(catalogue.id);
            rows = Array.isArray(freshRows) ? freshRows : [];
          }

          return {
            catalogue,
            rows,
          };
        })
      );

      const emptyCatalogues = [];
      const pdfItems = [];

      catalogueResults.forEach(({ catalogue, rows }) => {
        if (!rows.length) {
          emptyCatalogues.push(catalogue.name || String(catalogue.id));
          return;
        }

        rows.forEach((item) => {
          pdfItems.push({
            ...item,
            catalogue_id: catalogue.id,
          });
        });
      });

      if (pdfItems.length === 0) {
        throw new Error("The selected catalogues do not contain any price rows.");
      }

      const allBrands = brands.length ? brands : await getPricelistBrands();

      const generatedPdf = generatePricelistPdf({
        brands: allBrands,
        catalogues: pdfCatalogues,
        items: pdfItems,
        selectedCatalogueIds: pdfCatalogues.map((catalogue) => String(catalogue.id)),
        markupPercent,
        filename: `Themes-Pricelist-${Number(markupPercent || 0)}pct.pdf`,
      });

      if (!generatedPdf?.blob) {
        throw new Error("PDF generation did not return a file.");
      }

      const pdfUrl = URL.createObjectURL(generatedPdf.blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = pdfUrl;
      downloadLink.download = generatedPdf.filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      window.setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 1000);

      const generatedCount = pdfCatalogues.length - emptyCatalogues.length;
      const emptyNote =
        emptyCatalogues.length > 0
          ? ` ${emptyCatalogues.length} catalogue${
              emptyCatalogues.length === 1 ? "" : "s"
            } had no rows and were skipped: ${emptyCatalogues.join(", ")}.`
          : "";

      setSuccess(
        `Pricelist PDF generated for ${generatedCount} of ${pdfCatalogues.length} selected catalogue${
          pdfCatalogues.length === 1 ? "" : "s"
        }.${emptyNote}`
      );
    } catch (err) {
      console.error("Failed to generate pricelist PDF", err);
      setError(err?.message || "Could not generate the pricelist PDF.");
    }
  };

  const handleBulkPriceUpdate = async () => {
    if (selectedCatalogueIds.length === 0) {
      setError("Select at least one catalogue to update.");
      return;
    }

    const value = Number(priceUpdateValue);
    if (!Number.isFinite(value)) {
      setError("Enter a valid price value.");
      return;
    }

    if (priceUpdateMode === "percent" && value === 0) {
      setError("Enter a non-zero percentage.");
      return;
    }

    if (priceUpdateMode === "exact" && value < 0) {
      setError("Exact price cannot be negative.");
      return;
    }

    if (priceUpdateScope === "selected" && selectedItemIds.length === 0) {
      setError("Select at least one design row to update.");
      return;
    }

    const actionText =
      priceUpdateMode === "percent"
        ? `${value > 0 ? "increase" : "decrease"} prices by ${Math.abs(value)}%`
        : `set price to ${formatPrice(value)}`;

    const scopeText =
      priceUpdateScope === "all"
        ? "all designs in the selected catalogues"
        : `${selectedItemIds.length} selected design${selectedItemIds.length === 1 ? "" : "s"}`;

    const confirmed = window.confirm(
      `Permanently ${actionText} for ${scopeText}? This will update Supabase.`
    );

    if (!confirmed) return;

    try {
      setIsBulkUpdating(true);
      setError("");
      setSuccess("");

      const result = await setPricelistPrice({
        catalogueIds: selectedCatalogueIds,
        itemIds: selectedItemIds,
        value,
        mode: priceUpdateMode,
        scope: priceUpdateScope,
      });

      setSuccess(
        `Updated ${formatNumber(result.itemCount)} price row${
          result.itemCount === 1 ? "" : "s"
        } in Supabase.`
      );

      await refreshPricelistData();
      setSelectedItemIds([]);
    } catch (err) {
      console.error("Failed to update pricelist prices", err);
      setError(err?.message || "Could not update the selected prices.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleManualPriceChange = (itemId, value) => {
    setManualPrices((current) => ({
      ...current,
      [String(itemId)]: value,
    }));
  };

  const handleSaveManualPrices = async () => {
    if (!selectedCatalogueId) {
      setError("Choose a catalogue before editing prices.");
      return;
    }

    const catalogueItems = items.filter(
      (item) => String(item.catalogue_id) === String(selectedCatalogueId)
    );

    const changedItems = catalogueItems
      .map((item) => {
        const enteredValue = manualPrices[String(item.id)];
        const nextPrice = Number(enteredValue);

        if (!Number.isFinite(nextPrice) || nextPrice < 0) return null;
        if (nextPrice === Number(item.rrp)) return null;

        return {
          ...item,
          rrp: Math.ceil(nextPrice),
        };
      })
      .filter(Boolean);

    if (changedItems.length === 0) {
      setSuccess("No price changes to save.");
      return;
    }

    try {
      setIsSavingPrices(true);
      setError("");
      setSuccess("");

      await updatePricelistItems(changedItems);
      setSuccess(
        `Saved ${formatNumber(changedItems.length)} updated price${
          changedItems.length === 1 ? "" : "s"
        } to Supabase.`
      );

      await loadItems(selectedCatalogueId);
    } catch (err) {
      console.error("Failed to save manual pricelist prices", err);
      setError(err?.message || "Could not save the edited prices.");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const updateDbDesignRow = (index, field, value) => {
    setDbDesignRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const addDbDesignRow = () => {
    setDbDesignRows((current) => [
      ...current,
      { design_code: "", width: "", hsn: "", gst_percent: "", rrp: "" },
    ]);
  };

  const removeDbDesignRow = (index) => {
    setDbDesignRows((current) =>
      current.length === 1
        ? current
        : current.filter((_, rowIndex) => rowIndex !== index)
    );
  };

  const resetDbEntryForm = () => {
    setDbNewBrandName("");
    setDbNewCatalogueName("");
    setDbDesignRows([
      { design_code: "", width: "", hsn: "", gst_percent: "", rrp: "" },
    ]);
  };

  const handleSaveDbEntry = async () => {
    try {
      setIsSavingDbEntry(true);
      setError("");
      setSuccess("");

      let brandId = dbBrandId;

      if (dbBrandMode === "new") {
        const brandName = dbNewBrandName.trim();
        if (!brandName) throw new Error("Enter the new brand name.");

        const createdBrand = await createPricelistBrand(brandName);
        brandId = Array.isArray(createdBrand)
          ? createdBrand[0]?.id
          : createdBrand?.id;
      }

      if (!brandId) throw new Error("Select a brand or create a new brand.");

      let catalogueId = dbCatalogueId;

      if (dbCatalogueMode === "new") {
        const catalogueName = dbNewCatalogueName.trim();
        if (!catalogueName) throw new Error("Enter the new catalogue name.");

        const createdCatalogue = await createPricelistCatalogue({
          brandId,
          name: catalogueName,
        });
        catalogueId = Array.isArray(createdCatalogue)
          ? createdCatalogue[0]?.id
          : createdCatalogue?.id;
      }

      if (!catalogueId) {
        throw new Error("Select a catalogue or create a new catalogue.");
      }

      const validRows = dbDesignRows
        .map((row) => ({
          catalogue_id: catalogueId,
          design_code: row.design_code.trim() || null,
          description: null,
          width: row.width.trim() || null,
          hsn: row.hsn.trim() || null,
          gst_percent: row.gst_percent === "" ? null : Number(row.gst_percent),
          rrp: Number(row.rrp),
        }))
        .filter(
          (row) =>
            row.design_code && Number.isFinite(row.rrp) && row.rrp >= 0
        );

      if (validRows.length === 0) {
        throw new Error("Add at least one design with a design/code and valid RRP.");
      }

      await createPricelistItems(validRows);

      setSuccess(
        `Added ${formatNumber(validRows.length)} design${
          validRows.length === 1 ? "" : "s"
        } to the pricelist database.`
      );

      resetDbEntryForm();
      await refreshPricelistData();

      if (dbBrandMode === "existing" && dbBrandId) {
        const refreshedCatalogues = await getPricelistCatalogues(dbBrandId);
        setDbCatalogues(refreshedCatalogues || []);
      }
    } catch (err) {
      console.error("Failed to add pricelist database entry", err);
      setError(err?.message || "Could not add the pricelist data.");
    } finally {
      setIsSavingDbEntry(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!dbBrandId) {
      setError("Select a brand to delete.");
      return;
    }

    const brand = brands.find((entry) => String(entry.id) === String(dbBrandId));
    const brandName = brand?.name || "this brand";

    if (!window.confirm(
      `Delete ${brandName}? This will permanently delete the brand, all of its catalogues, and every design inside them.`
    )) return;

    try {
      setError("");
      setSuccess(`Deleting ${brandName}...`);
      await deletePricelistBrand(dbBrandId);
      setDbBrandId("");
      setDbCatalogueId("");
      setDbCatalogues([]);
      setSelectedBrandId("");
      setSelectedCatalogueId("");
      setSelectedCatalogueIds([]);
      setSelectedCatalogueItems([]);
      await refreshPricelistData();
      setSuccess(`Deleted ${brandName} and all related catalogues and designs.`);
    } catch (err) {
      console.error("Failed to delete pricelist brand", err);
      setSuccess("");
      setError(err?.message || "Could not delete the brand.");
    }
  };

  const handleDeleteCatalogue = async () => {
    if (!dbCatalogueId) {
      setError("Select a catalogue to delete.");
      return;
    }

    const catalogue = dbCatalogues.find(
      (entry) => String(entry.id) === String(dbCatalogueId)
    );
    const catalogueName = catalogue?.name || "this catalogue";

    if (!window.confirm(
      `Delete ${catalogueName}? This will permanently delete the catalogue and every design inside it.`
    )) return;

    try {
      setError("");
      setSuccess(`Deleting ${catalogueName}...`);
      await deletePricelistCatalogue(dbCatalogueId);
      setDbCatalogueId("");
      setSelectedCatalogueId("");
      setSelectedCatalogueIds((current) =>
        current.filter((id) => String(id) !== String(dbCatalogueId))
      );
      const refreshedCatalogues = dbBrandId
        ? await getPricelistCatalogues(dbBrandId)
        : [];
      setDbCatalogues(refreshedCatalogues || []);
      await refreshPricelistData();
      setSuccess(`Deleted ${catalogueName} and all of its designs.`);
    } catch (err) {
      console.error("Failed to delete pricelist catalogue", err);
      setSuccess("");
      setError(err?.message || "Could not delete the catalogue.");
    }
  };

  const handleDeleteDesign = async (item) => {
    const designName = item?.design_code || item?.description || "this design";

    if (!window.confirm(
      `Delete design ${designName}? This will permanently remove only this design row.`
    )) return;

    try {
      setError("");
      setSuccess(`Deleting design ${designName}...`);
      await deletePricelistItem(item.id);

      if (selectedCatalogueId) {
        await loadItems(selectedCatalogueId);
      } else {
        await loadItems();
      }

      if (selectedCatalogueIds.length > 0) {
        const refreshedGroups = await Promise.all(
          selectedCatalogueIds.map((catalogueId) =>
            getPricelistItems(catalogueId)
          )
        );
        setSelectedCatalogueItems(refreshedGroups.flat());
      }

      setSuccess(`Deleted design ${designName}.`);
    } catch (err) {
      console.error("Failed to delete pricelist design", err);
      setSuccess("");
      setError(err?.message || "Could not delete the design.");
    }
  };

  const sampleBrands = useMemo(
    () => parsed?.brands?.slice(0, 8) || [],
    [parsed]
  );

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files?.[0] || null;

    setFile(selectedFile);
    setParsed(null);
    setError("");
    setSuccess("");
    setProgress(null);

    if (!selectedFile) return;

    try {
      setIsParsing(true);
      const result = await parsePricelistExcel(selectedFile);
      setParsed(result);
    } catch (err) {
      console.error("Failed to parse pricelist Excel", err);
      setError(err?.message || "Could not read the Excel file.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsed?.brands?.length) return;

    try {
      setIsImporting(true);
      setError("");
      setSuccess("");
      setProgress(null);

      const result = await importParsedPricelist(parsed, setProgress);

      setSuccess(
        `Imported ${formatNumber(result.importedBrands)} brands, ${formatNumber(
          result.importedCatalogues
        )} catalogues and ${formatNumber(result.importedItems)} price rows.`
      );

      await refreshPricelistData();
    } catch (err) {
      console.error("Failed to import pricelist", err);
      setError(err?.message || "Could not import the pricelist to Supabase.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="panel pricelists-panel">
      <div className="panel-header">
        <div>
          <h2>Pricelists</h2>
          <p className="muted">
            Search any imported design, browse catalogues by brand, and view current RRP.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="pricelist-search-card">
        <div className="pricelist-filter-grid">
          <div className="field">
            <label htmlFor="pricelist-search">Search</label>
            <input
              id="pricelist-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search design, code, catalogue, brand, width or price..."
            />
          </div>

          <div className="field">
            <label htmlFor="pricelist-brand">Brand</label>
            <select
              id="pricelist-brand"
              value={selectedBrandId}
              onChange={(event) => setSelectedBrandId(event.target.value)}
            >
              <option value="">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="pricelist-catalogue">Catalogue</label>
            <select
              id="pricelist-catalogue"
              value={selectedCatalogueId}
              onChange={(event) => setSelectedCatalogueId(event.target.value)}
            >
              <option value="">All Catalogues</option>
              {catalogues.map((catalogue) => (
                <option key={catalogue.id} value={catalogue.id}>
                  {catalogue.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pricelist-result-meta">
          {isSearching ? (
            <>Searching entire pricelist database...</>
          ) : (
            <>
              <strong>{formatNumber(searchTerm.trim() ? searchResults.length : filteredItems.length)}</strong> price rows · {selectedBrandName} · {selectedCatalogueName}
            </>
          )}
        </div>
      </div>

      <div className="pricelist-selection-card">
        <div className="panel-header compact">
          <div>
            <h3>Create Printable Pricelist</h3>
            <p className="muted">
              First choose a brand and its catalogue(s). Then choose whether to edit the whole catalogue or individual designs.
            </p>
          </div>
        </div>

        <div className="pricelist-workflow-step">
          <div className="pricelist-step-number">1</div>
          <div className="field pricelist-workflow-brand-field">
            <label htmlFor="pricelist-workflow-brand">Select Brand</label>
            <select
              id="pricelist-workflow-brand"
              value={selectedBrandId}
              onChange={(event) => {
                setSelectedBrandId(event.target.value);
                setSelectedCatalogueIds([]);
                setSelectedItemIds([]);
              }}
            >
              <option value="">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pricelist-workflow-heading">
          <span className="pricelist-step-number">2</span>
          <div>
            <strong>Select Catalogue(s)</strong>
            <div className="muted">Choose one or more catalogues from the selected brand.</div>
          </div>
        </div>

        <div className="pricelist-selection-toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={toggleSelectAllVisibleCatalogues}
            disabled={catalogues.length === 0}
          >
            {allVisibleSelected ? "Clear Visible Catalogues" : "Select All Visible Catalogues"}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearCatalogueSelection}
            disabled={selectedCatalogueIds.length === 0}
          >
            Clear Selection
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGeneratePdf}
            disabled={selectedCatalogueIds.length === 0}
          >
            Generate PDF
          </button>

          <div className="field pricelist-markup-field">
            <label htmlFor="pricelist-markup">Increase over RRP (%)</label>
            <input
              id="pricelist-markup"
              type="number"
              min="0"
              step="0.1"
              value={markupPercent}
              onChange={(event) => setMarkupPercent(event.target.value)}
            />
          </div>
        </div>

        <div className="pricelist-catalogue-grid">
          {catalogues.map((catalogue) => {
            const brand = brandById.get(String(catalogue.brand_id));
            const checked = selectedCatalogueIdSet.has(String(catalogue.id));

            return (
              <label
                key={catalogue.id}
                className={`pricelist-catalogue-option ${checked ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCatalogueSelection(catalogue.id)}
                />
                <span>
                  <strong>{catalogue.name}</strong>
                  <small>{brand?.name || "Unknown brand"}</small>
                </span>
              </label>
            );
          })}
        </div>

        <div className="pricelist-selection-summary">
          <strong>{formatNumber(selectedCatalogues.length)}</strong> catalogues selected · {" "}
          <strong>{formatNumber(selectedItems.length)}</strong> price rows · {" "}
          markup <strong>{Number(markupPercent || 0)}%</strong>
        </div>

        {priceUpdateScope === "selected" && isLoadingSelectedDesigns && (
          <div className="pricelist-design-mode-note">
            <strong>Loading designs...</strong>
            <div className="muted">Fetching all designs from the selected catalogue(s).</div>
          </div>
        )}

        {priceUpdateScope === "selected" && !isLoadingSelectedDesigns && selectedItems.length > 0 && (
          <div className="pricelist-design-editor">
            <div className="pricelist-design-editor-head">
              <div>
                <strong>Edit Design Prices</strong>
                <div className="muted">
                  Enter the final RRP for each design you want to change. Different designs can have different prices.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDesignPrices}
                disabled={isSavingPrices}
              >
                {isSavingPrices ? "Saving..." : "Save Design Prices"}
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Catalogue</th>
                    <th>Design / Code</th>
                    <th>Current RRP</th>
                    <th>New RRP</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.slice(0, 100).map((item) => {
                    const catalogue = catalogueById.get(String(item.catalogue_id));
                    const brand = catalogue
                      ? brandById.get(String(catalogue.brand_id))
                      : null;

                    return (
                      <tr key={`design-edit-${item.id}`}>
                        <td>{brand?.name || "—"}</td>
                        <td>{catalogue?.name || "—"}</td>
                        <td>{item.design_code || item.description || "—"}</td>
                        <td>{formatPrice(item.rrp)}</td>
                        <td>
                          <input
                            className="pricelist-price-input"
                            type="number"
                            min="0"
                            step="1"
                            value={designPrices[String(item.id)] ?? String(item.rrp ?? "")}
                            onChange={(event) =>
                              handleDesignPriceChange(item.id, event.target.value)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {priceUpdateScope === "selected" &&
          !isLoadingSelectedDesigns &&
          selectedCatalogueIds.length > 0 &&
          selectedItems.length === 0 && (
            <div className="pricelist-design-mode-note">
              <strong>No designs found</strong>
              <div className="muted">
                The selected catalogue(s) do not currently contain any price rows in Supabase.
              </div>
            </div>
          )}
        {priceUpdateScope === "selected" && selectedItems.length > 100 && (
          <div className="muted pricelist-limit-note">
            Preview shows the first 100 selected price rows. All selected rows will be available for the PDF step.
          </div>
        )}

        <div className="pricelist-db-update-box pricelist-price-manager">
          <div className="pricelist-workflow-heading pricelist-price-manager-title">
            <span className="pricelist-step-number">3</span>
            <div>
              <strong>Choose Price Editing Method</strong>
              <div className="muted">
                Update the entire selected catalogue(s), or edit every design individually.
              </div>
            </div>
          </div>

          <div className="pricelist-segmented-control pricelist-edit-scope-toggle">
            <button
              type="button"
              className={priceUpdateScope === "all" ? "active" : ""}
              onClick={() => setPriceUpdateScope("all")}
            >
              Entire Catalogue(s)
            </button>
            <button
              type="button"
              className={priceUpdateScope === "selected" ? "active" : ""}
              onClick={() => setPriceUpdateScope("selected")}
            >
              Design-wise
            </button>
          </div>

          {priceUpdateScope === "all" ? (
            <div className="pricelist-entire-catalogue-editor">
              <div className="pricelist-price-manager-head">
                <div>
                  <strong>Update Entire Catalogue(s)</strong>
                  <div className="muted">
                    This applies the same rule to every design in the selected catalogue(s).
                  </div>
                </div>
                <div className="pricelist-price-manager-count">
                  {selectedCatalogues.length} catalogue{selectedCatalogues.length === 1 ? "" : "s"} · {selectedItems.length} designs
                </div>
              </div>

              <div className="pricelist-segmented-control pricelist-price-mode-toggle">
                <button
                  type="button"
                  className={priceUpdateMode === "percent" ? "active" : ""}
                  onClick={() => setPriceUpdateMode("percent")}
                >
                  Percentage Change
                </button>
                <button
                  type="button"
                  className={priceUpdateMode === "exact" ? "active" : ""}
                  onClick={() => setPriceUpdateMode("exact")}
                >
                  Set Exact Price
                </button>
              </div>

              <div className="pricelist-price-manager-action">
                <div className="field">
                  <label htmlFor="price-update-value">
                    {priceUpdateMode === "percent" ? "Change by (%)" : "Set exact RRP (₹)"}
                  </label>
                  <input
                    id="price-update-value"
                    type="number"
                    step={priceUpdateMode === "percent" ? "0.1" : "1"}
                    min={priceUpdateMode === "exact" ? "0" : undefined}
                    value={priceUpdateValue}
                    onChange={(event) => setPriceUpdateValue(event.target.value)}
                    placeholder={priceUpdateMode === "percent" ? "e.g. 10 or -5" : "e.g. 650"}
                  />
                </div>

                <div className="pricelist-update-preview">
                  {priceUpdateMode === "percent" ? (
                    <>
                      Every design in the selected catalogue(s) will be {Number(priceUpdateValue || 0) >= 0 ? "increased" : "decreased"} by {Math.abs(Number(priceUpdateValue || 0))}%.
                    </>
                  ) : (
                    <>
                      Every design in the selected catalogue(s) will be set to <strong>{formatPrice(priceUpdateValue)}</strong>.
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBulkPriceUpdate}
                  disabled={isBulkUpdating || selectedCatalogueIds.length === 0}
                >
                  {isBulkUpdating ? "Updating..." : "Update Entire Catalogue(s)"}
                </button>
              </div>
            </div>
          ) : (
            <div className="pricelist-design-mode-note">
              <strong>Design-wise editing enabled</strong>
              <div className="muted">
                Use the design table above to enter a different final RRP for each design, then click Save Design Prices.
              </div>
            </div>
          )}
        </div>
      </div>

      {(searchTerm.trim() || selectedCatalogueIds.length > 0 || selectedCatalogueId) && (
        <div className="pricelist-browser-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Catalogue</th>
                <th>Design / Code</th>
                <th>Width</th>
                <th>HSN</th>
                <th>GST</th>
                <th>{selectedCatalogueId ? "Edit RRP" : "RRP"}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingData ? (
                <tr>
                  <td colSpan="8">Loading pricelists...</td>
                </tr>
              ) : browserItems.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    {searchTerm.trim()
                      ? `No matches found for "${searchTerm.trim()}".`
                      : selectedCatalogueIds.length > 0
                        ? "No price rows found for the selected catalogue(s)."
                        : "No matching prices found."}
                  </td>
                </tr>
              ) : (
                browserItems.slice(0, 500).map((item) => {
                  const catalogue = catalogueById.get(String(item.catalogue_id));
                  const brand = catalogue
                    ? brandById.get(String(catalogue.brand_id))
                    : null;
                  const displayBrand = item._brandName || brand?.name || "—";
                  const displayCatalogue = item._catalogueName || catalogue?.name || "—";

                  return (
                    <tr key={item.id}>
                      <td>{displayBrand}</td>
                      <td>{displayCatalogue}</td>
                      <td>{item.design_code || item.description || "—"}</td>
                      <td>{item.width || "—"}</td>
                      <td>{item.hsn || "—"}</td>
                      <td>
                        {item.gst_percent !== null && item.gst_percent !== undefined
                          ? `${item.gst_percent}%`
                          : "—"}
                      </td>
                      <td>
                        {selectedCatalogueId &&
                        String(item.catalogue_id) === String(selectedCatalogueId) ? (
                          <input
                            className="pricelist-price-input"
                            type="number"
                            min="0"
                            step="1"
                            value={manualPrices[String(item.id)] ?? String(item.rrp ?? "")}
                            onChange={(event) =>
                              handleManualPriceChange(item.id, event.target.value)
                            }
                          />
                        ) : (
                          <strong>{formatPrice(item.rrp)}</strong>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger pricelist-delete-design-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDeleteDesign(item);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selectedCatalogueId && (
          <div className="pricelist-manual-save-bar">
            <div>
              <strong>Edit prices for {selectedCatalogueName}</strong>
              <div className="muted">
                Change any RRP above, then save. Saved values permanently update Supabase.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveManualPrices}
              disabled={isSavingPrices}
            >
              {isSavingPrices ? "Saving..." : "Save Prices"}
            </button>
          </div>
        )}

        {browserItems.length > 500 && (
          <div className="muted pricelist-limit-note">
            Showing the first 500 rows. Use search or filters to narrow the results.
          </div>
        )}
        </div>
      )}


      <details className="pricelist-import-section pricelist-db-manager">
        <summary>Add Brand, Catalogue or Designs</summary>

        <div className="pricelist-db-manager-body">
          <div className="panel-header compact">
            <div>
              <h3>Add to Pricelist Database</h3>
              <p className="muted">
                Create a new brand, add a catalogue to an existing brand, or add new designs to an existing catalogue.
              </p>
            </div>
          </div>

          <div className="pricelist-db-manager-grid">
            <div className="pricelist-db-manager-card">
              <div className="pricelist-db-manager-card-head">
                <span className="pricelist-step-number">1</span>
                <strong>Brand</strong>
              </div>

              <div className="pricelist-segmented-control">
                <button
                  type="button"
                  className={dbBrandMode === "existing" ? "active" : ""}
                  onClick={() => setDbBrandMode("existing")}
                >
                  Existing Brand
                </button>
                <button
                  type="button"
                  className={dbBrandMode === "new" ? "active" : ""}
                  onClick={() => {
                    setDbBrandMode("new");
                    setDbBrandId("");
                    setDbCatalogueMode("new");
                    setDbCatalogueId("");
                  }}
                >
                  New Brand
                </button>
              </div>

              {dbBrandMode === "existing" ? (
                <div className="field">
                  <label>Select Brand</label>
                  <select
                    value={dbBrandId}
                    onChange={(event) => setDbBrandId(event.target.value)}
                  >
                    <option value="">Choose brand...</option>
                    {brands.map((brand) => (
                      <option key={`db-brand-${brand.id}`} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field">
                  <label>New Brand Name</label>
                  <input
                    type="text"
                    value={dbNewBrandName}
                    onChange={(event) => setDbNewBrandName(event.target.value)}
                    placeholder="e.g. D'Decor"
                  />
                </div>
              )}
              {dbBrandMode === "existing" && dbBrandId && (
                <button
                  type="button"
                  className="btn btn-danger pricelist-delete-button"
                  onClick={handleDeleteBrand}
                >
                  Delete Brand
                </button>
              )}
            </div>

            <div className="pricelist-db-manager-card">
              <div className="pricelist-db-manager-card-head">
                <span className="pricelist-step-number">2</span>
                <strong>Catalogue</strong>
              </div>

              <div className="pricelist-segmented-control">
                <button
                  type="button"
                  className={dbCatalogueMode === "existing" ? "active" : ""}
                  onClick={() => setDbCatalogueMode("existing")}
                  disabled={dbBrandMode === "new"}
                >
                  Existing Catalogue
                </button>
                <button
                  type="button"
                  className={dbCatalogueMode === "new" ? "active" : ""}
                  onClick={() => {
                    setDbCatalogueMode("new");
                    setDbCatalogueId("");
                  }}
                >
                  New Catalogue
                </button>
              </div>

              {dbCatalogueMode === "existing" && dbBrandMode === "existing" ? (
                <div className="field">
                  <label>Select Catalogue</label>
                  <select
                    value={dbCatalogueId}
                    onChange={(event) => setDbCatalogueId(event.target.value)}
                    disabled={!dbBrandId}
                  >
                    <option value="">Choose catalogue...</option>
                    {dbCatalogues.map((catalogue) => (
                      <option key={`db-catalogue-${catalogue.id}`} value={catalogue.id}>
                        {catalogue.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="field">
                  <label>New Catalogue Name</label>
                  <input
                    type="text"
                    value={dbNewCatalogueName}
                    onChange={(event) => setDbNewCatalogueName(event.target.value)}
                    placeholder="e.g. Amaara"
                  />
                </div>
              )}
              {dbCatalogueMode === "existing" && dbCatalogueId && (
                <button
                  type="button"
                  className="btn btn-danger pricelist-delete-button"
                  onClick={handleDeleteCatalogue}
                >
                  Delete Catalogue
                </button>
              )}
            </div>
          </div>

          <div className="pricelist-db-designs-card">
            <div className="pricelist-design-editor-head">
              <div>
                <div className="pricelist-db-manager-card-head">
                  <span className="pricelist-step-number">3</span>
                  <strong>Add Designs</strong>
                </div>
                <div className="muted">
                  Add one or more designs. Design/code and RRP are required; Width, HSN and GST are optional.
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={addDbDesignRow}
              >
                + Add Design Row
              </button>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Design / Code</th>
                    <th>Width</th>
                    <th>HSN</th>
                    <th>GST %</th>
                    <th>RRP</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dbDesignRows.map((row, index) => (
                    <tr key={`db-design-row-${index}`}>
                      <td>
                        <input
                          type="text"
                          value={row.design_code}
                          onChange={(event) =>
                            updateDbDesignRow(index, "design_code", event.target.value)
                          }
                          placeholder="Design code"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.width}
                          onChange={(event) =>
                            updateDbDesignRow(index, "width", event.target.value)
                          }
                          placeholder='54"'
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.hsn}
                          onChange={(event) =>
                            updateDbDesignRow(index, "hsn", event.target.value)
                          }
                          placeholder="HSN"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={row.gst_percent}
                          onChange={(event) =>
                            updateDbDesignRow(index, "gst_percent", event.target.value)
                          }
                          placeholder="5"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.rrp}
                          onChange={(event) =>
                            updateDbDesignRow(index, "rrp", event.target.value)
                          }
                          placeholder="650"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => removeDbDesignRow(index)}
                          disabled={dbDesignRows.length === 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pricelist-db-manager-actions">
              <div className="muted">
                Save creates only the missing brand/catalogue level you selected, then adds these designs to that catalogue.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDbEntry}
                disabled={isSavingDbEntry}
              >
                {isSavingDbEntry ? "Saving..." : "Save to Supabase"}
              </button>
            </div>
          </div>
        </div>
      </details>

      <details className="pricelist-import-section">
        <summary>Update Pricelist Database from Excel</summary>

        <div className="pricelist-upload-card">
          <div className="field">
            <label htmlFor="pricelist-upload">Catalogue Pricing Excel</label>
            <input
              id="pricelist-upload"
              type="file"
              accept=".xlsx,.xls,.xlsm"
              onChange={handleFileChange}
              disabled={isParsing || isImporting}
            />
          </div>

          {file && <div className="muted">Selected: {file.name}</div>}
          {isParsing && <div className="muted">Reading catalogue workbook...</div>}
        </div>

        {parsed && (
          <>
            <div className="pricelist-summary-grid">
              <div className="stat-card">
                <span>Brands</span>
                <strong>{formatNumber(parsed.summary.brandCount)}</strong>
              </div>
              <div className="stat-card">
                <span>Catalogues</span>
                <strong>{formatNumber(parsed.summary.catalogueCount)}</strong>
              </div>
              <div className="stat-card">
                <span>Price Rows</span>
                <strong>{formatNumber(parsed.summary.itemCount)}</strong>
              </div>
              <div className="stat-card">
                <span>Warnings</span>
                <strong>{formatNumber(parsed.warnings?.length || 0)}</strong>
              </div>
            </div>

            <div className="pricelist-preview-card">
              <div className="panel-header compact">
                <div>
                  <h3>Import Preview</h3>
                  <p className="muted">
                    Check a few detected brands and catalogues before importing.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={isImporting || !parsed.summary.itemCount}
                >
                  {isImporting ? "Importing..." : "Import to Supabase"}
                </button>
              </div>

              {progress && (
                <div className="muted pricelist-progress">
                  Importing {progress.brand} → {progress.catalogue} · {formatNumber(
                    progress.importedItems
                  )} rows saved
                </div>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Catalogue</th>
                      <th>Rows</th>
                      <th>Sample Design</th>
                      <th>Sample RRP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleBrands.flatMap((brand) =>
                      brand.catalogues.slice(0, 5).map((catalogue) => {
                        const firstItem = catalogue.items?.[0];

                        return (
                          <tr key={`${brand.name}-${catalogue.name}`}>
                            <td>{brand.name}</td>
                            <td>{catalogue.name}</td>
                            <td>{formatNumber(catalogue.items?.length || 0)}</td>
                            <td>{firstItem?.designCode || "—"}</td>
                            <td>
                              {firstItem?.rrp != null
                                ? formatPrice(firstItem.rrp)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {parsed.warnings?.length > 0 && (
              <div className="pricelist-warning-card">
                <h3>Sheets needing review</h3>
                <p className="muted">
                  These sheets did not match the normal catalogue-table format and were
                  not imported automatically.
                </p>
                <ul>
                  {parsed.warnings.slice(0, 20).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </details>
    </div>
  );
}