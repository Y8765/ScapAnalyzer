/**
 * OpenSCAP Report Comparison UI
 * File manager, flat matrix, detail modal
 */

window.OpenSCAPUI = (() => {

  const RESULT_LABELS = {
    pass: 'Pass', fail: 'Fail', error: 'Error', unknown: '?',
    fixed: 'Fixed', informational: 'Info',
    notapplicable: 'N/A', notselected: 'N/S', notchecked: 'N/C',
    exempt: 'Exempt',
  };

  function scoreColor(pct) {
    if (pct >= 80) return 'var(--pass)';
    if (pct >= 50) return 'var(--error)';
    return 'var(--fail)';
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function trunc(s, n) { return s && s.length > n ? s.substring(0, n) + '…' : (s || ''); }

  // ═══ FILE MANAGER ═══

  function renderFileList(reports, container, duplicates, onRemove) {
    container.innerHTML = '';
    if (reports.length === 0) return;

    let html = `
      <table class="file-table">
        <thead>
          <tr>
            <th style="width:40px">Type</th>
            <th>Host / Profile</th>
            <th style="text-align:center">Score</th>
            <th style="width:30px"></th>
          </tr>
        </thead>
        <tbody>
    `;

    reports.forEach((report, idx) => {
      const pct = report.stats.compliancePercent;
      const srcCls = report.source === 'xml' ? 'file-type-xml' : 'file-type-html';
      const srcLabel = report.source === 'xml' ? 'XML' : 'HTML';
      const host = report.metadata.target || 'Unknown';
      const profile = trunc(report.metadata.profileTitle || report.metadata.profileId || 'No profile', 35);
      
      const dupOf = duplicates.find(d => d.idx1 === idx || d.idx2 === idx);

      html += `
        <tr ${dupOf ? 'title="Potential duplicate detected"' : ''}>
          <td><span class="file-type-badge ${srcCls}">${srcLabel}</span></td>
          <td>
            <span class="file-host-small">${esc(host)}</span>
            <span class="file-profile-small">${esc(profile)}</span>
            ${dupOf ? '<span style="color:var(--error);font-size:0.6rem;font-weight:600"> [!]</span>' : ''}
          </td>
          <td style="text-align:center">
            <span class="file-score-small" style="color:${scoreColor(pct)}">${pct.toFixed(0)}%</span>
          </td>
          <td style="text-align:right">
            <button class="file-remove-btn" data-idx="${idx}">✕</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.file-remove-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onRemove(parseInt(btn.dataset.idx));
      });
    });
  }

  // ═══ DUPLICATE DETECTION ═══

  function detectDuplicates(reports) {
    const pairs = [];
    for (let i = 0; i < reports.length; i++) {
      for (let j = i + 1; j < reports.length; j++) {
        const a = reports[i], b = reports[j];
        if (a.metadata.target && b.metadata.target &&
            a.metadata.target === b.metadata.target &&
            (a.metadata.profileId === b.metadata.profileId ||
             a.metadata.profileTitle === b.metadata.profileTitle)) {
          const totalA = a.stats.pass + a.stats.fail;
          const totalB = b.stats.pass + b.stats.fail;
          if (totalA > 0 && totalB > 0) {
            const passRatioA = a.stats.pass / totalA;
            const passRatioB = b.stats.pass / totalB;
            if (Math.abs(passRatioA - passRatioB) < 0.05) {
              pairs.push({
                idx1: i, idx2: j,
                confidence: a.stats.pass === b.stats.pass && a.stats.fail === b.stats.fail ? 'exact' : 'likely'
              });
            }
          }
        }
      }
    }
    return pairs;
  }

  // ═══ HOST SUMMARY ═══

  function renderHostSummary(reports, container) {
    container.innerHTML = '';
    if (reports.length < 2) return;

    const hostMap = new Map();
    reports.forEach((r, i) => {
      const host = r.metadata.target || 'Unknown';
      if (!hostMap.has(host)) hostMap.set(host, []);
      hostMap.get(host).push(i);
    });

    if (hostMap.size <= 1 && reports.length > 1) {
      container.innerHTML = `<div class="host-info host-warn">ℹ️ All ${reports.length} reports are from the same host: <strong>${esc([...hostMap.keys()][0])}</strong></div>`;
      return;
    }

    let html = `<div class="host-info">🖥 <strong>${hostMap.size}</strong> unique host${hostMap.size > 1 ? 's' : ''} across <strong>${reports.length}</strong> reports</div>`;
    container.innerHTML = html;
  }

  // ═══ GLOBAL STATS ═══

  function renderGlobalStats(comparison, container) {
    container.innerHTML = '';
    if (!comparison) return;
    const s = comparison.summary;
    const isSingleHost = comparison.reports.length === 1;

    const stats = [
      { cls: 'g-stat-rules', num: s.totalUniqueRules, label: 'Total Rules' },
    ];
    // Only show "Differences" if more than 1 host
    if (!isSingleHost) {
      stats.push({ cls: 'g-stat-diff', num: s.differentCount, label: 'Differences' });
    }
    stats.push(
      { cls: 'g-stat-exempt', num: s.anyExemptCount || s.allExemptCount || 0, label: 'Exempted' },
      { cls: 'g-stat-fail', num: s.allFailCount, label: 'Failed' },
      { cls: 'g-stat-pass', num: s.allPassCount, label: 'Passed' },
      { cls: 'g-stat-na', num: s.allNACount || 0, label: 'Non Relevant' },
    );

    stats.forEach(st => {
      const div = document.createElement('div');
      div.className = `g-stat ${st.cls}`;
      div.innerHTML = `<div class="g-num">${st.num}</div><div class="g-label">${st.label}</div>`;
      container.appendChild(div);
    });
  }

  function updateChipCounts(comparison) {
    if (!comparison) return;
    const s = comparison.summary;
    const isSingleHost = comparison.reports.length === 1;
    const el = id => document.getElementById(id);
    if (el('chip-all')) el('chip-all').textContent = s.totalUniqueRules;
    if (el('chip-diff')) {
      el('chip-diff').textContent = s.differentCount;
      // Hide differences chip if single host
      el('chip-diff').parentElement.style.display = isSingleHost ? 'none' : '';
    }
    if (el('chip-fail')) el('chip-fail').textContent = s.allFailCount;
    if (el('chip-exempt')) el('chip-exempt').textContent = s.anyExemptCount || s.allExemptCount || 0;
    if (el('chip-pass')) el('chip-pass').textContent = s.allPassCount;
    if (el('chip-na')) el('chip-na').textContent = s.allNACount || 0;
  }

  function renderMatrix(comparison, container, filteredRuleIds, useGrouping = true) {
    container.innerHTML = '';
    if (!comparison || filteredRuleIds.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No rules match your filters</h3></div>`;
      return;
    }

    const reports = comparison.reports;

    // Build host summary bar above the matrix
    const isCompact = reports.length >= 8;
    let hostBar = `<div class="host-bar${isCompact ? ' compact' : ''}">`;
    reports.forEach((r, i) => {
      const serverName = r.metadata.target || r.filename;
      const pct = r.stats.compliancePercent;
      const barColor = pct >= 80 ? 'var(--pass)' : pct >= 50 ? 'var(--error)' : 'var(--fail)';
      const hostInfo = comparison.hosts ? comparison.hosts[i] : null;
      const srcBadge = hostInfo && hostInfo.reports.length > 1
        ? `<span class="host-bar-src">${hostInfo.reports.length} sources merged</span>`
        : `<span class="host-bar-src">${r.sourceType}</span>`;

      hostBar += `<div class="host-bar-item" title="${esc(serverName)} — ${pct.toFixed(1)}% compliant">
        <div class="host-bar-name">🖥 ${esc(serverName)}</div>
        <div class="host-bar-score" style="color:${barColor}">${pct.toFixed(1)}%</div>
        <div class="host-bar-progress"><div class="host-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="host-bar-meta">${srcBadge} · ${r.stats.pass} pass · ${r.stats.fail} fail</div>
      </div>`;
    });
    hostBar += '</div>';

    let html = hostBar;
    html += '<table class="matrix-table"><thead><tr>';
    html += '<th class="sortable" data-sort="name">Rule <span class="sort-arrow" id="sort-name">▼</span></th>';
    html += '<th class="sortable" data-sort="severity">Sev <span class="sort-arrow" id="sort-sev">▼</span></th>';
    reports.forEach((r, i) => {
      const serverName = r.metadata.target || r.filename;
      html += `<th class="srv-col sortable" data-sort="host-${i}" title="${esc(serverName)}"><div class="srv-col-name">${esc(serverName)}</div></th>`;
    });
    html += '<th></th></tr></thead><tbody>';

    if (useGrouping) {
      // Group rules by original XML category
      const groups = new Map();
      filteredRuleIds.forEach(ruleId => {
        const info = comparison.ruleMap.get(ruleId);
        const group = info.groupTitle || 'Other';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(ruleId);
      });

      // Maintain order of original XML by using a Map's insertion order if possible,
      // but since filteredRuleIds is sorted, we group them as they appear.
      groups.forEach((ruleIds, groupName) => {
        let gPass = 0, gFail = 0, gMixed = 0;
        ruleIds.forEach(id => {
          const row = comparison.matrix.get(id);
          const present = row.filter(r => r !== null);
          if (present.length === 0) return;
          const types = new Set(present.map(r => OpenSCAPComparator.normalizeResult(r.result)));
          if (types.size > 1) gMixed++;
          else if (types.has('pass')) gPass++;
          else if (types.has('fail')) gFail++;
        });

        html += `<tr class="group-row" data-group="${esc(groupName)}">`;
        html += `<td colspan="${2 + reports.length}">`;
        html += `<span class="group-toggle">▾</span>`;
        html += `<span class="group-name">${esc(groupName)}</span>`;
        html += `<span class="group-count">${ruleIds.length} rules</span>`;
        html += `<span class="group-stats">`;
        if (gPass > 0) html += `<span class="gs-pass" title="Passing on all hosts">${gPass} Pass</span>`;
        if (gFail > 0) html += `<span class="gs-fail" title="Failing on all hosts">${gFail} Fail</span>`;
        if (gMixed > 0) html += `<span class="gs-mixed" title="Mixed results across hosts">${gMixed} Mixed</span>`;
        html += `</span></td></tr>`;

        ruleIds.forEach(ruleId => {
          html += renderRuleRow(ruleId, comparison, groupName);
        });
      });
    } else {
      // Flat list
      filteredRuleIds.forEach(ruleId => {
        html += renderRuleRow(ruleId, comparison, '');
      });
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function renderRuleRow(ruleId, comparison, groupName) {
    const info = comparison.ruleMap.get(ruleId);
    const row = comparison.matrix.get(ruleId);
    const isDiff = comparison.diffs.different.includes(ruleId);

    let rowStatus = '';
    const results = row.filter(r => r !== null).map(r => OpenSCAPComparator.normalizeResult(r.result));
    if (isDiff) {
      rowStatus = 'row-diff';
    } else if (results.length > 0) {
      if (results.every(r => r === 'fail')) rowStatus = 'row-fail';
      else if (results.every(r => r === 'na')) rowStatus = 'row-na';
    }

    const sevLabel = (info.severity || 'unknown').charAt(0).toUpperCase() + (info.severity || 'unknown').slice(1);

    let html = `<tr class="rule-row ${rowStatus}" data-rule="${esc(ruleId)}" data-group="${esc(groupName)}">`;
    html += `<td class="rule-cell"><span class="rule-title">${esc(info.title || ruleId)}</span></td>`;
    html += `<td class="sev-cell"><span class="sev-badge sev-${info.severity}">${esc(sevLabel)}</span></td>`;

    row.forEach((r, idx) => {
      if (r) {
        const norm = OpenSCAPComparator.normalizeResult(r.result);
        const serverName = comparison.reports[idx].metadata.target || comparison.reports[idx].filename;
        const isExempt = typeof ExemptionManager !== 'undefined' && ExemptionManager.getExemption(ruleId, serverName) !== null && (norm === 'fail' || norm === 'error' || norm === 'exempt');
        const cls = isExempt ? 'res-exempt' : norm === 'pass' ? 'res-pass' : norm === 'fail' ? 'res-fail' : norm === 'error' ? 'res-error' : 'res-na';
        const label = isExempt ? 'Exempt' : (RESULT_LABELS[r.result] || r.result);
        html += `<td class="res-cell"><span class="res-badge ${cls}">${label}</span></td>`;
      } else {
        html += `<td class="res-cell"><span class="res-badge res-missing">—</span></td>`;
      }
    });
    html += `<td style="width:40px;text-align:center"><button class="btn-icon btn-exempt-row" title="Manage Exemptions for this rule" data-rule="${esc(ruleId)}">🔕</button></td>`;
    html += '</tr>';
    return html;
  }

  function renderMatrixInfo(total, filtered, container) {
    container.innerHTML = `Showing ${filtered} of ${total} rules${filtered < total ? ' (filtered)' : ''}`;
  }

  // ═══ DETAIL MODAL ═══

  function renderRuleDetail(ruleId, comparison, container) {
    container.innerHTML = '';
    if (!ruleId || !comparison) return;
    const info = comparison.ruleMap.get(ruleId);
    const row = comparison.matrix.get(ruleId);
    if (!info) return;

    const sevLabel = (info.severity||'unknown').charAt(0).toUpperCase()+(info.severity||'unknown').slice(1);

    let html = `<h2>${esc(info.title || ruleId)}</h2>`;
    html += `<div class="detail-ruleid">${esc(ruleId)}</div>`;
    html += `<div style="margin-bottom:16px; display: flex; align-items: center; gap: 10px;">
      <span class="sev-badge sev-${info.severity}">${esc(sevLabel)}</span>
      <button class="modal-export btn-exempt-detail" style="position:relative;z-index:1000">🔕 Manage Exemption</button>
    </div>`;

    if (info.description) html += `<div class="detail-section"><h3>Description</h3><p>${esc(info.description)}</p></div>`;
    if (info.rationale) html += `<div class="detail-section"><h3>Rationale</h3><p>${esc(info.rationale)}</p></div>`;
    if (info.fixtext) html += `<div class="detail-section"><h3>Fix</h3><pre>${esc(info.fixtext)}</pre></div>`;

    html += `<div class="detail-section detail-results"><h3>Results by Server</h3>`;
    comparison.reports.forEach((report, idx) => {
      const r = row[idx];
      const serverName = report.metadata.target || report.filename;
      if (r) {
        const norm = OpenSCAPComparator.normalizeResult(r.result);
        html += `<div class="detail-srv-result">
          <div class="detail-srv-info"><span class="detail-srv-name">🖥 ${esc(serverName)}</span></div>
          <span class="detail-srv-badge ${norm}">${r.result}</span></div>`;
        if (r.messages?.length > 0) r.messages.forEach(m => { html += `<pre style="margin:4px 0 8px;font-size:0.72rem">${esc(m.text||m)}</pre>`; });
      } else {
        html += `<div class="detail-srv-result"><div class="detail-srv-info"><span class="detail-srv-name">🖥 ${esc(serverName)}</span></div><span class="detail-srv-badge na">Not present</span></div>`;
      }
    });
    html += `</div>`;
    container.innerHTML = html;

    // Add listener for the exemption button in detail modal
    const btn = container.querySelector('.btn-exempt-detail');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openExemptDialog(ruleId);
      });
    }
  }

  // ═══ EXEMPTIONS MODALS ═══

  let currentExemptRuleId = null;
  let currentComparison = null;
  let onExemptSaveCallback = null;

  function openExemptDialog(ruleId) {
    if (!currentComparison) return;
    const info = currentComparison.ruleMap.get(ruleId);
    if (!info) return;
    currentExemptRuleId = ruleId;
    document.getElementById('exempt-rule-title').textContent = info.title || ruleId;
    document.getElementById('exempt-rule-id').textContent = ruleId;
    const serversList = document.getElementById('exempt-servers-list');
    const pagination = document.getElementById('exempt-pagination');
    const reasonField = document.getElementById('exempt-reason');
    const radioGlobal = document.getElementById('exempt-scope-global');
    const radioSpecific = document.getElementById('exempt-scope-specific');
    let currentLimit = 'all';
    const renderServers = (limit) => {
      let html = '<table class="exempt-srv-table"><thead><tr><th><input type="checkbox" id="exempt-chk-all"></th><th>Server / IP</th><th>Status</th></tr></thead><tbody>';
      currentComparison.reports.forEach((r, i) => {
        const srvName = r.metadata.target || r.filename;
        const matrixRow = currentComparison.matrix.get(ruleId);
        const norm = matrixRow && matrixRow[i] ? OpenSCAPComparator.normalizeResult(matrixRow[i].result) : 'na';
        const isFailed = ['fail', 'error', 'exempt'].includes(norm);
        const ex = ExemptionManager.getExemption(ruleId, srvName);
        const isChecked = ex !== null && !ex.isGlobal;
        const isHidden = limit !== 'all' && i >= parseInt(limit);
        html += '<tr class="' + (isFailed ? 'srv-failed' : 'srv-passed') + '" style="' + (isHidden ? 'display:none' : '') + '"><td><input type="checkbox" value="' + esc(srvName) + '" class="exempt-srv-chk" ' + (isChecked ? 'checked' : '') + ' ' + (!isFailed ? 'disabled' : '') + '></td><td><span class="srv-chk-name">' + esc(srvName) + '</span></td><td><span class="srv-chk-status ' + (isFailed ? 'failed' : 'passed') + '">' + (isFailed ? '✗ Failed' : '✓ Passed') + '</span></td></tr>';
      });
      html += '</tbody></table>';
      serversList.innerHTML = html;
      const chkAll = document.getElementById('exempt-chk-all');
      if (chkAll) chkAll.addEventListener('change', e => { document.querySelectorAll('.exempt-srv-chk:not(:disabled)').forEach(chk => chk.checked = e.target.checked); });
    };
    pagination.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => { pagination.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentLimit = btn.dataset.size; renderServers(currentLimit); };
    });
    renderServers(currentLimit);
    const exGlobal = ExemptionManager.getExemption(ruleId, 'global');
    const existingEx = ExemptionManager.getPolicy().rules[ruleId];
    if (exGlobal && exGlobal.isGlobal) {
      radioGlobal.checked = true; reasonField.value = exGlobal.reason;
      serversList.style.display = 'none'; pagination.style.display = 'none';
    } else {
      const anySrvChecked = Array.from(document.querySelectorAll('.exempt-srv-chk')).some(c => c.checked);
      if (anySrvChecked) { radioSpecific.checked = true; serversList.style.display = 'block'; pagination.style.display = 'flex'; }
      else { radioGlobal.checked = true; serversList.style.display = 'none'; pagination.style.display = 'none'; }
      reasonField.value = (existingEx && !existingEx.global) ? (Object.values(existingEx.servers)[0] || '') : '';
    }
    const badge = document.getElementById('exempt-count-badge');
    if (badge) badge.textContent = Object.keys(ExemptionManager.getPolicy().rules).length;
    document.getElementById('btn-exempt-remove').style.display = existingEx ? 'inline-block' : 'none';
    document.getElementById('exempt-backdrop').style.display = 'block';
    setTimeout(() => { reasonField.focus(); }, 50);
  }

  function closeExemptModal() {
    document.getElementById('exempt-backdrop').style.display = 'none';
  }

  function setupDetailModal() {
    const overlay = document.getElementById('detail-overlay');
    const panel = document.getElementById('detail-panel');
    const dialog = panel.querySelector('.modal-dialog');
    const close = () => { overlay.classList.remove('open'); panel.classList.remove('open'); };
    document.getElementById('detail-close').addEventListener('click', close);
    overlay.addEventListener('click', close);
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
    if (dialog) dialog.addEventListener('click', (e) => e.stopPropagation());
  }

  function setupExemptModal() {
    const backdropInner = document.getElementById('exempt-backdrop-inner');
    const dialog = document.getElementById('exempt-dialog');
    backdropInner.addEventListener('mousedown', (e) => { if (e.target === backdropInner) closeExemptModal(); });
    dialog.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    document.getElementById('exempt-close').addEventListener('click', closeExemptModal);
    document.getElementById('btn-expand-all')?.addEventListener('click', () => { document.querySelectorAll('.group-row').forEach(row => { row.classList.remove('collapsed'); document.querySelectorAll('.rule-row[data-group="' + row.dataset.group + '"]').forEach(r => r.style.display = ''); }); });
    document.getElementById('btn-collapse-all')?.addEventListener('click', () => { document.querySelectorAll('.group-row').forEach(row => { row.classList.add('collapsed'); document.querySelectorAll('.rule-row[data-group="' + row.dataset.group + '"]').forEach(r => r.style.display = 'none'); }); });
    document.getElementById('exempt-radio-global').addEventListener('click', () => { document.getElementById('exempt-scope-global').checked = true; document.getElementById('exempt-servers-list').style.display = 'none'; document.getElementById('exempt-pagination').style.display = 'none'; });
    document.getElementById('exempt-radio-specific').addEventListener('click', () => { document.getElementById('exempt-scope-specific').checked = true; document.getElementById('exempt-servers-list').style.display = 'block'; document.getElementById('exempt-pagination').style.display = 'flex'; });
    document.getElementById('btn-exempt-remove').addEventListener('click', () => { if (!currentExemptRuleId) return; if (confirm('Remove all exemptions for this rule?')) { const p = ExemptionManager.getPolicy(); if (p.rules[currentExemptRuleId]) delete p.rules[currentExemptRuleId]; closeExemptModal(); if (onExemptSaveCallback) onExemptSaveCallback(); } });
    document.getElementById('btn-exempt-save').addEventListener('click', () => {
      if (!currentExemptRuleId) return;
      const reason = document.getElementById('exempt-reason').value.trim();
      if (!reason) { alert('Please enter a reason for the exemption.'); return; }
      if (document.getElementById('exempt-scope-global').checked) {
        ExemptionManager.addExemption(currentExemptRuleId, true, [], reason);
      } else {
        const srvs = Array.from(document.querySelectorAll('.exempt-srv-chk:checked')).map(c => c.value);
        if (srvs.length === 0) { alert('Please select at least one server.'); return; }
        const p = ExemptionManager.getPolicy();
        if (p.rules[currentExemptRuleId] && p.rules[currentExemptRuleId].global) p.rules[currentExemptRuleId].global = false;
        ExemptionManager.addExemption(currentExemptRuleId, false, srvs, reason);
      }
      closeExemptModal(); if (onExemptSaveCallback) onExemptSaveCallback();
    });
    document.getElementById('btn-add-exempt-manual').addEventListener('click', () => {
      if (!currentComparison) { alert('Please run a comparison first.'); return; }
      const ruleId = prompt('Enter Rule ID to exempt:');
      if (!ruleId) return;
      if (currentComparison.ruleMap.get(ruleId)) { openExemptDialog(ruleId); }
      else if (confirm('Rule not found. Add global exemption anyway?')) { const reason = prompt('Enter reason:'); if (reason) { ExemptionManager.addExemption(ruleId, true, [], reason); showManageExemptions(currentComparison, onExemptSaveCallback); if (onExemptSaveCallback) onExemptSaveCallback(); } }
    });
    const moOverlay = document.getElementById('manage-exempt-overlay');
    const moPanel = document.getElementById('manage-exempt-panel');
    const moDialog = moPanel.querySelector('.modal-dialog');
    const moClose = () => { moOverlay.classList.remove('open'); moPanel.classList.remove('open'); };
    document.getElementById('manage-exempt-close').addEventListener('click', moClose);
    document.getElementById('btn-manage-exempt-close').addEventListener('click', moClose);
    moOverlay.addEventListener('click', moClose);
    moPanel.addEventListener('click', (e) => { if (e.target === moPanel) moClose(); });
    if (moDialog) moDialog.addEventListener('click', (e) => e.stopPropagation());
  }

  function showManageExemptions(comparison, onSaveCallback) {
    const list = document.getElementById('manage-exempt-list');
    const policy = ExemptionManager.getPolicy();
    
    if (!policy || !policy.rules || Object.keys(policy.rules).length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">No exemptions defined.</div>';
    } else {
      let html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem"><thead><tr style="background:var(--bg-secondary)"><th style="padding:8px;text-align:left">Rule</th><th style="padding:8px;text-align:left">Scope</th><th style="padding:8px;text-align:left">Reason</th><th style="padding:8px"></th></tr></thead><tbody>';
      
      Object.keys(policy.rules).forEach(ruleId => {
        const ex = policy.rules[ruleId];
        const info = currentComparison ? currentComparison.ruleMap.get(ruleId) : null;
        const title = info ? info.title : ruleId;
        
        let scope = '';
        let reason = '';
        if (ex.global) {
          scope = 'Global (All Servers)';
          reason = ex.globalReason;
        } else {
          scope = Object.keys(ex.servers).join(', ');
          reason = Object.values(ex.servers)[0] || ''; // Pick first reason
        }
        
        html += '<tr style="border-bottom:1px solid var(--border)">' +
          '<td style="padding:8px"><strong>' + esc(title) + '</strong><br><span style="font-size:0.7rem;color:var(--text-secondary)">' + esc(ruleId) + '</span></td>' +
          '<td style="padding:8px;color:var(--accent)">' + esc(scope) + '</td>' +
          '<td style="padding:8px">' + esc(reason) + '</td>' +
          '<td style="padding:8px;text-align:right;white-space:nowrap">' +
            '<button onclick="OpenSCAPUI.editExemption(\'' + esc(ruleId) + '\')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-weight:600;margin-right:8px">✏️ Edit</button>' +
            '<button onclick="OpenSCAPUI.removeExemption(\'' + esc(ruleId) + '\')" style="background:none;border:none;color:var(--error);cursor:pointer">Remove</button>' +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      list.innerHTML = html;
    }
    
    onExemptSaveCallback = onSaveCallback;
    document.getElementById('manage-exempt-overlay').classList.add('open');
    document.getElementById('manage-exempt-panel').classList.add('open');

    // Add info note if not present
    if (!list.querySelector('.persistence-note')) {
      const note = document.createElement('div');
      note.className = 'persistence-note';
      note.style = 'background:var(--bg-glass);border:1px solid var(--accent);padding:8px;border-radius:6px;font-size:0.75rem;margin-bottom:12px;color:var(--text)';
      note.innerHTML = 'ℹ️ Exemptions are stored locally in your browser. Use <strong>🛡️ Export</strong> to save them to a file.';
      list.prepend(note);
    }
  }
  
  function editExemption(ruleId) {
    // Close the manage modal first
    document.getElementById('manage-exempt-overlay').classList.remove('open');
    document.getElementById('manage-exempt-panel').classList.remove('open');
    
    // Open the exemption dialog for editing
    if (currentComparison && currentComparison.ruleMap.get(ruleId)) {
      openExemptDialog(ruleId);
    } else {
      // Rule not in current comparison — open a minimal edit dialog
      currentExemptRuleId = ruleId;
      const policy = ExemptionManager.getPolicy();
      const ex = policy.rules[ruleId];
      if (!ex) return;
      
      document.getElementById('exempt-rule-title').textContent = ruleId;
      document.getElementById('exempt-rule-id').textContent = ruleId;
      document.getElementById('exempt-servers-list').style.display = 'none';
      document.getElementById('exempt-servers-list').innerHTML = '';
      document.getElementById('exempt-pagination').style.display = 'none';
      
      if (ex.global) {
        document.getElementById('exempt-scope-global').checked = true;
        document.getElementById('exempt-reason').value = ex.globalReason || '';
      } else {
        document.getElementById('exempt-scope-global').checked = true;
        document.getElementById('exempt-reason').value = Object.values(ex.servers)[0] || '';
      }
      
      document.getElementById('btn-exempt-remove').style.display = 'inline-block';
      document.getElementById('exempt-backdrop').style.display = 'block';
      setTimeout(() => { document.getElementById('exempt-reason').focus(); }, 50);
    }
  }
  
  function removeExemption(ruleId) {
     const policy = ExemptionManager.getPolicy();
     delete policy.rules[ruleId];
     showManageExemptions(currentComparison, onExemptSaveCallback);
     if (onExemptSaveCallback) onExemptSaveCallback();
  }

  // Setup modals
  window.addEventListener('DOMContentLoaded', () => {
    setupDetailModal();
    setupExemptModal();
  });

  return {
    renderFileList, detectDuplicates, renderHostSummary,
    renderGlobalStats, updateChipCounts,
    renderMatrix, renderMatrixInfo, renderRuleDetail,
    openExemptDialog, showManageExemptions, removeExemption, editExemption,
    setComparison: (c, cb) => { currentComparison = c; onExemptSaveCallback = cb; }
  };
})();
