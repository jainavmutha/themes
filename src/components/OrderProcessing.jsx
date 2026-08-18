import React, { useEffect, useMemo, useState } from "react";
import { FileText, Package, Plus } from "lucide-react";

import {
  computeFabricCost,
} from "../calculations/curtainCalculations.js";

import {
  currency,
  toNum,
} from "../utils/formatting.js";

import {
  Box,
  Field,
  StatusBadge,
  UnitInput,
} from "./ui.jsx";
/* =========================
   Order Processing Tab
   ========================= */
function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && value !== "") ?? "";
}

function formatFabricDimension(value, unit) {
  if (value === undefined || value === null || value === '') return '';
  return `${value} ${unit || 'in'}`;
}

function getRoomWidth(room) {
  return firstValue(
    room?.width,
    room?.widthFt,
    room?.windowWidth,
    room?.windowWidthFt,
    room?.openingWidth,
    room?.roomWidth,
    room?.dimensions?.width,
    room?.measurements?.width,
    room?.size?.width
  );
}

function getRoomLength(room) {
  return firstValue(
    room?.length,
    room?.lengthFt,
    room?.windowLength,
    room?.windowLengthFt,
    room?.openingLength,
    room?.roomLength,
    room?.height,
    room?.heightFt,
    room?.windowHeight,
    room?.windowHeightFt,
    room?.openingHeight,
    room?.dimensions?.length,
    room?.dimensions?.height,
    room?.measurements?.length,
    room?.measurements?.height,
    room?.size?.length,
    room?.size?.height
  );
}

function getStitchingLabel(fabric) {
  return firstValue(
    fabric?.stitching?.label,
    fabric?.stitchingLabel,
    fabric?.stitchingType,
    fabric?.stitching
  );
}

function OrderProcessingTab({ rooms, quoteMeta, quoteNo, currentQuoteStatus, allQuotes, onSaveOrderData, onProcessToFabricProcessing }) {
  const savedRecord = allQuotes?.[quoteNo];
  const isApproved = currentQuoteStatus === 'Approved' || savedRecord?.status === 'Approved';
  const defaultOrderItems = useMemo(() => {
    const items = [];
    rooms.filter(r => r.include !== false).forEach(room => {
      (room.fabrics || []).forEach(fab => {
        const fc = computeFabricCost(room, fab);
        let typeLabel = 'Curtain';
        if (fab.isWallpaper) typeLabel = 'Wallpaper';
        else if (fab.blindType) typeLabel = fab.blindType.charAt(0).toUpperCase() + fab.blindType.slice(1) + ' Blind';
        else if (fab.isRomanBlind) typeLabel = 'Roman Blind';
        let defaultQty = '';
        if (fab.isWallpaper) defaultQty = String(fc.rollQty || '');
        else if (fab.blindType) defaultQty = String(Number(fc.blindSqFt || 0).toFixed(2));
        else defaultQty = String(fc.metersOfCloth.toFixed(2));
        items.push({
          id: `${room.id}__${fab.id}`,
          fabricLabel: fab.label || '',
          roomName: room.name || 'Room',

          roomWidth:
            formatFabricDimension(fab.widthInch, fab.widthUnit) ||
            String(getRoomWidth(room) || ''),
          roomLength:
            formatFabricDimension(fab.lengthInch, fab.lengthUnit) ||
            String(getRoomLength(room) || ''),
          quotedFabricName: fab.materialName || '',
          stitchingType: getStitchingLabel(fab) || '',
          quotedFabricRate: String(fab.materialPrice || ''),

          fabricName: '',
          supplier: '',
          metersToOrder: '',
          panels: String(Math.round(fc.panels) || ''),
          clothWidthInch: '',
          ratePerMeter: String(fab.materialPrice || ''),
          type: typeLabel,
          unit: fab.isWallpaper ? 'rolls' : fab.blindType ? 'sq ft' : 'm',
          notes: '',
        });
      });
    });
    return items;
  }, [rooms]);
  const [orderItems, setOrderItems] = useState(() => {
    const saved = savedRecord?.orderProcessing?.items;
    if (saved && saved.length) {
      const savedMap = Object.fromEntries(saved.map(i => [i.id, i]));

      return defaultOrderItems.map(di => {
        const savedItem = savedMap[di.id];
        if (!savedItem) return di;

        return {
          ...savedItem,
          ...di,

          fabricName: savedItem.fabricName || '',
          supplier: savedItem.supplier || '',
          metersToOrder: savedItem.metersToOrder || '',
          clothWidthInch: savedItem.clothWidthInch || '',
          notes: savedItem.notes || '',
        };
      });
    }
    return defaultOrderItems;
  });
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  useEffect(() => {
    setOrderItems(prev => {
      const prevMap = Object.fromEntries(prev.map(i => [i.id, i]));

      return defaultOrderItems.map(di => {
        const previous = prevMap[di.id];
        if (!previous) return di;

        return {
          ...previous,
          ...di,

          fabricName: previous.fabricName || '',
          supplier: previous.supplier || '',
          metersToOrder: previous.metersToOrder || '',
          clothWidthInch: previous.clothWidthInch || '',
          notes: previous.notes || '',
        };
      });
    });
  }, [defaultOrderItems]);
  const updateItem = (id, patch) => setOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  const addItem = () => setOrderItems(prev => [...prev, {
    id: crypto.randomUUID(),
    fabricLabel: 'Extra',
    roomName: '',
    roomWidth: '',
    roomLength: '',
    quotedFabricName: '',
    stitchingType: '',
    quotedFabricRate: '',
    fabricName: '',
    supplier: '',
    metersToOrder: '',
    panels: '',
    clothWidthInch: '',
    ratePerMeter: '',
    type: 'Curtain',
    unit: 'm',
    notes: '',
  }]);
  const removeItem = (id) => setOrderItems(prev => prev.filter(i => i.id !== id));
  const handleSave = () => { onSaveOrderData({ items: orderItems }); setSavedSuccessfully(true); };
  const handleProcessOrder = () => { onProcessToFabricProcessing(orderItems, quoteNo, quoteMeta.customerName || ''); };
  const totalOrderValue = orderItems.reduce(
    (sum, item) =>
      sum +
      toNum(item.metersToOrder) *
        toNum(item.quotedFabricRate || item.ratePerMeter),
    0
  );
  if (!isApproved) {
    return (
      <div className="box"><div className="box-header"><h3><Package size={15} style={{ marginRight: 4 }} /> Order Processing</h3></div>
        <div className="box-body"><div className="op-not-approved">
          <div className="op-not-approved-icon">🔒</div>
          <div className="op-not-approved-title">Quote Not Yet Approved</div>
          <div className="op-not-approved-sub">Order Processing is available only after a quote is <strong>Approved</strong>.<br /><br />Go to <strong>Saved Quotes</strong> and change the status of quote <strong>{quoteNo || '—'}</strong> to <strong>Approved</strong>, then return here.</div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}><StatusBadge status={currentQuoteStatus || savedRecord?.status || 'Draft'} /></div>
        </div></div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="op-banner"><div className="op-banner-icon">✅</div><div className="op-banner-text"><div className="op-banner-title">Quote Approved — Processing Order</div><div className="op-banner-sub">{quoteNo} · {quoteMeta.customerName || 'Customer'} · {quoteMeta.projectTitle || ''}</div></div></div>
      <Box title="Fabric & Material Orders">
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', marginBottom: 16 }}>
          Room width and length, quoted fabric/type, stitching and quoted fabric rate are pulled automatically from the approved quotation. Fill only the <strong>Selection / Fabric Name, Panna / Fabric Width, Meter / Quantity and Supplier</strong>, then save and send the order to Fabric Processing.
        </div>
        <div className="op-order-items">
          {orderItems.map((item, idx) => (
            <div key={item.id} className="op-item-card">
              <div className="op-item-header">
                <span className="op-item-badge">{item.fabricLabel || `Item ${idx + 1}`}</span>
                <span className="op-item-room" style={{ marginLeft: 4 }}>{item.roomName || ''}</span>
                <span style={{ marginLeft: 8, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>{item.type}</span>
                {toNum(item.metersToOrder) > 0 && toNum(item.quotedFabricRate || item.ratePerMeter) > 0 && (
                  <span className="op-item-cost">
                    Est. {currency(toNum(item.metersToOrder) * toNum(item.quotedFabricRate || item.ratePerMeter))}
                  </span>
                )}
                <button className="btn-remove-fabric" onClick={() => removeItem(item.id)} title="Remove item" style={{ marginLeft: 'auto' }}>×</button>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: 8,
                padding: '10px 12px',
                marginBottom: 12,
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                fontSize: 12,
              }}>
                <div><span style={{ color: 'var(--muted)' }}>Room:</span> <strong>{item.roomName || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Width:</span> <strong>{item.roomWidth || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Length:</span> <strong>{item.roomLength || item.roomHeight || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Quoted Fabric:</span> <strong>{item.quotedFabricName || item.fabricLabel || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Type:</span> <strong>{item.type || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Stitching:</span> <strong>{item.stitchingType || '—'}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Quoted Rate:</span> <strong>{item.quotedFabricRate ? currency(toNum(item.quotedFabricRate)) : '—'}</strong></div>
              </div>
              <div className="op-item-grid">
                <Field label="Selection / Fabric Name">
                  <input
                    className="input"
                    value={item.fabricName || ''}
                    onChange={e => updateItem(item.id, { fabricName: e.target.value })}
                    placeholder="e.g. Velvet Maroon / Selection 245"
                  />
                </Field>

                <Field label="Supplier Name">
                  <input
                    className="input"
                    value={item.supplier || ''}
                    onChange={e => updateItem(item.id, { supplier: e.target.value })}
                    placeholder="e.g. Arvind Mills"
                  />
                </Field>

                <Field label={item.unit === 'm' ? 'Meter to Order' : `Qty to Order (${item.unit})`}>
                  <UnitInput
                    unit={item.unit}
                    value={item.metersToOrder || ''}
                    onChange={e => updateItem(item.id, { metersToOrder: e.target.value })}
                    inputMode="decimal"
                    placeholder={item.unit === 'm' ? 'e.g. 12' : item.unit === 'rolls' ? 'e.g. 3' : 'e.g. 15'}
                  />
                </Field>

                {item.unit === 'm' && (
                  <Field label="Panna / Fabric Width" hint="inches">
                    <UnitInput
                      unit="in"
                      value={item.clothWidthInch || ''}
                      onChange={e => updateItem(item.id, { clothWidthInch: e.target.value })}
                      inputMode="decimal"
                      placeholder='e.g. 54"'
                    />
                  </Field>
                )}
              </div>
              <div className="op-item-notes"><input className="input" value={item.notes || ''} onChange={e => updateItem(item.id, { notes: e.target.value })} placeholder="Notes / special instructions for this fabric..." style={{ fontSize: 12 }} /></div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={addItem}><Plus size={13} /> Add Item</button>
          {totalOrderValue > 0 && <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--primary)' }}>Total Purchase Value: {currency(totalOrderValue)}</div>}
        </div>
        {orderItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--primary)', borderBottom: '2px solid var(--border)', paddingBottom: 6, marginBottom: 10 }}>Order Summary</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="op-summary-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Width</th>
                    <th>Length</th>
                    <th>Quoted Fabric</th>
                    <th>Stitching</th>
                    <th>Selection</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Panna</th>
                    <th style={{ textAlign: 'right' }}>Meter / Qty</th>
                    <th style={{ textAlign: 'right' }}>Quoted Rate</th>
                    <th style={{ textAlign: 'right' }}>Est. Value</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700, fontSize: 12 }}>{item.roomName || '—'}</td>
                      <td>{item.roomWidth || '—'}</td>
                      <td>{item.roomLength || item.roomHeight || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{item.quotedFabricName || item.fabricLabel || '—'}</td>
                      <td>{item.stitchingType || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{item.fabricName || '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{item.supplier || <span style={{ color: '#EF4444', fontWeight: 700 }}>Not set</span>}</td>
                      <td style={{ textAlign: 'right' }}>{item.clothWidthInch ? `${item.clothWidthInch}"` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.metersToOrder || '—'} {item.unit}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.quotedFabricRate || item.ratePerMeter ? currency(toNum(item.quotedFabricRate || item.ratePerMeter)) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                        {toNum(item.metersToOrder) > 0 && toNum(item.quotedFabricRate || item.ratePerMeter) > 0
                          ? currency(toNum(item.metersToOrder) * toNum(item.quotedFabricRate || item.ratePerMeter))
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalOrderValue > 0 && (<tfoot><tr style={{ background: '#FFF5FA' }}><td colSpan={10} style={{ fontWeight: 900, padding: '10px 12px' }}>Total Purchase Value</td><td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--primary)', fontSize: 15, padding: '10px 12px' }}>{currency(totalOrderValue)}</td></tr></tfoot>)}
              </table>
            </div>
          </div>
        )}
      </Box>
      <div className="save-bottom-bar">
        <span className="save-bottom-label">Save order data first, then process to Fabric Processing.</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleSave}><FileText size={15} /> Save Order Data</button>
          <button className="btn btn-primary" onClick={handleProcessOrder} style={{ background: '#059669', borderColor: '#059669' }}><Package size={15} /> Process Order → Fabric Processing</button>
        </div>
      </div>
      {savedSuccessfully && (<div className="process-order-cta"><div style={{ fontSize: 28 }}>🚀</div><div className="process-order-cta-text"><div className="process-order-cta-title">Order data saved! Ready to process.</div><div className="process-order-cta-sub">Click "Process Order → Fabric Processing" above to send all fabrics to the global Fabric Processing checklist.</div></div></div>)}
    </div>
  );
}
export default OrderProcessingTab;