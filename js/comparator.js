/**
 * OpenSCAP Report Comparator
 * Compares multiple parsed OpenSCAP reports with host aggregation
 */

const OpenSCAPComparator = (() => {

  /**
   * Main compare function.
   * Aggregates reports from the same host+profile into a single effective host.
   */
  function compare(reports) {
    if (!reports || reports.length === 0) return null;

    // Aggregate: group by host+profile, pick best data from each group
    const hosts = aggregateHosts(reports);
    const effectiveReports = hosts.map(h => h.primary);

    const ruleMap = buildUnifiedRuleMap(effectiveReports);
    const matrix = buildComparisonMatrix(ruleMap, effectiveReports);
    const diffs = classifyDifferences(matrix, effectiveReports);
    const groups = groupByCategory(ruleMap);
    const summary = buildSummary(effectiveReports, matrix, diffs, hosts);
    return { reports: effectiveReports, ruleMap, matrix, diffs, groups, summary, hosts, originalReports: reports };
  }

  /**
   * Aggregate reports by host + profile.
   * Same host + same profile = same effective host.
   * Returns array of { hostname, profile, reports: [...], primary: bestReport }
   */
  function aggregateHosts(reports) {
    const hostMap = new Map();

    reports.forEach((report, idx) => {
      const hostname = normalizeHostname(report.metadata.target || report.filename);
      const profileId = report.metadata.profileId || report.metadata.profileTitle || 'default';
      const key = `${hostname}||${profileId}`;

      if (!hostMap.has(key)) {
        hostMap.set(key, {
          hostname,
          profile: report.metadata.profileTitle || report.metadata.profileId || '',
          reports: [],
          indices: [],
        });
      }
      hostMap.get(key).reports.push(report);
      hostMap.get(key).indices.push(idx);
    });

    // Second pass: merge "default" profile groups into matching host groups
    // This handles HTML reports that don't have profileId
    const keys = [...hostMap.keys()];
    keys.forEach(key => {
      if (!key.endsWith('||default')) return;
      const group = hostMap.get(key);
      // Find another group with the same hostname but a real profile
      const matchKey = keys.find(k =>
        k !== key &&
        k.startsWith(group.hostname + '||') &&
        !k.endsWith('||default')
      );
      if (matchKey) {
        const target = hostMap.get(matchKey);
        target.reports.push(...group.reports);
        target.indices.push(...group.indices);
        hostMap.delete(key);
      }
    });

    return Array.from(hostMap.values()).map(group => {
      // Pick primary: prefer XML (more data) over HTML, or first one
      const xmlReport = group.reports.find(r => r.source === 'xml' || r.sourceType === 'XCCDF' || r.sourceType === 'ARF');
      const primary = xmlReport || group.reports[0];
      // Merge data: use XML rules but enrich with HTML descriptions if better
      if (group.reports.length > 1) {
        const secondary = group.reports.find(r => r !== primary);
        if (secondary) {
          primary.rules.forEach(rule => {
            const otherRule = secondary.rules.find(r => r.idref === rule.idref);
            if (otherRule) {
              if (!rule.description && otherRule.description) rule.description = otherRule.description;
              if (!rule.fixtext && otherRule.fixtext) rule.fixtext = otherRule.fixtext;
              if (!rule.rationale && otherRule.rationale) rule.rationale = otherRule.rationale;
            }
          });
        }
      }
      return { ...group, primary };
    });
  }

  /**
   * Normalize hostname: lowercase, strip trailing dots
   */
  function normalizeHostname(host) {
    return (host || '').toLowerCase().replace(/\.$/, '').trim();
  }

  function buildUnifiedRuleMap(reports) {
    const map = new Map();
    reports.forEach((report, idx) => {
      report.rules.forEach(rule => {
        if (!map.has(rule.idref)) {
          map.set(rule.idref, {
            idref: rule.idref, title: rule.title,
            severity: rule.severity, description: rule.description,
            rationale: rule.rationale || '', fixtext: rule.fixtext || '',
            groupTitle: rule.groupTitle || 'Other',
            presentIn: new Set(),
          });
        }
        const entry = map.get(rule.idref);
        entry.presentIn.add(idx);
        if ((!entry.title || entry.title === entry.idref) && rule.title && rule.title !== rule.idref) {
          entry.title = rule.title;
        }
        if (rule.groupTitle && rule.groupTitle !== 'Other' && entry.groupTitle === 'Other') {
          entry.groupTitle = rule.groupTitle;
        }
        if (!entry.description && rule.description) entry.description = rule.description;
        if (!entry.rationale && rule.rationale) entry.rationale = rule.rationale;
        if (!entry.fixtext && rule.fixtext) entry.fixtext = rule.fixtext;
        if (severityRank(rule.severity) > severityRank(entry.severity)) {
          entry.severity = rule.severity;
        }
      });
    });
    return map;
  }

  function severityRank(s) {
    const ranks = { high: 3, medium: 2, low: 1, unknown: 0 };
    return ranks[s] || 0;
  }

  function buildComparisonMatrix(ruleMap, reports) {
    const matrix = new Map();
    ruleMap.forEach((info, ruleId) => {
      const row = reports.map(report => {
        const rule = report.rules.find(r => r.idref === ruleId);
        if (!rule) return null;
        let finalResult = rule.result;
        let isExempt = false;
        let exemptionReason = '';
        
        // Apply Exemption Policy
        if (typeof ExemptionManager !== 'undefined') {
          const srvName = report.metadata.target || report.filename;
          const ex = ExemptionManager.getExemption(ruleId, srvName);
          if (ex && (normalizeResult(finalResult) === 'fail' || normalizeResult(finalResult) === 'error')) {
            finalResult = 'exempt';
            isExempt = true;
            exemptionReason = ex.reason;
          }
        }
        
        return {
          result: finalResult, severity: rule.severity,
          messages: rule.messages, time: rule.time, overrides: rule.overrides,
          isExempt, exemptionReason
        };
      });
      matrix.set(ruleId, row);
    });
    return matrix;
  }

  function classifyDifferences(matrix, reports) {
    const categories = {
      allPass: [], allFail: [], allExempt: [], anyExempt: [], different: [],
      partialOnly: [], allError: [], allNA: [],
    };
    matrix.forEach((row, ruleId) => {
      const present = row.filter(r => r !== null);
      const missing = row.length - present.length;
      if (present.length === 0) return;
      const inAll = missing === 0;
      const types = new Set(present.map(r => normalizeResult(r.result)));
      
      if (present.some(r => r.isExempt || normalizeResult(r.result) === 'exempt')) {
        categories.anyExempt.push(ruleId);
      }
      
      if (!inAll && missing > 0) categories.partialOnly.push(ruleId);
      if (types.size === 1) {
        const r = normalizeResult(present[0].result);
        if (r === 'pass') categories.allPass.push(ruleId);
        else if (r === 'fail') categories.allFail.push(ruleId);
        else if (r === 'exempt') categories.allExempt.push(ruleId);
        else if (r === 'error') categories.allError.push(ruleId);
        else if (r === 'na') categories.allNA.push(ruleId);
      } else {
        categories.different.push(ruleId);
      }
    });
    return categories;
  }

  function groupByCategory(ruleMap) {
    const groups = new Map();
    ruleMap.forEach((info, ruleId) => {
      const stripped = ruleId.replace(/^xccdf_org\.ssgproject\.content_rule_/, '');
      const parts = stripped.split('_');
      let group = parts.length > 1 ? parts[0] : 'other';
      group = group.charAt(0).toUpperCase() + group.slice(1);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(ruleId);
    });
    return groups;
  }

  function normalizeResult(result) {
    switch (result) {
      case 'pass': case 'fixed': case 'informational': return 'pass';
      case 'fail': return 'fail';
      case 'error': case 'unknown': return 'error';
      case 'notapplicable': case 'notselected': case 'notchecked': return 'na';
      case 'exempt': return 'exempt';
      default: return result;
    }
  }

  function buildSummary(reports, matrix, diffs, hosts) {
    return {
      totalReports: reports.length,
      totalUniqueRules: matrix.size,
      allPassCount: diffs.allPass.length,
      allFailCount: diffs.allFail.length,
      allExemptCount: diffs.allExempt.length,
      anyExemptCount: diffs.anyExempt.length,
      differentCount: diffs.different.length,
      partialCount: diffs.partialOnly.length,
      allNACount: diffs.allNA.length,
      hosts: hosts || [],
      reportSummaries: reports.map((r, i) => {
        const rowData = Array.from(matrix.values()).map(row => row[i]);
        const exemptCount = rowData.filter(cell => cell && cell.result === 'exempt').length;
        return {
          index: i, filename: r.filename,
          target: r.metadata.target,
          profile: r.metadata.profileTitle || r.metadata.profileId,
          score: r.metadata.scores.length > 0 ? r.metadata.scores[0].value : null,
          scoreMax: r.metadata.scores.length > 0 ? r.metadata.scores[0].maximum : null,
          compliancePercent: r.stats.compliancePercent,
          stats: { ...r.stats, exempt: exemptCount },
          startTime: r.metadata.startTime,
          endTime: r.metadata.endTime, sourceType: r.sourceType,
        };
      }),
    };
  }

  function filterMatrix(comparison, filters = {}) {
    const { searchText, severity, quickFilter } = filters;
    const filtered = [];

    comparison.matrix.forEach((row, ruleId) => {
      const info = comparison.ruleMap.get(ruleId);

      // Quick filter
      if (quickFilter && quickFilter !== 'all') {
        if (quickFilter === 'different' && !comparison.diffs.different.includes(ruleId)) return;
        if (quickFilter === 'allfail' && !comparison.diffs.allFail.includes(ruleId)) return;
        if (quickFilter === 'allpass' && !comparison.diffs.allPass.includes(ruleId)) return;
        if (quickFilter === 'allexempt') {
          const rowResults = row.filter(r => r !== null);
          if (!rowResults.some(r => r.isExempt)) return;
        }
        if (quickFilter === 'na' && !comparison.diffs.allNA.includes(ruleId)) return;
      }

      // Text search
      if (searchText) {
        const q = searchText.toLowerCase();
        const matches = ruleId.toLowerCase().includes(q) ||
          (info.title && info.title.toLowerCase().includes(q));
        if (!matches) return;
      }

      // Severity
      if (severity && severity !== 'all') {
        if (info.severity !== severity) return;
      }

      filtered.push(ruleId);
    });

    return sortRules(filtered, comparison);
  }

  function sortRules(ruleIds, comparison) {
    return [...ruleIds].sort((a, b) => {
      const aDiff = comparison.diffs.different.includes(a) ? 0 : 1;
      const bDiff = comparison.diffs.different.includes(b) ? 0 : 1;
      if (aDiff !== bDiff) return aDiff - bDiff;
      const aInfo = comparison.ruleMap.get(a);
      const bInfo = comparison.ruleMap.get(b);
      if (severityRank(aInfo.severity) !== severityRank(bInfo.severity))
        return severityRank(bInfo.severity) - severityRank(aInfo.severity);
      return a.localeCompare(b);
    });
  }

  function exportCSV(comparison) {
    const reports = comparison.reports;
    const headers = ['Rule ID', 'Title', 'Severity'];
    reports.forEach(r => headers.push(r.metadata.target || r.filename));
    headers.push('Status');
    const rows = [headers.join(',')];
    const sorted = sortRules([...comparison.matrix.keys()], comparison);
    sorted.forEach(ruleId => {
      const info = comparison.ruleMap.get(ruleId);
      const mRow = comparison.matrix.get(ruleId);
      const cells = [
        `"${ruleId}"`,
        `"${(info.title || '').replace(/"/g, '""')}"`,
        info.severity,
      ];
      mRow.forEach(r => cells.push(r ? r.result : 'N/A'));
      let status = 'Same';
      if (comparison.diffs.different.includes(ruleId)) status = 'Different';
      cells.push(status);
      rows.push(cells.join(','));
    });
    return rows.join('\n');
  }

  return { compare, filterMatrix, sortRules, exportCSV, normalizeResult, groupByCategory, normalizeHostname };
})();
