import jsPDF from "jspdf";

const PAGE_MARGIN_INCH = 0.5;
const POINTS_PER_INCH = 72;
const PAGE_MARGIN = PAGE_MARGIN_INCH * POINTS_PER_INCH;

const COLORS = {
  primary: [183, 7, 102],
  secondary: [245, 235, 221],
  accent: [0, 126, 124],
  dark: [46, 46, 46],
  muted: [110, 110, 110],
  line: [220, 214, 208],
  white: [255, 255, 255],
};

const formatPrice = (value) => {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(number);
};

const safeText = (value) => String(value ?? "").trim();

const adjustedPrice = (rrp, markupPercent) => {
  const base = Number(rrp || 0);
  const percent = Number(markupPercent || 0);
  return Math.ceil(base * (1 + percent / 100));
};

const groupPricelistData = ({
  brands = [],
  catalogues = [],
  items = [],
  selectedCatalogueIds = [],
}) => {
  const selectedSet = new Set(selectedCatalogueIds.map(String));
  const brandById = new Map(brands.map((brand) => [String(brand.id), brand]));
  const catalogueById = new Map(
    catalogues.map((catalogue) => [String(catalogue.id), catalogue])
  );

  return catalogues
    .filter((catalogue) => selectedSet.has(String(catalogue.id)))
    .map((catalogue) => {
      const brand = brandById.get(String(catalogue.brand_id));
      const catalogueItems = items.filter(
        (item) => String(item.catalogue_id) === String(catalogue.id)
      );

      return {
        brandName: brand?.name || "",
        catalogueName: catalogue.name || "",
        items: catalogueItems,
      };
    })
    .filter((group) => group.items.length > 0)
    .sort((a, b) => {
      const brandCompare = a.brandName.localeCompare(b.brandName);
      if (brandCompare !== 0) return brandCompare;
      return a.catalogueName.localeCompare(b.catalogueName);
    });
};

const getColumnWidths = (tableWidth) => {
  const designWidth = tableWidth * 0.42;
  const widthWidth = tableWidth * 0.14;
  const rrpWidth = tableWidth * 0.21;
  const priceWidth = tableWidth * 0.23;

  return [designWidth, widthWidth, rrpWidth, priceWidth];
};

const estimateTableHeight = (group, rowHeight, titleHeight, headerHeight) =>
  titleHeight + headerHeight + group.items.length * rowHeight;

const drawTable = ({
  doc,
  group,
  x,
  y,
  width,
  markupPercent,
  pageBottom,
  rowHeight,
  titleHeight,
  headerHeight,
  fontSize,
}) => {
  const [designWidth, widthWidth, rrpWidth, priceWidth] = getColumnWidths(width);
  const columnXs = [
    x,
    x + designWidth,
    x + designWidth + widthWidth,
    x + designWidth + widthWidth + rrpWidth,
  ];

  const drawTitle = (titleY) => {
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(x, titleY, width, titleHeight, 4, 4, "F");

    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize + 1);
    doc.text(
      `${group.brandName} — ${group.catalogueName}`,
      x + 7,
      titleY + titleHeight * 0.67,
      { maxWidth: width - 14 }
    );
  };

  const drawHeader = (headerY) => {
    doc.setFillColor(...COLORS.secondary);
    doc.rect(x, headerY, width, headerHeight, "F");

    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.45);
    doc.rect(x, headerY, width, headerHeight);

    const headers = ["Design / Code", "Width", "RRP", "Adjusted"];
    const widths = [designWidth, widthWidth, rrpWidth, priceWidth];

    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize - 0.5);

    headers.forEach((header, index) => {
      doc.text(header, columnXs[index] + 5, headerY + headerHeight * 0.67, {
        maxWidth: widths[index] - 10,
      });
    });

    doc.setDrawColor(...COLORS.line);
    doc.line(columnXs[1], headerY, columnXs[1], headerY + headerHeight);
    doc.line(columnXs[2], headerY, columnXs[2], headerY + headerHeight);
    doc.line(columnXs[3], headerY, columnXs[3], headerY + headerHeight);
  };

  const drawRow = (item, rowY) => {
    doc.setFillColor(...COLORS.white);
    doc.rect(x, rowY, width, rowHeight, "F");

    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.35);
    doc.rect(x, rowY, width, rowHeight);
    doc.line(columnXs[1], rowY, columnXs[1], rowY + rowHeight);
    doc.line(columnXs[2], rowY, columnXs[2], rowY + rowHeight);
    doc.line(columnXs[3], rowY, columnXs[3], rowY + rowHeight);

    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);

    const designText = safeText(item.design_code || item.description || "—");
    const widthText = safeText(item.width || "—");
    const rrpText = formatPrice(item.rrp);
    const adjustedText = formatPrice(adjustedPrice(item.rrp, markupPercent));

    doc.text(designText, columnXs[0] + 5, rowY + rowHeight * 0.66, {
      maxWidth: designWidth - 10,
    });
    doc.text(widthText, columnXs[1] + 5, rowY + rowHeight * 0.66, {
      maxWidth: widthWidth - 10,
    });
    doc.text(rrpText, columnXs[2] + rrpWidth - 5, rowY + rowHeight * 0.66, {
      align: "right",
      maxWidth: rrpWidth - 10,
    });

    doc.setTextColor(...COLORS.primary);
    doc.setFont("helvetica", "bold");
    doc.text(
      adjustedText,
      columnXs[3] + priceWidth - 5,
      rowY + rowHeight * 0.66,
      {
        align: "right",
        maxWidth: priceWidth - 10,
      }
    );
  };

  let cursorY = y;
  let currentPageBottom = pageBottom;

  drawTitle(cursorY);
  cursorY += titleHeight;
  drawHeader(cursorY);
  cursorY += headerHeight;

  group.items.forEach((item, index) => {
    if (cursorY + rowHeight > currentPageBottom) {
      doc.addPage("a4", "landscape");
      cursorY = PAGE_MARGIN;
      currentPageBottom = doc.internal.pageSize.getHeight() - PAGE_MARGIN;
      drawTitle(cursorY);
      cursorY += titleHeight;
      drawHeader(cursorY);
      cursorY += headerHeight;
    }

    drawRow(item, cursorY);
    cursorY += rowHeight;

    if (index === group.items.length - 1) {
      cursorY += 2;
    }
  });

  return cursorY;
};

export function generatePricelistPdf({
  brands = [],
  catalogues = [],
  items = [],
  selectedCatalogueIds = [],
  markupPercent = 0,
  filename = "Themes-Pricelist.pdf",
}) {
  const groups = groupPricelistData({
    brands,
    catalogues,
    items,
    selectedCatalogueIds,
  });

  if (groups.length === 0) {
    throw new Error("Select at least one catalogue with price rows before generating the PDF.");
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const contentHeight = pageHeight - PAGE_MARGIN * 2;
  const gap = 10;

  const columns = 3;
  const tableWidth = (contentWidth - gap * (columns - 1)) / columns;

  const titleHeight = 21;
  const headerHeight = 18;
  const rowHeight = 17;
  const fontSize = 7.6;

  const columnY = Array(columns).fill(PAGE_MARGIN);
  let pageBottom = pageHeight - PAGE_MARGIN;

  groups.forEach((group) => {
    const estimatedHeight = estimateTableHeight(
      group,
      rowHeight,
      titleHeight,
      headerHeight
    );

    let bestColumn = 0;
    for (let index = 1; index < columns; index += 1) {
      if (columnY[index] < columnY[bestColumn]) {
        bestColumn = index;
      }
    }

    if (
      estimatedHeight <= contentHeight &&
      columnY[bestColumn] + estimatedHeight > pageBottom
    ) {
      const allColumnsBlocked = columnY.every(
        (currentY) => currentY + estimatedHeight > pageBottom
      );

      if (allColumnsBlocked) {
        doc.addPage("a4", "landscape");
        columnY.fill(PAGE_MARGIN);
        pageBottom = doc.internal.pageSize.getHeight() - PAGE_MARGIN;
        bestColumn = 0;
      } else {
        for (let index = 0; index < columns; index += 1) {
          if (columnY[index] + estimatedHeight <= pageBottom) {
            bestColumn = index;
            break;
          }
        }
      }
    }

    const x = PAGE_MARGIN + bestColumn * (tableWidth + gap);
    const y = columnY[bestColumn];

    const finalY = drawTable({
      doc,
      group,
      x,
      y,
      width: tableWidth,
      markupPercent,
      pageBottom,
      rowHeight,
      titleHeight,
      headerHeight,
      fontSize,
    });

    columnY[bestColumn] = finalY + gap;
  });

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      `Themes Furnishings & Decor · Markup ${Number(markupPercent || 0)}%`,
      PAGE_MARGIN,
      pageHeight - 12
    );
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      pageHeight - 12,
      { align: "right" }
    );
  }

  const blob = doc.output("blob");

  return {
    blob,
    filename,
  };
}