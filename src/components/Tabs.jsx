import React from "react";
import {
  canAccessTab,
} from "../constants/auth.js";

export default function Tabs({
  authUser,
  activeTab,
  setActiveTab,
  currentQuoteStatus,
  currentSavedStatus,
  fpAllReceived,
  fpTotal,
  fpPending,
}) {
  const tabs = [
    ["quote", "Quote"],
    ["order-processing", "Order Processing"],
    ["fabric-processing", "Fabric Processing"],
    ["payments", "Payments"],
    ["history", "Saved Quotes"],
    ["dashboard", "Dashboard"],
    ["company", "Company"],
    ["settings", "Settings"],
  ];

  return (
    <div className="tabs-box">
      {tabs
        .filter(([id]) =>
          canAccessTab(authUser, id)
        )
        .map(([id, label]) => (
          <button
            key={id}
            className={`tab ${
              activeTab === id
                ? "tab-active"
                : ""
            }`}
            onClick={() =>
              setActiveTab(id)
            }
          >
            {id === "order-processing" &&
            (currentQuoteStatus === "Approved" ||
              currentSavedStatus ===
                "Approved") ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: "#10B981",
                    borderRadius: "50%",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {label}
              </span>
            ) : id ===
                "fabric-processing" &&
              fpAllReceived ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    background: "#059669",
                    borderRadius: "50%",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {label}
              </span>
            ) : id ===
                "fabric-processing" &&
              fpTotal > 0 ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    background:
                      fpPending > 0
                        ? "#F59E0B"
                        : "#3B82F6",
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent:
                      "center",
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 900,
                    color: "white",
                  }}
                >
                  {fpTotal}
                </span>

                {label}
              </span>
            ) : (
              label
            )}
          </button>
        ))}
    </div>
  );
}