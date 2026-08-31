import { jsPDF } from "jspdf";

import {
  DEFAULT_SIGNATURE_URL,
  createBrand,
} from "../constants/brand.js";

import {
  getUnitShortLabel,
} from "../constants/settings.js";

import {
  normalizeImageUrl,
  imageToDataURL,
  pdfColor,
} from "../utils/images.js";

import {
  numberWithCommas,
  safeFileNamePart,
  toNum,
} from "../utils/formatting.js";

import {
  computeFabricCost,
  computeRoomCost,
} from "../calculations/curtainCalculations.js";

import {
  computeAllTotals,
} from "../calculations/quoteTotals.js";

const BRAND = createBrand({
  normalizeImageUrl,
});

function pdfText(doc, text, x, y, options = {}) {
  const safeText = text == null ? '' : String(text);
  if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
  doc.text(safeText, x, y, { baseline: 'alphabetic', ...options });
}
function drawHeader(doc, m, meta, logoDataURL) {
  const pw = doc.internal.pageSize.getWidth();
  const y = m;
  doc.setFillColor(255,255,255); doc.setDrawColor(...pdfColor(BRAND.border)); doc.setLineWidth(0.5);
  doc.roundedRect(m, y, pw-2*m, 70, 6, 6, "S");
  doc.setFillColor(...pdfColor(BRAND.primary)); doc.rect(m, y, 5, 70, "F");
  if (logoDataURL) { try { doc.addImage(logoDataURL,'PNG',m+12,y+11,48,48); } catch(e) { try { doc.addImage(logoDataURL,'JPEG',m+12,y+11,48,48); } catch(_) {} } }
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, meta.company.pdfCompanyName || meta.company.name || BRAND.pdfCompanyName, m+68, y+24);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, meta.company.address, m+68, y+40);
  pdfText(doc, `Phone: ${meta.company.phone} | Email: ${meta.company.email}`, m+68, y+54);
  const rightX = pw-m-10;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, `Date: ${new Date().toLocaleDateString('en-IN')}`, rightX, y+18, {align:'right'});
  pdfText(doc, `Customer: ${meta.customerName||'N/A'}`, rightX, y+32, {align:'right'});
  pdfText(doc, `Phone: ${meta.customerPhone||'N/A'}`, rightX, y+46, {align:'right'});
  if (meta.quoteNo) { doc.setFont('helvetica','bold'); doc.setTextColor(...pdfColor(BRAND.primary)); pdfText(doc, `Quote No: ${meta.quoteNo}`, rightX, y+60, {align:'right'}); }
  return y+80;
}
function drawSectionHeader(doc, m, y, title) {
  const pw = doc.internal.pageSize.getWidth(), tw = pw-2*m;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, tw, 24, 4, 4, "FD");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, title, m+10, y+16);
  return y+30;
}
function drawGstBlock(doc, m, y, meta) {
  if (!meta.commercials.needGstBill) return y;
  const pw = doc.internal.pageSize.getWidth(), w = pw-2*m;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, w, 22, 4, 4, "FD");
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  pdfText(doc, "GST BILL DETAILS", m+6, y+14);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(17,24,39);
  pdfText(doc, `Customer GSTIN: ${meta.commercials.customerGstin || meta.commercials.gstin || 'N/A'}`, m+6, y+28);
if (meta.commercials.customerCompanyName)
  pdfText(doc, `Company: ${meta.commercials.customerCompanyName}`, m+6, y+40);
pdfText(doc, `Billing Address: ${meta.commercials.billingAddress || 'N/A'}`, m+6, y+(meta.commercials.customerCompanyName ? 52 : 40));
  return y+48;
}
function drawPaymentTermsBlock(doc, m, y) {
  const pw = doc.internal.pageSize.getWidth();
  const w = pw - 2 * m;
  const blockH = 76;
  doc.setFillColor(255, 250, 245);
  doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, w, blockH, 5, 5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, "PAYMENT TERMS", m + 8, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  const terms = [
    "50% advance payment is required to start order processing.",
    "Remaining 50% payment is due after installation.",
  ];
  terms.forEach((term, index) => {
    pdfText(doc, `• ${term}`, m + 10, y + 31 + index * 12);
  });
  return y + blockH + 12;
}
function getFabricDiscountPercent(fabric) {
  return Math.min(
    100,
    Math.max(0, toNum(fabric?.discountPercent))
  );
}

function getDiscountedFabricAmount(rawAmount, fabric, commercials) {
  if (commercials?.discountMode !== "linewise") {
    return rawAmount;
  }

  const discountPercent = getFabricDiscountPercent(fabric);
  return Math.max(
    0,
    rawAmount * (1 - discountPercent / 100)
  );
}

function buildFabricSummaryRows(rooms, settings) {
  const effectiveRooms = rooms.filter(r => r.include !== false);
  const map = new Map();
  effectiveRooms.forEach((room) => {
    const fabrics = room.fabrics && room.fabrics.length ? room.fabrics : [];
    fabrics.forEach((fab) => {
      const fc = computeFabricCost(room, fab);
      const key = `${(fab.materialName||'N/A').trim().toLowerCase()}__${Number(fab.materialPrice||0)}`;
      if (!map.has(key)) map.set(key, { label: fab.materialName||'N/A', qtyMeters: 0, rate: Number(fab.materialPrice||0), amount: 0, roomNames: [] });
      const row = map.get(key);
      row.qtyMeters += fc.metersOfCloth;
      row.amount += fc.clothCost;
      row.roomNames.push(`${room.name||'Room'} (${fab.label||'Fabric'})`);
    });
  });
  return Array.from(map.values()).map(r => ({ ...r, qtyMeters: Math.round(r.qtyMeters*100)/100, amount: Math.round(r.amount), roomNames: Array.from(new Set(r.roomNames)) }));
}
function drawGroupedSummarySection(doc, m, y, rooms, settings, commercials, miscellaneousCosts = [], mergeFabricsRoomWise = false) {
  const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), tw = pw-2*m;
  const ensureSpace = (h) => { if ((y+h) > (ph-24)) { doc.addPage(); y=m; } return y; };
  const rightText = (text, x, lineY) => { const s=String(text??''); doc.text(s, x-doc.getTextWidth(s), lineY); };
  const fabricRows = buildFabricSummaryRows(rooms, settings);
  const fabricTotal = Math.round(fabricRows.reduce((s,r)=>s+r.amount,0));
  const { discountType, discountValue } = commercials || {};
  const totalsForSummary = computeAllTotals(
    rooms,
    commercials,
    settings,
    miscellaneousCosts
  ).summary;
  const discountMode = totalsForSummary.discountMode || "same";
  const discountAmount = Math.round(totalsForSummary.discountAmount || 0);
  const netFabricTotal = Math.round(
    totalsForSummary.netFabricTotal ??
      Math.max(0, fabricTotal - discountAmount)
  );
  const hasDiscount = discountAmount > 0;
  const isLinewiseDiscount = discountMode === "linewise";
  const hasFabricCosts = fabricTotal > 0 || netFabricTotal > 0;
  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));
  const otherRows = [];
  { const smap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const isBlind=Boolean(fb.isRomanBlind||fb.romanBlindSqFt);const k=isBlind?`roman_blind_${fb.stitching?.id||'none'}`:(fb.stitching?.id||'none');if(!smap.has(k))smap.set(k,{label:isBlind?`Roman Blind - ${fb.stitching?.label||'Stitching'}`:`Stitching - ${fb.stitching?.label||'N/A'}`,qty:0,qtyUnit:isBlind?'sqft':'panels',rate:fb.stitching?.ratePerPanel||0,amount:0});const row=smap.get(k);row.qty+=isBlind?(fb.romanBlindSqFt||0):fb.panels;row.amount+=fb.stitchingCost;});}); smap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const lmap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{const k=fb.lining?.id||'none';if(!lmap.has(k))lmap.set(k,{label:`Lining - ${fb.lining?.label||'N/A'}`,qty:0,qtyUnit:'m',rate:fb.lining?.ratePerMeter||0,amount:0});const row=lmap.get(k);row.qty+=fb.metersOfCloth;row.amount+=fb.liningCost;});}); lmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const tmap=new Map(); roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{if(Math.round(fb.trackCost||0)<=0)return;const isBlind=Boolean(fb.isRomanBlind||fb.romanBlindSqFt);const k=isBlind?`roman_track_${fb.track?.id||'none'}`:(fb.track?.id||room.track?.id||'none');const rate=Number.isFinite(fb.track?.ratePerFt)?fb.track.ratePerFt:(Number.isFinite(room.track?.ratePerFt)?room.track.ratePerFt:(settings?.trackRatePerFt||0));if(!tmap.has(k))tmap.set(k,{label:isBlind?`Roman Track - ${fb.track?.label||'N/A'}`:`Track - ${fb.track?.label||room.track?.label||'N/A'}`,qty:0,qtyUnit:'ft',rate,amount:0});const row=tmap.get(k);row.qty += (fb.trackFeet || 0);row.amount+=fb.trackCost;});}); tmap.forEach(r=>{if(Math.round(r.amount)>0)otherRows.push(r);}); }
  { const ti=Math.round(roomCosts.reduce((s,x)=>s+x.cost.installationCost,0)),tq=roomCosts.reduce((s,x)=>s+(x.cost.usedInstallQty||0),0);if(ti>0)otherRows.push({label:'Installation',qty:tq,qtyUnit:'pcs',rate:settings?.installationRatePerTrackFt||0,amount:ti}); }
  (miscellaneousCosts || []).forEach((item) => {
    const name = String(item.name || '').trim();
    const rate = toNum(item.rate);
    const qty = toNum(item.quantity) || 1;
    const unit = item.unit || 'nos';
    const grossAmount = rate * qty;
    const discountPercent = Math.min(
      100,
      Math.max(0, toNum(item?.discountPercent))
    );
    const discountAmount = grossAmount * (discountPercent / 100);
    const amount = Math.max(0, grossAmount - discountAmount);

    if (name && Math.round(amount) > 0) {
      otherRows.push({
        label: name,
        qty,
        qtyUnit: unit,
        rate,
        grossAmount,
        discountPercent,
        discountAmount,
        amount,
        isMiscellaneous: true,
      });
    }
  });
  const netOtherCostsTotal = Math.round(otherRows.reduce((s, r) => s + r.amount, 0));
  const grossOtherCostsTotal = Math.round(
    otherRows.reduce(
      (sum, row) =>
        sum +
        (row.isMiscellaneous
          ? toNum(row.grossAmount)
          : toNum(row.amount)),
      0
    )
  );
  const miscDiscountTotal = Math.round(
    otherRows.reduce(
      (sum, row) =>
        sum +
        (row.isMiscellaneous
          ? toNum(row.discountAmount)
          : 0),
      0
    )
  );
  const headerH=22,baseRowH=22,lineH=11;
  const drawTableHeader=(startY,columns)=>{doc.setFillColor(...pdfColor(BRAND.header));doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,startY,tw,headerH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(80,80,80);columns.forEach(col=>{if(col.align==='right')rightText(col.title,col.x+col.w-8,startY+14);else pdfText(doc,col.title,col.x+8,startY+14);});columns.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+headerH));return startY+headerH;};
  const wrapText=(text,maxW)=>{const words=String(text??'').split(' '),lines=[];let cur='';words.forEach(word=>{const t=cur?`${cur} ${word}`:word;if(doc.getTextWidth(t)<=maxW)cur=t;else{if(cur)lines.push(cur);let w=word;while(doc.getTextWidth(w)>maxW&&w.length>4)w=w.slice(0,-2)+'...';cur=w;}});if(cur)lines.push(cur);return lines.length?lines:[''];};
  const drawDataRow=(startY,rowIdx,cells,colDefs)=>{let maxLines=1;const wc=cells.map((cell,i)=>{const l=wrapText(String(cell??''),colDefs[i].w-16);if(l.length>maxLines)maxLines=l.length;return l;});const rowH=Math.max(baseRowH,maxLines*lineH+8);doc.setFillColor(rowIdx%2===0?255:250,rowIdx%2===0?255:250,rowIdx%2===0?255:250);doc.rect(m,startY,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,startY,tw,rowH,'S');colDefs.slice(0,-1).forEach(col=>doc.line(col.x+col.w,startY,col.x+col.w,startY+rowH));doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(30,30,30);cells.forEach((_,i)=>{const col=colDefs[i];const lines=wc[i];const ty=startY+lineH;if(col.align==='right')lines.forEach((l,li)=>rightText(l,col.x+col.w-8,ty+li*lineH));else lines.forEach((l,li)=>pdfText(doc,l,col.x+8,ty+li*lineH));});return rowH;};
  if (hasFabricCosts) {
    y=ensureSpace(50); y=drawSectionHeader(doc,m,y,'SUMMARY');
  const colRoomW2 = isLinewiseDiscount ? 92 : 110;
  const colFabricW = isLinewiseDiscount ? 118 : 130;
  const colClothW = isLinewiseDiscount ? 62 : 70;
  const colRateW = isLinewiseDiscount ? 72 : 80;
  const colDiscountW = isLinewiseDiscount ? 58 : 0;
  const colAmountW = tw - colRoomW2 - colFabricW - colClothW - colRateW - colDiscountW;

  const colRoomX2 = m;
  const colFabricX = colRoomX2 + colRoomW2;
  const colClothX = colFabricX + colFabricW;
  const colRateX2 = colClothX + colClothW;
  const colDiscountX = colRateX2 + colRateW;
  const colAmountX2 = colDiscountX + colDiscountW;

  const roomFabricColDefs = [
    { title: 'Room', x: colRoomX2, w: colRoomW2, align: 'left' },
    { title: 'Fabric', x: colFabricX, w: colFabricW, align: 'left' },
    { title: 'Cloth (m)', x: colClothX, w: colClothW, align: 'right' },
    { title: 'Rate/m', x: colRateX2, w: colRateW, align: 'right' },
    ...(isLinewiseDiscount
      ? [{ title: 'Disc.', x: colDiscountX, w: colDiscountW, align: 'right' }]
      : []),
    { title: 'Amount', x: colAmountX2, w: colAmountW, align: 'right' },
  ];
  const totalFabricEntries=mergeFabricsRoomWise?effectiveRooms.length:effectiveRooms.reduce((s,r)=>s+Math.max(1,(r.fabrics||[]).length),0);
  y=ensureSpace(headerH+totalFabricEntries*baseRowH+60); y=drawTableHeader(y,roomFabricColDefs);
  let globalRowIdx=0;
  effectiveRooms.forEach((room)=>{
    const fabrics=room.fabrics&&room.fabrics.length?room.fabrics:[];
    if(!fabrics.length){const rowH=drawDataRow(y,globalRowIdx++,[room.name||'Room','—','—','—','—'],roomFabricColDefs);y+=rowH;return;}
    if(mergeFabricsRoomWise){
      const fabricCosts=fabrics.map((fab)=>({fab,fc:computeFabricCost(room,fab)}));
      const fabricLabel=fabricCosts.map(({fab})=>fab.label||'Fabric').join(' + ');
      const totalMeters=fabricCosts.reduce((sum,item)=>sum+Number(item.fc.metersOfCloth||0),0);
      const totalAmount = fabricCosts.reduce((sum, item) => sum + Number(item.fc.clothCost || 0), 0);
      const totalNetAmount = fabricCosts.reduce(
        (sum, item) =>
          sum +
          getDiscountedFabricAmount(
            Number(item.fc.clothCost || 0),
            item.fab,
            commercials
          ),
        0
      );
      const rates=Array.from(new Set(fabricCosts.map(({fab})=>Number(fab.materialPrice||0)).filter(rate=>rate>0)));
      const rateText=rates.length===1?`Rs.${numberWithCommas(rates[0])}`:'Mixed';
      const discountRates = Array.from(
        new Set(fabricCosts.map(({ fab }) => getFabricDiscountPercent(fab)))
      );
      const discountText = discountRates.length === 1 ? `${discountRates[0]}%` : 'Mixed';
      const rowCells = [
        room.name || 'Room',
        fabricLabel || 'Fabric',
        `${totalMeters.toFixed(2)} m`,
        rateText,
        ...(isLinewiseDiscount ? [discountText] : []),
        `Rs.${numberWithCommas(Math.round(totalAmount))}`,
      ];
      const rowH=drawDataRow(y,globalRowIdx++,rowCells,roomFabricColDefs);
      y+=rowH;
    } else {
      const fabRowHeights=fabrics.map((fab)=>{const fc=computeFabricCost(room,fab);const nameLines=wrapText(fab.materialName||'N/A',colFabricW-16);const roomLines=wrapText(room.name||'Room',colRoomW2-16);const maxL=Math.max(nameLines.length,roomLines.length,1);return Math.max(baseRowH,maxL*lineH+8);});
      const totalRoomH=fabRowHeights.reduce((s,h)=>s+h,0);
      const isAlt=globalRowIdx%2===0;
      const roomStartY=y;
      fabrics.forEach((fab,fi)=>{
        const fc=computeFabricCost(room,fab);const rowH=fabRowHeights[fi];const ry=y+fabRowHeights.slice(0,fi).reduce((s,h)=>s+h,0);
        doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colFabricX,ry,tw-colRoomW2,rowH,'S');[colClothX,colRateX2,...(isLinewiseDiscount?[colDiscountX]:[]),colAmountX2].forEach(x=>doc.line(x,ry,x,ry+rowH));
        doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(30,30,30);
        const nameText=fab.label||'Fabric';wrapText(nameText,colFabricW-16).forEach((l,li)=>pdfText(doc,l,colFabricX+8,ry+lineH+li*lineH));
        rightText(fab.isWallpaper?`${Number(fc.rollQty||0).toFixed(2)} rolls`:(fab.isMattress?`${Number(fc.mattressQty||0).toFixed(0)} nos`:(fc.blindType?`${Number(fc.blindSqFt||0).toFixed(2)} sq ft`:`${fc.metersOfCloth.toFixed(2)} m`)),colClothX+colClothW-8,ry+lineH);
        rightText(fab.isWallpaper?`Rs.${numberWithCommas(fc.rollPrice||0)}`:(fab.isMattress?`Rs.${numberWithCommas(fc.mattressPrice||0)}`:`Rs.${numberWithCommas(fc.blindType?fc.blindRate:(fab.materialPrice||0))}`),colRateX2+colRateW-8,ry+lineH);
        if (isLinewiseDiscount) {
          rightText(
            `${getFabricDiscountPercent(fab)}%`,
            colDiscountX + colDiscountW - 8,
            ry + lineH
          );
        }
        rightText(
          `Rs.${numberWithCommas(Math.round(Number(fc.clothCost || 0)))}`,
          colAmountX2 + colAmountW - 8,
          ry + lineH
        );
      });
      doc.setFillColor(isAlt?255:250,isAlt?255:250,isAlt?255:250);doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(colRoomX2,roomStartY,colRoomW2,totalRoomH,'S');doc.line(colFabricX,roomStartY,colFabricX,roomStartY+totalRoomH);
      doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);
      const roomLines=wrapText(room.name||'Room',colRoomW2-16);const roomTextHeight=roomLines.length*lineH;const roomTextStartY=roomStartY+(totalRoomH-roomTextHeight)/2+lineH-2;
      roomLines.forEach((l,li)=>{pdfText(doc,l,colRoomX2+colRoomW2/2,roomTextStartY+li*lineH,{align:'center'});});
      y+=totalRoomH;globalRowIdx++;
    }
  });
  {const rowH=baseRowH;doc.setFillColor(...pdfColor('#FFF7ED'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(30,30,30);pdfText(doc,'Sub-Total',m+8,y+14);rightText(`Rs.${numberWithCommas(fabricTotal)}`,m+tw-8,y+14);y+=rowH;}
  if(hasDiscount){const rowH=baseRowH;const dl=isLinewiseDiscount?'Linewise Fabric Discounts':(discountType==="percent"?`Discount (${Number(discountValue||0)}%)`:'Discount');doc.setFillColor(255,240,240);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(180,30,30);pdfText(doc,dl,m+8,y+14);rightText(`-Rs.${numberWithCommas(discountAmount)}`,m+tw-8,y+14);y+=rowH;doc.setFillColor(...pdfColor('#E8F5E9'));doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(20,100,40);pdfText(doc,'Net Fabric Total (after discount)',m+8,y+15);rightText(`Rs.${numberWithCommas(netFabricTotal)}`,m+tw-8,y+15);y+=rowH;}
  }
  if (hasFabricCosts) y += 12;
  y = ensureSpace(50);
  y = drawSectionHeader(doc, m, y, hasFabricCosts ? 'OTHER COSTS' : 'COSTS');
  const hasMiscDiscount = otherRows.some(
    row => row.isMiscellaneous && toNum(row.discountPercent) > 0
  );
  const ocColQty = 72;
  const ocColRate = 82;
  const ocColDiscount = hasMiscDiscount ? 64 : 0;
  const ocColAmount = 90;
  const ocColDesc = tw - ocColQty - ocColRate - ocColDiscount - ocColAmount;
  const ocDescX = m;
  const ocQtyX = ocDescX + ocColDesc;
  const ocRateX = ocQtyX + ocColQty;
  const ocDiscountX = ocRateX + ocColRate;
  const ocAmountX = ocDiscountX + ocColDiscount;
  const otherColDefs = [
    { title: 'Description', x: ocDescX, w: ocColDesc, align: 'left' },
    { title: 'Qty', x: ocQtyX, w: ocColQty, align: 'right' },
    { title: 'Rate', x: ocRateX, w: ocColRate, align: 'right' },
    ...(hasMiscDiscount
      ? [{ title: 'Disc.', x: ocDiscountX, w: ocColDiscount, align: 'right' }]
      : []),
    { title: 'Amount', x: ocAmountX, w: ocColAmount, align: 'right' },
  ];
  y=ensureSpace(headerH+Math.max(1,otherRows.length)*baseRowH+baseRowH);y=drawTableHeader(y,otherColDefs);
  if(!otherRows.length){const rowH=baseRowH;doc.setFillColor(255,255,255);doc.rect(m,y,tw,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(m,y,tw,rowH,'S');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);pdfText(doc,'No additional costs',m+8,y+14);y+=rowH;}
  else{
    otherRows.forEach((row,idx)=>{
      const unitShort=getUnitShortLabel(row.qtyUnit);
      const qtyText =
        row.qtyUnit==='m' || row.qtyUnit==='sqft'
          ? `${Number(row.qty).toFixed(2)} ${unitShort}`
          : `${Math.round(row.qty)} ${unitShort}`;

      const rowH=drawDataRow(
        y,
        idx,
        [
          row.label,
          qtyText,
          `Rs.${numberWithCommas(row.rate)}/${unitShort}`,
          ...(hasMiscDiscount
            ? [row.isMiscellaneous && toNum(row.discountPercent) > 0 ? `${toNum(row.discountPercent)}%` : '']
            : []),
          `Rs.${numberWithCommas(Math.round(
            row.isMiscellaneous
              ? toNum(row.grossAmount)
              : toNum(row.amount)
          ))}`,
        ],
        otherColDefs
      );

      y+=rowH;
    });
  }
  {
    const rowH = baseRowH;
    doc.setFillColor(...pdfColor('#FFF7ED'));
    doc.rect(m, y, tw, rowH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid));
    doc.rect(m, y, tw, rowH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    pdfText(doc, hasFabricCosts ? 'Other Costs Total' : 'Costs Total', m + 8, y + 14);
    rightText(`Rs.${numberWithCommas(grossOtherCostsTotal)}`, m + tw - 8, y + 14);
    y += rowH;
  }
  if (miscDiscountTotal > 0) {
    const rowH = baseRowH;
    doc.setFillColor(255, 240, 240);
    doc.rect(m, y, tw, rowH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid));
    doc.rect(m, y, tw, rowH, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(180, 30, 30);
    pdfText(doc, 'Miscellaneous Discounts', m + 8, y + 14);
    rightText(`-Rs.${numberWithCommas(miscDiscountTotal)}`, m + tw - 8, y + 14);
    y += rowH;
  }
  if (miscDiscountTotal > 0) {
    const rowH = baseRowH;
    doc.setFillColor(...pdfColor('#E8F5E9'));
    doc.rect(m, y, tw, rowH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid));
    doc.rect(m, y, tw, rowH, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(20, 100, 40);
    pdfText(
      doc,
      hasFabricCosts ? 'Net Other Costs Total (after discount)' : 'Net Costs Total (after discount)',
      m + 8,
      y + 15
    );
    rightText(`Rs.${numberWithCommas(netOtherCostsTotal)}`, m + tw - 8, y + 15);
    y += rowH;
  }
  return y+6;
}

/* drawFinalSummaryPanel  — accepts gstBreakdown for per-category lines */
function drawFinalSummaryPanel(doc, m, y, meta, summary, sigDataURL) {
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight(),qrDataUrl=meta.company?.paymentQrUrl;
  const grossOtherTotal = Math.round(
    toNum(summary.otherTotal || 0) + toNum(summary.miscDiscountTotal || 0)
  );
  const roundedNetFabricTotal = Math.round(
    toNum(summary.netFabricTotal ?? summary.clothTotal)
  );
  const roundedOtherTotal = Math.round(toNum(summary.otherTotal));
  const roundedGstAmount = Math.round(toNum(summary.gstAmount));
  const roundedRoundOff = Math.round(toNum(summary.roundOff));
  const roundedFinalTotal = roundedNetFabricTotal + roundedOtherTotal + roundedGstAmount + roundedRoundOff;
  const hasFabricCosts = toNum(summary.netFabricTotal ?? summary.clothTotal) > 0;
  const costsLabel = hasFabricCosts ? 'Other Costs' : 'Costs';
  const sectionW=pw-2*m,gap=16,halfW=(sectionW-gap)/2,leftX=m,rightX=m+halfW+gap,qrSize=132;

  // Build summary lines
  const lines = [];

  if (hasFabricCosts) {
    lines.push({
      label: summary.discountAmount > 0
        ? (summary.discountMode === 'linewise'
          ? 'Net Fabric (linewise discounts)'
          : 'Net Fabric (after discount)')
        : 'Fabric Total',
      value: `Rs.${numberWithCommas(roundedNetFabricTotal)}`,
      bold: false,
      grandTotal: false,
    });
  }

  lines.push({
    label: toNum(summary.miscDiscountTotal) > 0
      ? `${costsLabel} (after discount)`
      : costsLabel,
    value: `Rs.${numberWithCommas(roundedOtherTotal)}`,
    bold: false,
    grandTotal: false,
  });

  // ── NEW: per-category GST lines ──
  const gstBreakdown = summary.gstBreakdown || [];
  if (meta.commercials.applyGst) {
    if (gstBreakdown.length > 0) {
      gstBreakdown.forEach(cat => {
        lines.push({
          label: `GST — ${cat.label} (${cat.rate}%)`,
          value: `Rs.${numberWithCommas(cat.amount)}`,
          bold: false,
          grandTotal: false,
          isGst: true,
        });
      });
    } else if (summary.gstAmount > 0) {
      // Fallback for old quotes with no breakdown
      lines.push({ label: `GST`, value: `Rs.${numberWithCommas(roundedGstAmount)}`, bold: false, grandTotal: false, isGst: true });
    }
  }

  if (roundedRoundOff !== 0) {
    lines.push({ label: "Round Off / Adjustment", value: `${roundedRoundOff > 0 ? "" : "-"}Rs.${numberWithCommas(Math.abs(roundedRoundOff))}`, bold: false, grandTotal: false });
  }
  lines.push({ label: 'GRAND TOTAL', value: `Rs.${numberWithCommas(roundedFinalTotal)}`, bold: true, grandTotal: true });

  const rowH=22,signatureH=62,blockH=Math.max(180,lines.length*rowH+signatureH+8);
  if(y+blockH>ph-24){y=Math.max(m,ph-blockH-24);}
  y=drawSectionHeader(doc,m,y,'GRAND TOTAL SUMMARY');
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.setLineWidth(0.5);doc.roundedRect(leftX,y,halfW,blockH,6,6,'S');
  doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc,'Scan to Pay',leftX+(halfW/2),y+18,{align:'center'});
  if(qrDataUrl){try{const qrBoxX=leftX+(halfW-qrSize)/2,qrBoxY=y+28;doc.roundedRect(qrBoxX,qrBoxY,qrSize,qrSize,6,6,'S');doc.addImage(qrDataUrl,'PNG',qrBoxX+4,qrBoxY+4,qrSize-8,qrSize-8);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.grid));doc.roundedRect(rightX,y,halfW,blockH,6,6,'S');
  const totalsStartY=y+8;
  lines.forEach((it,i)=>{const ry=totalsStartY+i*rowH;if(it.grandTotal){doc.setFillColor(...pdfColor(BRAND.primary));doc.rect(rightX,ry,halfW,rowH+4,'F');doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(255,255,255);pdfText(doc,it.label,rightX+8,ry+15);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}else{if(it.isGst){doc.setFillColor(240,253,244);}else if(i%2===0){doc.setFillColor(255,255,255);}else{doc.setFillColor(250,250,250);}doc.rect(rightX,ry,halfW,rowH,'F');doc.setDrawColor(...pdfColor(BRAND.grid));doc.rect(rightX,ry,halfW,rowH,'S');doc.setFont('helvetica',it.bold?'bold':'normal');doc.setFontSize(it.isGst?8.5:10);doc.setTextColor(it.isDiscount?180:(it.isGst?5:50),it.isDiscount?30:(it.isGst?100:50),it.isDiscount?30:(it.isGst?60:50));pdfText(doc,it.label,rightX+8,ry+15);doc.setTextColor(30,30,30);pdfText(doc,it.value,rightX+halfW-8,ry+15,{align:'right'});}});
  const sigTopY=y+blockH-signatureH+2;
  if(sigDataURL){try{doc.addImage(sigDataURL,'PNG',rightX+4,sigTopY,120,32);}catch(e){}}
  doc.setDrawColor(...pdfColor(BRAND.primary));doc.setLineWidth(0.8);doc.line(rightX+4,sigTopY+34,rightX+halfW-4,sigTopY+34);
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);
  pdfText(doc,meta.commercials.signatoryName||'Authorized Signatory',rightX+4,sigTopY+46);
  doc.setFont('helvetica','italic');
  pdfText(doc,meta.commercials.signatoryTitle||`For ${meta.company.pdfCompanyName||meta.company.name||'Themes Furnishings & Decor'}`,rightX+4,sigTopY+58);
  return y+blockH;
}

function estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts = []) {
  const effectiveRooms = rooms.filter(r=>r.include!==false);
  const totalFabricEntries = effectiveRooms.reduce((s,r)=>s+Math.max(1,(r.fabrics||[]).length),0);
  const roomCosts = effectiveRooms.map(r=>({room:r,cost:computeRoomCost(r,settings)}));
  const stitchKeys=new Set(),liningKeys=new Set(),trackKeys=new Set();let hasInstall=false;
  roomCosts.forEach(({room,cost})=>{cost.fabricBreakdowns.forEach(fb=>{if(Math.round(fb.stitchingCost||0)>0)stitchKeys.add(fb.stitching?.id||'none');if(Math.round(fb.liningCost||0)>0)liningKeys.add(fb.lining?.id||'none');});if(Math.round(cost.trackCost||0)>0)trackKeys.add(room.track?.id||'none');if(Math.round(cost.installationCost||0)>0)hasInstall=true;});
  const miscRowCount=(miscellaneousCosts||[]).filter(item=>String(item.name||'').trim()&&Math.round(toNum(item.rate)*(toNum(item.quantity)||1))>0).length;
  const otherRowCount=Math.max(1,stitchKeys.size+liningKeys.size+trackKeys.size+(hasInstall?1:0)+miscRowCount);
  const {discountType,discountValue}=meta?.commercials||{};
  const hasDiscount=discountType==="percent"?Number(discountValue||0)>0:Math.round(discountValue||0)>0;
  // Extra space for per-category GST lines
  const gstLineCount = meta?.commercials?.applyGst ? (settings?.gstCategories?.length || 3) : 0;
  return Math.max(842,Math.ceil(116+(meta?.commercials?.needGstBill?52:0)+34+30+22+totalFabricEntries*26+24+(hasDiscount?48:0)+42+22+otherRowCount*24+24+96+(220+gstLineCount*22)+28));
}

export async function generateFullPDF(rooms, meta, settings, miscellaneousCosts = [], mergeFabricsRoomWise = false) {
  const logoDataURL = await imageToDataURL(meta.company.logoUrl);
  const paymentQrDataURL = await imageToDataURL(meta.company.paymentQrUrl);
  const sigDataURL = await imageToDataURL(meta.commercials.signatureUrl);
  if (paymentQrDataURL) meta = { ...meta, company: { ...meta.company, paymentQrUrl: paymentQrDataURL } };
  const m = 36, pageWidth = 595.28;
  const pageHeight = estimateFullPdfHeight(rooms, meta, settings, miscellaneousCosts);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });
  let y = drawHeader(doc, m, meta, logoDataURL);
  y = drawGstBlock(doc, m, y, meta);
  y = drawSectionHeader(doc, m, y, meta.quoteNo ? `QUOTATION - ${meta.quoteNo}` : 'QUOTATION');
  const all = computeAllTotals(rooms, meta.commercials, settings, miscellaneousCosts);
  const miscDiscountTotal = Math.round(
    (miscellaneousCosts || []).reduce((sum, item) => {
      const grossAmount = toNum(item.rate) * (toNum(item.quantity) || 1);
      const discountPercent = Math.min(100, Math.max(0, toNum(item?.discountPercent)));
      return sum + grossAmount * (discountPercent / 100);
    }, 0)
  );
  all.summary.miscDiscountTotal = miscDiscountTotal;
  y = drawGroupedSummarySection(doc, m, y, rooms, settings, meta.commercials, miscellaneousCosts, mergeFabricsRoomWise);
  y = drawPaymentTermsBlock(doc, m, y);
  drawFinalSummaryPanel(doc, m, y, meta, all.summary, sigDataURL);
  return doc;
}

export async function generateCombinedPDF(quotes, settings) {
  const allRooms = [];
  const quoteSnapshots = [];
  for (const quote of quotes) {
    const rooms = (quote.rooms || []).filter(r => r.include !== false);
    const commercials = quote.commercials || {};
    const misc = quote.miscellaneousCosts || [];
    const allTotals = computeAllTotals(rooms, commercials, settings, misc);
    quoteSnapshots.push({ quoteNo: quote.quoteNo, customer: quote.customer, commercials, misc, rooms, summary: allTotals.summary });
    rooms.forEach(r => allRooms.push({ ...r, _sourceQuote: quote.quoteNo }));
  }
  const firstQuote = quotes[0];
  const logoDataURL = await imageToDataURL(firstQuote.company?.logoUrl || BRAND.logoUrl);
  const paymentQrDataURL = await imageToDataURL(firstQuote.company?.paymentQrUrl || BRAND.paymentQrUrl);
  const sigDataURL = await imageToDataURL(firstQuote.commercials?.signatureUrl || normalizeImageUrl(DEFAULT_SIGNATURE_URL));
  const combinedGrandTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.finalTotal || 0), 0);
  const combinedBaseTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.base || 0), 0);
  const combinedNetFabricTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.netFabricTotal ?? qs.summary?.clothTotal ?? 0), 0);
  const combinedOtherTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.otherTotal || 0), 0);
  const combinedGstTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.gstAmount || 0), 0);
  const combinedRoundOffTotal = quoteSnapshots.reduce((sum, qs) => sum + Number(qs.summary?.roundOff || 0), 0);
  const m = 36, pageWidth = 595.28, pageHeight = 842;
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });
  const meta = {
    quoteNo: '',
    customerName: firstQuote.customer?.name || 'Customer',
    customerPhone: firstQuote.customer?.phone || '',
    projectTitle: firstQuote.customer?.project || 'Combined Quotation',
    company: { ...BRAND, ...(firstQuote.company || {}), paymentQrUrl: paymentQrDataURL || BRAND.paymentQrUrl },
    commercials: { ...(firstQuote.commercials || {}), applyGst: combinedGstTotal > 0, gstRate: '', signatureUrl: sigDataURL },
  };
  let y = drawHeader(doc, m, meta, logoDataURL);
  y = drawSectionHeader(doc, m, y, `COMBINED QUOTATION — ${firstQuote.customer?.name || 'Customer'}`);
  const pw = doc.internal.pageSize.getWidth(), tw = pw - 2 * m;
  const rowH = 24;
  doc.setFillColor(...pdfColor(BRAND.header)); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  pdfText(doc, 'Quote No', m + 8, y + 16);
  pdfText(doc, 'Project / Customer', m + 120, y + 16);
  const rightText = (text, x, lineY) => { const s = String(text ?? ''); doc.text(s, x - doc.getTextWidth(s), lineY); };
  rightText('Rooms', m + tw - 120, y + 16);
  rightText('Grand Total', m + tw - 8, y + 16);
  y += rowH;
  quoteSnapshots.forEach((qs, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
    doc.setFillColor(...bg); doc.rect(m, y, tw, rowH, 'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.primary));
    pdfText(doc, qs.quoteNo, m + 8, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    pdfText(doc, qs.customer?.project || qs.customer?.name || '—', m + 120, y + 16);
    doc.setFont('helvetica', 'bold');
    rightText(String(qs.rooms.length), m + tw - 120, y + 16);
    rightText(`Rs.${numberWithCommas(qs.summary.finalTotal)}`, m + tw - 8, y + 16);
    y += rowH;
  });
  doc.setFillColor(...pdfColor('#FFF7ED')); doc.rect(m, y, tw, rowH, 'F'); doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
  pdfText(doc, `${quotes.length} Quotes Combined`, m + 8, y + 16);
  rightText(`Rs.${numberWithCommas(combinedGrandTotal)}`, m + tw - 8, y + 16);
  y += rowH + 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'Each quotation is shown on a separate page after this summary for easier reading.', m + 8, y);
  y += 16;
  for (const qs of quoteSnapshots) {
    doc.addPage();
    const quoteMeta = { ...meta, quoteNo: qs.quoteNo, customerName: qs.customer?.name || meta.customerName || 'Customer', customerPhone: qs.customer?.phone || meta.customerPhone || '', projectTitle: qs.customer?.project || '', commercials: { ...meta.commercials, ...qs.commercials, signatureUrl: meta.commercials.signatureUrl } };
    y = drawHeader(doc, m, quoteMeta, logoDataURL);
    y = drawSectionHeader(doc, m, y, `QUOTE ${qs.quoteNo}${qs.customer?.project ? ` - ${qs.customer.project}` : ''}`);
    y = drawGroupedSummarySection(doc, m, y, qs.rooms, settings, qs.commercials, qs.misc, false);
  }
  doc.addPage();
  y = drawHeader(doc, m, meta, logoDataURL);
  y = drawSectionHeader(doc, m, y, 'COMBINED FINAL TOTAL & PAYMENT TERMS');
  y = drawPaymentTermsBlock(doc, m, y);
  drawFinalSummaryPanel(doc, m, y, meta, {
    netFabricTotal: combinedNetFabricTotal, clothTotal: combinedNetFabricTotal, otherTotal: combinedOtherTotal,
    base: combinedBaseTotal, discountAmount: 0, afterDiscount: combinedNetFabricTotal + combinedOtherTotal,
    gstAmount: combinedGstTotal, roundOff: combinedRoundOffTotal, finalTotal: combinedGrandTotal, gstBreakdown: [],
    miscDiscountTotal: quoteSnapshots.reduce((sum, qs) => sum + (qs.misc || []).reduce((s, item) => {
      const grossAmount = toNum(item.rate) * (toNum(item.quantity) || 1);
      const discountPercent = Math.min(100, Math.max(0, toNum(item?.discountPercent)));
      return s + grossAmount * (discountPercent / 100);
    }, 0), 0),
  }, sigDataURL);
  return doc;
}
/* =========================
   Performa Invoice PDF
   ========================= */
export async function generatePerformaInvoice(rooms, meta, settings, miscellaneousCosts = []) {
  const logoDataURL   = await imageToDataURL(meta.company.logoUrl);
  const paymentQrURL  = await imageToDataURL(meta.company.paymentQrUrl);
  const sigDataURL    = await imageToDataURL(meta.commercials.signatureUrl);
  if (paymentQrURL) meta = { ...meta, company: { ...meta.company, paymentQrUrl: paymentQrURL } };

  const m = 36, pageWidth = 595.28;
  const all   = computeAllTotals(rooms, meta.commercials, settings, miscellaneousCosts);
  const { summary } = all;

  /* ── dynamic height ── */
  const effectiveRooms   = rooms.filter(r => r.include !== false);
  const totalFabricLines = effectiveRooms.reduce((s, r) => s + Math.max(1, (r.fabrics || []).length), 0);
  const gstLineCount     = meta.commercials.applyGst ? (summary.gstBreakdown?.length || 1) : 0;
  const pageHeight = Math.max(842, 200 + totalFabricLines * 26 + gstLineCount * 22 + 420);
  const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: [pageWidth, pageHeight] });

  const pw = pageWidth, tw = pw - 2 * m;
  const rightText = (text, x, y) => { const s = String(text ?? ''); doc.text(s, x - doc.getTextWidth(s), y); };

  /* ── HEADER BAND ── */
  doc.setFillColor(...pdfColor(BRAND.primary));
  doc.rect(0, 0, pw, 8, 'F');

  /* company logo + name block */
  if (logoDataURL) {
    try { doc.addImage(logoDataURL, 'PNG', m, 18, 50, 50); } catch (_) {
      try { doc.addImage(logoDataURL, 'JPEG', m, 18, 50, 50); } catch (__) {}
    }
  }
  const nameX = m + 58;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, meta.company.pdfCompanyName || meta.company.name || BRAND.pdfCompanyName, nameX, 36);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, meta.company.address, nameX, 50);
  pdfText(doc, `Ph: ${meta.company.phone}  |  ${meta.company.email}`, nameX, 62);
  if (meta.company.gstin) pdfText(doc, meta.company.gstin, nameX, 74);

  /* PROFORMA INVOICE title on the right */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.setTextColor(...pdfColor(BRAND.primary));
  rightText('PROFORMA INVOICE', pw - m, 36);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  if (meta.quoteNo) rightText(`Ref: ${meta.quoteNo}`, pw - m, 52);
  rightText(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pw - m, 65);

  let y = 94;

  /* ── DIVIDER ── */
  doc.setDrawColor(...pdfColor(BRAND.border)); doc.setLineWidth(0.6);
  doc.line(m, y, pw - m, y); y += 10;

  /* ── BILL TO / SHIP TO / INVOICE META ── */
  const colW3 = tw / 3;
  doc.setFillColor(252, 248, 244);
  doc.roundedRect(m, y, tw, 68, 5, 5, 'F');
  doc.setDrawColor(...pdfColor(BRAND.border)); doc.roundedRect(m, y, tw, 68, 5, 5, 'S');

  /* Bill To */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'BILL TO', m + 10, y + 14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
  pdfText(doc, meta.customerName || 'Customer', m + 10, y + 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  let billToY = y + 40;
  if (meta.commercials.customerCompanyName) { pdfText(doc, meta.commercials.customerCompanyName, m + 10, billToY); billToY += 12; }
  if (meta.customerPhone) { pdfText(doc, `Ph: ${meta.customerPhone}`, m + 10, billToY); billToY += 12; }
  if (meta.commercials.applyGst && meta.commercials.customerGstin) { pdfText(doc, `GSTIN: ${meta.commercials.customerGstin}`, m + 10, billToY); billToY += 12; }
  if (meta.commercials.billingAddress) {
    const addrLines = meta.commercials.billingAddress.length > 45 ? [meta.commercials.billingAddress.slice(0, 45), meta.commercials.billingAddress.slice(45)] : [meta.commercials.billingAddress];
    addrLines.forEach(line => { pdfText(doc, line, m + 10, billToY); billToY += 11; });
  }

  /* Project */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'PROJECT', m + colW3 + 10, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  pdfText(doc, meta.projectTitle || 'Curtain Quotation', m + colW3 + 10, y + 28);

  /* Invoice details */
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...pdfColor(BRAND.muted));
  pdfText(doc, 'INVOICE DETAILS', m + colW3 * 2 + 10, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  pdfText(doc, `Proforma No: ${meta.quoteNo || '—'}`, m + colW3 * 2 + 10, y + 28);
  pdfText(doc, `Place of Supply: ${meta.commercials.place || 'Pune'}`, m + colW3 * 2 + 10, y + 42);
  if (meta.commercials.needGstBill) pdfText(doc, 'Type: GST Invoice', m + colW3 * 2 + 10, y + 56);

  y += 78;

  /* ── ITEMS TABLE ── */
  const colNo  = 24, colDesc = tw - 24 - 70 - 70 - 80 - 80, colHsn = 70, colQty = 70, colRate = 80, colAmt = 80;
  const xNo = m, xDesc = xNo + colNo, xHsn = xDesc + colDesc, xQty = xHsn + colHsn, xRate = xQty + colQty, xAmt = xRate + colRate;
  const hdrH = 22;

  doc.setFillColor(...pdfColor(BRAND.primary));
  doc.rect(m, y, tw, hdrH, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  pdfText(doc, '#', xNo + 4, y + 15);
  pdfText(doc, 'Description', xDesc + 6, y + 15);
  pdfText(doc, 'HSN', xHsn + 4, y + 15);
  rightText('Qty', xQty + colQty - 6, y + 15);
  rightText('Rate', xRate + colRate - 6, y + 15);
  rightText('Amount', xAmt + colAmt - 6, y + 15);
  y += hdrH;

  /* Rows */
  let rowIdx = 0;
  const rowH = 22;
  const lineH = 11;

  effectiveRooms.forEach(room => {
    (room.fabrics || []).forEach(fab => {
      const fc = computeFabricCost(room, fab);
      const isAlt = rowIdx % 2 !== 0;
      doc.setFillColor(isAlt ? 250 : 255, isAlt ? 248 : 255, isAlt ? 248 : 255);
      doc.rect(m, y, tw, rowH, 'F');
      doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');

      /* vertical lines */
      [xDesc, xHsn, xQty, xRate, xAmt].forEach(x => doc.line(x, y, x, y + rowH));

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
      pdfText(doc, String(rowIdx + 1), xNo + 4, y + 15);

      /* description: room · fabric label · material name */
      const descStr = [room.name, fab.label, fab.materialName].filter(Boolean).join(' · ');
      const maxDescW = colDesc - 12;
      const descLines = [];
      let cur = '';
      descStr.split(' ').forEach(word => {
        const t = cur ? `${cur} ${word}` : word;
        if (doc.getTextWidth(t) <= maxDescW) cur = t;
        else { if (cur) descLines.push(cur); cur = word; }
      });
      if (cur) descLines.push(cur);
      descLines.slice(0, 2).forEach((l, li) => pdfText(doc, l, xDesc + 6, y + 15 + li * lineH));

      /* HSN (fabric / blind / wallpaper) */
      const hsnCode = fab.hsnCode || invoiceHsn || "-";
      pdfText(doc, hsnCode, xHsn + 4, y + 15);

      /* Qty */
      let qtyStr;
      if (fab.isWallpaper) qtyStr = `${Number(fc.rollQty || 0).toFixed(1)} rolls`;
      else if (fab.isMattress) qtyStr = `${Number(fc.mattressQty || 0).toFixed(0)} nos`;
      else if (fab.blindType) qtyStr = `${Number(fc.blindSqFt || 0).toFixed(1)} sq ft`;
      else qtyStr = `${fc.metersOfCloth.toFixed(2)} m`;
      rightText(qtyStr, xQty + colQty - 6, y + 15);

      /* Rate */
      const rateStr = fab.isWallpaper
        ? `Rs.${numberWithCommas(fc.rollPrice)}/roll`
        : fab.isMattress
          ? `Rs.${numberWithCommas(fc.mattressPrice)}/nos`
          : fab.blindType
            ? `Rs.${numberWithCommas(fc.blindRate)}/sqft`
            : `Rs.${numberWithCommas(fab.materialPrice || 0)}/m`;
      rightText(rateStr, xRate + colRate - 6, y + 15);

      /* Amount */
      rightText(`Rs.${numberWithCommas(Math.round(fc.clothCost))}`, xAmt + colAmt - 6, y + 15);
      y += rowH;
      rowIdx++;
    });
  });

  /* ── service rows (stitching, lining, track, installation, misc) ── */
  const roomCosts = effectiveRooms.map(r => ({ room: r, cost: computeRoomCost(r, settings) }));
  const serviceRows = [];
  { const sm = new Map(); roomCosts.forEach(({ cost }) => { cost.fabricBreakdowns.forEach(fb => { const k = fb.stitching?.id || 'none'; if (!sm.has(k)) sm.set(k, { desc: `Stitching — ${fb.stitching?.label || 'N/A'}`, qty: 0, unit: 'panels', rate: fb.stitching?.ratePerPanel || 0, amount: 0 }); const r = sm.get(k); r.qty += fb.panels; r.amount += fb.stitchingCost; }); }); sm.forEach(r => { if (Math.round(r.amount) > 0) serviceRows.push(r); }); }
  { const lm = new Map(); roomCosts.forEach(({ cost }) => { cost.fabricBreakdowns.forEach(fb => { const k = fb.lining?.id || 'none'; if (!lm.has(k)) lm.set(k, { desc: `Lining — ${fb.lining?.label || 'N/A'}`, qty: 0, unit: 'm', rate: fb.lining?.ratePerMeter || 0, amount: 0 }); const r = lm.get(k); r.qty += fb.metersOfCloth; r.amount += fb.liningCost; }); }); lm.forEach(r => { if (Math.round(r.amount) > 0) serviceRows.push(r); }); }
  { const tm = new Map(); roomCosts.forEach(({ cost }) => { cost.fabricBreakdowns.forEach(fb => { if (Math.round(fb.trackCost || 0) <= 0) return; const k = fb.track?.id || 'none'; if (!tm.has(k)) tm.set(k, { desc: `Track — ${fb.track?.label || 'N/A'}`, qty: 0, unit: 'ft', rate: fb.track?.ratePerFt || 0, amount: 0 }); const r = tm.get(k); r.qty += fb.trackFeet; r.amount += fb.trackCost; }); }); tm.forEach(r => { if (Math.round(r.amount) > 0) serviceRows.push(r); }); }
  const installTotal = Math.round(roomCosts.reduce((s, x) => s + x.cost.installationCost, 0));
  if (installTotal > 0) {
    const tq = roomCosts.reduce((s, x) => s + (x.cost.usedInstallQty || 0), 0);
    serviceRows.push({ desc: 'Installation', qty: tq, unit: 'pcs', rate: settings.installationRatePerTrackFt || 0, amount: installTotal });
  }
  (miscellaneousCosts || []).forEach(item => {
    const name = String(item.name || '').trim();
    const rate = toNum(item.rate);
    const qty = toNum(item.quantity) || 1;
    const grossAmount = rate * qty;
    const discountPercent = Math.min(
      100,
      Math.max(0, toNum(item?.discountPercent))
    );
    const discountAmount = grossAmount * (discountPercent / 100);
    const amount = Math.max(0, grossAmount - discountAmount);

    if (name && Math.round(amount) > 0) {
      serviceRows.push({
        desc: discountPercent > 0
          ? `${name} (Disc. ${discountPercent}%)`
          : name,
        qty,
        unit: item.unit || 'nos',
        rate,
        grossAmount,
        discountPercent,
        discountAmount,
        amount,
        isMiscellaneous: true,
      });
    }
  });
  const miscDiscountTotal = Math.round(
    serviceRows.reduce(
      (sum, row) =>
        sum +
        (row.isMiscellaneous
          ? toNum(row.discountAmount)
          : 0),
      0
    )
  );

  serviceRows.forEach(row => {
    const isAlt = rowIdx % 2 !== 0;
    doc.setFillColor(isAlt ? 250 : 255, isAlt ? 248 : 255, isAlt ? 248 : 255);
    doc.rect(m, y, tw, rowH, 'F');
    doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
    [xDesc, xHsn, xQty, xRate, xAmt].forEach(x => doc.line(x, y, x, y + rowH));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    pdfText(doc, String(rowIdx + 1), xNo + 4, y + 15);
    pdfText(doc, row.desc, xDesc + 6, y + 15);
    pdfText(doc, '9983', xHsn + 4, y + 15); /* service HSN */
    rightText(`${Number(row.qty).toFixed(row.unit === 'm' || row.unit === 'sq ft' ? 2 : 0)} ${getUnitShortLabel(row.unit)}`, xQty + colQty - 6, y + 15);
    rightText(`Rs.${numberWithCommas(row.rate)}`, xRate + colRate - 6, y + 15);
    rightText(`Rs.${numberWithCommas(Math.round(row.amount))}`, xAmt + colAmt - 6, y + 15);
    y += rowH; rowIdx++;
  });

  /* subtotal row */
  doc.setFillColor(...pdfColor('#FFF7ED')); doc.rect(m, y, tw, rowH, 'F');
  doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(m, y, tw, rowH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  pdfText(doc, 'Sub-total', xDesc + 6, y + 15);
  rightText(`Rs.${numberWithCommas(summary.netFabricTotal)}`, xAmt + colAmt - 6, y + 15);
  y += rowH;

  /* ── TOTALS PANEL + QR side by side ── */
  y += 12;
  const totalsW = 240, qrBlockW = 250, gap = 14;
  const totalsX  = pw - m - totalsW;
  const qrBlockX = totalsX - qrBlockW - gap;
  const paymentBlockH = 128;

  /* QR block */
  if (paymentQrURL) {
    const qrSize = 120;
    doc.setFillColor(255, 250, 245); doc.setDrawColor(...pdfColor(BRAND.border));
    doc.roundedRect(qrBlockX, y, qrBlockW, paymentBlockH, 6, 6, 'FD');

doc.setFont('helvetica', 'bold');

doc.setFontSize(8.5);

doc.setTextColor(...pdfColor(BRAND.primary));

pdfText(doc, 'Payment Details', qrBlockX + 10, y + 14);

doc.setFont('helvetica', 'normal');

doc.setFontSize(7.2);

doc.setTextColor(55, 55, 55);

const bankLines = [

  'Themes Furnishings & Decor',

  'HDFC BANK',

  'Pune Branch',

  'Boat Club Road',

  'Pune 411001',

  'A/c No. 50200047416320',

  'IFSC: HDFC0000039',

];

const bankX = qrBlockX + 10;

let bankY = y + 30;

bankLines.forEach(line => {

  pdfText(doc, line, bankX, bankY);

  bankY += 10;

});

const qrSizeSmall = 92;

const qrX = qrBlockX + qrBlockW - qrSizeSmall - 10;

const qrY = y + 24;

try {

  doc.addImage(paymentQrURL, 'PNG', qrX, qrY, qrSizeSmall, qrSizeSmall);

} catch (_) {}
  }

  /* totals box */
  const tLines = [];
  if (summary.discountAmount > 0) {
    tLines.push({ label: 'Sub-total', value: `Rs.${numberWithCommas(summary.clothTotal)}`, normal: true });
    tLines.push({ label: `Discount (${meta.commercials.discountType === 'percent' ? meta.commercials.discountValue + '%' : 'Fixed'})`, value: `-Rs.${numberWithCommas(summary.discountAmount)}`, red: true });
  }
  tLines.push({ label: 'Taxable Amount', value: `Rs.${numberWithCommas(summary.afterDiscount)}`, bold: true });
  if (miscDiscountTotal > 0) {
    tLines.push({
      label: 'Discount',
      value: `-Rs.${numberWithCommas(miscDiscountTotal)}`,
      red: true,
    });
  }

  /* per-category GST lines */
  const gstBreakdown = summary.gstBreakdown || [];
  if (meta.commercials.applyGst && gstBreakdown.length > 0) {
    gstBreakdown.forEach(cat => {
      tLines.push({ label: `GST — ${cat.label} (${cat.rate}%)`, value: `Rs.${numberWithCommas(cat.amount)}`, green: true });
    });
  } else if (meta.commercials.applyGst && summary.gstAmount > 0) {
    tLines.push({ label: 'GST', value: `Rs.${numberWithCommas(summary.gstAmount)}`, green: true });
  }
  if (Number(summary.roundOff || 0) !== 0) {
    tLines.push({ label: 'Round Off', value: `${Number(summary.roundOff) > 0 ? '+' : '-'}Rs.${numberWithCommas(Math.abs(summary.roundOff))}`, normal: true });
  }
  tLines.push({ label: 'GRAND TOTAL', value: `Rs.${numberWithCommas(summary.finalTotal)}`, grand: true });

  const tLineH = 22;
  const totalsH = tLines.length * tLineH;
  doc.setDrawColor(...pdfColor(BRAND.border)); doc.roundedRect(totalsX, y, totalsW, totalsH, 5, 5, 'S');
  tLines.forEach((line, i) => {
    const ry = y + i * tLineH;
    if (line.grand) {
      doc.setFillColor(...pdfColor(BRAND.primary)); doc.rect(totalsX, ry, totalsW, tLineH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 250);
      doc.rect(totalsX, ry, totalsW, tLineH, 'F');
      doc.setDrawColor(...pdfColor(BRAND.grid)); doc.rect(totalsX, ry, totalsW, tLineH, 'S');
      if (line.grand || line.bold) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); }
      else { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); }
      doc.setTextColor(line.red ? 180 : line.green ? 5 : 30, line.red ? 30 : line.green ? 100 : 30, line.red ? 30 : line.green ? 60 : 30);
    }
    pdfText(doc, line.label, totalsX + 8, ry + 15);
    if (line.grand) doc.setTextColor(255, 255, 255);
    rightText(line.value, totalsX + totalsW - 8, ry + 15);
  });
  y += totalsH + 16;

  /* ── DELIVERY TERMS ── */
  y += 12;

const deliveryH = 44;

doc.setFillColor(239, 246, 255);

doc.setDrawColor(191, 219, 254);

doc.roundedRect(m, y, tw, deliveryH, 4, 4, 'FD');

doc.setFont('helvetica', 'bold');

doc.setFontSize(8.5);

doc.setTextColor(29, 78, 216);

pdfText(doc, 'Delivery Terms', m + 8, y + 14);

doc.setFont('helvetica', 'normal');

doc.setFontSize(8);

doc.setTextColor(45, 45, 45);

const deliveryLines = doc.splitTextToSize(

  'Goods will be delivered within 7 working days from the date of order confirmation and advance payment.',

  tw - 16

);

doc.text(deliveryLines, m + 8, y + 28);

y += deliveryH + 10;
  /* ── GST BILL DETAILS block (if needed) ── */
  if (meta.commercials.needGstBill) {
    doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208);
    doc.roundedRect(m, y, tw, meta.commercials.customerCompanyName ? 58 : 44, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(6, 95, 70);
    pdfText(doc, 'GST INVOICE DETAILS', m + 8, y + 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
    pdfText(doc, `Customer GSTIN: ${meta.commercials.customerGstin || meta.commercials.gstin || 'N/A'}`, m + 8, y + 28);
if (meta.commercials.customerCompanyName)
  pdfText(doc, `Company: ${meta.commercials.customerCompanyName}`, m + 8, y + 40);
pdfText(doc, `Billing Address: ${meta.commercials.billingAddress || 'N/A'}`, m + 8, y + (meta.commercials.customerCompanyName ? 52 : 40));
    y += meta.commercials.customerCompanyName ? 68 : 54;
  }

  /* ── PAYMENT TERMS ── */
  doc.setFillColor(255, 250, 245); doc.setDrawColor(...pdfColor(BRAND.grid));
  doc.roundedRect(m, y, tw, 54, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...pdfColor(BRAND.primary));
  pdfText(doc, 'PAYMENT TERMS', m + 8, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
  pdfText(doc, '• 50% advance required to start order processing.', m + 10, y + 28);
  pdfText(doc, '• Balance 50% due before / at time of delivery & installation.', m + 10, y + 42);
  y += 64;

  /* ── SIGNATORY ── */
  const sigX = pw - m - 180;
  if (sigDataURL) { try { doc.addImage(sigDataURL, 'PNG', sigX, y, 120, 30); } catch (_) {} }
  doc.setDrawColor(...pdfColor(BRAND.primary)); doc.setLineWidth(0.8);
  doc.line(sigX, y + 34, pw - m, y + 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 80, 80);
  pdfText(doc, meta.commercials.signatoryName || 'Authorized Signatory', sigX, y + 46);
  doc.setFont('helvetica', 'italic');
  pdfText(doc, `For ${meta.company.pdfCompanyName || meta.company.name || BRAND.pdfCompanyName}`, sigX, y + 58);
  y += 70;

  /* ── FOOTER BAND ── */
  doc.setFillColor(...pdfColor(BRAND.primary)); doc.rect(0, y + 6, pw, 6, 'F');

  return doc;
}

/* tiny helper — number to words for Indian system */
function numberToWords(n) {
  n = Math.round(Number(n || 0));
  if (n === 0) return 'Zero Rupees';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function below100(x) { return x < 20 ? ones[x] : (tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '')); }
  function below1000(x) { return x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + below100(x % 100) : '') : below100(x); }
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  const parts = [];
  if (crore) parts.push(below100(crore) + ' Crore');
  if (lakh)  parts.push(below100(lakh)  + ' Lakh');
  if (thou)  parts.push(below1000(thou) + ' Thousand');
  if (n)     parts.push(below1000(n));
  return parts.join(' ') + ' Rupees';
}