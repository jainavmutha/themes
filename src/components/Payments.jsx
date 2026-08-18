import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Download } from "lucide-react";

import {
  currency,
  toNum,
} from "../utils/formatting.js";

import {
  getQuoteCustomerName,
  getQuoteFinalTotal,
} from "../utils/quoteHelpers.js";

import {
  Box,
  Field,
  StatusBadge,
} from "./ui.jsx";
function PaymentsTab({ allQuotes, paymentsStore, setPaymentsStore, settings,generateCombinedPDF, }) {
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", mode: "UPI", date: new Date().toISOString().slice(0, 10), note: "" });
  const customerGroups = useMemo(() => {
    const map = {};
    Object.values(allQuotes || {}).forEach(quote => {
      const customerName = getQuoteCustomerName(quote);
      if (!map[customerName]) map[customerName] = { customerName, quotes: [], totalValue: 0 };
      const value = getQuoteFinalTotal(quote);
      map[customerName].quotes.push({ quoteNo: quote.quoteNo || quote.quote_no || "Unknown", status: quote.status || quote.quoteStatus || "Draft", value, date: quote.updatedAt || quote.createdAt || "" });
      map[customerName].totalValue += value;
    });
    return Object.values(map).sort((a, b) => b.totalValue - a.totalValue || a.customerName.localeCompare(b.customerName));
  }, [allQuotes]);
  useEffect(() => { if (!selectedCustomer && customerGroups.length) setSelectedCustomer(customerGroups[0].customerName); }, [customerGroups, selectedCustomer]);
  const selectedGroup = customerGroups.find(group => group.customerName === selectedCustomer) || customerGroups[0];
  const customerKey = selectedGroup?.customerName || "";
  const payments = Array.isArray(paymentsStore?.[customerKey]) ? paymentsStore[customerKey] : [];
  const totalValue = selectedGroup?.totalValue || 0;
  const totalReceived = payments.reduce((sum, payment) => sum + toNum(payment.amount), 0);
  const balance = Math.max(0, totalValue - totalReceived);
  const addPayment = useCallback(() => {
    if (!customerKey) return;
    const amount = toNum(paymentForm.amount);
    if (amount <= 0) { alert("Enter a payment amount first."); return; }
    const payment = { id: crypto.randomUUID(), amount, mode: paymentForm.mode || "UPI", date: paymentForm.date || new Date().toISOString().slice(0, 10), note: paymentForm.note || "", createdAt: new Date().toISOString() };
    setPaymentsStore(prev => ({ ...(prev || {}), [customerKey]: [payment, ...(Array.isArray(prev?.[customerKey]) ? prev[customerKey] : [])] }));
    setPaymentForm({ amount: "", mode: "UPI", date: new Date().toISOString().slice(0, 10), note: "" });
  }, [customerKey, paymentForm, setPaymentsStore]);
  const removePayment = useCallback((paymentId) => {
    if (!customerKey) return;
    setPaymentsStore(prev => ({ ...(prev || {}), [customerKey]: (Array.isArray(prev?.[customerKey]) ? prev[customerKey] : []).filter(payment => payment.id !== paymentId) }));
  }, [customerKey, setPaymentsStore]);
  if (!customerGroups.length) return <Box title="Payments"><div className="empty-box">No saved quotes yet. Save quotes first, then customer-wise payments will appear here.</div></Box>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Box title="Payments — Customer Wise">
        <div className="grid-3">
          <Field label="Customer / Name">
            <select className="select" value={customerKey} onChange={e => setSelectedCustomer(e.target.value)}>
              {customerGroups.map(group => <option key={group.customerName} value={group.customerName}>{group.customerName}</option>)}
            </select>
          </Field>
          <div className="op-fin-card quote"><div className="op-fin-label">Total Quote Value</div><div className="op-fin-value">{currency(totalValue)}</div><div className="op-fin-sub">Across {selectedGroup?.quotes.length || 0} quote{(selectedGroup?.quotes.length || 0) !== 1 ? "s" : ""}</div></div>
          <div className={`op-fin-card balance ${balance <= 0 ? "settled" : ""}`}><div className="op-fin-label">Balance Due</div><div className="op-fin-value">{currency(balance)}</div><div className="op-fin-sub">Received: {currency(totalReceived)}</div></div>
        </div>
      </Box>
      <Box title="Quotes Included">
        <div style={{ overflowX: "auto" }}>
          <table className="history-table">
            <thead><tr><th>Quote No</th><th>Status</th><th>Date</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
            <tbody>
              {(selectedGroup?.quotes || []).map(quote => (
                <tr key={quote.quoteNo}>
                  <td className="history-row-no">{quote.quoteNo}</td>
                  <td><StatusBadge status={quote.status} /></td>
                  <td className="history-row-date">{quote.date ? new Date(quote.date).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="history-row-total" style={{ textAlign: "right" }}>{currency(quote.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(selectedGroup?.quotes || []).length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={async () => {
                try {
                  const quoteRecords = (selectedGroup?.quotes || []).map(q => allQuotes[q.quoteNo]).filter(Boolean);
                  if (quoteRecords.length < 2) { alert("Need at least 2 saved quotes."); return; }
                  const doc = await generateCombinedPDF(quoteRecords, settings);
                  doc.save(`Combined_${customerKey}_${new Date().toISOString().slice(0,10)}.pdf`);
                } catch (err) { console.error(err); alert("Could not generate combined PDF."); }
              }}><Download size={14} /> Combined PDF (All Quotes)</button>
            </div>
          )}
        </div>
      </Box>
      <Box title="Add Payment Received">
        <div className="grid-3">
          <Field label="Amount Received"><input className="input" value={paymentForm.amount} onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="e.g. 10000" inputMode="decimal" /></Field>
          <Field label="Payment Type"><select className="select" value={paymentForm.mode} onChange={e => setPaymentForm(prev => ({ ...prev, mode: e.target.value }))}><option value="UPI">UPI</option><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="Card">Card</option><option value="Cheque">Cheque</option><option value="Other">Other</option></select></Field>
          <Field label="Payment Date"><input className="input" type="date" value={paymentForm.date} onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))} /></Field>
          <Field label="Note / Reference"><input className="input" value={paymentForm.note} onChange={e => setPaymentForm(prev => ({ ...prev, note: e.target.value }))} placeholder="Txn ID, cheque no., remarks" /></Field>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={addPayment}>+ Add Payment</button></div>
      </Box>
      <Box title="Payment History">
        {!payments.length ? <div className="empty-box">No payments received for this customer yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="history-table">
              <thead><tr><th>Date</th><th>Type</th><th>Note</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "center" }}>Remove</th></tr></thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id}>
                    <td className="history-row-date">{payment.date ? new Date(payment.date).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="history-row-customer">{payment.mode || "—"}</td>
                    <td>{payment.note || "—"}</td>
                    <td className="history-row-total" style={{ textAlign: "right" }}>{currency(payment.amount)}</td>
                    <td style={{ textAlign: "center" }}><button className="btn-remove-fabric" type="button" onClick={() => removePayment(payment.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </div>
  );
}
export default PaymentsTab;