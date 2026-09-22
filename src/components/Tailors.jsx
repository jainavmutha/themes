

import React from "react";
import useTailors from "../hooks/useTailors.js";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

export default function Tailors() {
  const {
    tailors,
    selectedTailorId,
    selectedTailor,
    totals,
    loading,
    saving,
    error,
    newTailor,
    newService,
    newWork,
    newPayment,
    setSelectedTailorId,
    setNewTailor,
    setNewService,
    setNewWork,
    setNewPayment,
    addTailor,
    deleteTailor,
    addService,
    removeService,
    chooseService,
    addWork,
    removeWork,
    addPayment,
    removePayment,
  } = useTailors();

  const cardStyle = {
    background:
      "linear-gradient(180deg, rgba(31,29,31,0.98), rgba(24,24,26,0.98))",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 22,
    boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
    overflow: "hidden",
  };

  const sectionBodyStyle = {
    padding: 24,
  };

  const sectionHeaderStyle = {
    minHeight: 64,
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(90deg, rgba(183,7,102,0.08), rgba(245,235,221,0.015))",
  };

  const sectionAccentStyle = {
    width: 7,
    height: 28,
    borderRadius: 999,
    background: "linear-gradient(180deg, #B70766, #007E7C)",
    flex: "0 0 auto",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 16,
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 48,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.13)",
    background: "rgba(39,39,42,0.96)",
    color: "#F5EBDD",
    outline: "none",
    fontSize: 14,
    fontWeight: 600,
  };

  const buttonStyle = {
    minHeight: 44,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: "0 16px",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: "0.01em",
  };

  const labelStyle = {
    marginBottom: 7,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(245,235,221,0.72)",
  };

  const statStyle = {
    ...cardStyle,
    padding: 20,
    minHeight: 92,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  return (
    <div style={{ display: "grid", gap: 22, paddingBottom: 34 }}>
      {error && (
        <div
          style={{
            background: "rgba(183,7,102,0.12)",
            border: "1px solid #B70766",
            borderRadius: 12,
            padding: "12px 14px",
            color: "inherit",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div
          style={{
            ...cardStyle,
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 10,
            opacity: 0.82,
          }}
        >
          Loading tailor ledger…
        </div>
      )}
      <div style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={sectionAccentStyle} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: "#F5EBDD" }}>
              Tailor Ledger
            </h2>
            <div style={{ opacity: 0.62, marginTop: 3, fontSize: 13 }}>
              Tailors, service rates, work history and payments
            </div>
          </div>
        </div>

        <div
          style={{
            ...sectionBodyStyle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", flex: 1 }}>
            <div style={{ minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Tailor Name</div>
              <input
                style={inputStyle}
                placeholder="Enter tailor name"
                value={newTailor.name}
                onChange={(event) =>
                  setNewTailor((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div style={{ minWidth: 200, flex: "1 1 200px" }}>
              <div style={labelStyle}>Phone</div>
              <input
                style={inputStyle}
                placeholder="Phone number"
                value={newTailor.phone}
                onChange={(event) =>
                  setNewTailor((previous) => ({
                    ...previous,
                    phone: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <button
            style={{
              ...buttonStyle,
              background: "linear-gradient(180deg, #C01978, #B70766)",
              color: "white",
              minWidth: 150,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onClick={addTailor}
            disabled={saving}
          >
            {saving ? "Saving…" : "+ Add Tailor"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(250px, 300px) minmax(0, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div style={sectionAccentStyle} />
            <h3 style={{ margin: 0, fontSize: 17 }}>Tailors</h3>
          </div>
          <div style={sectionBodyStyle}>

          {tailors.length === 0 && (
            <div style={{ opacity: 0.65 }}>No tailors added yet.</div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            {tailors.map((tailor) => {
              const work = (tailor.jobs || []).reduce(
                (sum, job) => sum + Number(job.amount || 0),
                0
              );
              const paid = (tailor.payments || []).reduce(
                (sum, payment) => sum + Number(payment.amount || 0),
                0
              );

              return (
                <button
                  key={tailor.id}
                  onClick={() => setSelectedTailorId(tailor.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 15px",
                    borderRadius: 14,
                    border:
                      selectedTailorId === tailor.id
                        ? "1px solid rgba(183,7,102,0.9)"
                        : "1px solid rgba(255,255,255,0.10)",
                    background:
                      selectedTailorId === tailor.id
                        ? "linear-gradient(135deg, rgba(183,7,102,0.18), rgba(183,7,102,0.07))"
                        : "rgba(255,255,255,0.025)",
                    color: "inherit",
                    cursor: "pointer",
                    boxShadow:
                      selectedTailorId === tailor.id
                        ? "inset 4px 0 0 #B70766"
                        : "none",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{tailor.name}</div>
                  {tailor.phone && (
                    <div style={{ opacity: 0.65, fontSize: 12 }}>
                      {tailor.phone}
                    </div>
                  )}
                  <div style={{ marginTop: 5, fontSize: 12 }}>
                    Balance: {money(work - paid)}
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!selectedTailor ? (
            <div style={cardStyle}>Add or select a tailor to begin.</div>
          ) : (
            <>
              <div style={cardStyle}>
                <div
                  style={{
                    ...sectionBodyStyle,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>{selectedTailor.name}</h2>
                    <div style={{ opacity: 0.65 }}>
                      {selectedTailor.phone || "No phone added"}
                    </div>
                  </div>

                  <button
                    style={{
                      ...buttonStyle,
                      background: "transparent",
                      color: "#d9534f",
                      border: "1px solid #d9534f",
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    onClick={() => deleteTailor(selectedTailor.id)}
                    disabled={saving}
                  >
                    Delete Tailor
                  </button>
                </div>
              </div>

              <div style={gridStyle}>
                <div style={statStyle}>
                  <div style={{ opacity: 0.65 }}>Work Value</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>
                    {money(totals.work)}
                  </div>
                </div>
                <div style={statStyle}>
                  <div style={{ opacity: 0.65 }}>Paid</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>
                    {money(totals.paid)}
                  </div>
                </div>
                <div style={statStyle}>
                  <div style={{ opacity: 0.65 }}>Amount Left</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>
                    {money(totals.balance)}
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={sectionAccentStyle} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>Services & Rates</h3>
                </div>
                <div style={sectionBodyStyle}>
                <div style={{ ...gridStyle, marginBottom: 12 }}>
                  <input
                    style={inputStyle}
                    placeholder="Service e.g. Curtain stitching"
                    value={newService.name}
                    onChange={(event) =>
                      setNewService((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                  />
                  <input
                    style={inputStyle}
                    placeholder="Unit e.g. Piece / Meter / Panel"
                    value={newService.unit}
                    onChange={(event) =>
                      setNewService((previous) => ({
                        ...previous,
                        unit: event.target.value,
                      }))
                    }
                  />
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    placeholder="Rate"
                    value={newService.rate}
                    onChange={(event) =>
                      setNewService((previous) => ({
                        ...previous,
                        rate: event.target.value,
                      }))
                    }
                  />
                  <button
                    style={{
                      ...buttonStyle,
                      background: "#007E7C",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    onClick={addService}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "+ Add Service"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {(selectedTailor.services || []).map((service) => (
                    <div
                      key={service.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: 10,
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 14,
                      }}
                    >
                      <div>
                        <strong>{service.name}</strong>
                        <div style={{ opacity: 0.65, fontSize: 12 }}>
                          {money(service.rate)} / {service.unit}
                        </div>
                      </div>
                      <button
                        style={{
                          ...buttonStyle,
                          padding: "6px 10px",
                          background: "transparent",
                          color: "#d9534f",
                          opacity: saving ? 0.6 : 1,
                          cursor: saving ? "not-allowed" : "pointer",
                        }}
                        onClick={() => removeService(service.id)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {(selectedTailor.services || []).length === 0 && (
                    <div style={{ opacity: 0.65 }}>
                      No services added for this tailor yet.
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={sectionAccentStyle} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>Add Work</h3>
                </div>
                <div style={sectionBodyStyle}>
                <div style={gridStyle}>
                  <select
                    style={inputStyle}
                    value={newWork.serviceId}
                    onChange={(event) => chooseService(event.target.value)}
                  >
                    <option value="">Select service</option>
                    {(selectedTailor.services || []).map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — {money(service.rate)}/{service.unit}
                      </option>
                    ))}
                  </select>

                  <input
                    style={inputStyle}
                    type="date"
                    value={newWork.date}
                    onChange={(event) =>
                      setNewWork((previous) => ({
                        ...previous,
                        date: event.target.value,
                      }))
                    }
                  />

                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Quantity"
                    value={newWork.qty}
                    onChange={(event) =>
                      setNewWork((previous) => ({
                        ...previous,
                        qty: event.target.value,
                      }))
                    }
                  />

                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rate"
                    value={newWork.rate}
                    onChange={(event) =>
                      setNewWork((previous) => ({
                        ...previous,
                        rate: event.target.value,
                      }))
                    }
                  />

                  <input
                    style={inputStyle}
                    placeholder="Reference / notes"
                    value={newWork.note}
                    onChange={(event) =>
                      setNewWork((previous) => ({
                        ...previous,
                        note: event.target.value,
                      }))
                    }
                  />

                  <button
                    style={{
                      ...buttonStyle,
                      background: "#B70766",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    onClick={addWork}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Add Work"}
                  </button>
                </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={sectionAccentStyle} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>Work History</h3>
                </div>
                <div style={sectionBodyStyle}>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: "0 8px",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr>
                        <th align="left">Date</th>
                        <th align="left">Service</th>
                        <th align="right">Qty</th>
                        <th align="right">Rate</th>
                        <th align="right">Amount</th>
                        <th align="left">Note</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedTailor.jobs || []).map((job) => (
                        <tr
                          key={job.id}
                          style={{ background: "rgba(255,255,255,0.028)" }}
                        >
                          <td style={{ padding: "10px 4px" }}>{job.date}</td>
                          <td>{job.serviceName}</td>
                          <td align="right">{job.qty}</td>
                          <td align="right">{money(job.rate)}</td>
                          <td align="right">
                            <strong>{money(job.amount)}</strong>
                          </td>
                          <td>{job.note || "—"}</td>
                          <td align="right">
                            <button
                              style={{
                                ...buttonStyle,
                                padding: "5px 8px",
                                background: "transparent",
                                color: "#d9534f",
                                opacity: saving ? 0.6 : 1,
                                cursor: saving ? "not-allowed" : "pointer",
                              }}
                              onClick={() => removeWork(job.id)}
                              disabled={saving}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {(selectedTailor.jobs || []).length === 0 && (
                    <div style={{ opacity: 0.65, paddingTop: 10 }}>
                      No work entries yet.
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                  <div style={sectionAccentStyle} />
                  <h3 style={{ margin: 0, fontSize: 17 }}>Payments</h3>
                </div>
                <div style={sectionBodyStyle}>
                <div style={{ ...gridStyle, marginBottom: 12 }}>
                  <input
                    style={inputStyle}
                    type="date"
                    value={newPayment.date}
                    onChange={(event) =>
                      setNewPayment((previous) => ({
                        ...previous,
                        date: event.target.value,
                      }))
                    }
                  />
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount paid"
                    value={newPayment.amount}
                    onChange={(event) =>
                      setNewPayment((previous) => ({
                        ...previous,
                        amount: event.target.value,
                      }))
                    }
                  />
                  <input
                    style={inputStyle}
                    placeholder="Payment note / UPI / cash"
                    value={newPayment.note}
                    onChange={(event) =>
                      setNewPayment((previous) => ({
                        ...previous,
                        note: event.target.value,
                      }))
                    }
                  />
                  <button
                    style={{
                      ...buttonStyle,
                      background: "#007E7C",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                    onClick={addPayment}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Record Payment"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {(selectedTailor.payments || []).map((payment) => (
                    <div
                      key={payment.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr auto auto",
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 14,
                      }}
                    >
                      <div>{payment.date}</div>
                      <div style={{ opacity: 0.75 }}>
                        {payment.note || "Payment"}
                      </div>
                      <strong>{money(payment.amount)}</strong>
                      <button
                        style={{
                          ...buttonStyle,
                          padding: "5px 8px",
                          background: "transparent",
                          color: "#d9534f",
                          opacity: saving ? 0.6 : 1,
                          cursor: saving ? "not-allowed" : "pointer",
                        }}
                        onClick={() => removePayment(payment.id)}
                        disabled={saving}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {(selectedTailor.payments || []).length === 0 && (
                    <div style={{ opacity: 0.65 }}>
                      No payments recorded yet.
                    </div>
                  )}
                </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}