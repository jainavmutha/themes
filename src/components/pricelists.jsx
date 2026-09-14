
import { useEffect, useMemo, useState } from "react";
import {
  getPricelistBrands,
  getPricelistCatalogues,
  getPricelistItems,
  searchPricelistItems,
  updatePricelistItems,
  setPricelistPrice,
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

        const [allBrands, allCatalogues, directItemMatches] = await Promise.all([
          getPricelistBrands(),
          getPricelistCatalogues(),
          searchPricelistItems(term),
        ]);

        if (cancelled) return;

        const lowerTerm = term.toLowerCase();
        const brandMap = new Map(
          allBrands.map((brand) => [String(brand.id), brand])
        );

        const matchingBrandIds = new Set(
          allBrands
            .filter((brand) =>
              String(brand.name || "")
                .toLowerCase()
                .includes(lowerTerm)
            )
            .map((brand) => String(brand.id))
        );

        const matchingCatalogues = allCatalogues.filter((catalogue) => {
          const catalogueMatches = String(catalogue.name || "")
            .toLowerCase()
            .includes(lowerTerm);
          const brandMatches = matchingBrandIds.has(String(catalogue.brand_id));
          return catalogueMatches || brandMatches;
        });

        const catalogueItemGroups = await Promise.all(
          matchingCatalogues.map((catalogue) => getPricelistItems(catalogue.id))
        );

        if (cancelled) return;

        const catalogueMap = new Map(
          allCatalogues.map((catalogue) => [String(catalogue.id), catalogue])
        );

        const combined = [
          ...(directItemMatches || []),
          ...catalogueItemGroups.flat(),
        ];

        const unique = Array.from(
          new Map(combined.map((item) => [String(item.id), item])).values()
        ).map((item) => {
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

      const allCatalogues = await getPricelistCatalogues();
      const selectedSet = new Set(selectedCatalogueIds.map(String));
      const pdfCatalogues = allCatalogues.filter((catalogue) =>
        selectedSet.has(String(catalogue.id))
      );

      const itemGroups = await Promise.all(
        pdfCatalogues.map((catalogue) => getPricelistItems(catalogue.id))
      );
      const pdfItems = itemGroups.flat();

      if (pdfCatalogues.length === 0) {
        throw new Error("The selected catalogues could not be found in the database.");
      }

      if (pdfItems.length === 0) {
        throw new Error("The selected catalogues do not contain any price rows.");
      }

      const generatedPdf = generatePricelistPdf({
        brands,
        catalogues: pdfCatalogues,
        items: pdfItems,
        selectedCatalogueIds,
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

      setSuccess(
        `Pricelist PDF generated for ${pdfCatalogues.length} catalogue${
          pdfCatalogues.length === 1 ? "" : "s"
        }.`
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
              <strong>{formatNumber(filteredItems.length)}</strong> price rows · {selectedBrandName} · {selectedCatalogueName}
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
              </tr>
            </thead>
            <tbody>
              {isLoadingData ? (
                <tr>
                  <td colSpan="7">Loading pricelists...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="7">No matching prices found.</td>
                </tr>
              ) : (
                filteredItems.slice(0, 500).map((item) => {
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

        {filteredItems.length > 500 && (
          <div className="muted pricelist-limit-note">
            Showing the first 500 rows. Use search or filters to narrow the results.
          </div>
        )}
      </div>

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