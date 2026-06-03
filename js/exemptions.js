/**
 * OpenSCAP Exemptions Manager
 * Handles creating, applying, and exporting exemption policies.
 * Persists to localStorage automatically so data survives page refresh.
 */

const ExemptionManager = (() => {
  const STORAGE_KEY = 'oscap-exemption-policy';

  let policy = {
    type: 'openscap-exemptions',
    version: '1.0',
    rules: {}
  };

  // ─── Persistence ───

  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
    } catch (e) {
      console.warn('Failed to save exemptions to localStorage:', e);
    }
    _notifyUI();
  }

  function _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === 'openscap-exemptions' && parsed.rules) {
          policy = parsed;
          return true;
        }
      }
    } catch (e) {
      console.warn('Failed to load exemptions from localStorage:', e);
    }
    return false;
  }

  // Notify the UI about exemption count changes
  function _notifyUI() {
    const count = Object.keys(policy.rules).length;
    const badge = document.getElementById('exempt-count-badge');
    if (badge) badge.textContent = count;

    // Show/hide the exemption panel section
    const panel = document.getElementById('exemption-panel-section');
    if (panel) {
      panel.style.display = count > 0 ? 'block' : (panel.style.display === 'block' ? 'block' : 'none');
    }
  }

  // ─── Public API ───

  function loadPolicy(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.type === 'openscap-exemptions') {
        if (!parsed.rules) return false;
        
        // Merge imported rules into current policy (not replace)
        Object.keys(parsed.rules).forEach(ruleId => {
          const parsedRule = parsed.rules[ruleId];
          policy.rules[ruleId] = { 
            global: !!parsedRule.global, 
            servers: {}, 
            globalReason: parsedRule.globalReason || '' 
          };
          
          if (parsedRule.servers) {
            Object.keys(parsedRule.servers).forEach(srv => {
              policy.rules[ruleId].servers[srv.toLowerCase()] = parsedRule.servers[srv];
            });
          }
        });
        _save();
        return true;
      }
    } catch (e) {
      console.error('Failed to parse exemption policy', e);
    }
    return false;
  }

  function getPolicy() {
    return policy;
  }

  function addExemption(ruleId, isGlobal, servers, reason) {
    if (!policy.rules[ruleId]) {
      policy.rules[ruleId] = { global: false, servers: {}, globalReason: '' };
    }
    const ruleEx = policy.rules[ruleId];
    if (isGlobal) {
      ruleEx.global = true;
      ruleEx.globalReason = reason;
    } else {
      servers.forEach(srv => {
        ruleEx.servers[srv.toLowerCase()] = reason;
      });
    }
    _save();
  }

  function removeExemption(ruleId, server) {
    if (!policy.rules[ruleId]) return;
    if (server === 'global') {
      policy.rules[ruleId].global = false;
      policy.rules[ruleId].globalReason = '';
    } else {
      delete policy.rules[ruleId].servers[server.toLowerCase()];
    }
    
    // Clean up if empty
    if (!policy.rules[ruleId].global && Object.keys(policy.rules[ruleId].servers).length === 0) {
      delete policy.rules[ruleId];
    }
    _save();
  }

  function getExemption(ruleId, serverName) {
    const ruleEx = policy.rules[ruleId];
    if (!ruleEx) return null;
    
    if (ruleEx.global) {
      return { isGlobal: true, reason: ruleEx.globalReason };
    }
    
    const srvKey = (serverName || '').toLowerCase();
    if (ruleEx.servers[srvKey]) {
      return { isGlobal: false, reason: ruleEx.servers[srvKey] };
    }
    return null;
  }

  function exportPolicy() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(policy, null, 2));
    const el = document.createElement('a');
    el.setAttribute("href", dataStr);
    el.setAttribute("download", "openscap-exemptions.json");
    document.body.appendChild(el);
    el.click();
    el.remove();
  }

  function clearPolicy() {
    policy = {
      type: 'openscap-exemptions',
      version: '1.0',
      rules: {}
    };
    _save();
  }

  function hasAnyExemptions() {
    return Object.keys(policy.rules).length > 0;
  }

  // Auto-load from localStorage on startup
  _loadFromStorage();

  return {
    loadPolicy,
    getPolicy,
    addExemption,
    removeExemption,
    getExemption,
    exportPolicy,
    clearPolicy,
    hasAnyExemptions
  };
})();
