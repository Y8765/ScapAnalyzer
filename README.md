# 🛡️ ScapAnalyzer

ScapAnalyzer is a modern, high-performance, browser-based compliance audit comparator and analyzer for OpenSCAP reports. It is designed to run entirely client-side, allowing security engineers, compliance officers, and system administrators to securely review and compare reports in air-gapped or restricted environments without any backend server.

🚀 **Live Version:** [y8765.github.io/ScapAnalyzer/](https://y8765.github.io/ScapAnalyzer/)

---

## 📸 Screenshots & Demos

### 1. Main Compliance Matrix Dashboard
*Compare compliance states across multiple target hosts in a single unified grid view.*
<!-- Placeholder for Main Dashboard Screenshot or GIF -->
![Main Dashboard Mockup](docs/screenshots/dashboard_mockup.webp)

### 2. Exemption Policy Review
*Quickly view, search, and manage rules exempted from auditing.*
<!-- Placeholder for Exemption Panel Screenshot -->
![Exemption Panel Mockup](docs/screenshots/exemption_panel_mockup.webp)

### 3. Exemption Creation Dialog
*Create scoped (global or server-specific) exemptions with rationales.*
<!-- Placeholder for Exemption Creation Dialog Screenshot -->
![Exemption Dialog Mockup](docs/screenshots/exemption_dialog_mockup.webp)

---

## ✨ Key Features

- **Drag & Drop Loading:** Simply drop XML (XCCDF/ARF) or HTML reports into the browser.
- **Side-by-Side Comparison Matrix:** Visual grid showcasing compliance status (Pass, Fail, Error, Non-Relevant) across all uploaded hosts.
- **Offline & Private:** All processing happens in the browser. IndexedDB is used to persist large datasets locally (no network requests).
- **Rule Inspector:** Click any rule in the matrix to view descriptions, rationales, remediation instructions, and host-specific results.
- **Smart Filtering:** Filter matrix by search query, severity (High, Medium, Low), category grouping, or quick-chips (Differences, Failures, Exemptions, Passes).
- **Exemption Engine:**
  - Create global exemptions for rules across all servers.
  - Create targeted exemptions for specific servers.
  - Attach approval details and rationales.
  - Export and import exemption policies as JSON.
- **Rich Exports:** Export the consolidated compliance matrix to:
  - 📥 **CSV** (General spreadsheets)
  - 📊 **Excel (XLSX)** (Formatted report with SheetJS)
  - 📄 **Standalone HTML** (Self-contained, interactive matrix page for emailing or archiving)

---

## 🛠️ Usage

### Quick Start (Web)
Simply visit [y8765.github.io/ScapAnalyzer/](https://y8765.github.io/ScapAnalyzer/) in any modern web browser.

### Local Deployment
Since ScapAnalyzer is fully static, you can run it locally:
1. Clone the repository:
   ```bash
   git clone https://github.com/Y8765/ScapAnalyzer.git
   ```
2. Double-click `index.html` to open it in your browser. (Alternatively, run any simple HTTP server in the directory, e.g., `python -m http.server 8000`).

---

## 📂 Project Structure

```
ScapAnalyzer/
├── css/
│   └── styles.css       # Core styling & glassmorphism theme tokens
├── js/
│   ├── app.js           # Main application shell & setup
│   ├── comparator.js    # Comparison matrix generator & filter logic
│   ├── exemptions.js    # Exemption database & policy manager
│   ├── exporter.js      # CSV, Excel, and HTML export modules
│   ├── parser.js        # XCCDF & ARF XML parser and HTML scavenger
│   ├── storage.js       # IndexedDB storage provider
│   ├── ui.js            # UI DOM renderer & modal handlers
│   └── xlsx.bundle.js   # SheetJS library bundle
├── samples/             # Sample reports for testing
├── index.html           # Main user interface entrypoint
└── README.md            # Project documentation
```

---

## 🛡️ License

This project is licensed under the **MIT License**. See the license file for details.
