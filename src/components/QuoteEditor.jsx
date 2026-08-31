import React from "react";
import { Package, Plus, Trash2 } from "lucide-react";

import {
  UNIT_OPTIONS,
  getUnitLabel,
  getUnitShortLabel,
} from "../constants/settings.js";

import {
  currency,
  toNum,
} from "../utils/formatting.js";

import RoomCard from "./RoomCard.jsx";

import {
  Box,
  Field,
  StatusBadge,
  UnitInput,
} from "./ui.jsx";

export default function QuoteEditor({
  loadedBanner,
  quoteMeta,
  setQuoteMeta,
  quoteNo,
  currentQuoteStatus,
  allQuotes,
  setActiveTab,
  rooms,
  cloneRoom,
  deleteRoom,
  updateRoom,
  settings,
  addRoomAfter,
  miscellaneousCosts,
  handleMiscCostChange,
  handleDeleteMiscCost,
  handleAddMiscCost,
  miscTotal,
  totalClothCost,
  totalOther,
  finalTotals,
  liveGstBreakdown,
  grandTotal,
  handleSaveQuote,
}) {
  return (
    <>
          {loadedBanner && <div className="loaded-banner">{loadedBanner}</div>}
          <Box title="Customer Details">
            <div className="grid-3">
              <div className="field-group"><label className="field-label">Customer Name</label><input className="input" value={quoteMeta.customerName} onChange={e => setQuoteMeta(o => ({ ...o, customerName: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="Customer Name" /></div>
              <div className="field-group"><label className="field-label">Phone</label><input className="input" value={quoteMeta.customerPhone} onChange={e => setQuoteMeta(o => ({ ...o, customerPhone: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="+91 98765 43210" /></div>
              <div className="field-group"><label className="field-label">Project</label><input className="input" value={quoteMeta.projectTitle} onChange={e => setQuoteMeta(o => ({ ...o, projectTitle: e.target.value }))} onFocus={e => e.currentTarget.select()} placeholder="e.g. Living Room" /></div>
            </div>
            {quoteNo && (<div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="current-quote-badge">{quoteNo}</span>
              <StatusBadge status={currentQuoteStatus || allQuotes[quoteNo]?.status || 'Draft'} />
              {(currentQuoteStatus === 'Approved' || allQuotes[quoteNo]?.status === 'Approved') && (<button className="btn btn-outline btn-sm" style={{ borderColor: '#10B981', color: '#10B981', fontSize: 11 }} onClick={() => setActiveTab('order-processing')}><Package size={12} /> Process Order →</button>)}
            </div>)}
          </Box>

          <Box title="Rooms">
            {rooms.length === 0 && <div className="empty-box">No rooms yet. Click "+ Room" above to add.</div>}
            {rooms.map((r, idx) => (
              <React.Fragment key={r.id}>
                <RoomCard room={r} onClone={cloneRoom} onDelete={deleteRoom} updateRoom={updateRoom} settings={settings} commercials={quoteMeta.commercials} />
                <div className="add-room-between">
                  <button className="btn btn-outline btn-sm" onClick={() => addRoomAfter(idx)} style={{ borderStyle: 'dashed', fontSize: 12 }}><Plus size={13} /> Add Room here</button>
                </div>
              </React.Fragment>
            ))}
          </Box>

          <Box title="Miscellaneous Costs">
            <div className="summary-inner">
              {miscellaneousCosts.length === 0 ? <div className="empty-box">No miscellaneous costs added.</div> : (
                <div className="misc-costs-list">
                  {miscellaneousCosts.map((item) => {
                    const grossAmount = toNum(item.rate) * (toNum(item.quantity) || 1);
const discountPercent = Math.min(100, Math.max(0, toNum(item.discountPercent)));
const discountAmount = grossAmount * (discountPercent / 100);
const amount = grossAmount - discountAmount;
                    return (
                      <div key={item.id} className="misc-cost-row">
  <Field label="Cost Name">
    <input
      className="input"
      value={item.name || ''}
      onChange={e => handleMiscCostChange(item.id, { name: e.target.value })}
      placeholder="e.g. Transport, Labour, Hardware"
    />
  </Field>

  <Field label="Unit">
    <select
      className="select"
      value={item.unit || "nos"}
      onChange={e => handleMiscCostChange(item.id, { unit: e.target.value })}
    >
      {UNIT_OPTIONS.map(u => (
        <option key={u.id} value={u.id}>{u.label}</option>
      ))}
    </select>
  </Field>

  <Field label={`Cost / ${getUnitLabel(item.unit || "nos")}`}>
    <UnitInput
      unit="Rs"
      value={item.rate}
      onChange={e => handleMiscCostChange(item.id, { rate: e.target.value })}
      inputMode="decimal"
      placeholder="e.g. 500"
    />
  </Field>

  <Field label="Quantity">
    <UnitInput
      unit={getUnitShortLabel(item.unit || "nos")}
      value={item.quantity}
      onChange={e => handleMiscCostChange(item.id, { quantity: e.target.value })}
      inputMode="decimal"
      placeholder="1"
    />
  </Field>

  <Field label="Discount %">
  <UnitInput
    unit="%"
    value={item.discountPercent || ""}
    onChange={e =>
      handleMiscCostChange(item.id, {
        discountPercent: e.target.value,
      })
    }
    inputMode="decimal"
    placeholder="0"
  />
</Field>

  {quoteMeta.commercials.applyGst && (
    <Field label="GST Category">
      <select
        className="select"
        value={
          item.gstCategory?.id ||
          (settings.gstCategories || []).find(c => c.id === "other")?.id ||
          settings.gstCategories?.[0]?.id ||
          ""
        }
        onChange={e =>
          handleMiscCostChange(item.id, {
            gstCategory: (settings.gstCategories || []).find(c => c.id === e.target.value),
          })
        }
      >
        {(settings.gstCategories || []).map(c => (
          <option key={c.id} value={c.id}>
            {c.label} ({c.rate}%)
          </option>
        ))}
      </select>
    </Field>
  )}

  <Field label="Amount">
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{ minWidth: 120 }}>
  {discountAmount > 0 && (
    <div
      style={{
        fontSize: 11,
        color: '#6b7280',
        textDecoration: 'line-through',
      }}
    >
      {currency(grossAmount)}
    </div>
  )}

  <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
    {currency(amount)}
  </div>

  {discountAmount > 0 && (
    <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
      -{currency(discountAmount)} ({discountPercent}%)
    </div>
  )}
</div>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDeleteMiscCost(item.id)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  </Field>
</div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={handleAddMiscCost}><Plus size={13} /> Add Miscellaneous Cost</button>
                <div style={{ fontWeight: 900, color: 'var(--primary)' }}>Total: {currency(miscTotal)}</div>
              </div>
            </div>
          </Box>

          <Box title="Summary & Grand Total">
            <div className="summary-inner">
              <div className="summary-list">
                <div className="summary-item"><div className="summary-name">Total Cloth Cost</div><div className="summary-total">{currency(totalClothCost)}</div></div>
                <div className="summary-item"><div className="summary-name">Total Other Costs (Stitching, Lining, Track, Install, Misc)</div><div className="summary-total">{currency(totalOther)}</div></div>
                {Number(finalTotals.roundOff || 0) !== 0 && (<div className="summary-item"><span className="summary-name">Round Off / Adjustment</span><span className="summary-total">{Number(finalTotals.roundOff || 0) > 0 ? "+" : "-"}{currency(Math.abs(Number(finalTotals.roundOff || 0)))}</span></div>)}
              </div>

              <div className="commercial-grid">
                <div className="commercial-card">
                  <div className="commercial-title">Discount (on Fabric)</div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input
                        type="radio"
                        name="discountMode"
                        value="same"
                        checked={(quoteMeta.commercials.discountMode || "same") === "same"}
                        onChange={() =>
                          setQuoteMeta(o => ({
                            ...o,
                            commercials: {
                              ...o.commercials,
                              discountMode: "same",
                            },
                          }))
                        }
                      />
                      Same discount on all fabrics
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input
                        type="radio"
                        name="discountMode"
                        value="linewise"
                        checked={quoteMeta.commercials.discountMode === "linewise"}
                        onChange={() =>
                          setQuoteMeta(o => ({
                            ...o,
                            commercials: {
                              ...o.commercials,
                              discountMode: "linewise",
                            },
                          }))
                        }
                      />
                      Different discount per fabric
                    </label>
                  </div>

                  {(quoteMeta.commercials.discountMode || "same") === "same" ? (
                    <div className="commercial-controls">
                      <select
                        className="select-xs"
                        value={quoteMeta.commercials.discountType}
                        onChange={e =>
                          setQuoteMeta(o => ({
                            ...o,
                            commercials: {
                              ...o.commercials,
                              discountType: e.target.value,
                            },
                          }))
                        }
                      >
                        <option value="percent">%</option>
                        <option value="fixed">Rs</option>
                      </select>

                      <input
                        type="number"
                        className="input-xs"
                        value={quoteMeta.commercials.discountValue}
                        onChange={e =>
                          setQuoteMeta(o => ({
                            ...o,
                            commercials: {
                              ...o.commercials,
                              discountValue: +e.target.value,
                            },
                          }))
                        }
                      />

                      <span className="commercial-amount text-danger">
                        -{currency(finalTotals.discountAmount)}
                      </span>
                    </div>
                  ) : (
                    <div className="commercial-note">
                      Set the discount separately on each fabric row above.
                      Total discount: {currency(finalTotals.discountAmount)}
                    </div>
                  )}

                  <div className="commercial-note">
                    After Discount: {currency(finalTotals.afterDiscount)}
                  </div>
                </div>

                {/* ── NEW GST card: just a toggle, no single rate ── */}
                <div className="commercial-card">
  <div className="commercial-title">GST (per-category)</div>
  <div className="commercial-controls">
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
      <input
        type="checkbox"
        checked={quoteMeta.commercials.applyGst}
        onChange={e => setQuoteMeta(o => ({
          ...o,
          commercials: { ...o.commercials, applyGst: e.target.checked }
        }))}
      />
      Apply GST
    </label>
  </div>

  {quoteMeta.commercials.applyGst && (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Customer GSTIN */}
      <div className="field">
        <label className="field-label">Customer GSTIN</label>
        <input
          className="input"
          value={quoteMeta.commercials.customerGstin || ''}
          onChange={e => setQuoteMeta(o => ({
            ...o,
            commercials: { ...o.commercials, customerGstin: e.target.value }
          }))}
          placeholder="e.g. 27AABCU9603R1ZX"
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Customer Company Name for GST */}
      <div className="field">
        <label className="field-label">Customer Company Name <span className="field-hint">(for GST invoice)</span></label>
        <input
          className="input"
          value={quoteMeta.commercials.customerCompanyName || ''}
          onChange={e => setQuoteMeta(o => ({
            ...o,
            commercials: { ...o.commercials, customerCompanyName: e.target.value }
          }))}
          placeholder="e.g. Sharma Interiors Pvt Ltd"
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Billing Address */}
      <div className="field">
        <label className="field-label">Billing Address</label>
        <input
          className="input"
          value={quoteMeta.commercials.billingAddress || ''}
          onChange={e => setQuoteMeta(o => ({
            ...o,
            commercials: { ...o.commercials, billingAddress: e.target.value }
          }))}
          placeholder="Full billing address"
          style={{ fontSize: 12 }}
        />
      </div>

      {/* GST breakdown rows */}
      {liveGstBreakdown.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {liveGstBreakdown.map(cat => (
            <div key={cat.categoryId} className="gst-breakdown-row">
              <span className="gst-breakdown-label">{cat.label} ({cat.rate}%)</span>
              <span className="gst-breakdown-value">{currency(cat.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="commercial-note">
          GST is enabled. Add product rows or costs to see GST breakup.
        </div>
      )}
    </div>
  )}

  {!quoteMeta.commercials.applyGst && (
    <div className="commercial-note">
      GST is calculated category-wise when enabled.
    </div>
  )}
</div>

                <div className="commercial-card">
                  <div className="commercial-title">Round Off / Adjustment</div>
                  <div className="commercial-controls">
                    <input
                      type="number"
                      className="input-xs"
                      value={quoteMeta.commercials.roundOff || ""}
                      onChange={e =>
                        setQuoteMeta(o => ({
                          ...o,
                          commercials: {
                            ...o.commercials,
                            roundOff: e.target.value,
                          },
                        }))
                      }
                      placeholder="0"
                    />
                    <span className="commercial-amount">
                      {currency(finalTotals.roundOff)}
                    </span>
                  </div>
                  <div className="commercial-note">
                    Use negative value for reduction, positive for addition.
                  </div>
                </div>
              </div>

              <div className="grand-total-box">
                <div className="summary-list">
                  <div className="summary-item">
                    <span className="summary-name">Base Total</span>
                    <span className="summary-total">{currency(grandTotal)}</span>
                  </div>

                  {finalTotals.discountAmount > 0 && (
                    <div className="summary-item">
                      <span className="summary-name">Discount</span>
                      <span className="summary-total text-danger">
                        -{currency(finalTotals.discountAmount)}
                      </span>
                    </div>
                  )}

                  {quoteMeta.commercials.applyGst && liveGstBreakdown.map(cat => (
                    <div key={cat.categoryId} className="summary-item">
                      <span className="summary-name">
                        GST — {cat.label} ({cat.rate}%)
                      </span>
                      <span className="summary-total">
                        {currency(cat.amount)}
                      </span>
                    </div>
                  ))}

                  {Number(finalTotals.roundOff || 0) !== 0 && (
                    <div className="summary-item">
                      <span className="summary-name">Round Off / Adjustment</span>
                      <span className="summary-total">
                        {Number(finalTotals.roundOff || 0) > 0 ? "+" : "-"}
                        {currency(Math.abs(Number(finalTotals.roundOff || 0)))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="final-row" style={{ marginTop: 12 }}>
                  <div className="final-label">Grand Total</div>
                  <div className="final-amount">{currency(finalTotals.finalTotal)}</div>
                </div>
              </div>

              <div className="save-bottom-bar">
                <span className="save-bottom-label">
                  Save this quotation before processing the order.
                </span>
                <button className="btn btn-primary" onClick={handleSaveQuote}>
                  Save Quote
                </button>
              </div>
            </div>
          </Box>
    </>
  );
}
