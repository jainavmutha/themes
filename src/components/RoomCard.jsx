import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Copy,
  Plus,
  Trash2,
} from "lucide-react";

import { computeRoomCost } from "../calculations/curtainCalculations.js";
import { currency } from "../utils/formatting.js";
import { BlankFabric } from "../utils/factories.js";

import FabricRow from "./FabricRow.jsx";

import {
  Field,
  Pill,
  UnitInput,
} from "./ui.jsx";

/* =========================
   Room Card  — passes commercials down to FabricRow
   ========================= */
const RoomCard = React.memo(function RoomCard({ room, onClone, onDelete, updateRoom, settings, commercials }) {
  const [localRoom, setLocalRoom] = useState(room);
  const localRoomRef = useRef(localRoom);
  const cost = useMemo(() => computeRoomCost(localRoom, settings), [localRoom, settings]);
  useEffect(() => { localRoomRef.current = localRoom; }, [localRoom]);
  const syncToParent = useCallback(() => { updateRoom(room.id, { ...localRoomRef.current }); }, [room.id, updateRoom]);
  const handleChange = useCallback((field, value) => setLocalRoom(prev => ({ ...prev, [field]: value })), []);
  const debounceRef = useRef(null);
  const scheduleSync = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { syncToParent(); debounceRef.current = null; }, 250);
  }, [syncToParent]);
  const handleSelectChange = useCallback((patch) => { setLocalRoom(prev => ({ ...prev, ...patch })); scheduleSync(); }, [scheduleSync]);
  useEffect(() => { return () => { if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; } syncToParent(); }; }, [syncToParent]);
  const prevRoomJson = useRef(JSON.stringify(room));
  useEffect(() => { const newJson = JSON.stringify(room); if (newJson !== prevRoomJson.current) { setLocalRoom(room); prevRoomJson.current = newJson; } }, [room]);
  const handleFabricChange = useCallback((fabricId, patch) => { setLocalRoom(prev => ({ ...prev, fabrics: prev.fabrics.map(f => f.id === fabricId ? { ...f, ...patch } : f) })); scheduleSync(); }, [scheduleSync]);
  const handleAddFabric = useCallback(() => { setLocalRoom(prev => ({ ...prev, fabrics: [...prev.fabrics, BlankFabric(settings, prev.fabrics.length === 1 ? "Sheer" : `Fabric ${prev.fabrics.length + 1}`)] })); scheduleSync(); }, [settings, scheduleSync]);
  const handleRemoveFabric = useCallback((fabricId) => { setLocalRoom(prev => ({ ...prev, fabrics: prev.fabrics.filter(f => f.id !== fabricId) })); scheduleSync(); }, [scheduleSync]);
  return (
    <div className="box room-box">
      <div className="room-header">
        <input type="checkbox" checked={localRoom.include !== false} onChange={e => handleSelectChange({ include: e.target.checked })} style={{ transform: 'scale(1.2)', flexShrink: 0 }} />
        <input value={localRoom.name || ''} onChange={e => handleChange('name', e.target.value)} onBlur={syncToParent} onFocus={e => e.currentTarget.select()} className="room-title-input" placeholder="Room Name" />
        <div className="room-actions">
          <button className="btn-icon" onClick={() => onClone(room.id)} title="Duplicate"><Copy size={15} /></button>
          <button className="btn-icon text-danger" onClick={() => onDelete(room.id)} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="fabrics-section">
        <div className="fabrics-section-header">
          <span className="fabrics-section-title">Fabrics ({localRoom.fabrics?.length || 0})</span>
          <button className="btn btn-outline btn-sm" onClick={handleAddFabric} style={{ fontSize: 11 }}><Plus size={12} /> Add Fabric</button>
        </div>
        {(localRoom.fabrics || []).map(fabric => (
          <FabricRow
            key={fabric.id}
            fabric={fabric}
            room={localRoom}
            settings={settings}
            commercials={commercials}
            onChange={patch => handleFabricChange(fabric.id, patch)}
            onRemove={() => handleRemoveFabric(fabric.id)}
            canRemove={(localRoom.fabrics || []).length > 1}
          />
        ))}
      </div>
      <div className="room-dims-grid" style={{ paddingTop: 0 }}>
        <Field label="Installation">
          <select className="select" value={localRoom.needInstallation ? "yes" : "no"} onChange={e => { const yes = e.target.value === 'yes'; handleSelectChange({ needInstallation: yes, installQtyFt: yes ? localRoom.installQtyFt : "" }); }}>
            <option value="yes">Yes</option><option value="no">No</option>
          </select>
        </Field>
        {localRoom.needInstallation && <Field label="Install Qty" hint="pcs"><UnitInput value={localRoom.installQtyFt} onChange={e => handleChange("installQtyFt", e.target.value)} onBlur={syncToParent} inputMode="decimal" placeholder="e.g. 45" unit="pcs" /></Field>}
      </div>
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Cloth</div><div className="stat-value">{currency(cost.clothCost)}</div></div>
        <div className="stat"><div className="stat-label">{(cost.fabricBreakdowns || []).some(f => f.isRomanBlind) ? 'Blind Stitch' : 'Stitch'}</div><div className="stat-value">{currency(cost.stitchingCost)}</div></div>
        <div className="stat"><div className="stat-label">Lining</div><div className="stat-value">{currency(cost.liningCost)}</div></div>
        <div className="stat"><div className="stat-label">Track</div><div className="stat-value">{currency(cost.trackCost)}</div></div>
        <div className="stat"><div className="stat-label">Install</div><div className="stat-value">{currency(cost.installationCost)}</div></div>
      </div>
      <div className="room-footer">
        <div className="pills">
          <Pill>{(cost.fabricBreakdowns || []).some(f => f.isRomanBlind) ? `${Number((cost.fabricBreakdowns || []).reduce((s, f) => s + Number(f.romanBlindSqFt || 0), 0)).toFixed(2)} sq ft` : `${Number(cost.panels).toFixed(2)} panels`}</Pill>
          <Pill>{cost.totalMeters.toFixed(1)} m total</Pill>
          <Pill>{cost.trackFeet} ft</Pill>
          <Pill>{(localRoom.fabrics || []).length} fabric{(localRoom.fabrics || []).length !== 1 ? 's' : ''}</Pill>
        </div>
        <div className="total-group">
          <div className="total-amount" style={{ opacity: localRoom.include !== false ? 1 : 0.45 }}>{currency(cost.subtotal)}</div>
        </div>
      </div>
    </div>
  );
});

export default RoomCard;