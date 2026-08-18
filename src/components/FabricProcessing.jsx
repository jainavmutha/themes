import React, {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  Download,
  Plus,
  Trash2,
} from "lucide-react";

import {
  saveGlobalFabricProcessing,
  saveRemoteFabricProcessing,
} from "../services/appStateStorage.js";

import {
  Box,
  Field,
} from "./ui.jsx";

/* =========================
   Fabric Processing Tab
   ========================= */
function normalizeGroupPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getFabricGroupKey(item) {
  const fabricName = normalizeGroupPart(
    item.fabricName || item.materialName || item.quotedFabricName
  );
  const supplier = normalizeGroupPart(item.supplier);
  return `${fabricName}__${supplier}`;
}

function sumGroupQty(items) {
  return items.reduce(
    (sum, item) => sum + Number(item.metersToOrder || item.qty || 0),
    0
  );
}

function firstAvailable(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "") ?? "";
}

function formatDimension(value, unit) {
  if (value === undefined || value === null || value === "") return "";
  return `${value} ${unit || "in"}`;
}

function getItemWidth(item) {
  return firstAvailable(
    item.roomWidth,
    item.width,
    item.widthFt,
    item.windowWidth,
    item.openingWidth,
    formatDimension(item.widthInch, item.widthUnit),
    formatDimension(item.fabricWidthInch, item.fabricWidthUnit)
  );
}

function getItemLength(item) {
  return firstAvailable(
    item.roomLength,
    item.roomHeight,
    item.length,
    item.height,
    item.lengthFt,
    item.heightFt,
    item.windowLength,
    item.windowHeight,
    item.openingLength,
    item.openingHeight,
    formatDimension(item.lengthInch, item.lengthUnit),
    formatDimension(item.heightInch, item.heightUnit)
  );
}

function getItemStitching(item) {
  return firstAvailable(
    item.stitchingType,
    item.stitchingLabel,
    item.stitching?.label,
    typeof item.stitching === "string" ? item.stitching : ""
  );
}

function getItemQuotedFabric(item) {
  return firstAvailable(
    item.quotedFabricName,
    item.fabricLabel,
    item.materialName,
    item.fabricName
  );
}

function getItemQuotedRate(item) {
  return firstAvailable(
    item.quotedFabricRate,
    item.ratePerMeter,
    item.materialPrice,
    item.rate
  );
}

function getItemPanna(item) {
  return firstAvailable(
    item.clothWidthInch,
    item.panna,
    item.fabricPanna,
    item.fabricWidth
  );
}

function getQuoteRecord(allQuotes, quoteNo) {
  if (!quoteNo || !allQuotes) return null;
  return allQuotes[quoteNo] || null;
}

function getSourceIds(item) {
  const rawId = String(item?.id || "");
  const prefix = item?.quoteNo ? `${item.quoteNo}__` : "";
  const sourceId = prefix && rawId.startsWith(prefix)
    ? rawId.slice(prefix.length)
    : rawId;

  const parts = sourceId.split("__");

  return {
    roomId: parts[0] || "",
    fabricId: parts[1] || "",
  };
}

function getSavedQuoteFabric(item, allQuotes) {
  const rec = getQuoteRecord(allQuotes, item?.quoteNo);
  if (!rec) return { room: null, fabric: null };

  const { roomId, fabricId } = getSourceIds(item);
  const rooms = Array.isArray(rec.rooms) ? rec.rooms : [];

  let room = rooms.find(r => String(r.id || "") === roomId) || null;
  let fabric = room?.fabrics?.find(f => String(f.id || "") === fabricId) || null;

  if (!fabric && fabricId) {
    for (const candidateRoom of rooms) {
      const found = (candidateRoom.fabrics || []).find(
        f => String(f.id || "") === fabricId
      );

      if (found) {
        room = candidateRoom;
        fabric = found;
        break;
      }
    }
  }

  return { room, fabric };
}

function getResolvedItemDetails(item, allQuotes) {
  const { room, fabric } = getSavedQuoteFabric(item, allQuotes);

  return {
    roomName: firstAvailable(
      item.roomName,
      room?.name
    ),

    width: firstAvailable(
      getItemWidth(item),
      formatDimension(fabric?.widthInch, fabric?.widthUnit)
    ),

    length: firstAvailable(
      getItemLength(item),
      formatDimension(fabric?.lengthInch, fabric?.lengthUnit)
    ),

    quotedFabric: firstAvailable(
      getItemQuotedFabric(item),
      fabric?.materialName,
      fabric?.label
    ),

    stitching: firstAvailable(
      getItemStitching(item),
      fabric?.stitching?.label,
      fabric?.stitchingLabel,
      fabric?.stitchingType
    ),

    quotedRate: firstAvailable(
      getItemQuotedRate(item),
      fabric?.materialPrice,
      fabric?.mattressPrice,
      fabric?.wallpaperRollPrice
    ),

    panna: getItemPanna(item),
  };
}

function FabricProcessingTab({
  globalFabricItems,
  onUpdateGlobalItems,
  onClearAll,
  allQuotes,
}) {
  const items = globalFabricItems;
  const setItems = onUpdateGlobalItems;
  const [manualFabric, setManualFabric] = useState({ roomName: "", fabricName: "", supplier: "", metersToOrder: "", unit: "m", receivedDate: "", supplierBillNo: "" });
  const [showManualFabricForm, setShowManualFabricForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState({});
  const groupedFabrics = useMemo(() => {
    const groups = {};

    items.forEach(item => {
      const key = getFabricGroupKey(item);
      if (!groups[key]) {
        groups[key] = {
          key,
          fabricName:
            item.fabricName ||
            item.materialName ||
            item.quotedFabricName ||
            "Unnamed Fabric",
          supplier: item.supplier || "",
          unit: item.unit || "m",
          items: [],
        };
      }
      groups[key].items.push(item);
    });

    return Object.values(groups).map(group => {
      const first = group.items[0] || {};
      return {
        ...group,
        totalQty: sumGroupQty(group.items),
        ordered: group.items.every(item => !!item.ordered),
        received: group.items.every(item => !!item.received),
        orderedDate: first.orderedDate || "",
        receivedDate: first.receivedDate || "",
        supplierBillNo: first.supplierBillNo || "",
      };
    });
  }, [items]);

  const suppliers = useMemo(
    () => Array.from(new Set(groupedFabrics.map(group => group.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [groupedFabrics]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();

    return groupedFabrics.filter(group => {
      if (statusFilter === "not-ordered" && group.ordered) return false;
      if (statusFilter === "ordered" && !group.ordered) return false;
      if (statusFilter === "pending-receipt" && (!group.ordered || group.received)) return false;
      if (statusFilter === "received" && !group.received) return false;
      if (supplierFilter !== "all" && group.supplier !== supplierFilter) return false;

      if (!q) return true;

      const haystack = [
        group.fabricName,
        group.supplier,
        ...group.items.flatMap(item => {
          const details = getResolvedItemDetails(item, allQuotes);

          return [
            item.quoteNo,
            item.customerName,
            details.roomName,
            details.quotedFabric,
            details.stitching,
            details.width,
            details.length,
          ];
        }),
      ].join(" ").toLowerCase();

      return haystack.includes(q);
    });
  }, [groupedFabrics, search, statusFilter, supplierFilter, allQuotes]);

  const orderedCount = groupedFabrics.filter(group => group.ordered).length;
  const receivedCount = groupedFabrics.filter(group => group.received).length;
  const total = groupedFabrics.length;

  const updateGroup = useCallback((groupKey, patch) => {
    setItems(prev => prev.map(item => getFabricGroupKey(item) === groupKey ? { ...item, ...patch } : item));
  }, [setItems]);

  const toggleGroup = useCallback((groupKey, field) => {
    setItems(prev => {
      const groupItems = prev.filter(item => getFabricGroupKey(item) === groupKey);
      const currentValue = groupItems.length > 0 && groupItems.every(item => !!item[field]);
      const nextValue = !currentValue;

      return prev.map(item => {
        if (getFabricGroupKey(item) !== groupKey) return item;
        const updated = { ...item, [field]: nextValue };
        if (field === "received" && nextValue) updated.ordered = true;
        if (field === "ordered" && !nextValue) updated.received = false;
        return updated;
      });
    });
  }, [setItems]);
  const markAllOrdered = () => setItems(prev => prev.map(i => ({ ...i, ordered: true })));
  const markAllReceived = () => setItems(prev => prev.map(i => ({ ...i, ordered: true, received: true })));
  const resetAll = () => setItems(prev => prev.map(i => ({ ...i, ordered: false, received: false })));
  const toggleExpanded = key => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));
  const saveFabricProcessingOnlineNow = useCallback(async () => { try { saveGlobalFabricProcessing(items); await saveRemoteFabricProcessing(items); alert(`Fabric Processing saved online — ${items.length} item${items.length !== 1 ? "s" : ""}`); } catch (err) { alert(err?.message ? `Online save failed: ${err.message}` : "Online save failed."); } }, [items]);
  const addManualFabric = useCallback(() => {
    const fabricName = String(manualFabric.fabricName || "").trim();
    if (!fabricName && !manualFabric.supplier && !manualFabric.metersToOrder) return;
    const newItem = { id: `manual-${crypto.randomUUID()}`, quoteNo: "Manual", customerName: "Manual Entry", roomName: manualFabric.roomName || "Manual", fabricName: fabricName || "Manual Fabric", materialName: fabricName || "Manual Fabric", supplier: manualFabric.supplier, metersToOrder: manualFabric.metersToOrder, unit: manualFabric.unit || "m", ordered: false, received: false, receivedDate: manualFabric.receivedDate || "", supplierBillNo: manualFabric.supplierBillNo || "", isManual: true, createdAt: new Date().toISOString() };
    setItems(prev => [newItem, ...prev]);
    setManualFabric({ roomName: "", fabricName: "", supplier: "", metersToOrder: "", unit: "m", receivedDate: "", supplierBillNo: "" });
    setShowManualFabricForm(false);
  }, [manualFabric, setItems]);
  const downloadFabricProcessingExcel = useCallback(() => {
    const rows = (items || []).map(item => ({ "Quote No": item.quoteNo || "", "Customer": item.customerName || "", "Room": item.roomName || "", "Material Name": item.fabricName || item.materialName || "", "Supplier": item.supplier || "", "Qty": item.metersToOrder || item.qty || "", "Unit": item.unit || "", "Ordered": item.ordered ? "Yes" : "No", "Received": item.received ? "Yes" : "No", "Received Date": item.receivedDate || "", "Supplier Bill No.": item.supplierBillNo || "", "Entry Type": item.isManual ? "Manual" : "Quote" }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const tableRows = rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8" /><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;}th{background:#B70766;color:#ffffff;font-weight:bold;border:1px solid #d8d8d8;padding:8px;text-align:left;}td{border:1px solid #d8d8d8;padding:8px;}tr:nth-child(even) td{background:#F5EBDD;}</style></head><body><table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `fabric-processing-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  }, [items]);

  const manualFabricForm = (
    <Box title="Fabric Processing Actions">
      {!showManualFabricForm ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" type="button" onClick={() => setShowManualFabricForm(true)}><Plus size={15} /> Add Fabric</button></div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "var(--primary-dark)" }}>Add Fabric Manually</div>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setShowManualFabricForm(false)}>Cancel</button>
          </div>
          <div className="grid-3">
            <Field label="Room / Area"><input className="input" value={manualFabric.roomName} onChange={e => setManualFabric(prev => ({ ...prev, roomName: e.target.value }))} placeholder="e.g. Living Room" /></Field>
            <Field label="Material Name"><input className="input" value={manualFabric.fabricName} onChange={e => setManualFabric(prev => ({ ...prev, fabricName: e.target.value }))} placeholder="e.g. Blue Jacquard" /></Field>
            <Field label="Supplier"><input className="input" value={manualFabric.supplier} onChange={e => setManualFabric(prev => ({ ...prev, supplier: e.target.value }))} placeholder="Supplier name" /></Field>
            <Field label="Qty"><input className="input" value={manualFabric.metersToOrder} onChange={e => setManualFabric(prev => ({ ...prev, metersToOrder: e.target.value }))} placeholder="e.g. 12.5" inputMode="decimal" /></Field>
            <Field label="Unit"><select className="select" value={manualFabric.unit} onChange={e => setManualFabric(prev => ({ ...prev, unit: e.target.value }))}><option value="m">m</option><option value="rolls">rolls</option><option value="sq ft">sq ft</option><option value="pcs">pcs</option></select></Field>
            <Field label="Received Date"><input className="input" type="date" value={manualFabric.receivedDate} onChange={e => setManualFabric(prev => ({ ...prev, receivedDate: e.target.value }))} /></Field>
            <Field label="Supplier Bill No."><input className="input" value={manualFabric.supplierBillNo} onChange={e => setManualFabric(prev => ({ ...prev, supplierBillNo: e.target.value }))} placeholder="Bill no." /></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={addManualFabric}><Plus size={15} /> Add Fabric</button></div>
        </>
      )}
    </Box>
  );

  if (!items.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {manualFabricForm}
        <Box title="Fabric Processing — Global">
          <div className="empty-box" style={{ padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary-dark)', marginBottom: 8 }}>No fabrics in processing yet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Go to an approved quote → <strong>Order Processing</strong> → fill in fabric details → click <strong>"Process Order → Fabric Processing"</strong> to populate this list, or add a fabric manually above.</div>
          </div>
        </Box>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {manualFabricForm}
      <div className="fp-kpi-grid">
        {[{ label: 'Fabric Groups', value: total, color: 'var(--primary)' }, { label: 'Not Ordered', value: total - orderedCount, color: '#D97706' }, { label: 'Ordered', value: `${orderedCount} / ${total}`, color: '#1D4ED8' }, { label: 'Received', value: `${receivedCount} / ${total}`, color: '#059669' }].map(k => (
          <div key={k.label} className="fp-kpi"><div className="fp-kpi-label">{k.label}</div><div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div></div>
        ))}
      </div>
      <div className="fp-progress-card">
        {[{ label: 'Ordered', count: orderedCount, color: '#3B82F6' }, { label: 'Received', count: receivedCount, color: '#059669' }].map(bar => (
          <div key={bar.label} className="fp-progress-row">
            <div className="fp-progress-meta"><span>{bar.label}</span><span>{total > 0 ? Math.round((bar.count / total) * 100) : 0}%</span></div>
            <div className="fp-progress-bar-bg"><div className="fp-progress-bar-fill" style={{ width: `${total > 0 ? (bar.count / total) * 100 : 0}%`, background: bar.color }} /></div>
          </div>
        ))}
      </div>
      <Box title="Filters & Search">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <Field label="Search">
            <input
              className="input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Fabric, supplier, customer, quote or room..."
            />
          </Field>

          <Field label="Status">
            <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="not-ordered">Not Ordered</option>
              <option value="ordered">Ordered</option>
              <option value="pending-receipt">Pending Receipt</option>
              <option value="received">Received</option>
            </select>
          </Field>

          <Field label="Supplier">
            <select className="select" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
              <option value="all">All Suppliers</option>
              {suppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </Field>
        </div>
      </Box>
      <div className="fp-bulk-actions">
        <button className="btn btn-outline btn-sm" onClick={markAllOrdered}>✓ Mark All Ordered</button>
        <button className="btn btn-outline btn-sm" style={{ borderColor: '#059669', color: '#059669' }} onClick={markAllReceived}>✓ Mark All Received</button>
        <button className="btn btn-outline btn-sm" style={{ borderColor: '#9CA3AF', color: '#6B7280' }} onClick={resetAll}>↺ Reset Checkboxes</button>
        <button className="btn btn-outline btn-sm" type="button" onClick={downloadFabricProcessingExcel}><Download size={13} /> Download Excel</button>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveFabricProcessingOnlineNow}>Save Online</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { if (window.confirm('Clear ALL fabric processing items? This cannot be undone.')) onClearAll(); }}><Trash2 size={13} /> Clear All</button>
      </div>
      <Box title={`Fabric Procurement — ${filteredGroups.length} of ${groupedFabrics.length} groups`}>
        <div style={{ overflowX: 'auto' }}>
          <table className="fp-checklist-table">
            <thead>
              <tr>
                <th>Fabric / Selection</th>
                <th>Supplier</th>
                <th className="center">Total Qty</th>
                <th className="center">Ordered</th>
                <th>Ordered Date</th>
                <th className="center">Received</th>
                <th>Received Date</th>
                <th>Supplier Bill No.</th>
                <th className="center">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((group, idx) => {
                let rowBg = idx % 2 === 0 ? 'white' : '#FAFAFA';
                if (group.received) rowBg = '#F0FDF4';
                else if (group.ordered) rowBg = '#EFF6FF';

                return (
                  <React.Fragment key={group.key}>
                    <tr>
                      <td style={{ background: rowBg, fontWeight: 800 }}>
                        {group.fabricName}
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                          {group.items.length} customer/room line{group.items.length !== 1 ? 's' : ''}
                        </div>
                      </td>
                      <td style={{ background: rowBg, fontWeight: group.supplier ? 700 : 600, color: group.supplier ? 'var(--text)' : '#EF4444' }}>
                        {group.supplier || 'Supplier not set'}
                      </td>
                      <td style={{ background: rowBg, textAlign: 'center', fontWeight: 900, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        {Number(group.totalQty || 0).toFixed(2)} {group.unit}
                      </td>
                      <td style={{ background: rowBg, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={group.ordered}
                          onChange={() => toggleGroup(group.key, 'ordered')}
                          style={{ width: 18, height: 18, accentColor: '#3B82F6', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ background: rowBg }}>
                        <input
                          className="input"
                          type="date"
                          value={group.orderedDate || ''}
                          onChange={e => updateGroup(group.key, { orderedDate: e.target.value })}
                          style={{ minWidth: 135 }}
                        />
                      </td>
                      <td style={{ background: rowBg, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={group.received}
                          onChange={() => toggleGroup(group.key, 'received')}
                          style={{ width: 18, height: 18, accentColor: '#059669', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ background: rowBg }}>
                        <input
                          className="input"
                          type="date"
                          value={group.receivedDate || ''}
                          onChange={e => updateGroup(group.key, { receivedDate: e.target.value })}
                          style={{ minWidth: 135 }}
                        />
                      </td>
                      <td style={{ background: rowBg }}>
                        <input
                          className="input"
                          value={group.supplierBillNo || ''}
                          onChange={e => updateGroup(group.key, { supplierBillNo: e.target.value })}
                          placeholder="Bill no."
                          style={{ minWidth: 135 }}
                        />
                      </td>
                      <td style={{ background: rowBg, textAlign: 'center' }}>
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => toggleExpanded(group.key)}>
                          {expandedGroups[group.key] ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>

                    {expandedGroups[group.key] && (
                      <tr>
                        <td colSpan={9} style={{ background: '#F8FAFC', padding: 12 }}>
                          <div style={{ fontWeight: 900, marginBottom: 8, color: 'var(--primary-dark)' }}>
                            Customer & Room Breakdown
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table className="fp-checklist-table" style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th>Quote</th>
                                  <th>Customer</th>
                                  <th>Room</th>
                                  <th>Width</th>
                                  <th>Length</th>
                                  <th>Quoted Fabric</th>
                                  <th>Stitching</th>
                                  <th>Quoted Rate</th>
                                  <th>Panna</th>
                                  <th className="center">Meters / Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map(item => {
                                  const details = getResolvedItemDetails(item, allQuotes);

                                  return (
                                    <tr key={item.id}>
                                      <td>{item.quoteNo || '—'}</td>
                                      <td style={{ fontWeight: 700 }}>{item.customerName || '—'}</td>
                                      <td>{details.roomName || '—'}</td>
                                      <td>{details.width || '—'}</td>
                                      <td>{details.length || '—'}</td>
                                      <td>{details.quotedFabric || '—'}</td>
                                      <td>{details.stitching || '—'}</td>
                                      <td>{details.quotedRate || '—'}</td>
                                      <td>{details.panna ? `${details.panna}"` : '—'}</td>
                                      <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>
                                        {item.metersToOrder || item.qty || '—'} {item.unit || ''}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!filteredGroups.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                    No fabric groups match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Box>
      <div className="fp-legend" style={{ padding: '0 4px' }}>
        <span className="fp-legend-item"><span className="fp-legend-swatch" style={{ background: '#EFF6FF', borderColor: '#BFDBFE' }} /> Ordered</span>
        <span className="fp-legend-item"><span className="fp-legend-swatch" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }} /> Received</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Rows are grouped by Fabric Name + Supplier. Checking “Received” also marks the whole group as Ordered.</span>
      </div>
    </div>
  );
}
export default FabricProcessingTab;