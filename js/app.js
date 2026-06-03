/**
 * OpenSCAP Report Comparison Tool — Main Application
 */

const App = (() => {
  let reports = [];
  let comparison = null;
  let filters = { searchText: '', severity: 'all', quickFilter: 'all' };
  let filteredRuleIds = [];
  let duplicates = [];
  let sortState = { column: 'default', direction: 'asc' }; // default = diff-first

  const $ = id => document.getElementById(id);

  // ─── Report Persistence (IndexedDB — supports hundreds of MB) ───
  function saveReports() {
    StorageManager.saveReports(reports).catch(e => console.warn('Save failed:', e));
  }

  async function init() {
    setupTheme();
    setupFileInputs();
    setupCompareButton();
    setupFilterBar();
    setupChips();
    setupDetailPanel();
    setupExport();

    // Restore reports from IndexedDB
    try {
      const restored = await StorageManager.loadReports();
      if (restored && restored.length > 0) {
        reports = restored;
        duplicates = OpenSCAPUI.detectDuplicates(reports);
      }
    } catch (e) {
      console.warn('Failed to restore reports:', e);
    }

    render();

    // Show exemption panel if there are stored exemptions
    if (ExemptionManager.hasAnyExemptions()) {
      $('exemption-panel-section').style.display = 'block';
      const badge = $('exempt-count-badge');
      if (badge) badge.textContent = Object.keys(ExemptionManager.getPolicy().rules).length;
    }

    // Auto-run comparison if we restored reports
    if (reports.length >= 1) {
      showLoadingOverlay(`Restoring ${reports.length} report${reports.length > 1 ? 's' : ''}…`, 'Building compliance matrix');
      await new Promise(resolve => setTimeout(resolve, 60));
      try {
        comparison = OpenSCAPComparator.compare(reports);
        OpenSCAPUI.setComparison(comparison, () => {
          if (reports.length > 0) recompare();
        });
        filters = { searchText: '', severity: 'all', quickFilter: 'all', grouping: $('filter-group').checked };
        applyFilters();
        renderComparison(true);
        $('exemption-panel-section').style.display = 'block';
      } finally {
        hideLoadingOverlay();
      }
    }
  }

  // ═══ THEME ═══

  function setupTheme() {
    const saved = localStorage.getItem('oscap-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);

    $('theme-toggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('oscap-theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    $('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ═══ FILE INPUTS ═══

  function setupFileInputs() {
    const fileInput = $('file-input');
    const folderInput = $('folder-input');
    const dropZone = $('drop-zone');

    $('btn-add-files').addEventListener('click', () => fileInput.click());
    $('btn-add-folder').addEventListener('click', () => folderInput.click());
    $('btn-clear-all').addEventListener('click', () => {
      if (!confirm('Clear all reports and exemptions? This will reset everything.')) return;
      reports = []; comparison = null; duplicates = []; filteredRuleIds = [];
      ExemptionManager.clearPolicy();
      StorageManager.clearAll();
      $('exemption-panel-section').style.display = 'none';
      $('results-section').style.display = 'none';
      $('btn-clear-all').style.display = 'none';
      render();
    });
    
    $('btn-export-exemptions').addEventListener('click', () => {
      ExemptionManager.exportPolicy();
    });

    $('btn-load-exemptions').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const content = await readFile(file);
          if (ExemptionManager.loadPolicy(content)) {
            // Update dashboard immediately
            $('exemption-panel-section').style.display = 'block';
            const count = Object.keys(ExemptionManager.getPolicy().rules).length;
            const badge = $('exempt-count-badge');
            if (badge) badge.textContent = count;
            
            alert('Exemption policy loaded successfully (' + count + ' rules).');
            if (reports.length > 0) recompare();
          } else {
            alert('Invalid exemption policy file.');
          }
        } catch (err) {
          alert('Failed to load policy: ' + err.message);
        }
      };
      input.click();
    });

    $('btn-manage-exemptions').addEventListener('click', () => {
      OpenSCAPUI.showManageExemptions(comparison, () => {
        // Callback when exemptions are updated
        if (reports.length > 0) recompare();
      });
    });

    fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });
    folderInput.addEventListener('change', e => {
      // Filter for XML/HTML/JSON files from folder
      const files = Array.from(e.target.files).filter(f =>
        /\.(xml|html|htm|xccdf|json)$/i.test(f.name)
      );
      if (files.length === 0) {
        alert('No XML or HTML files found in the selected folder.');
        return;
      }
      handleFiles(files);
      folderInput.value = '';
    });

    // Drop zone
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter(f => /\.(xml|html|htm|xccdf|json)$/i.test(f.name));
    let added = 0;
    const showProgress = files.length > 3;
    if (showProgress) showLoadingOverlay(`Loading ${files.length} files…`, 'Starting…');
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      if (showProgress) updateLoadingSub(`Parsing ${fi + 1} of ${files.length}: ${file.name}`);
      try {
        const content = await readFile(file);
        
        if (file.name.toLowerCase().endsWith('.json')) {
          if (ExemptionManager.loadPolicy(content)) {
            $('exemption-panel-section').style.display = 'block';
            const badge = $('exempt-count-badge');
            if (badge) badge.textContent = Object.keys(ExemptionManager.getPolicy().rules).length;
            
            // Force re-run of comparison to apply new exemptions immediately
            if (reports.length > 0) recompare();
            
            console.log("Loaded exemption policy.");
          }
          continue;
        }

        const report = OpenSCAPParser.parse(content, file.name);
        reports.push(report);
        added++;
      } catch (err) {
        console.error(`Error parsing ${file.name}:`, err);
        if (files.length <= 3) alert(`Error parsing ${file.name}:\n${err.message}`);
      }
    }
    if (showProgress) hideLoadingOverlay();
    if (added > 0) {
      comparison = null;
      duplicates = OpenSCAPUI.detectDuplicates(reports);
      saveReports();
      render();
    }
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ═══ COMPARE ═══

  function recompare() {
    if (reports.length < 1) return;
    comparison = OpenSCAPComparator.compare(reports);
    OpenSCAPUI.setComparison(comparison, () => {
      if (reports.length > 0) recompare();
    });
    applyFilters();
    renderComparison(false);
  }

  function setupCompareButton() {
    $('btn-compare').addEventListener('click', () => {
      if (reports.length < 1) return;
      const btn = $('btn-compare');
      btn.disabled = true;
      showLoadingOverlay(`Comparing ${reports.length} report${reports.length > 1 ? 's' : ''}…`, 'Building compliance matrix');
      setTimeout(() => {
        try {
          comparison = OpenSCAPComparator.compare(reports);
          OpenSCAPUI.setComparison(comparison, () => {
            if (reports.length > 0) recompare();
          });
          filters = { searchText: '', severity: 'all', quickFilter: 'all', grouping: $('filter-group').checked };
          applyFilters();
          renderComparison(true);
          $('exemption-panel-section').style.display = reports.length > 0 ? 'block' : 'none';
        } finally {
          hideLoadingOverlay();
          btn.disabled = false;
          render();
          $('results-section').scrollIntoView({ behavior: 'smooth' });
        }
      }, 60);
    });
  }

  // ═══ FILTERS ═══

  function setupFilterBar() {
    let debounce;
    $('filter-search').addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        filters.searchText = e.target.value;
        applyFilters(); renderMatrix();
      }, 250);
    });
    $('filter-severity').addEventListener('change', e => {
      filters.severity = e.target.value;
      applyFilters(); renderMatrix();
    });
    $('filter-group').addEventListener('change', () => {
      renderMatrix();
    });
  }

  function setupChips() {
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filters.quickFilter = chip.dataset.filter;
        applyFilters(); renderMatrix();
      });
    });
  }

  function applyFilters() {
    if (!comparison) { filteredRuleIds = []; return; }
    filteredRuleIds = OpenSCAPComparator.filterMatrix(comparison, filters);
  }

  // ═══ DETAIL MODAL ═══

  let currentDetailRuleId = null;

  function setupDetailPanel() {
    $('detail-close').addEventListener('click', closeDetail);
    $('detail-overlay').addEventListener('click', closeDetail);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

    // Export from modal
    $('detail-export').addEventListener('click', () => {
      if (!currentDetailRuleId || !comparison) return;
      const info = comparison.ruleMap.get(currentDetailRuleId);
      const row = comparison.matrix.get(currentDetailRuleId);
      if (!info) return;

      let text = `Rule: ${info.title || currentDetailRuleId}\n`;
      text += `ID: ${currentDetailRuleId}\n`;
      text += `Severity: ${info.severity}\n\n`;
      if (info.description) text += `Description:\n${info.description}\n\n`;
      if (info.rationale) text += `Rationale:\n${info.rationale}\n\n`;
      if (info.fixtext) text += `Fix:\n${info.fixtext}\n\n`;
      text += `Results:\n`;
      comparison.reports.forEach((report, idx) => {
        const r = row[idx];
        const name = report.metadata.target || report.filename;
        text += `  ${name}: ${r ? r.result : 'N/A'}\n`;
      });

      OpenSCAPExporter.downloadFile(text, `rule-${currentDetailRuleId.replace(/[^a-z0-9]/gi, '_')}.txt`, 'text/plain');
    });
  }

  function openDetail(ruleId) {
    currentDetailRuleId = ruleId;
    OpenSCAPUI.renderRuleDetail(ruleId, comparison, $('detail-content'));
    $('detail-panel').classList.add('open');
    $('detail-overlay').classList.add('open');
  }

  function closeDetail() {
    $('detail-panel').classList.remove('open');
    $('detail-overlay').classList.remove('open');
    currentDetailRuleId = null;
  }

  // ═══ EXPORT ═══

  function setupExport() {
    $('btn-export-csv').addEventListener('click', () => {
      if (!comparison) return;
      const csv = OpenSCAPExporter.exportCSV(comparison);
      OpenSCAPExporter.downloadFile(csv, 'openscap-comparison.csv', 'text/csv');
    });
    $('btn-export-xlsx').addEventListener('click', () => {
      if (!comparison) return;
      OpenSCAPExporter.exportExcel(comparison);
    });
    $('btn-export-html').addEventListener('click', () => {
      if (!comparison) return;
      const html = OpenSCAPExporter.exportHTML(comparison);
      OpenSCAPExporter.downloadFile(html, 'openscap-report.html', 'text/html');
    });
  }

  // ═══ RENDER ═══

  function render() {
    // File list
    OpenSCAPUI.renderFileList(reports, $('file-list'), duplicates, removeReport);
    OpenSCAPUI.renderHostSummary(reports, $('host-summary'));

    // Clear all button — show when there are reports or stored exemptions
    $('btn-clear-all').style.display = (reports.length > 0 || ExemptionManager.hasAnyExemptions()) ? 'inline-flex' : 'none';

    // Compare bar
    const btn = $('btn-compare');
    btn.disabled = reports.length < 1;
    btn.textContent = reports.length === 0
      ? 'Load reports first'
      : reports.length === 1
        ? '⚡ Analyze Report'
        : `⚡ Compare ${reports.length} Reports`;
    $('compare-bar').style.display = reports.length >= 1 ? 'flex' : 'none';

    // Results
    if (!comparison) {
      $('results-section').style.display = 'none';
      // Only hide exemption panel if no exemptions stored
      if (!ExemptionManager.hasAnyExemptions()) {
        $('exemption-panel-section').style.display = 'none';
      }
    }
  }

  function renderComparison(resetFilters = true) {
    $('results-section').style.display = 'block';
    OpenSCAPUI.renderGlobalStats(comparison, $('global-stats'));
    OpenSCAPUI.updateChipCounts(comparison);
    
    if (resetFilters) {
      $('filter-search').value = '';
      $('filter-severity').value = 'all';
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      const chipAll = document.querySelector('.chip[data-filter="all"]');
      if (chipAll) chipAll.classList.add('active');
    }
    
    renderMatrix();
  }

  function setupDetailPanel() {
    // Basic setup if needed, but currently handled by OpenSCAPUI.setupDetailModal
  }

  function openDetail(ruleId) {
    if (!comparison) return;
    OpenSCAPUI.renderRuleDetail(ruleId, comparison, $('detail-content'));
    $('detail-overlay').classList.add('open');
    $('detail-panel').classList.add('open');
  }

  function renderMatrix() {
    // Apply sorting (persists across filter changes)
    sortFilteredRules();

    OpenSCAPUI.renderMatrixInfo(
      comparison ? comparison.summary.totalUniqueRules : 0,
      filteredRuleIds.length, $('matrix-info')
    );
    const useGrouping = $('filter-group').checked;
    OpenSCAPUI.renderMatrix(comparison, $('matrix-wrap'), filteredRuleIds, useGrouping);

    // Click listeners — rule rows
    $('matrix-wrap').querySelectorAll('.rule-row').forEach(row => {
      row.addEventListener('click', () => openDetail(row.dataset.rule));
    });

    // Exemption buttons
    $('matrix-wrap').querySelectorAll('.btn-exempt-row').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        OpenSCAPUI.openExemptDialog(btn.dataset.rule);
      });
    });

    // Group collapse/expand
    $('matrix-wrap').querySelectorAll('.group-row').forEach(row => {
      row.addEventListener('click', () => {
        const group = row.dataset.group;
        row.classList.toggle('collapsed');
        const collapsed = row.classList.contains('collapsed');
        $('matrix-wrap').querySelectorAll(`.rule-row[data-group="${CSS.escape(group)}"]`).forEach(r => {
          r.style.display = collapsed ? 'none' : '';
        });
      });
    });

    // Sortable column headers (including per-host columns)
    $('matrix-wrap').querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', e => {
        e.stopPropagation();
        const col = th.dataset.sort;
        if (sortState.column === col) {
          sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          sortState.column = col;
          sortState.direction = 'asc';
        }
        renderMatrix();
      });
    });
  }

  function sortFilteredRules() {
    if (!comparison || sortState.column === 'default') return;

    const dir = sortState.direction === 'asc' ? 1 : -1;

    if (sortState.column === 'name') {
      filteredRuleIds.sort((a, b) => {
        const aInfo = comparison.ruleMap.get(a);
        const bInfo = comparison.ruleMap.get(b);
        const aTitle = (aInfo.title || a).toLowerCase();
        const bTitle = (bInfo.title || b).toLowerCase();
        return dir * aTitle.localeCompare(bTitle);
      });
    } else if (sortState.column === 'severity') {
      const sevRank = s => ({ high: 3, medium: 2, low: 1, unknown: 0 }[s] || 0);
      filteredRuleIds.sort((a, b) => {
        const aInfo = comparison.ruleMap.get(a);
        const bInfo = comparison.ruleMap.get(b);
        return dir * (sevRank(aInfo.severity) - sevRank(bInfo.severity));
      });
    } else if (sortState.column.startsWith('host-')) {
      // Per-host column sorting: fail first, then pass, then N/A
      const hostIdx = parseInt(sortState.column.replace('host-', ''));
      const resultRank = r => {
        if (!r) return 4;
        const norm = OpenSCAPComparator.normalizeResult(r.result);
        return { fail: 0, error: 1, pass: 2, na: 3 }[norm] ?? 4;
      };
      filteredRuleIds.sort((a, b) => {
        const aRow = comparison.matrix.get(a);
        const bRow = comparison.matrix.get(b);
        return dir * (resultRank(aRow[hostIdx]) - resultRank(bRow[hostIdx]));
      });
    }
  }

  function removeReport(idx) {
    reports.splice(idx, 1);
    comparison = null; filteredRuleIds = [];
    duplicates = OpenSCAPUI.detectDuplicates(reports);
    saveReports();
    render();
  }

  // ═══ LOADING OVERLAY ═══

  function showLoadingOverlay(message, sub) {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-message" id="loading-message"></div>
        <div class="loading-sub" id="loading-sub"></div>`;
      document.body.appendChild(overlay);
    }
    document.getElementById('loading-message').textContent = message || 'Processing…';
    document.getElementById('loading-sub').textContent = sub || '';
    overlay.classList.add('active');
  }

  function updateLoadingSub(text) {
    const el = document.getElementById('loading-sub');
    if (el) el.textContent = text;
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
