#!/usr/bin/env python3
"""
Run this script in the same folder as your App.jsx:
  python3 patch_app.py

It will create App_modified.jsx with all 5 changes applied.
"""

import sys, os

src_path = sys.argv[1] if len(sys.argv) > 1 else "App.jsx"
if not os.path.exists(src_path):
    print(f"Error: {src_path} not found"); sys.exit(1)

src = open(src_path, encoding="utf-8").read()
original_len = len(src)

def apply(src, old, new, tag):
    if old not in src:
        print(f"  WARN: Could not find patch target for: {tag}")
        return src
    result = src.replace(old, new, 1)
    print(f"  OK: {tag}")
    return result

# ── 1. BlankFabric: add mattress + HSN fields ──
src = apply(src,
    '''  isWallpaper: false,
  wallpaperRollQty: "",
  wallpaperRollPrice: "",
  stitching: settings.stitchingTypes[0],''',
    '''  isWallpaper: false,
  wallpaperRollQty: "",
  wallpaperRollPrice: "",
  isMattress: false,
  mattressQty: "",
  mattressPrice: "",
  hsnCode: "",
  stitching: settings.stitchingTypes[0],''',
    "BlankFabric mattress+HSN fields"
)

# ── 2. computeFabricCost: add isMattress branch ──
src = apply(src,
    '''    return { panels: 0, metersOfCloth: 0, trackFeet: 0, widthFeet: 0, clothCost: rollQty * rollPrice, stitchingCost: 0, liningCost: 0, romanBlindSqFt: 0, blindSqFt: 0, blindRate: 0, blindType: "", isRomanBlind: false, isWallpaper: true, rollQty, rollPrice, stitchingRate: 0 };
  }
  if (fabric.blindType) {''',
    '''    return { panels: 0, metersOfCloth: 0, trackFeet: 0, widthFeet: 0, clothCost: rollQty * rollPrice, stitchingCost: 0, liningCost: 0, romanBlindSqFt: 0, blindSqFt: 0, blindRate: 0, blindType: "", isRomanBlind: false, isWallpaper: true, isMattress: false, rollQty, rollPrice, stitchingRate: 0 };
  }
  if (fabric.isMattress) {
    const mattressQty = toNum(fabric.mattressQty);
    const mattressPrice = toNum(fabric.mattressPrice);
    return { panels: 0, metersOfCloth: 0, trackFeet: 0, widthFeet: 0, clothCost: mattressQty * mattressPrice, stitchingCost: 0, liningCost: 0, romanBlindSqFt: 0, blindSqFt: 0, blindRate: 0, blindType: "", isRomanBlind: false, isWallpaper: false, isMattress: true, mattressQty, mattressPrice, rollQty: 0, rollPrice: 0, stitchingRate: 0 };
  }
  if (fabric.blindType) {''',
    "computeFabricCost isMattress branch"
)

# ── 3. computeRoomCost: skip track for mattress ──
src = apply(src,
    "    const fabricTrackCost = (fc.isWallpaper || fc.blindType) ? 0",
    "    const fabricTrackCost = (fc.isWallpaper || fc.isMattress || fc.blindType) ? 0",
    "computeRoomCost: skip track for mattress"
)

# ── 4a. FabricRow header: add Mattress checkbox ──
src = apply(src,
    '''          <input type="checkbox" checked={!!fabric.isWallpaper} onChange={e => onChange({ isWallpaper: e.target.checked, isRomanBlind: false, romanBlindSqFt: "", panels: e.target.checked ? "" : fabric.panels, clothMeters: e.target.checked ? "" : fabric.clothMeters, blindType: e.target.checked ? "" : fabric.blindType, blindSqFt: e.target.checked ? "" : fabric.blindSqFt })} />
          Wallpaper
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Type
          <select className="select" style={{ width: 156, padding: '5px 8px', fontSize: 12 }} value={fabric.isRomanBlind ? "roman" : (fabric.blindType || "")} disabled={!!fabric.isWallpaper}''',
    '''          <input type="checkbox" checked={!!fabric.isWallpaper} onChange={e => onChange({ isWallpaper: e.target.checked, isMattress: false, isRomanBlind: false, romanBlindSqFt: "", panels: e.target.checked ? "" : fabric.panels, clothMeters: e.target.checked ? "" : fabric.clothMeters, blindType: e.target.checked ? "" : fabric.blindType, blindSqFt: e.target.checked ? "" : fabric.blindSqFt })} />
          Wallpaper
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!fabric.isMattress} onChange={e => onChange({ isMattress: e.target.checked, isWallpaper: false, isRomanBlind: false, romanBlindSqFt: "", panels: "", clothMeters: "", blindType: "", blindSqFt: "" })} />
          Mattress
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Type
          <select className="select" style={{ width: 156, padding: '5px 8px', fontSize: 12 }} value={fabric.isRomanBlind ? "roman" : (fabric.blindType || "")} disabled={!!fabric.isWallpaper || !!fabric.isMattress}''',
    "FabricRow: Mattress checkbox"
)

# ── 4b. Cost pill: Mattress label ──
src = apply(src,
    '{fc.blindType ? `Blinds Cost: ${currency(fc.clothCost)}` : currency(fc.clothCost + fc.stitchingCost + fc.liningCost)}',
    '{fc.isMattress ? `Mattress: ${currency(fc.clothCost)}` : fc.blindType ? `Blinds Cost: ${currency(fc.clothCost)}` : currency(fc.clothCost + fc.stitchingCost + fc.liningCost)}',
    "FabricRow: cost pill Mattress label"
)

# ── 4c. Update onChange for blindType select (disable when isMattress) ──
src = apply(src,
    '''            onChange={e => { const value = e.target.value; const isRoman = value === "roman"; onChange({ blindType: isRoman ? "" : value, blindSqFt: value && !isRoman ? fabric.blindSqFt : "", isRomanBlind: isRoman, romanBlindSqFt: isRoman ? fabric.romanBlindSqFt : "", isWallpaper: false, panels: value ? "" : fabric.panels, clothMeters: value ? "" : fabric.clothMeters }); }}>''',
    '''            onChange={e => { const value = e.target.value; const isRoman = value === "roman"; onChange({ blindType: isRoman ? "" : value, blindSqFt: value && !isRoman ? fabric.blindSqFt : "", isRomanBlind: isRoman, romanBlindSqFt: isRoman ? fabric.romanBlindSqFt : "", isWallpaper: false, isMattress: false, panels: value ? "" : fabric.panels, clothMeters: value ? "" : fabric.clothMeters }); }}>''',
    "FabricRow: type select onChange adds isMattress:false"
)

# ── 4d. Wallpaper branch: add HSN field ──
src = apply(src,
    '            <Field label="Price / Roll"><UnitInput unit="Rs" value={fabric.wallpaperRollPrice ?? ""} onChange={e => onChange({ wallpaperRollPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 2500" /></Field>\n            {showGstPicker && (\n              <Field label="GST Category">\n                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="wallpaper")?.id || gstCategories[0]?.id || ""}',
    '            <Field label="Price / Roll"><UnitInput unit="Rs" value={fabric.wallpaperRollPrice ?? ""} onChange={e => onChange({ wallpaperRollPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 2500" /></Field>\n            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 4814" /></Field>\n            {showGstPicker && (\n              <Field label="GST Category">\n                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="wallpaper")?.id || gstCategories[0]?.id || ""}',
    "Wallpaper: HSN field"
)

# ── 4e. Insert Mattress branch after wallpaper closing ──
src = apply(src,
    '          <>\n        ) : fabric.blindType ? (',
    '          <>\n        ) : fabric.isMattress ? (\n          <>\n            <Field label="Mattress Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder="e.g. King Size Mattress" /></Field>\n            <Field label="Quantity" hint="nos"><UnitInput unit="nos" value={fabric.mattressQty ?? ""} onChange={e => onChange({ mattressQty: e.target.value })} inputMode="decimal" placeholder="e.g. 2" /></Field>\n            <Field label="Price / Piece"><UnitInput unit="Rs" value={fabric.mattressPrice ?? ""} onChange={e => onChange({ mattressPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 8000" /></Field>\n            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 9404" /></Field>\n            {showGstPicker && (\n              <Field label="GST Category">\n                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="other")?.id || gstCategories[0]?.id || ""}\n                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>\n                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}\n                </select>\n              </Field>\n            )}\n          <>\n        ) : fabric.blindType ? (',
    "Insert Mattress branch"
)

# ── 4f. Blind branch: add HSN field ──
src = apply(src,
    '            {showGstPicker && (\n              <Field label="GST Category">\n                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="blind")?.id || gstCategories[0]?.id || ""}\n                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>\n                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}\n                </select>\n              </Field>\n            )}\n          <>\n        ) : (',
    '            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 6303" /></Field>\n            {showGstPicker && (\n              <Field label="GST Category">\n                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="blind")?.id || gstCategories[0]?.id || ""}\n                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>\n                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}\n                </select>\n              </Field>\n            )}\n          <>\n        ) : (',
    "Blind branch: HSN field"
)

# ── 4g. Curtain branch: add HSN field ──
src = apply(src,
    '            {/* ── NEW: GST Category picker — only shown when "Apply GST" is enabled ── */}',
    '            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 6303" /></Field>\n            {/* ── GST Category picker — only shown when "Apply GST" is enabled ── */}',
    "Curtain: HSN field"
)

# ── 5a. Performa Invoice: Bill To with company + address ──
src = apply(src,
    '  if (meta.customerPhone) pdfText(doc, `Ph: ${meta.customerPhone}`, m + 10, y + 42);\n  if (meta.commercials.applyGst && meta.commercials.customerGstin)\n  pdfText(doc, `GSTIN: ${meta.commercials.customerGstin}`, m + 10, y + 42);\nif (meta.commercials.applyGst && meta.commercials.customerCompanyName)\n  pdfText(doc, meta.commercials.customerCompanyName, m + 10, y + 55);',
    '  let billToY = y + 40;\n  if (meta.commercials.customerCompanyName) { pdfText(doc, meta.commercials.customerCompanyName, m + 10, billToY); billToY += 12; }\n  if (meta.customerPhone) { pdfText(doc, `Ph: ${meta.customerPhone}`, m + 10, billToY); billToY += 12; }\n  if (meta.commercials.applyGst && meta.commercials.customerGstin) { pdfText(doc, `GSTIN: ${meta.commercials.customerGstin}`, m + 10, billToY); billToY += 12; }\n  if (meta.commercials.billingAddress) {\n    const addrLines = meta.commercials.billingAddress.length > 45 ? [meta.commercials.billingAddress.slice(0, 45), meta.commercials.billingAddress.slice(45)] : [meta.commercials.billingAddress];\n    addrLines.forEach(line => { pdfText(doc, line, m + 10, billToY); billToY += 11; });\n  }',
    "Performa: Bill To with company+address"
)

# ── 5b. Performa: HSN from fabric field ──
src = apply(src,

    """      /* HSN (fabric / blind / wallpaper) */

      const hsnCode = fab.isWallpaper ? '4814' : fab.blindType ? '6303' : '6303';""",

    """      /* HSN — use user-entered value only */

      const hsnCode = fab.hsnCode || "-";""",

    "Performa: HSN from fabric.hsnCode"

)

# ── 5c. Performa: Mattress qty/rate ──
src = apply(src,
    '      if (fab.isWallpaper) qtyStr = `${Number(fc.rollQty || 0).toFixed(1)} rolls`;\n      else if (fab.blindType) qtyStr = `${Number(fc.blindSqFt || 0).toFixed(1)} sq ft`;',
    '      if (fab.isWallpaper) qtyStr = `${Number(fc.rollQty || 0).toFixed(1)} rolls`;\n      else if (fab.isMattress) qtyStr = `${Number(fc.mattressQty || 0).toFixed(0)} nos`;\n      else if (fab.blindType) qtyStr = `${Number(fc.blindSqFt || 0).toFixed(1)} sq ft`;',
    "Performa: Mattress qty"
)

src = apply(src,
    '        : fab.blindType\n          ? `Rs.${numberWithCommas(fc.blindRate)}/sqft`\n          : `Rs.${numberWithCommas(fab.materialPrice || 0)}/m`;',
    '        : fab.isMattress\n          ? `Rs.${numberWithCommas(fc.mattressPrice)}/nos`\n          : fab.blindType\n            ? `Rs.${numberWithCommas(fc.blindRate)}/sqft`\n            : `Rs.${numberWithCommas(fab.materialPrice || 0)}/m`;',
    "Performa: Mattress rate"
)

# ── 5d. Remove Amount in Words, add Delivery Terms ──
# ── 5d. Remove Amount in Words, add Delivery Terms ──
src = apply(src,
    """  /* ── AMOUNT IN WORDS ── */
  const amountWords = numberToWords(summary.finalTotal);
  doc.setFillColor(252, 248, 244); doc.setDrawColor(...pdfColor(BRAND.border));
  doc.roundedRect(m, y, tw, 24, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'Amount in Words: ', m + 8, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  pdfText(doc, `${amountWords} Only`, m + 8 + doc.getTextWidth('Amount in Words: '), y + 16);
  y += 34;""",
    """  /* ── DELIVERY TERMS ── */
  doc.setFillColor(239, 246, 255); doc.setDrawColor(191, 219, 254);
  doc.roundedRect(m, y, tw, 24, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(29, 78, 216);
  pdfText(doc, 'Delivery Terms: ', m + 8, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  pdfText(doc, 'Goods will be delivered within 7 working days from the date of order confirmation and advance payment.', m + 8 + doc.getTextWidth('Delivery Terms: '), y + 16);
  y += 34;""",
    "Remove Amount-in-Words, add Delivery Terms"
)

# ── 6. drawGroupedSummarySection: mattress qty/rate ──
src = apply(src,
    'rightText(fab.isWallpaper?`${Number(fc.rollQty||0).toFixed(2)} rolls`:(fc.blindType?`${Number(fc.blindSqFt||0).toFixed(2)} sq ft`:`${fc.metersOfCloth.toFixed(2)} m`),colClothX+colClothW-8,ry+lineH);\n        rightText(fab.isWallpaper?`Rs.${numberWithCommas(fc.rollPrice||0)}`:`Rs.${numberWithCommas(fc.blindType?fc.blindRate:(fab.materialPrice||0))}`,colRateX2+colRateW-8,ry+lineH);',
    'rightText(fab.isWallpaper?`${Number(fc.rollQty||0).toFixed(2)} rolls`:(fab.isMattress?`${Number(fc.mattressQty||0).toFixed(0)} nos`:(fc.blindType?`${Number(fc.blindSqFt||0).toFixed(2)} sq ft`:`${fc.metersOfCloth.toFixed(2)} m`)),colClothX+colClothW-8,ry+lineH);\n        rightText(fab.isWallpaper?`Rs.${numberWithCommas(fc.rollPrice||0)}`:(fab.isMattress?`Rs.${numberWithCommas(fc.mattressPrice||0)}`:`Rs.${numberWithCommas(fc.blindType?fc.blindRate:(fab.materialPrice||0))}`),colRateX2+colRateW-8,ry+lineH);',
    "drawGroupedSummarySection: mattress qty+rate"
)

out_path = src_path.replace(".jsx", "_modified.jsx")
open(out_path, "w", encoding="utf-8").write(src)
print(f"\nDone. Written to: {out_path}")
print(f"Size: {len(src):,} chars ({len(src) - original_len:+,} chars vs original)")
