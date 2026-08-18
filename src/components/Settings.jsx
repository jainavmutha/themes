import React from "react";
import { Plus } from "lucide-react";
import { Box, Field } from "./ui.jsx";
export default function SettingsTab({
  settings,
  setSettings,

  handleAddStitch,
  handleStitchChange,
  handleDeleteStitch,

  handleAddLining,
  handleLiningChange,
  handleDeleteLining,

  handleAddTrack,
  handleTrackChange,
  handleDeleteTrack,

  handleAddGstCategory,
  handleGstCategoryChange,
  handleDeleteGstCategory,
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <Box title="General Rates">
                    <div className="grid-2">
                      <Field label="Default Track Rate / ft">
                        <input
                          className="input"
                          type="number"
                          value={settings.trackRatePerFt}
                          onChange={e => setSettings(s => ({ ...s, trackRatePerFt: Number(e.target.value) }))}
                        />
                      </Field>
                      <Field label="Installation Rate / pcs">
                        <input
                          className="input"
                          type="number"
                          value={settings.installationRatePerTrackFt}
                          onChange={e => setSettings(s => ({ ...s, installationRatePerTrackFt: Number(e.target.value) }))}
                        />
                      </Field>
                    </div>
                  </Box>
      
                  <Box title="Stitching Types">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(settings.stitchingTypes || []).map((item, idx) => (
                        <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                          <Field label="Label">
                            <input
                              className="input"
                              value={item.label}
                              onChange={e => handleStitchChange(idx, { label: e.target.value })}
                            />
                          </Field>
                          <Field label="Rate / Panel">
                            <input
                              className="input"
                              type="number"
                              value={item.ratePerPanel}
                              onChange={e => handleStitchChange(idx, { ratePerPanel: Number(e.target.value) })}
                            />
                          </Field>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteStitch(idx)}>
                            Delete
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-outline btn-sm" onClick={handleAddStitch}>
                        <Plus size={13} /> Add Stitching
                      </button>
                    </div>
                  </Box>
      
                  <Box title="Linings">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(settings.linings || []).map((item, idx) => (
                        <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                          <Field label="Label">
                            <input
                              className="input"
                              value={item.label}
                              onChange={e => handleLiningChange(idx, { label: e.target.value })}
                            />
                          </Field>
                          <Field label="Rate / Meter">
                            <input
                              className="input"
                              type="number"
                              value={item.ratePerMeter}
                              onChange={e => handleLiningChange(idx, { ratePerMeter: Number(e.target.value) })}
                            />
                          </Field>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLining(idx)}>
                            Delete
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-outline btn-sm" onClick={handleAddLining}>
                        <Plus size={13} /> Add Lining
                      </button>
                    </div>
                  </Box>
      
                  <Box title="Tracks">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(settings.tracks || []).map((item, idx) => (
                        <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                          <Field label="Label">
                            <input
                              className="input"
                              value={item.label}
                              onChange={e => handleTrackChange(idx, { label: e.target.value })}
                            />
                          </Field>
                          <Field label="Rate / ft">
                            <input
                              className="input"
                              type="number"
                              value={item.ratePerFt}
                              onChange={e => handleTrackChange(idx, { ratePerFt: Number(e.target.value) })}
                            />
                          </Field>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTrack(idx)}>
                            Delete
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-outline btn-sm" onClick={handleAddTrack}>
                        <Plus size={13} /> Add Track
                      </button>
                    </div>
                  </Box>
      
                  <Box title="GST Categories">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(settings.gstCategories || []).map((item, idx) => (
                        <div key={item.id || idx} className="grid-3" style={{ alignItems: "end" }}>
                          <Field label="Category Label">
                            <input
                              className="input"
                              value={item.label}
                              onChange={e => handleGstCategoryChange(idx, { label: e.target.value })}
                            />
                          </Field>
                          <Field label="GST Rate %">
                            <input
                              className="input"
                              type="number"
                              value={item.rate}
                              onChange={e => handleGstCategoryChange(idx, { rate: Number(e.target.value) })}
                            />
                          </Field>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGstCategory(idx)}>
                            Delete
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-outline btn-sm" onClick={handleAddGstCategory}>
                        <Plus size={13} /> Add GST Category
                      </button>
                    </div>
                  </Box>
    </div>
  );
}