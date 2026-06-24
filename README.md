<div align="center">

# 📊 ScapAnalyzer

**Browser-based OpenSCAP compliance report comparison and exemption engine**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-y8765.github.io%2FScapAnalyzer-blue?logo=github)](https://y8765.github.io/ScapAnalyzer/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![No Backend](https://img.shields.io/badge/Backend-None%20%E2%80%94%20100%25%20Client--Side-brightgreen)](https://y8765.github.io/ScapAnalyzer/)

</div>

---

<!-- GIF PLACEHOLDER: Full overview — drag in 3-4 XML reports, watch the comparison matrix build, click a rule to inspect it -->
> 📹 *[Demo GIF: Loading reports and exploring the comparison matrix — coming soon]*

---

## What is ScapAnalyzer?

ScapAnalyzer is a fully client-side, zero-backend tool for analyzing and comparing OpenSCAP compliance reports. Drag and drop your XML or HTML reports from any browser — nothing is uploaded anywhere. All processing and storage happens locally in the browser using IndexedDB.

It is designed to complement **[SCAP Suite](https://github.com/Y8765/ScapSuite)** by providing a professional audit and review layer on top of generated scan reports.

🚀 **Live Version:** [y8765.github.io/ScapAnalyzer/](https://y8765.github.io/ScapAnalyzer/)

---

## ✨ Key Features

### 📋 Multi-Server Comparison Matrix

<!-- GIF PLACEHOLDER: Load 4-5 reports, show the matrix appearing with color-coded Pass/Fail/Error cells, hover over cells -->
> 📹 *[Demo GIF: Comparison matrix overview — coming soon]*

Load multiple XCCDF/ARF XML or HTML reports and instantly see a side-by-side compliance matrix. Each cell shows the result for that rule on that host — color-coded by status (Pass, Fail, Error, Non-Relevant).

---

### 🔍 Smart Filtering & Search

<!-- GIF PLACEHOLDER: Type in the search bar, click filter chips (Differences / All Fail / Exempted), show the matrix updating in real-time -->
> 📹 *[Demo GIF: Filtering and search in action — coming soon]*

Narrow down results instantly:
- **Search** by rule name, rule ID, or description
- **Filter chips:** Differences only · All Fail · Exempted · All Pass · Non-Relevant
- **Severity filter:** High · Medium · Low
- **Category grouping** for organized viewing

---

### 🛡️ Exemption Management Engine

<!-- GIF PLACEHOLDER: Open exemption dialog, fill in rule + reason + approver, show the rule turn "Exempted" in the matrix, export the JSON policy -->
> 📹 *[Demo GIF: Creating and managing exemptions — coming soon]*

Create and manage a local exemption policy for rules that are intentionally non-compliant:
- **Global exemptions** — apply across all loaded servers
- **Scoped exemptions** — apply to specific servers only
- Attach approval details, rationales, and timestamps
- **Export / Import** policies as a portable JSON file

---

### 📤 Rich Export Options

Export your consolidated compliance matrix to:

| Format | Description |
|---|---|
| 📥 **CSV** | Raw data for spreadsheet tools |
| 📊 **Excel (XLSX)** | Formatted workbook with color-coded cells (powered by SheetJS) |
| 📄 **Standalone HTML** | Self-contained interactive matrix page — share via email or archive offline |

---

## 🛠️ Usage

### Option A: Use the Hosted Version (No Setup)

Open [y8765.github.io/ScapAnalyzer/](https://y8765.github.io/ScapAnalyzer/) in any modern browser and drag in your reports.

### Option B: Run Locally (Offline / Air-Gapped)

```bash
git clone https://github.com/Y8765/ScapAnalyzer.git
cd ScapAnalyzer
```

Then open `index.html` directly in your browser, or serve it with any static server:

```bash
python -m http.server 8000
# Open http://localhost:8000
```

### Integration with SCAP Suite

If you have [SCAP Suite](https://github.com/Y8765/ScapSuite) installed, click the **📊 Open ScapAnalyzer** button in the Compliance Gallery — it will open ScapAnalyzer automatically (local clone if detected, otherwise the hosted version).

---

## 📂 Project Structure

```
ScapAnalyzer/
├── css/
│   └── styles.css        # Core styling and glassmorphism design tokens
├── js/
│   ├── app.js            # Application shell and initialization
│   ├── comparator.js     # Comparison matrix builder and filter engine
│   ├── exemptions.js     # Exemption database and policy manager
│   ├── exporter.js       # CSV, Excel, and standalone HTML exporters
│   ├── parser.js         # XCCDF & ARF XML parser and HTML report scavenger
│   ├── storage.js        # IndexedDB persistence layer
│   ├── ui.js             # DOM renderer and modal/dialog handlers
│   └── xlsx.bundle.js    # Bundled SheetJS library for Excel export
├── samples/              # Sample OpenSCAP reports for testing
├── index.html            # Main application entrypoint
└── README.md
```

---

## 🤝 Related Projects

- **[SCAP Suite](https://github.com/Y8765/ScapSuite)** — Remote OpenSCAP scanning platform that generates the reports ScapAnalyzer analyzes

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
