import React, {
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  QUOTE_STATUSES,
} from "../constants/settings.js";

import {
  currency,
} from "../utils/formatting.js";

import {
  getQuoteEstimatedProfit,
} from "../utils/quoteHelpers.js";

import {
  StatusBadge,
} from "./ui.jsx";

function DashboardTab({ allQuotes }) {
  const canvasRefs = { monthly: useRef(null), status: useRef(null), topCustomers: useRef(null), roomDist: useRef(null) };
  const chartInstances = useRef({});
  const stats = useMemo(() => {
    const quotes = Object.values(allQuotes || {});
    const approvedQuotes = quotes.filter(q => (q?.status || "Draft") === "Approved");
    const approvedEstimatedProfit = approvedQuotes.reduce((sum, q) => sum + getQuoteEstimatedProfit(q), 0);
    const totalRevenue = approvedQuotes.reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0);
    const avgQuote = quotes.length ? quotes.reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0) / quotes.length : 0;
    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisMonthQuotes = quotes.filter(q => (q.updatedAt || '').slice(0, 7) === thisMonth);
    return {
      total: quotes.length,
      approved: approvedQuotes.length,
      approvedQuotesCount: approvedQuotes.length,
      approvedEstimatedProfit,
      totalRevenue,
      avgQuote,
      thisMonthQuotes: thisMonthQuotes.length,
    };
  }, [allQuotes]);
  const chartData = useMemo(() => {
    const quotes = Object.values(allQuotes || {});
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
    const monthlyRevenue = months.map(m => ({ label: new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), value: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).reduce((s, q) => s + (q.snapshot?.summary?.finalTotal || 0), 0), count: quotes.filter(q => (q.updatedAt || '').slice(0, 7) === m).length }));
    const statusCounts = QUOTE_STATUSES.reduce((acc, s) => { acc[s] = quotes.filter(q => (q.status || 'Draft') === s).length; return acc; }, {});
    const custMap = {};
    quotes.forEach(q => { const name = q.customer?.name || 'Unknown'; if (!custMap[name]) custMap[name] = 0; custMap[name] += q.snapshot?.summary?.finalTotal || 0; });
    const topCustomers = Object.entries(custMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const roomCounts = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    quotes.forEach(q => { const n = q.rooms?.length || 0; if (n <= 4) roomCounts[String(n)] = (roomCounts[String(n)] || 0) + 1; else roomCounts['5+'] = (roomCounts['5+'] || 0) + 1; });
    return { monthlyRevenue, statusCounts, topCustomers, roomCounts };
  }, [allQuotes]);
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    script.onload = () => renderCharts();
    document.head.appendChild(script);
    return () => { Object.values(chartInstances.current).forEach(c => { try { c.destroy(); } catch(e) {} }); chartInstances.current = {}; };
  }, []);
  useEffect(() => { if (window.Chart) renderCharts(); }, [chartData]);
  function renderCharts() {
    if (!window.Chart) return;
    const pink = '#E5097F', pinkLight = 'rgba(229,9,127,0.15)';
    const statusColors = { Draft: '#6B7280', Sent: '#3B82F6', Approved: '#10B981', Rejected: '#EF4444', Cancelled: '#F59E0B' };
    const makeChart = (key, config) => { if (chartInstances.current[key]) { try { chartInstances.current[key].destroy(); } catch(e) {} } const canvas = canvasRefs[key]?.current; if (!canvas) return; chartInstances.current[key] = new window.Chart(canvas, config); };
    makeChart('monthly', { type: 'bar', data: { labels: chartData.monthlyRevenue.map(m => m.label), datasets: [{ label: 'Revenue (Rs)', data: chartData.monthlyRevenue.map(m => m.value), backgroundColor: pinkLight, borderColor: pink, borderWidth: 2, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => 'Rs.' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) } } } } });
    makeChart('status', { type: 'doughnut', data: { labels: QUOTE_STATUSES, datasets: [{ data: QUOTE_STATUSES.map(s => chartData.statusCounts[s] || 0), backgroundColor: QUOTE_STATUSES.map(s => statusColors[s]), borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } } });
    makeChart('topCustomers', { type: 'bar', data: { labels: chartData.topCustomers.map(([name]) => name.length > 14 ? name.slice(0, 12) + '…' : name), datasets: [{ label: 'Total (Rs)', data: chartData.topCustomers.map(([, val]) => val), backgroundColor: pink, borderRadius: 6 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => 'Rs.' + new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) } } } } });
    makeChart('roomDist', { type: 'bar', data: { labels: Object.keys(chartData.roomCounts).map(k => `${k} room${k === '1' ? '' : 's'}`), datasets: [{ label: 'Quotes', data: Object.values(chartData.roomCounts), backgroundColor: ['#3B82F6','#10B981','#F59E0B',pink,'#8B5CF6'], borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 1 } } } } });
  }
  const noData = !allQuotes || Object.keys(allQuotes).length === 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="dash-kpi-grid">
        <div className="dash-kpi"><div className="dash-kpi-label">Total Quotes</div><div className="dash-kpi-value">{stats.total}</div></div>
        <div className="dash-kpi"><div className="dash-kpi-label">Approved</div><div className="dash-kpi-value" style={{ color: '#059669' }}>{stats.approved}</div></div>
        <div className="dash-kpi"><div className="dash-kpi-label">Approved Revenue</div><div className="dash-kpi-value">{currency(stats.totalRevenue)}</div></div>
        
        <div className="dash-kpi"><div className="dash-kpi-label">Avg Quote Value</div><div className="dash-kpi-value">{currency(stats.avgQuote)}</div><div className="dash-kpi-sub">across all quotes</div></div>
      </div>

      <div className="box" style={{ marginBottom: 16 }}>
  <div className="box-header">
    <h3>Estimated Profits</h3>
  </div>

  <div className="box-body">
    <div className="summary-inner">
      

      <div className="summary-list">
        <div className="summary-item">
          <span className="summary-name">Approved Quotations</span>
          <span className="summary-total">{stats.approvedQuotesCount}</span>
        </div>

        <div className="summary-item">
          <span className="summary-name">Estimated Profit</span>
          <span className="summary-total">{currency(stats.approvedEstimatedProfit)}</span>
        </div>
      </div>

      
    </div>
  </div>
</div>
      {noData ? <div className="empty-box">No saved quotes yet. Save some quotes to see your dashboard.</div> : (
        <>
          <div className="dash-charts-grid">
            <div className="dash-chart-card"><div className="dash-chart-title">Monthly Revenue (last 6 months)</div><canvas ref={canvasRefs.monthly} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Quote Status Distribution</div><canvas ref={canvasRefs.status} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Top Customers by Quote Value</div><canvas ref={canvasRefs.topCustomers} height="200"></canvas></div>
            <div className="dash-chart-card"><div className="dash-chart-title">Quotes by Room Count</div><canvas ref={canvasRefs.roomDist} height="200"></canvas></div>
          </div>
          <div className="box">
            <div className="box-header"><h3>Recent Activity</h3></div>
            <div className="box-body">
              <table className="history-table">
                <thead><tr><th>Quote No</th><th>Customer</th><th>Status</th><th>Value</th><th>Date</th></tr></thead>
                <tbody>
                  {Object.values(allQuotes || {}).slice(0, 8).map(rec => (
                    <tr key={rec.quoteNo}>
                      <td className="history-row-no">{rec.quoteNo}</td>
                      <td className="history-row-customer">{rec.customer?.name || '—'}</td>
                      <td><StatusBadge status={rec.status || 'Draft'} /></td>
                      <td className="history-row-total">{rec.snapshot?.summary?.finalTotal != null ? currency(rec.snapshot.summary.finalTotal) : '—'}</td>
                      <td className="history-row-date">{rec.updatedAt ? new Date(rec.updatedAt).toLocaleDateString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default DashboardTab;