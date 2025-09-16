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

