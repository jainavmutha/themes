import React from "react";
import { Download, FileText, Plus } from "lucide-react";
import {
  getGoogleDriveFileId,
  normalizeImageUrl,
} from "../utils/images.js";

export default function HeroBar({
  quoteMeta,
  authUser,
  activeTab,
  logout,
  handleNewQuote,
  addRoom,
  onDownloadFullPdf,
  onGeneratePerforma,
  handleSaveQuote,
}) {
  return (
    <div className="hero-box">
      <div className="hero-brand">
        {quoteMeta.company.logoUrl && (
          <img
            src={normalizeImageUrl(quoteMeta.company.logoUrl)}
            alt="Logo"
            className="hero-logo"
            onError={(e) => {
              const id = getGoogleDriveFileId(
                quoteMeta.company.logoUrl
              );

              const fallback = id
                ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000`
                : quoteMeta.company.logoUrl;

              if (e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
          />
        )}

        <div>
          <h1 className="hero-title">
            Curtain Quotation
          </h1>
          <p className="hero-subtitle">
            Themes Furnishings & Decor
          </p>
        </div>
      </div>

      <div className="hero-actions">
        <span className="user-pill">
          Logged in as{" "}
          <span className="user-role">
            {authUser.role}
          </span>
        </span>

        <button
          className="btn btn-outline"
          onClick={logout}
        >
          Logout
        </button>

        {activeTab === "quote" && (
          <>
            <button
              onClick={handleNewQuote}
              className="btn btn-outline btn-sm"
            >
              <Plus size={15} />
              New Quote
            </button>

            <button
              onClick={addRoom}
              className="btn btn-primary btn-sm"
            >
              <Plus size={15} />
              Room
            </button>

            <button
              onClick={onDownloadFullPdf}
              className="btn btn-outline btn-sm"
            >
              <Download size={15} />
              Full PDF
            </button>

            <button
              onClick={onGeneratePerforma}
              className="btn btn-outline btn-sm"
            >
              <FileText size={15} />
              Performa
            </button>

            <button
              onClick={handleSaveQuote}
              className="btn btn-primary btn-sm"
            >
              Save
            </button>
          </>
        )}

        {(activeTab === "history" ||
          activeTab === "dashboard") && (
          <button
            onClick={handleNewQuote}
            className="btn btn-primary btn-sm"
          >
            <Plus size={15} />
            New Quote
          </button>
        )}
      </div>
    </div>
  );
}