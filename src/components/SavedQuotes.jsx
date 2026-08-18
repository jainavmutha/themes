import React from "react";
import { QUOTE_STATUSES } from "../constants/settings.js";
import { currency } from "../utils/formatting.js";
import { getQuoteFinalTotal } from "../utils/quoteHelpers.js";
import { Box } from "./ui.jsx";

function getSavedOrderItems(rec) {
  return Array.isArray(rec?.orderProcessing?.items)
    ? rec.orderProcessing.items
    : [];
}

function orderSummaryCurrency(value) {
  return `Rs.${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
}

function buildOrderSummaryHtml(rec) {
  const items = getSavedOrderItems(rec);
  const rows = items.map(item => `
    <tr>
      <td>${item.roomName || "—"}</td>
      <td>${item.roomWidth || "—"}</td>
      <td>${item.roomLength || item.roomHeight || "—"}</td>
      <td>${item.quotedFabricName || item.fabricLabel || "—"}</td>
      <td>${item.stitchingType || "—"}</td>
      <td>${item.fabricName || "—"}</td>
      <td>${item.supplier || "—"}</td>
      <td style="text-align:right">${item.clothWidthInch ? `${item.clothWidthInch}&quot;` : "—"}</td>
      <td style="text-align:right">${item.metersToOrder || "—"} ${item.unit || ""}</td>
      <td style="text-align:right">${item.quotedFabricRate || item.ratePerMeter ? orderSummaryCurrency(item.quotedFabricRate || item.ratePerMeter) : "—"}</td>
    </tr>
  `).join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Order Summary ${rec?.quoteNo || ""}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:28px;color:#2E2E2E;background:#fff}
        h1{margin:0 0 4px;color:#B70766;font-size:24px}
        .meta{margin-bottom:22px;color:#6B6B6B;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#F5EBDD;text-align:left;text-transform:uppercase;letter-spacing:.04em;color:#5f5853;padding:10px 8px;border-bottom:2px solid #d6cfc9;white-space:nowrap}
        td{padding:10px 8px;border-bottom:1px solid #d6cfc9;vertical-align:top}
        td:first-child,td:nth-child(4),td:nth-child(6){font-weight:700}
        .empty{padding:30px;text-align:center;color:#6B6B6B;border:1px solid #d6cfc9;border-radius:8px}
      </style>
    </head>
    <body>
      <h1>Order Summary</h1>
      <div class="meta"><strong>${rec?.quoteNo || ""}</strong>${rec?.customer?.name ? ` · ${rec.customer.name}` : ""}</div>
      ${items.length ? `
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Width</th>
              <th>Length</th>
              <th>Quoted Fabric</th>
              <th>Stitching</th>
              <th>Selection</th>
              <th>Supplier</th>
              <th style="text-align:right">Panna</th>
              <th style="text-align:right">Meter / Qty</th>
              <th style="text-align:right">Quoted Rate</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      ` : '<div class="empty">No saved Order Processing data for this quote.</div>'}
    </body>
  </html>`;
}

function previewOrderSummary(rec) {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    alert("Please allow pop-ups to preview the Order Summary.");
    return;
  }

  previewWindow.document.open();
  previewWindow.document.write(buildOrderSummaryHtml(rec));
  previewWindow.document.close();
}

async function downloadOrderSummary(rec) {
  const items = getSavedOrderItems(rec);
  if (!items.length) {
    alert("No saved Order Processing data is available for this quote.");
    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const rowHeight = 28;
  const headers = ["Room", "Width", "Length", "Quoted Fabric", "Stitching", "Selection", "Supplier", "Panna", "Meter / Qty", "Quoted Rate"];
  const baseWidths = [72, 58, 58, 92, 86, 92, 72, 52, 68, 70];
  const scale = usableWidth / baseWidths.reduce((sum, value) => sum + value, 0);
  const widths = baseWidths.map(value => value * scale);

  const drawHeader = y => {
    doc.setFillColor(245, 235, 221);
    doc.rect(margin, y, usableWidth, rowHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(95, 88, 83);

    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 4, y + 18, { maxWidth: widths[index] - 8 });
      x += widths[index];
    });

    doc.setDrawColor(214, 207, 201);
    doc.line(margin, y + rowHeight, margin + usableWidth, y + rowHeight);
    return y + rowHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(183, 7, 102);
  doc.text("Order Summary", margin, 36);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${rec?.quoteNo || ""}${rec?.customer?.name ? ` · ${rec.customer.name}` : ""}`, margin, 52);

  let y = drawHeader(66);

  items.forEach(item => {
    if (y + rowHeight > pageHeight - margin) {
      doc.addPage("a4", "landscape");
      y = drawHeader(margin);
    }

    const values = [
      item.roomName || "—",
      item.roomWidth || "—",
      item.roomLength || item.roomHeight || "—",
      item.quotedFabricName || item.fabricLabel || "—",
      item.stitchingType || "—",
      item.fabricName || "—",
      item.supplier || "—",
      item.clothWidthInch ? `${item.clothWidthInch}"` : "—",
      `${item.metersToOrder || "—"} ${item.unit || ""}`.trim(),
      item.quotedFabricRate || item.ratePerMeter ? orderSummaryCurrency(item.quotedFabricRate || item.ratePerMeter) : "—",
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(46, 46, 46);

    let x = margin;
    values.forEach((value, index) => {
      doc.text(String(value), x + 4, y + 18, { maxWidth: widths[index] - 8 });
      x += widths[index];
    });

    doc.setDrawColor(214, 207, 201);
    doc.line(margin, y + rowHeight, margin + usableWidth, y + rowHeight);
    y += rowHeight;
  });

  doc.save(`OrderSummary_${rec?.customer?.name || "Customer"}_${rec?.quoteNo || "Quote"}.pdf`);
}

function handleOrderSummaryAction(rec) {
  if (!getSavedOrderItems(rec).length) {
    alert("No saved Order Processing data is available for this quote.");
    return;
  }

  const choice = window.prompt(
    "Type PREVIEW to view the Order Summary, or DOWNLOAD to save it as PDF.",
    "PREVIEW"
  );

  if (!choice) return;

  const action = choice.trim().toLowerCase();
  if (action === "preview" || action === "p") {
    previewOrderSummary(rec);
  } else if (action === "download" || action === "d") {
    downloadOrderSummary(rec).catch(err => {
      console.error(err);
      alert("Could not download Order Summary PDF.");
    });
  } else {
    alert("Please type PREVIEW or DOWNLOAD.");
  }
}

export default function SavedQuotes({
  filteredQuotes,
  historySearch,
  setHistorySearch,
  historyStatusFilter,
  setHistoryStatusFilter,
  refreshQuoteList,
  handleUpdateQuoteStatus,
  loadQuoteRecord,
  handleDeleteQuote,
  quoteMeta,
  settings,
  generateFullPDF,
  generatePerformaInvoice,
}) {
  return (
    <Box title="Saved Quotes">
      <div className="history-toolbar">
              <input
                className="history-search"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search by quote no or customer..."
              />
              <select
                className="select"
                style={{ maxWidth: 180 }}
                value={historyStatusFilter}
                onChange={e => setHistoryStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                {QUOTE_STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button className="btn btn-outline btn-sm" onClick={refreshQuoteList}>
                Refresh
              </button>
            </div>

            {!filteredQuotes.length ? (
              <div className="empty-box">No saved quotes found.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Quote No</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(rec => (
                      <tr key={rec.quoteNo}>
                        <td className="history-row-no">{rec.quoteNo}</td>
                        <td className="history-row-customer">{rec.customer?.name || "—"}</td>
                        <td>
                          <select
  className={`select-xs status-select status-${String(rec.status || "Draft").toLowerCase()}`}
  value={rec.status || "Draft"}
  onChange={e => handleUpdateQuoteStatus(rec.quoteNo, e.target.value)}
>
  {QUOTE_STATUSES.map(status => (
    <option key={status} value={status}>{status}</option>
  ))}
</select>
                        </td>
                        <td className="history-row-date">
                          {rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="history-row-total" style={{ textAlign: "right" }}>
                          {currency(rec.snapshot?.summary?.finalTotal || getQuoteFinalTotal(rec))}
                        </td>
                        <td>
                          <div className="history-row-actions">
                            <button className="btn btn-outline btn-sm" onClick={() => loadQuoteRecord(rec)}>
                              Load
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={async () => {
                                try {
                                  const meta = {
                                    ...quoteMeta,
                                    quoteNo: rec.quoteNo,
                                    customerName: rec.customer?.name || "",
                                    customerPhone: rec.customer?.phone || "",
                                    projectTitle: rec.customer?.project || "",
                                    company: rec.company || quoteMeta.company,
                                    commercials: rec.commercials || quoteMeta.commercials,
                                  };
                                  const doc = await generateFullPDF(
                                    rec.rooms || [],
                                    meta,
                                    rec.settingsSnapshot || settings,
                                    rec.miscellaneousCosts || [],
                                    false
                                  );
                                  doc.save(`Quote_${rec.customer?.name || "Customer"}_${rec.quoteNo}.pdf`);
                                } catch (err) {
                                  console.error(err);
                                  alert("Could not download PDF.");
                                }
                              }}
                            >
                              PDF
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleOrderSummaryAction(rec)}
                              disabled={!getSavedOrderItems(rec).length}
                              title={getSavedOrderItems(rec).length ? "Preview or download saved Order Summary" : "No saved Order Processing data"}
                            >
                              Order Summary
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteQuote(rec.quoteNo)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </Box>
  );
}