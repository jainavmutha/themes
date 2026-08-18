import React from "react";
import { Box, Field } from "./ui.jsx";

export default function CompanyTab({
  quoteMeta,
  setQuoteMeta,
}) {
  return (
    <Box title="Company Details">
      <div className="grid-2">
              <Field label="Company Name">
                <input
                  className="input"
                  value={quoteMeta.company.name || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, name: e.target.value },
                  }))}
                />
              </Field>

              <Field label="PDF Company Name">
                <input
                  className="input"
                  value={quoteMeta.company.pdfCompanyName || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, pdfCompanyName: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Phone">
                <input
                  className="input"
                  value={quoteMeta.company.phone || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, phone: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Email">
                <input
                  className="input"
                  value={quoteMeta.company.email || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, email: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Address">
                <input
                  className="input"
                  value={quoteMeta.company.address || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, address: e.target.value },
                  }))}
                />
              </Field>

              <Field label="GSTIN">
                <input
                  className="input"
                  value={quoteMeta.company.gstin || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, gstin: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Logo URL">
                <input
                  className="input"
                  value={quoteMeta.company.logoUrl || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, logoUrl: e.target.value },
                  }))}
                />
              </Field>

              <Field label="Payment QR URL">
                <input
                  className="input"
                  value={quoteMeta.company.paymentQrUrl || ""}
                  onChange={e => setQuoteMeta(o => ({
                    ...o,
                    company: { ...o.company, paymentQrUrl: e.target.value },
                  }))}
                />
              </Field>
            </div>
    </Box>
  );
}

