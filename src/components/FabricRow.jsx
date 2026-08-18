import React, { useMemo } from "react";
import { DEFAULT_SETTINGS } from "../constants/settings.js";
import { computeFabricCost } from "../calculations/curtainCalculations.js";
import { currency } from "../utils/formatting.js";
import { Field, UnitInput } from "./ui.jsx";

const FabricRow = React.memo(function FabricRow({ fabric, room, settings, commercials, onChange, onRemove, canRemove }) {
  const fc = useMemo(() => computeFabricCost(room, fabric), [room, fabric]);
  const gstCategories = settings?.gstCategories || DEFAULT_SETTINGS.gstCategories;
  const showGstPicker = commercials?.applyGst;
  const showLinewiseDiscount = commercials?.discountMode === "linewise";

  return (
    <div className="fabric-row">
      <div className="fabric-row-header">
        <span className="fabric-label-badge">{fabric.label || "Fabric"}</span>
        <input className="input" value={fabric.label || ""} onChange={e => onChange({ label: e.target.value })} placeholder="Label e.g. Main / Sheer" style={{ flex: 1, marginLeft: 8, maxWidth: 180 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!fabric.isWallpaper} onChange={e => onChange({ isWallpaper: e.target.checked, isMattress: false, isRomanBlind: false, romanBlindSqFt: "", panels: e.target.checked ? "" : fabric.panels, clothMeters: e.target.checked ? "" : fabric.clothMeters, blindType: e.target.checked ? "" : fabric.blindType, blindSqFt: e.target.checked ? "" : fabric.blindSqFt })} />
          Wallpaper
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!fabric.isMattress} onChange={e => onChange({ isMattress: e.target.checked, isWallpaper: false, isRomanBlind: false, romanBlindSqFt: "", panels: "", clothMeters: "", blindType: "", blindSqFt: "" })} />
          Mattress
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Type
          <select className="select" style={{ width: 156, padding: '5px 8px', fontSize: 12 }} value={fabric.isRomanBlind ? "roman" : (fabric.blindType || "")} disabled={!!fabric.isWallpaper || !!fabric.isMattress}
            onChange={e => { const value = e.target.value; const isRoman = value === "roman"; onChange({ blindType: isRoman ? "" : value, blindSqFt: value && !isRoman ? fabric.blindSqFt : "", isRomanBlind: isRoman, romanBlindSqFt: isRoman ? fabric.romanBlindSqFt : "", isWallpaper: false, isMattress: false, panels: value ? "" : fabric.panels, clothMeters: value ? "" : fabric.clothMeters }); }}>
            <option value="">None</option>
            <option value="roman">Roman Blind</option>
            <option value="roller">Roller Blind</option>
            <option value="zebra">Zebra Blind</option>
            <option value="wooden">Wooden Blind</option>
          </select>
        </label>
        <span className="fabric-cost-pill">{fc.isMattress ? `Mattress: ${currency(fc.clothCost)}` : fc.blindType ? `Blinds Cost: ${currency(fc.clothCost)}` : currency(fc.clothCost + fc.stitchingCost + fc.liningCost)}</span>
        {canRemove && <button className="btn-remove-fabric" onClick={onRemove} title="Remove fabric">×</button>}
        {showLinewiseDiscount && (
          <Field label="Discount" hint="applies to this line only">
            <UnitInput
              unit="%"
              value={fabric.discountPercent ?? ""}
              onChange={e => {
                const raw = e.target.value;
                const numeric = raw === "" ? "" : Math.min(100, Math.max(0, Number(raw)));
                onChange({ discountPercent: numeric });
              }}
              inputMode="decimal"
              placeholder="e.g. 10"
            />
          </Field>
        )}
      </div>
      <div className="fabric-row-grid">
        {fabric.isMattress ? (
          <>
            <Field label="Mattress Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder="e.g. Mattress" /></Field>
            <Field label="Quantity" hint="nos"><UnitInput unit="nos" value={fabric.mattressQty ?? ""} onChange={e => onChange({ mattressQty: e.target.value })} inputMode="decimal" placeholder="e.g. 1" /></Field>
            <Field label="Price"><UnitInput unit="Rs" value={fabric.mattressPrice ?? ""} onChange={e => onChange({ mattressPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 25000" /></Field>
            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 9404" /></Field>
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="mattress")?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}
                </select>
              </Field>
            )}
          </>
        ) : fabric.isWallpaper ? (
          <>
            <Field label="Wallpaper Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder="e.g. Floral Wallpaper" /></Field>
            <Field label="Quantity" hint="rolls"><UnitInput unit="rolls" value={fabric.wallpaperRollQty ?? ""} onChange={e => onChange({ wallpaperRollQty: e.target.value })} inputMode="decimal" placeholder="e.g. 3" /></Field>
            <Field label="Price / Roll"><UnitInput unit="Rs" value={fabric.wallpaperRollPrice ?? ""} onChange={e => onChange({ wallpaperRollPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 2500" /></Field>
            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 4814" /></Field>
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="wallpaper")?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}
                </select>
              </Field>
            )}
          </>
        ) : fabric.blindType ? (
          <>
            <Field label="Blind Name"><input className="input" value={fabric.materialName || ""} onChange={e => onChange({ materialName: e.target.value })} placeholder={fabric.blindType === "roller" ? "Roller Blind" : fabric.blindType === "zebra" ? "Zebra Blind" : "Wooden Blind"} /></Field>
            <Field label="Height" hint={fabric.blindType === "wooden" ? "value + unit" : "height + 10 inches used"}>
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.lengthUnit || 'in'} value={fabric.lengthInch} onChange={e => onChange({ lengthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 90" />
                <select className="select" style={{ width: 76 }} value={fabric.lengthUnit || 'in'} onChange={e => onChange({ lengthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Width" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.widthUnit || 'in'} value={fabric.widthInch} onChange={e => onChange({ widthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 60" />
                <select className="select" style={{ width: 76 }} value={fabric.widthUnit || 'in'} onChange={e => onChange({ widthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Sq Ft" hint="auto-calculated, min 11"><UnitInput unit="sq ft" value={fabric.blindSqFt ?? ""} onChange={e => onChange({ blindSqFt: e.target.value })} inputMode="decimal" placeholder={Number(fc.blindSqFt || 0).toFixed(2)} /></Field>
            <Field label="Price / Sq Ft"><UnitInput unit="Rs" value={fabric.materialPrice} onChange={e => onChange({ materialPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 250" /></Field>
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select" value={fabric.gstCategory?.id || gstCategories.find(c=>c.id==="blind")?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>)}
                </select>
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Length" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.lengthUnit || 'in'} value={fabric.lengthInch} onChange={e => onChange({ lengthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 90" />
                <select className="select" style={{ width: 76 }} value={fabric.lengthUnit || 'in'} onChange={e => onChange({ lengthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Width" hint="value + unit">
              <div style={{ display: 'flex', gap: 8 }}>
                <UnitInput unit={fabric.widthUnit || 'in'} value={fabric.widthInch} onChange={e => onChange({ widthInch: e.target.value })} inputMode="decimal" placeholder="e.g. 60" />
                <select className="select" style={{ width: 76 }} value={fabric.widthUnit || 'in'} onChange={e => onChange({ widthUnit: e.target.value })}><option value="in">in</option><option value="ft">ft</option><option value="m">m</option></select>
              </div>
            </Field>
            <Field label="Panels" hint={fabric.isRomanBlind || room.isRomanBlind ? "auto: width ÷ 50, editable" : "auto: width ÷ 20, editable"}><UnitInput unit="pcs" value={fabric.panels ?? ""} onChange={e => onChange({ panels: e.target.value })} inputMode="decimal" placeholder={Number(fc.panels || 0).toFixed(2)} /></Field>
            {(fabric.isRomanBlind || room.isRomanBlind) && <Field label="Sq Ft" hint="auto from length × width"><UnitInput unit="sq ft" value={fabric.romanBlindSqFt ?? ""} onChange={e => onChange({ romanBlindSqFt: e.target.value })} inputMode="decimal" placeholder={Number(fc.romanBlindSqFt || 0).toFixed(2)} /></Field>}
            <Field label="Repeat">
              <select className="select" value={fabric.repeat || 'no'} onChange={e => onChange({ repeat: e.target.value, ...(e.target.value === 'no' ? { repeatCm: '' } : {}) })}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
            {fabric.repeat === 'yes' && <Field label="Repeat Size" hint="cm"><UnitInput unit="cm" value={fabric.repeatCm} onChange={e => onChange({ repeatCm: e.target.value })} inputMode="decimal" placeholder="e.g. 25" /></Field>}
            <Field label="Track Type">
              <select className="select" value={fabric.track?.id || ""} onChange={e => onChange({ track: (settings.tracks || []).find(t => t.id === e.target.value) || null })}>
                {(settings.tracks || []).map(t => <option key={t.id} value={t.id}>{t.label} (Rs.{t.ratePerFt}/ft)</option>)}
              </select>
            </Field>
            <Field label="Price / m"><UnitInput unit="Rs/m" value={fabric.materialPrice} onChange={e => onChange({ materialPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 350" /></Field>
            <Field label="Cloth" hint={`auto: ${fc.metersOfCloth.toFixed(2)} m`}><UnitInput unit="m" value={fabric.clothMeters ?? ""} onChange={e => onChange({ clothMeters: e.target.value })} inputMode="decimal" placeholder={fc.metersOfCloth.toFixed(2)} /></Field>
            <Field label="Stitching">
              <select className="select" value={fabric.stitching?.id || ""} onChange={e => onChange({ stitching: settings.stitchingTypes.find(s => s.id === e.target.value) })}>
                {settings.stitchingTypes.map(s => <option key={s.id} value={s.id}>{s.label} (Rs.{s.ratePerPanel}/panel)</option>)}
              </select>
            </Field>
            <Field label="Lining">
              <select className="select" value={fabric.lining?.id || ""} onChange={e => onChange({ lining: settings.linings.find(l => l.id === e.target.value) })}>
                {settings.linings.map(l => <option key={l.id} value={l.id}>{l.label} (Rs.{l.ratePerMeter}/m)</option>)}
              </select>
            </Field>
            <Field label="HSN Code"><input className="input" value={fabric.hsnCode || ""} onChange={e => onChange({ hsnCode: e.target.value })} placeholder="e.g. 6303" /></Field>
            {/* ── GST Category picker — only shown when "Apply GST" is enabled ── */}
            {showGstPicker && (
              <Field label="GST Category">
                <select className="select"
                  value={fabric.gstCategory?.id || gstCategories[0]?.id || ""}
                  onChange={e => onChange({ gstCategory: gstCategories.find(c => c.id === e.target.value) })}>
                  {gstCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.rate}%)</option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default FabricRow;