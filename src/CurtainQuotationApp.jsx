import React, {
  useState,
  useCallback,
  useEffect,
} from "react";

import { createBrand } from "./constants/brand.js";


import { normalizeImageUrl } from "./utils/images.js";



import "./styles/app.css";



import {
  LS_AUTH_USER_KEY,
  canAccessTab,
} from "./constants/auth.js";

import AuthScreen from "./components/AuthScreen.jsx";
import OrderProcessingTab from "./components/OrderProcessing.jsx";
import FabricProcessingTab from "./components/FabricProcessing.jsx";
import PaymentsTab from "./components/Payments.jsx";
import DashboardTab from "./components/Dashboard.jsx";
import CompanyTab from "./components/Company.jsx";
import SettingsTab from "./components/Settings.jsx";
import SavedQuotes from "./components/SavedQuotes.jsx";
import HeroBar from "./components/HeroBar.jsx";
import Tabs from "./components/Tabs.jsx";
import QuoteEditor from "./components/QuoteEditor.jsx";

import {
  generateFullPDF,
  generateCombinedPDF,
  generatePerformaInvoice,
} from "./pdf/quotePdf.js";

import useSettingsManager from "./hooks/useSettingsManager.js";
import useAppStateStores from "./hooks/useAppStateStores.js";
import useQuoteManager from "./hooks/useQuoteManager.js";
import useQuotePdfActions from "./hooks/useQuotePdfActions.js";

const BRAND = createBrand({ normalizeImageUrl });

/* =========================
   Main App
   ========================= */
export default function CurtainQuotationApp() {
  const [authUser, setAuthUser] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_AUTH_USER_KEY) || "null"); } catch { return null; } });
  const {
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
  } = useSettingsManager();
  
  const {
  paymentsStore,
  setPaymentsStore,
  globalFabricItems,
  setGlobalFabricItems,
} = useAppStateStores();

  const logout = useCallback(() => { localStorage.removeItem(LS_AUTH_USER_KEY); setAuthUser(null); }, []);
  const [activeTab, setActiveTab] = useState("quote");

useEffect(() => {
  if (!authUser) return;

  if (!canAccessTab(authUser, activeTab)) {
    setActiveTab("quote");
  }
}, [authUser, activeTab]);

const {
  rooms,
  miscellaneousCosts,
  quoteNo,
  loadedBanner,
  setLoadedBanner,
  currentQuoteStatus,
  quoteMeta,
  setQuoteMeta,

  historySearch,
  setHistorySearch,
  historyStatusFilter,
  setHistoryStatusFilter,

  allQuotes,
  filteredQuotes,
  refreshQuoteList,

  loadQuoteRecord,
  handleUpdateQuoteStatus,
  handleSaveQuote,
  handleSaveOrderData,
  handleProcessToFabricProcessing,
  handleClearAllFabricProcessing,
  handleNewQuote,
  handleDeleteQuote,

  updateRoom,
  addRoomAfter,
  addRoom,
  cloneRoom,
  deleteRoom,
  liveGstBreakdown,
  grandTotal,
  totalClothCost,
  totalOther,
  miscTotal,
  finalTotals,
  handleAddMiscCost,
  handleMiscCostChange,
  handleDeleteMiscCost,
} = useQuoteManager({
  settings,
  brand: BRAND,
  setActiveTab,
  setGlobalFabricItems,
});


  const fpTotal = globalFabricItems.length;
  const fpReceived = globalFabricItems.filter(i => i.received).length;
  const fpPending = globalFabricItems.filter(i => i.ordered && !i.received).length;
  const fpAllReceived = fpTotal > 0 && fpReceived === fpTotal;


  const {
    handleDownloadFullPdf,
    handleGeneratePerforma,
  } = useQuotePdfActions({
    rooms,
    quoteMeta,
    quoteNo,
    settings,
    miscellaneousCosts,
    setLoadedBanner,
  });

  if (!authUser) {
    return <AuthScreen onLogin={setAuthUser} brand={BRAND} />;
  }
  return (
    <div className="app-container">
      <div className="app-inner">
        <HeroBar
  quoteMeta={quoteMeta}
  authUser={authUser}
  activeTab={activeTab}
  logout={logout}
  handleNewQuote={handleNewQuote}
  addRoom={addRoom}
  onDownloadFullPdf={
    handleDownloadFullPdf
  }
  onGeneratePerforma={
    handleGeneratePerforma
  }
  handleSaveQuote={
    handleSaveQuote
  }
/>

        <Tabs
  authUser={authUser}
  activeTab={activeTab}
  setActiveTab={setActiveTab}
  currentQuoteStatus={
    currentQuoteStatus
  }
  currentSavedStatus={
    allQuotes[quoteNo]?.status
  }
  fpAllReceived={
    fpAllReceived
  }
  fpTotal={fpTotal}
  fpPending={fpPending}
/>

{/* QUOTE TAB */}
{activeTab === "quote" && (
  <QuoteEditor
    loadedBanner={loadedBanner}
    quoteMeta={quoteMeta}
    setQuoteMeta={setQuoteMeta}
    quoteNo={quoteNo}
    currentQuoteStatus={currentQuoteStatus}
    allQuotes={allQuotes}
    setActiveTab={setActiveTab}
    rooms={rooms}
    cloneRoom={cloneRoom}
    deleteRoom={deleteRoom}
    updateRoom={updateRoom}
    settings={settings}
    addRoomAfter={addRoomAfter}
    miscellaneousCosts={miscellaneousCosts}
    handleMiscCostChange={handleMiscCostChange}
    handleDeleteMiscCost={handleDeleteMiscCost}
    handleAddMiscCost={handleAddMiscCost}
    miscTotal={miscTotal}
    totalClothCost={totalClothCost}
    totalOther={totalOther}
    finalTotals={finalTotals}
    liveGstBreakdown={liveGstBreakdown}
    grandTotal={grandTotal}
    handleSaveQuote={handleSaveQuote}
  />
)} 

        {/* ORDER PROCESSING TAB */}
        {activeTab === 'order-processing' && (
          <OrderProcessingTab
            rooms={rooms}
            quoteMeta={quoteMeta}
            quoteNo={quoteNo}
            currentQuoteStatus={currentQuoteStatus}
            allQuotes={allQuotes}
            onSaveOrderData={handleSaveOrderData}
            onProcessToFabricProcessing={handleProcessToFabricProcessing}
          />
        )}

        {/* FABRIC PROCESSING TAB */}
        {activeTab === 'fabric-processing' && (
          <FabricProcessingTab
            globalFabricItems={globalFabricItems}
            onUpdateGlobalItems={setGlobalFabricItems}
            onClearAll={handleClearAllFabricProcessing}
            allQuotes={allQuotes}
          />
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <PaymentsTab
            allQuotes={allQuotes}
            paymentsStore={paymentsStore}
            setPaymentsStore={setPaymentsStore}
            settings={settings}
            generateCombinedPDF={generateCombinedPDF}
          />
        )}

        {/* SAVED QUOTES TAB */}
        {activeTab === "history" && (
  <SavedQuotes
    filteredQuotes={filteredQuotes}
    historySearch={historySearch}
    setHistorySearch={setHistorySearch}
    historyStatusFilter={historyStatusFilter}
    setHistoryStatusFilter={setHistoryStatusFilter}
    refreshQuoteList={refreshQuoteList}
    handleUpdateQuoteStatus={handleUpdateQuoteStatus}
    loadQuoteRecord={loadQuoteRecord}
    handleDeleteQuote={handleDeleteQuote}
    quoteMeta={quoteMeta}
    settings={settings}
    generateFullPDF={generateFullPDF}
    generatePerformaInvoice={generatePerformaInvoice}
  />
)}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <DashboardTab allQuotes={allQuotes} />
        )}

        {/* COMPANY TAB */}
        {activeTab === "company" && (
  <CompanyTab
    quoteMeta={quoteMeta}
    setQuoteMeta={setQuoteMeta}
  />
)}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
  <SettingsTab
    settings={settings}
    setSettings={setSettings}

    handleAddStitch={handleAddStitch}
    handleStitchChange={handleStitchChange}
    handleDeleteStitch={handleDeleteStitch}

    handleAddLining={handleAddLining}
    handleLiningChange={handleLiningChange}
    handleDeleteLining={handleDeleteLining}

    handleAddTrack={handleAddTrack}
    handleTrackChange={handleTrackChange}
    handleDeleteTrack={handleDeleteTrack}

    handleAddGstCategory={handleAddGstCategory}
    handleGstCategoryChange={handleGstCategoryChange}
    handleDeleteGstCategory={handleDeleteGstCategory}
  />
)}
      </div>
    </div>
  );
}