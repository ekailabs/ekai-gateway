Model Catalog — UI Guide
========================

This folder contains JSON model specs and a lightweight, static UI to compare models side‑by‑side.

What’s here
- models/: one JSON file per model (see model_schema_v0.json for structure)
- ui/: static web UI (index.html, app.js, styles.css) that reads models.bundle.json
- build_ui.py: bundles models/*.json into ui/models.bundle.json

Requirements
- Python 3.8+

Quick start
1) Edit or add models in models/*.json
2) Build the bundle
   - python model_catalog/build_ui.py
   - This writes model_catalog/ui/models.bundle.json
3) Serve the UI (from model_catalog/ui)
   - python3 -m http.server 8080
   - Open http://localhost:8080 in your browser

Notes
- Tier dropdowns
  - The UI shows a tier dropdown in each model column when rate_limits.tiers contains at least one tier with a non‑null rpm or tpm value.
  - The single “Rate Limits” row displays RPM and TPM based on the selected tier. Default tier order: tier_1, free, then tier_2 → tier_5.
- Updating data
  - After changing any models/*.json, rerun: python model_catalog/build_ui.py, then refresh the browser.
- Troubleshooting
  - If the page looks stale, do a hard refresh to bust browser cache for app.js/models.bundle.json.
  - If loading fails, ensure you’re serving over HTTP; browsers block fetch() from file:// URLs.

