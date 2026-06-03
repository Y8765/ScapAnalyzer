/**
 * OpenSCAP Report Exporter
 * Exports comparison results to CSV, Excel (XLSX), and standalone HTML
 */

const OpenSCAPExporter = (() => {

  // ─── CSV Export ───

  function exportCSV(comparison) {
    const reports = comparison.reports;
    const names = reports.map(r => r.metadata.target || r.filename);
    const headers = ['Category', 'Rule ID', 'Title', 'Severity', 'Passed Servers', 'Exceptions', 'Status'];

    const rows = [headers.map(h => csvEsc(h)).join(',')];
    const sorted = OpenSCAPComparator.filterMatrix(comparison, {});

    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      
      const passed = [];
      const failed = [];
      mRow.forEach((r, i) => {
        if (!r) failed.push(names[i] + ' (missing)');
        else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          if (norm === 'pass') passed.push(names[i]);
          else failed.push(names[i] + ' (' + r.result + ')');
        }
      });
      
      const cells = [
        csvEsc(info.groupTitle || 'Other'),
        csvEsc(ruleId), 
        csvEsc(info.title || ''), 
        info.severity,
        csvEsc(passed.join('\n')),
        csvEsc(failed.join('\n'))
      ];
      let status = 'Same';
      if (comparison.diffs.different.includes(ruleId)) status = 'Different';
      else if (comparison.diffs.partialOnly.includes(ruleId)) status = 'Partial';
      cells.push(status);
      rows.push(cells.join(','));
    });

    return rows.join('\n');
  }

  function csvEsc(str) {
    if (!str) return '""';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ─── Excel Export ───

  function exportExcel(comparison) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Cannot export to Excel.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const reports = comparison.reports;
    const names = reports.map(r => r.metadata.target || r.filename);

    // Styles
    const sHeader = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E293B" } }, alignment: { vertical: "center", horizontal: "center", wrapText: true } };
    const sWrap = { alignment: { vertical: "top", wrapText: true } };
    const sTitle = { font: { bold: true, sz: 16, color: { rgb: "1E293B" } }, alignment: { vertical: "center" } };
    const sLabel = { font: { bold: true, color: { rgb: "64748B" } } };
    const sValBlue = { font: { bold: true, sz: 14, color: { rgb: "6366F1" } } };
    const sValGreen = { font: { bold: true, sz: 14, color: { rgb: "10B981" } } };
    const sValRed = { font: { bold: true, sz: 14, color: { rgb: "EF4444" } } };
    const sValAmber = { font: { bold: true, sz: 14, color: { rgb: "F59E0B" } } };

    // Sheet 1: Summary Dashboard
    const summaryData = [
      [{ v: '🛡️ OpenSCAP Comparison Dashboard', s: sTitle }],
      [{ v: 'Generated: ' + new Date().toLocaleString(), s: { font: { color: { rgb: "94A3B8" } } } }],
      [],
      [
        { v: 'Reports Compared', s: sLabel },
        { v: 'Total Unique Rules', s: sLabel },
        { v: 'Differences', s: sLabel },
        { v: 'Exempted', s: sLabel },
        { v: 'All Pass', s: sLabel },
        { v: 'All Fail', s: sLabel }
      ],
      [
        { v: reports.length, s: sValBlue },
        { v: comparison.summary.totalUniqueRules, s: sValBlue },
        { v: comparison.summary.differentCount, s: sValAmber },
        { v: comparison.summary.anyExemptCount || comparison.summary.allExemptCount || 0, s: sValBlue },
        { v: comparison.summary.allPassCount, s: sValGreen },
        { v: comparison.summary.allFailCount, s: sValRed }
      ],
      [],
      ['Server', 'Profile', 'Score', 'Pass', 'Fail', 'Exempt', 'Error', 'Total Rules'].map(h => ({ v: h, s: sHeader }))
    ];

    comparison.summary.reportSummaries.forEach(rs => {
      summaryData.push([
        { v: rs.target || rs.filename, s: sWrap },
        { v: rs.profile || '', s: sWrap },
        { v: rs.compliancePercent.toFixed(1) + '%', s: { font: { bold: true }, alignment: { vertical: "top" } } },
        { v: rs.stats.pass, s: { font: { color: { rgb: "10B981" } }, alignment: { vertical: "top" } } },
        { v: rs.stats.fail, s: { font: { color: { rgb: "EF4444" } }, alignment: { vertical: "top" } } },
        { v: rs.stats.exempt || 0, s: { font: { color: { rgb: "6366F1" } }, alignment: { vertical: "top" } } },
        { v: rs.stats.error, s: sWrap },
        { v: rs.stats.total, s: sWrap }
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Dashboard');

    const allHeaders = ['Category', 'Rule ID', 'Title', 'Severity', 'Passed Servers', 'Exceptions', 'Status'].map(h => ({ v: h, s: sHeader }));
    const failHeaders = ['Category', 'Rule ID', 'Title', 'Severity', 'Passed Servers', 'Exceptions'].map(h => ({ v: h, s: sHeader }));

    // Function to generate styled rows
    function createRow(info, ruleId, passed, failed, status) {
      const row = [
        { v: info.groupTitle || 'Other', s: sWrap },
        { v: ruleId, s: sWrap },
        { v: info.title || '', s: sWrap },
        { v: info.severity, s: sWrap },
        { v: passed.join('\n'), s: sWrap },
        { v: failed.join('\n'), s: sWrap }
      ];
      if (status) row.push({ v: status, s: sWrap });
      return row;
    }

    // Sheet 2: All Rules
    const allRows = [allHeaders];
    const sorted = OpenSCAPComparator.filterMatrix(comparison, {});
    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      const passed = [];
      const failed = [];
      mRow.forEach((r, i) => {
        if (!r) failed.push(names[i] + ' (missing)');
        else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          if (norm === 'pass') passed.push(names[i]);
          else failed.push(names[i] + ' (' + r.result + ')');
        }
      });
      let status = 'Same';
      if (comparison.diffs.different.includes(ruleId)) status = 'Different';
      else if (comparison.diffs.partialOnly.includes(ruleId)) status = 'Partial';
      
      allRows.push(createRow(info, ruleId, passed, failed, status));
    });
    const ws2 = XLSX.utils.aoa_to_sheet(allRows);
    ws2['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 45 }, { wch: 12 }, { wch: 30 }, { wch: 35 }, { wch: 12 }];
    ws2['!autofilter'] = { ref: ws2['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws2, 'All Rules');

    // Sheet 3: Differences Only
    const diffRows = [allHeaders];
    comparison.diffs.different.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      const passed = [];
      const failed = [];
      mRow.forEach((r, i) => {
        if (!r) failed.push(names[i] + ' (missing)');
        else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          if (norm === 'pass') passed.push(names[i]);
          else failed.push(names[i] + ' (' + r.result + ')');
        }
      });
      diffRows.push(createRow(info, ruleId, passed, failed, 'Different'));
    });
    const ws3 = XLSX.utils.aoa_to_sheet(diffRows);
    ws3['!cols'] = ws2['!cols'];
    ws3['!autofilter'] = { ref: ws3['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws3, 'Differences');

    // Sheet 4: Failures
    const failRows = [failHeaders];
    [...comparison.diffs.allFail, ...comparison.diffs.different].forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      const hasAnyFail = mRow.some(r => r && OpenSCAPComparator.normalizeResult(r.result) === 'fail');
      if (!hasAnyFail) return;
      const passed = [];
      const failed = [];
      mRow.forEach((r, i) => {
        if (!r) failed.push(names[i] + ' (missing)');
        else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          if (norm === 'pass') passed.push(names[i]);
          else failed.push(names[i] + ' (' + r.result + ')');
        }
      });
      failRows.push(createRow(info, ruleId, passed, failed, null));
    });
    const ws4 = XLSX.utils.aoa_to_sheet(failRows);
    ws4['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 45 }, { wch: 12 }, { wch: 30 }, { wch: 35 }];
    ws4['!autofilter'] = { ref: ws4['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws4, 'Failures');

    // Sheet 5: Per-Host Matrix — one column per server, color-coded results
    const matrixColHeaders = [
      { v: 'Category', s: sHeader }, { v: 'Rule ID', s: sHeader },
      { v: 'Title', s: sHeader }, { v: 'Severity', s: sHeader },
      ...names.map(n => ({ v: n, s: sHeader }))
    ];
    const matrixRows = [matrixColHeaders];
    const resultStyle = (norm) => {
      const colors = { pass: '10B981', fail: 'EF4444', error: 'F59E0B', exempt: '60A5FA', na: '94A3B8' };
      const color = colors[norm] || '94A3B8';
      return { font: { color: { rgb: color }, bold: norm === 'fail' }, alignment: { vertical: 'top', horizontal: 'center' } };
    };
    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      const row = [
        { v: info.groupTitle || 'Other', s: sWrap },
        { v: ruleId, s: sWrap },
        { v: info.title || '', s: sWrap },
        { v: info.severity, s: sWrap },
      ];
      mRow.forEach(r => {
        if (!r) {
          row.push({ v: '—', s: resultStyle('na') });
        } else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          row.push({ v: r.result, s: resultStyle(norm) });
        }
      });
      matrixRows.push(row);
    });
    const ws5 = XLSX.utils.aoa_to_sheet(matrixRows);
    ws5['!cols'] = [{ wch: 25 }, { wch: 40 }, { wch: 40 }, { wch: 12 }, ...names.map(() => ({ wch: 14 }))];
    ws5['!autofilter'] = { ref: ws5['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws5, 'Host Matrix');

    // Download
    XLSX.writeFile(wb, 'openscap-comparison.xlsx');
  }

  // ─── Standalone Interactive HTML Report ───

  function exportHTML(comparison) {
    const reports = comparison.reports;
    const names = reports.map(r => r.metadata.target || r.filename);
    const sorted = OpenSCAPComparator.filterMatrix(comparison, {});
    const s = comparison.summary;
    const now = new Date().toLocaleString();

    // Build JSON data for client-side interactivity
    const rulesData = [];
    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const row = comparison.matrix.get(ruleId);
      
      const passed = [];
      const failed = [];
      row.forEach((r, i) => {
        if (!r) failed.push(names[i] + ' (missing)');
        else {
          const norm = OpenSCAPComparator.normalizeResult(r.result);
          if (norm === 'pass') passed.push(names[i]);
          else failed.push(names[i] + ' (' + r.result + ')');
        }
      });
      
      const isDiff = comparison.diffs.different.includes(ruleId);
      const isFail = row.some(r => r && OpenSCAPComparator.normalizeResult(r.result) === 'fail');
      const isPass = row.every(r => r && OpenSCAPComparator.normalizeResult(r.result) === 'pass');
      const isNA = row.every(r => r && OpenSCAPComparator.normalizeResult(r.result) === 'na');
      rulesData.push({
        id: ruleId, title: info.title || ruleId, severity: info.severity, category: info.groupTitle || 'Other',
        description: info.description || '', fixtext: info.fixtext || '',
        passed, failed, isDiff, isFail, isPass, isNA,
      });
    });

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenSCAP Comparison Report — ${esc(now)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.6; background: #f8fafc; }
  .header { background: linear-gradient(135deg, #1e293b, #334155); color: #fff; padding: 20px 28px; }
  .header h1 { font-size: 1.3rem; font-weight: 700; } .header .meta { color: #94a3b8; font-size: 0.8rem; margin-top: 4px; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px 24px; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .summary-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  .summary-card .num { font-size: 1.8rem; font-weight: 800; line-height: 1; }
  .summary-card .label { font-size: 0.72rem; color: #64748b; margin-top: 4px; }
  .c-indigo { color: #6366f1; } .c-amber { color: #f59e0b; } .c-red { color: #ef4444; } .c-green { color: #10b981; }
  .section { margin-bottom: 20px; }
  .section-header { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; padding: 10px 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; }
  .section-header:hover { background: #f1f5f9; }
  .section-header .toggle { transition: transform 0.2s; font-size: 0.8rem; color: #6366f1; }
  .section-header.collapsed .toggle { transform: rotate(-90deg); }
  .section-header h2 { font-size: 0.95rem; font-weight: 700; margin: 0; flex: 1; }
  .section-header .count { background: #e2e8f0; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; color: #475569; }
  .section-body { display: block; } .section-body.hidden { display: none; }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
  .filter-btn { padding: 5px 14px; border-radius: 20px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: 0.2s; font-family: inherit; }
  .filter-btn:hover { border-color: #6366f1; color: #6366f1; }
  .filter-btn.active { background: #6366f1; color: #fff; border-color: #6366f1; }
  .filter-btn.f-fail.active { background: #ef4444; border-color: #ef4444; }
  .filter-btn.f-pass.active { background: #10b981; border-color: #10b981; }
  .filter-btn.f-diff.active { background: #f59e0b; border-color: #f59e0b; }
  .search-box { padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.8rem; width: 220px; font-family: inherit; margin-left: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  thead th { position: sticky; top: 0; background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.3px; z-index: 5; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:hover td { background: #f8fafc; }
  tr.diff-row td { background: #fffbeb; } tr.diff-row:hover td { background: #fef3c7; }
  tr.rule-row { cursor: pointer; } tr.rule-row.expanded { background: #f0f9ff; }
  .rule-detail { display: none; } .rule-detail.show { display: table-row; }
  .rule-detail td { background: #f8fafc; padding: 14px 16px; border-left: 3px solid #6366f1; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .detail-grid h4 { font-size: 0.7rem; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .detail-grid p { font-size: 0.8rem; color: #475569; }
  .detail-grid pre { background: #e2e8f0; padding: 8px; border-radius: 4px; font-size: 0.72rem; white-space: pre-wrap; word-break: break-word; }
  .r-pass { color: #10b981; font-weight: 600; } .r-fail { color: #ef4444; font-weight: 700; } .r-error { color: #f59e0b; } .r-na { color: #94a3b8; }
  .sev-high { color: #ef4444; } .sev-medium { color: #f59e0b; } .sev-low { color: #3b82f6; }
  .srv-tbl th, .srv-tbl td { text-align: center; } .srv-tbl th:first-child, .srv-tbl td:first-child { text-align: left; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; }
  .b-pass { background: rgba(16,185,129,0.12); color: #059669; } .b-fail { background: rgba(239,68,68,0.12); color: #dc2626; }
  .b-high { background: rgba(239,68,68,0.1); color: #ef4444; } .b-medium { background: rgba(245,158,11,0.1); color: #d97706; } .b-low { background: rgba(59,130,246,0.1); color: #3b82f6; }
  .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 0.72rem; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { .filters, .search-box, .section-header .toggle { display: none; } .section-body.hidden { display: block !important; } body { background: #fff; } .header { background: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>🛡️ OpenSCAP Compliance Comparison Report</h1>
  <p class="meta">Generated: ${esc(now)} · ${s.totalReports} server${s.totalReports > 1 ? 's' : ''} compared</p>
</div>
<div class="container">

<div class="summary-grid">
  <div class="summary-card"><div class="num c-indigo">${s.totalUniqueRules}</div><div class="label">Total Rules</div></div>
  <div class="summary-card"><div class="num c-amber">${s.differentCount}</div><div class="label">Differences</div></div>
  <div class="summary-card"><div class="num c-red">${s.allFailCount}</div><div class="label">All Fail</div></div>
  <div class="summary-card"><div class="num c-green">${s.allPassCount}</div><div class="label">All Pass</div></div>
</div>

<div class="section">
  <div class="section-header" onclick="toggleSection(this)">
    <span class="toggle">▾</span><h2>Server Overview</h2>
  </div>
  <div class="section-body">
    <table class="srv-tbl"><thead><tr><th>Server</th><th>Profile</th><th>Score</th><th>Pass</th><th>Fail</th></tr></thead><tbody>`;

    s.reportSummaries.forEach(rs => {
      html += `<tr>
        <td><strong>${esc(rs.target || rs.filename)}</strong></td>
        <td>${esc(rs.profile || '—')}</td>
        <td><strong>${rs.compliancePercent.toFixed(1)}%</strong></td>
        <td class="r-pass">${rs.stats.pass}</td>
        <td class="r-fail">${rs.stats.fail}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div>

<div class="section">
  <div class="section-header" onclick="toggleSection(this)">
    <span class="toggle">▾</span><h2>Compliance Matrix</h2><span class="count">${sorted.length} rules</span>
  </div>
  <div class="section-body">
    <div class="filters">
      <button class="filter-btn active" onclick="filterRules('all',this)">All</button>
      <button class="filter-btn f-diff" onclick="filterRules('diff',this)">⚠ Differences</button>
      <button class="filter-btn f-fail" onclick="filterRules('fail',this)">✗ Failures</button>
      <button class="filter-btn f-pass" onclick="filterRules('pass',this)">✓ Pass</button>
      <button class="filter-btn" style="background:var(--error-bg);color:#d97706;border-color:#f59e0b" onclick="filterRules('remediation',this)">🔧 Remediation</button>
      <input class="search-box" placeholder="Search rules..." oninput="searchRules(this.value)">
    </div>
    <table id="rules-table"><thead><tr><th style="min-width:280px">Rule</th><th>Severity</th><th>Passed Servers</th><th>Exceptions</th><th>Status</th></tr></thead><tbody>`;

    rulesData.forEach((rule, idx) => {
      const isDiff = rule.isDiff;
      html += `<tr class="rule-row ${isDiff ? 'diff-row' : ''}" data-idx="${idx}" onclick="toggleDetail(${idx})">`;
      html += `<td><div style="font-size:0.7rem;color:#64748b;margin-bottom:2px">${esc(rule.category)}</div>${esc(rule.title)}</td>`;
      html += `<td><span class="badge b-${rule.severity}">${rule.severity}</span></td>`;
      
      html += `<td>`;
      if (rule.passed.length > 0) {
        html += rule.passed.map(s => `<div class="r-pass" style="white-space:nowrap;margin-bottom:2px">✓ ${esc(s)}</div>`).join('');
      } else {
        html += `<span class="r-na">—</span>`;
      }
      html += `</td><td>`;
      if (rule.failed.length > 0) {
        html += rule.failed.map(s => `<div class="r-fail" style="white-space:nowrap;margin-bottom:2px">✗ ${esc(s)}</div>`).join('');
      } else {
        html += `<span class="r-na">—</span>`;
      }
      html += `</td>`;
      
      html += `<td>${isDiff ? '<strong style="color:#d97706">Different</strong>' : 'Same'}</td></tr>`;

      // Expandable detail row
      html += `<tr class="rule-detail" id="detail-${idx}"><td colspan="5">
        <div class="detail-grid">
          <div>${rule.description ? `<h4>Description</h4><p>${esc(rule.description)}</p>` : ''}</div>
          <div>${rule.fixtext ? `<h4>Remediation</h4><pre>${esc(rule.fixtext)}</pre>` : ''}</div>
        </div>
        <p style="margin-top:8px;font-size:0.68rem;color:#94a3b8">ID: ${esc(rule.id)}</p>
      </td></tr>`;
    });

    html += `</tbody></table></div></div>

</div>
<div class="footer">Generated by OpenSCAP Report Comparator · ${esc(now)}</div>

<script>
const RULES = ${JSON.stringify(rulesData.map(r => ({ isDiff: r.isDiff, isFail: r.isFail, isPass: r.isPass, isNA: r.isNA, title: r.title })))};
let currentFilter = 'all';

function toggleSection(el) {
  el.classList.toggle('collapsed');
  el.nextElementSibling.classList.toggle('hidden');
}

function toggleDetail(idx) {
  const d = document.getElementById('detail-'+idx);
  d.classList.toggle('show');
}

function filterRules(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyVisibility();
}

function searchRules(q) {
  applyVisibility(q.toLowerCase());
}

function applyVisibility(searchQ) {
  const q = searchQ || document.querySelector('.search-box').value.toLowerCase();
  const rows = document.querySelectorAll('#rules-table tbody tr.rule-row');
  rows.forEach((row, i) => {
    const r = RULES[i];
    let show = true;
    if (currentFilter === 'diff' && !r.isDiff) show = false;
    if (currentFilter === 'fail' && !r.isFail) show = false;
    if (currentFilter === 'pass' && !r.isPass) show = false;
    if (currentFilter === 'remediation' && !r.isFail) show = false;
    if (q && !r.title.toLowerCase().includes(q)) show = false;
    row.style.display = show ? '' : 'none';
    
    // Handle detail row
    const detail = document.getElementById('detail-'+i);
    if (detail) {
      if (!show) { 
        detail.classList.remove('show'); 
        detail.style.display = 'none'; 
      } else { 
        detail.style.display = ''; 
        if (currentFilter === 'remediation') {
          detail.classList.add('show');
        } else {
          detail.classList.remove('show');
        }
      }
    }
  });
}
</script>
</body></html>`;

    return html;
  }

  // ─── Remediation Report (text, actionable) ───

  function exportRemediation(comparison) {
    const reports = comparison.reports;
    const s = comparison.summary;
    const now = new Date().toLocaleString();
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  OpenSCAP Remediation Report');
    lines.push('  Generated: ' + now);
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');

    // Per-host summary
    reports.forEach((r, i) => {
      const name = r.metadata.target || r.filename;
      const pct = r.stats.compliancePercent;
      lines.push(`HOST: ${name}`);
      lines.push(`  Score: ${pct.toFixed(1)}%`);
      lines.push(`  Profile: ${r.metadata.profileTitle || r.metadata.profileId || 'Unknown'}`);
      lines.push(`  Pass: ${r.stats.pass} | Fail: ${r.stats.fail} | Total: ${r.stats.total}`);
      lines.push('');
    });

    lines.push('───────────────────────────────────────────────────────');
    lines.push('');

    // Collect failed rules
    const sorted = OpenSCAPComparator.filterMatrix(comparison, {});
    let failCount = 0;

    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const row = comparison.matrix.get(ruleId);
      const hasAnyFail = row.some(r => r && OpenSCAPComparator.normalizeResult(r.result) === 'fail');
      if (!hasAnyFail) return;
      failCount++;

      const sevLabel = (info.severity || 'unknown').toUpperCase();
      lines.push(`${failCount}. [${sevLabel}] ${info.title || ruleId}`);
      lines.push(`   ID: ${ruleId}`);

      // Which hosts fail
      const failingHosts = [];
      row.forEach((r, idx) => {
        if (r && OpenSCAPComparator.normalizeResult(r.result) === 'fail') {
          failingHosts.push(reports[idx].metadata.target || reports[idx].filename);
        }
      });
      lines.push(`   Failed on: ${failingHosts.join(', ')}`);

      if (info.fixtext) {
        lines.push(`   Fix: ${info.fixtext.replace(/\n/g, '\n        ')}`);
      }
      lines.push('');
    });

    if (failCount === 0) {
      lines.push('  ✓ No failed rules found. All checks passed.');
    } else {
      lines.push('───────────────────────────────────────────────────────');
      lines.push(`Total failed rules requiring remediation: ${failCount}`);
    }

    return lines.join('\n');
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { exportCSV, exportExcel, exportHTML, exportRemediation, downloadFile };
})();
