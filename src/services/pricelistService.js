import * as XLSX from "xlsx";
import {
  supabaseFetch,
  SUPABASE_PRICELIST_BRANDS_TABLE,
  SUPABASE_PRICELIST_CATALOGUES_TABLE,
  SUPABASE_PRICELIST_ITEMS_TABLE,
} from "./supabase";

const SUPABASE_PAGE_SIZE = 1000;

const fetchAllRows = async (path) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const separator = path.includes("?") ? "&" : "?";

    const page =
      (await supabaseFetch(
        `${path}${separator}limit=${SUPABASE_PAGE_SIZE}&offset=${offset}`
      )) || [];

    if (!Array.isArray(page)) {
      return rows;
    }

    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    offset += SUPABASE_PAGE_SIZE;
  }

  return rows;
};

export async function getPricelistBrands() {
  return fetchAllRows(
    `/rest/v1/${SUPABASE_PRICELIST_BRANDS_TABLE}?select=id,name,created_at&order=name.asc`
  );
}

export async function getPricelistCatalogues(brandId = null) {
  const brandFilter = brandId
    ? `&brand_id=eq.${encodeURIComponent(brandId)}`
    : "";

  return fetchAllRows(
    `/rest/v1/${SUPABASE_PRICELIST_CATALOGUES_TABLE}?select=id,brand_id,name,created_at&order=name.asc${brandFilter}`
  );
}

export async function getPricelistItems(catalogueId = null) {
  const catalogueFilter = catalogueId
    ? `&catalogue_id=eq.${encodeURIComponent(catalogueId)}`
    : "";

  return fetchAllRows(
    `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}?select=id,catalogue_id,design_code,description,width,hsn,gst_percent,rrp,created_at&order=design_code.asc${catalogueFilter}`
  );
}

export async function searchPricelistItems(searchTerm) {
  const term = String(searchTerm || "").trim();

  if (!term) {
    return [];
  }

  const pattern = encodeURIComponent(`*${term}*`);

  return fetchAllRows(
    `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}?select=id,catalogue_id,design_code,description,width,hsn,gst_percent,rrp&or=(design_code.ilike.${pattern},description.ilike.${pattern},width.ilike.${pattern},hsn.ilike.${pattern})&order=design_code.asc`
  );
}

export async function createPricelistBrand(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Brand name is required.");
  }

  const data = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_BRANDS_TABLE}`,
    {
      method: "POST",
      body: JSON.stringify({ name: cleanName }),
    }
  );

  return Array.isArray(data) ? data[0] : data;
}

export async function createPricelistCatalogue({ brandId, name }) {
  const cleanName = String(name || "").trim();
  if (!brandId) {
    throw new Error("Brand is required.");
  }
  if (!cleanName) {
    throw new Error("Catalogue name is required.");
  }

  const data = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_CATALOGUES_TABLE}`,
    {
      method: "POST",
      body: JSON.stringify({
        brand_id: brandId,
        name: cleanName,
      }),
    }
  );

  return Array.isArray(data) ? data[0] : data;
}

export async function createPricelistItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const rows = items.map((item) => ({
    catalogue_id: item.catalogue_id ?? item.catalogueId,
    design_code: item.design_code ?? item.designCode ?? null,
    description: item.description || null,
    width: item.width || null,
    hsn: item.hsn || null,
    gst_percent:
      (item.gst_percent ?? item.gstPercent) === "" ||
      (item.gst_percent ?? item.gstPercent) == null
        ? null
        : Number(item.gst_percent ?? item.gstPercent),
    rrp: Number(item.rrp || 0),
  }));

  const batchSize = 500;
  const saved = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    const result = await supabaseFetch(
      `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}`,
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(batch),
      }
    );

    if (Array.isArray(result)) {
      saved.push(...result);
    }
  }

  return saved;
}


const GENERIC_SHEET_NAME = /^sheet\s*\d*(?:\s*\(\d+\))?$/i;

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeHeader = (value) =>
  normalizeText(value)
    .toUpperCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ");

const isThemesHeading = (value) =>
  /THEMES\s+FURNISHINGS/i.test(normalizeText(value));

const isDesignHeader = (value) => {
  const text = normalizeHeader(value);
  return [
    "DESIGN",
    "DESIGN/QUALITY",
    "ITEM CODE",
    "P CODE",
    "PCODE",
    "PRODUCT CODE",
    "CODE",
  ].includes(text);
};

const isWidthHeader = (value) => normalizeHeader(value) === "WIDTH";
const isHsnHeader = (value) => normalizeHeader(value) === "HSN";
const isGstHeader = (value) => {
  const text = normalizeHeader(value);
  return text === "GST %" || text === "GST" || text === "GST%";
};
const isRrpHeader = (value) => normalizeHeader(value) === "RRP";

const parseNumericPrice = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return null;

  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseGstPercent = (value) => {
  const parsed = parseNumericPrice(value);
  if (parsed == null) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
};

const formatWidth = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return normalizeText(value) || null;
};

const getCellRawValue = (worksheet, rowIndex, columnIndex) => {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = worksheet[address];
  if (!cell) return null;
  if (cell.v !== undefined && cell.v !== null && cell.v !== "") return cell.v;
  return null;
};

const findCatalogueName = (rows, headerRow, startColumn, endColumn) => {
  for (let row = headerRow - 1; row >= Math.max(0, headerRow - 4); row -= 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const value = normalizeText(rows[row]?.[column]);
      if (!value || isThemesHeading(value)) continue;
      if (
        isDesignHeader(value) ||
        isWidthHeader(value) ||
        isHsnHeader(value) ||
        isGstHeader(value) ||
        isRrpHeader(value)
      ) {
        continue;
      }
      return value;
    }
  }
  return null;
};

const findHeaderColumn = (row, predicate, fromColumn, toColumn) => {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    if (predicate(row?.[column])) return column;
  }
  return -1;
};

const detectCatalogueBlocks = (rows) => {
  const blocks = [];

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;

    row.forEach((value, rrpColumn) => {
      if (!isRrpHeader(value)) return;

      const fromColumn = Math.max(0, rrpColumn - 5);
      const designColumn = findHeaderColumn(
        row,
        isDesignHeader,
        fromColumn,
        rrpColumn
      );

      if (designColumn < 0) return;

      const widthColumn = findHeaderColumn(
        row,
        isWidthHeader,
        designColumn,
        rrpColumn
      );
      const hsnColumn = findHeaderColumn(
        row,
        isHsnHeader,
        designColumn,
        rrpColumn
      );
      const gstColumn = findHeaderColumn(
        row,
        isGstHeader,
        designColumn,
        rrpColumn
      );

      const catalogueName = findCatalogueName(
        rows,
        rowIndex,
        designColumn,
        rrpColumn
      );

      if (!catalogueName) return;

      blocks.push({
        headerRow: rowIndex,
        designColumn,
        widthColumn,
        hsnColumn,
        gstColumn,
        rrpColumn,
        catalogueName,
      });
    });
  });

  return blocks;
};

const parseBlockRows = (worksheet, rows, block) => {
  const items = [];
  let blankRowCount = 0;

  for (let rowIndex = block.headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const designValue = row[block.designColumn];
    const designText = normalizeText(designValue);
    const rrpRaw = getCellRawValue(worksheet, rowIndex, block.rrpColumn);
    const rrp = parseNumericPrice(rrpRaw ?? row[block.rrpColumn]);

    if (isThemesHeading(designText) || isDesignHeader(designText)) break;

    const relevantValues = [
      designText,
      block.widthColumn >= 0 ? row[block.widthColumn] : null,
      block.hsnColumn >= 0 ? row[block.hsnColumn] : null,
      block.gstColumn >= 0 ? row[block.gstColumn] : null,
      row[block.rrpColumn],
    ].filter((value) => normalizeText(value));

    if (relevantValues.length === 0) {
      blankRowCount += 1;
      if (blankRowCount >= 2) break;
      continue;
    }

    blankRowCount = 0;

    if (!designText || rrp == null || rrp < 0) continue;
    if (/GST INCLUDED|ESS FUR|\d{1,2}\/\d{2,4}/i.test(designText)) continue;

    items.push({
      designCode: designText,
      description: null,
      width:
        block.widthColumn >= 0 ? formatWidth(row[block.widthColumn]) : null,
      hsn:
        block.hsnColumn >= 0
          ? normalizeText(row[block.hsnColumn]) || null
          : null,
      gstPercent:
        block.gstColumn >= 0 ? parseGstPercent(row[block.gstColumn]) : null,
      rrp,
    });
  }

  return items;
};

export async function parsePricelistExcel(file) {
  if (!file) {
    throw new Error("Please select an Excel file.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellNF: false,
    cellText: true,
  });

  const brands = [];
  const warnings = [];

  workbook.SheetNames.forEach((sheetName) => {
    const brandName = normalizeText(sheetName);
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet || !brandName) return;

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    const blocks = detectCatalogueBlocks(rows);

    if (blocks.length === 0) {
      if (!GENERIC_SHEET_NAME.test(brandName)) {
        warnings.push(`${brandName}: no standard RRP catalogue tables detected.`);
      }
      return;
    }

    const catalogueMap = new Map();

    blocks.forEach((block) => {
      const items = parseBlockRows(worksheet, rows, block);
      if (items.length === 0) return;

      const key = block.catalogueName.toLowerCase();
      const existing = catalogueMap.get(key);

      if (existing) {
        existing.items.push(...items);
      } else {
        catalogueMap.set(key, {
          name: block.catalogueName,
          items,
        });
      }
    });

    const catalogues = Array.from(catalogueMap.values()).map((catalogue) => ({
      ...catalogue,
      items: catalogue.items.filter(
        (item, index, allItems) =>
          index ===
          allItems.findIndex(
            (candidate) =>
              candidate.designCode === item.designCode &&
              candidate.width === item.width &&
              candidate.rrp === item.rrp
          )
      ),
    }));

    if (catalogues.length > 0) {
      brands.push({
        name: brandName,
        catalogues,
      });
    }
  });

  const catalogueCount = brands.reduce(
    (total, brand) => total + brand.catalogues.length,
    0
  );
  const itemCount = brands.reduce(
    (total, brand) =>
      total +
      brand.catalogues.reduce(
        (brandTotal, catalogue) => brandTotal + catalogue.items.length,
        0
      ),
    0
  );

  return {
    brands,
    warnings,
    summary: {
      brandCount: brands.length,
      catalogueCount,
      itemCount,
    },
  };
}

const upsertPricelistBrand = async (name) => {
  const existing = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_BRANDS_TABLE}?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`
  );

  if (existing?.[0]) return existing[0];
  return createPricelistBrand(name);
};

const upsertPricelistCatalogue = async (brandId, name) => {
  const existing = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_CATALOGUES_TABLE}?select=id,brand_id,name&brand_id=eq.${brandId}&name=eq.${encodeURIComponent(name)}&limit=1`
  );

  if (existing?.[0]) return existing[0];
  return createPricelistCatalogue({ brandId, name });
};

const replaceCatalogueItems = async (catalogueId, items) => {
  await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}?catalogue_id=eq.${catalogueId}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    }
  );

  if (!items.length) return 0;

  const rows = items.map((item) => ({
    catalogue_id: catalogueId,
    design_code: item.designCode || null,
    description: item.description || null,
    width: item.width || null,
    hsn: item.hsn || null,
    gst_percent:
      item.gstPercent === "" || item.gstPercent == null
        ? null
        : Number(item.gstPercent),
    rrp: Number(item.rrp || 0),
  }));

  const batchSize = 500;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    await supabaseFetch(
      `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}`,
      {
        method: "POST",
        body: JSON.stringify(batch),
      }
    );
  }

  return rows.length;
};

export async function importParsedPricelist(parsedPricelist, onProgress) {
  if (!parsedPricelist?.brands?.length) {
    throw new Error("No pricelist data is available to import.");
  }

  let importedBrands = 0;
  let importedCatalogues = 0;
  let importedItems = 0;

  for (const brand of parsedPricelist.brands) {
    const savedBrand = await upsertPricelistBrand(brand.name);
    importedBrands += 1;

    for (const catalogue of brand.catalogues) {
      const savedCatalogue = await upsertPricelistCatalogue(
        savedBrand.id,
        catalogue.name
      );

      importedCatalogues += 1;
      importedItems += await replaceCatalogueItems(
        savedCatalogue.id,
        catalogue.items
      );

      if (typeof onProgress === "function") {
        onProgress({
          brand: brand.name,
          catalogue: catalogue.name,
          importedBrands,
          importedCatalogues,
          importedItems,
        });
      }
    }
  }

  return {
    importedBrands,
    importedCatalogues,
    importedItems,
  };
}
export async function deletePricelistBrand(brandId) {
  if (!brandId) {
    throw new Error("Brand is required.");
  }

  const result = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_BRANDS_TABLE}?id=eq.${encodeURIComponent(brandId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation",
      },
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(
      "Supabase did not delete the brand. DELETE may be blocked by Row Level Security (RLS)."
    );
  }

  return result[0];
}

export async function deletePricelistCatalogue(catalogueId) {
  if (!catalogueId) {
    throw new Error("Catalogue is required.");
  }

  const result = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_CATALOGUES_TABLE}?id=eq.${encodeURIComponent(catalogueId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation",
      },
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(
      "Supabase did not delete the catalogue. DELETE may be blocked by Row Level Security (RLS)."
    );
  }

  return result[0];
}

export async function deletePricelistItem(itemId) {
  if (!itemId) {
    throw new Error("Design is required.");
  }

  const result = await supabaseFetch(
    `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}?id=eq.${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation",
      },
    }
  );

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(
      "Supabase did not delete the design. DELETE may be blocked by Row Level Security (RLS)."
    );
  }

  return result[0];
}

export async function updatePricelistItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const rows = items.map((item) => ({
    id: item.id,
    catalogue_id: item.catalogue_id,
    design_code: item.design_code || null,
    description: item.description || null,
    width: item.width || null,
    hsn: item.hsn || null,
    gst_percent:
      item.gst_percent === "" || item.gst_percent == null
        ? null
        : Number(item.gst_percent),
    rrp: Number(item.rrp || 0),
  }));

  const batchSize = 500;
  const saved = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    const result = await supabaseFetch(
      `/rest/v1/${SUPABASE_PRICELIST_ITEMS_TABLE}?on_conflict=id`,
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(batch),
      }
    );

    if (Array.isArray(result)) {
      saved.push(...result);
    }
  }

  return saved;
}

export async function setPricelistPrice({
  catalogueIds = [],
  itemIds = [],
  value,
  mode = "exact",
  scope = "all",
}) {
  const ids = Array.from(new Set((catalogueIds || []).map(String))).filter(Boolean);
  const selectedItemIds = new Set(
    Array.from(new Set((itemIds || []).map(String))).filter(Boolean)
  );
  const numericValue = Number(value);

  if (ids.length === 0) {
    throw new Error("Select at least one catalogue.");
  }

  if (!Number.isFinite(numericValue)) {
    throw new Error("Enter a valid value.");
  }

  if (!["exact", "percent"].includes(mode)) {
    throw new Error("Invalid price update mode.");
  }

  if (mode === "exact" && numericValue < 0) {
    throw new Error("Exact price cannot be negative.");
  }

  if (mode === "percent" && numericValue === 0) {
    throw new Error("Enter a non-zero percentage.");
  }

  if (!["all", "selected"].includes(scope)) {
    throw new Error("Invalid price update scope.");
  }

  if (scope === "selected" && selectedItemIds.size === 0) {
    throw new Error("Select at least one design to update.");
  }

  const groups = await Promise.all(
    ids.map((catalogueId) => getPricelistItems(catalogueId))
  );

  const sourceItems = groups.flat();
  const targetItems =
    scope === "selected"
      ? sourceItems.filter((item) => selectedItemIds.has(String(item.id)))
      : sourceItems;

  if (targetItems.length === 0) {
    throw new Error("No matching price rows were found to update.");
  }

  const updatedItems = targetItems.map((item) => {
    const currentPrice = Number(item.rrp || 0);
    const nextPrice =
      mode === "percent"
        ? currentPrice * (1 + numericValue / 100)
        : numericValue;

    return {
      ...item,
      rrp: Math.max(0, Math.ceil(nextPrice)),
    };
  });

  await updatePricelistItems(updatedItems);

  return {
    catalogueCount: ids.length,
    itemCount: updatedItems.length,
    mode,
    value: numericValue,
    scope,
  };
}