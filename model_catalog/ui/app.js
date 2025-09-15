/* global window, document, fetch */
(function(){
  const cfg = window.ModelCompareConfig || { defaultTierPreference: ['tier_2','tier_3','tier_4','tier_5','tier_1','free'] };
  const state = {
    models: [],
    filtered: [],
    selected: [], // array of model ids
    selectedTier: {}, // id -> tierKey or null (generic)
    search: '',
    provider: 'all',
  };

  const elNow = () => document.getElementById('js-now');
  const elSearch = () => document.getElementById('js-search');
  const elProvider = () => document.getElementById('js-provider');
  const elChips = () => document.getElementById('js-chips');
  const elGrid = () => document.getElementById('js-grid');

  function formatNumber(num){
    if (num == null) return '—';
    if (num >= 1_000_000_000) return (num/1_000_000_000).toFixed(1)+'B';
    if (num >= 1_000_000) return (num/1_000_000).toFixed(1)+'M';
    if (num >= 1_000) return (num/1_000).toFixed(1)+'K';
    return String(num);
  }

  function providers(){
    return Array.from(new Set(state.models.map(m => m.provider))).sort();
  }

  function tierReadable(key){
    if (key === 'free') return 'Free';
    if (key && key.startsWith('tier_')) return key.replace('tier_', 'Tier ');
    return key || 'Generic';
  }

  function availableTiers(model){
    const tiers = (model.rate_limits && model.rate_limits.tiers) || {};
    return Object.entries(tiers)
      .filter(([,v]) => (v && (v.rpm != null || v.tpm != null)))
      .map(([k]) => k);
  }

  function defaultTierFor(model){
    const avail = availableTiers(model);
    for (const pref of (cfg.defaultTierPreference || [])){
      if (avail.includes(pref)) return pref;
    }
    return avail[0] || null; // null => use generic
  }

  function rateLimitFor(model, tierKey){
    const rl = model.rate_limits || {};
    if (tierKey){
      return (rl.tiers && rl.tiers[tierKey]) || null;
    }
    return rl.generic_limits || null;
  }

  function textPreferredPricing(model){
    const p = model.pricing && model.pricing.text_per_MTok;
    if (!p) return null;
    // Prefer base for Anthropic per request; otherwise fall back to standard then base
    if (model.provider === 'anthropic' && p.base) return p.base;
    return p.standard || p.base || null;
  }

  function escapeHtml(str){
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyFilters(){
    const q = state.search.trim().toLowerCase();
    state.filtered = state.models.filter(m => {
      const matchesProvider = state.provider === 'all' || m.provider === state.provider;
      const matchesQuery = q === '' ||
        (m.model_name || '').toLowerCase().includes(q) ||
        (m.provider || '').toLowerCase().includes(q) ||
        (m.snapshots || []).some(s => String(s).toLowerCase().includes(q));
      return matchesProvider && matchesQuery;
    });
  }

  function ensureTierInit(id){
    if (state.selectedTier[id] === undefined){
      const m = state.models.find(x => x.id === id);
      state.selectedTier[id] = defaultTierFor(m);
    }
  }

  function renderProviderOptions(){
    const sel = elProvider();
    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All providers';
    sel.appendChild(optAll);
    for (const p of providers()){
      const o = document.createElement('option');
      o.value = p; o.textContent = p; sel.appendChild(o);
    }
    sel.value = state.provider;
  }

  function renderChips(){
    const root = elChips();
    root.innerHTML = '';
    for (const m of state.filtered){
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.selected.includes(m.id) ? ' active' : '');
      btn.title = `${m.provider}/${m.model_name}`;
      btn.innerHTML = `<span class="name">${m.model_name}</span> <small>(${m.provider})</small>`;
      btn.onclick = () => {
        const idx = state.selected.indexOf(m.id);
        if (idx >= 0){
          state.selected.splice(idx,1);
        } else {
          state.selected.push(m.id);
          ensureTierInit(m.id);
        }
        renderGrid();
        renderChips();
      };
      root.appendChild(btn);
    }
  }

  function gridCols(){
    const n = state.selected.length;
    return `220px repeat(${n}, minmax(220px, 1fr))`;
  }

  function renderGrid(){
    const root = elGrid();
    root.innerHTML = '';
    if (state.selected.length === 0){
      const empty = document.createElement('div');
      empty.className = 'grid-cell';
      empty.textContent = 'Select models above to compare their properties.';
      root.appendChild(empty);
      return;
    }

    const selectedModels = state.selected.map(id => state.models.find(m => m.id === id)).filter(Boolean);

    function addRow(cells, isHead=false){
      const row = document.createElement('div');
      row.className = 'grid-row' + (isHead ? ' grid-head' : '');
      row.style.gridTemplateColumns = gridCols();
      for (const cell of cells){
        const div = document.createElement('div');
        div.className = 'grid-cell' + (cell.muted ? ' muted' : '');
        div.innerHTML = cell.html || '';
        row.appendChild(div);
      }
      root.appendChild(row);
    }

    // Header row
    const headCells = [{ html: '<div class="grid-title">Property</div>' }];
    for (const m of selectedModels){
      const tiers = availableTiers(m);
      const hasTiers = tiers.length > 0;
      const tierKey = state.selectedTier[m.id] ?? defaultTierFor(m);
      const title = `<div class="grid-title">${m.model_name}</div><div class="muted">${m.provider}</div>`;
      let tierHtml = '';
      if (hasTiers){
        const opts = tiers.map(t => `<option value="${t}" ${t === tierKey ? 'selected' : ''}>${tierReadable(t)}</option>`).join('');
        const genericOpt = m.rate_limits && m.rate_limits.generic_limits ? '<option value="">Generic</option>' : '';
        tierHtml = `<select data-tier-for="${m.id}" class="tier-select">${opts}${genericOpt}</select>`;
      }
      headCells.push({ html: `${title}${tierHtml}` });
    }
    addRow(headCells, true);

    // Single Rate Limits row (RPM + TPM; tiers supported for providers with tiers)
    function rlFor(m){
      const tierKey = state.selectedTier[m.id] ?? defaultTierFor(m);
      const rl = rateLimitFor(m, tierKey);
      return rl || {};
    }
    function rateLimitsCell(m){
      const rl = rlFor(m);
      const rpm = rl.rpm == null ? '—' : formatNumber(rl.rpm);
      const tpm = rl.tpm == null ? '—' : formatNumber(rl.tpm);
      if (rpm === '—' && tpm === '—') return '—';
      return `<div class="stat"><label>RPM</label><span>${rpm}</span></div><div class="stat"><label>TPM</label><span>${tpm}</span></div>`;
    }
    addRow([{ html: '<span class="prop-name">Rate Limits</span>' }, ...selectedModels.map(m => ({ html: rateLimitsCell(m) }))]);

    // Context window
    addRow([{ html: '<span class="prop-name">Context Window</span>' }, ...selectedModels.map(m => ({ html: m.context_window == null ? '—' : `${formatNumber(m.context_window)} tok` }))]);
    // Max output tokens
    addRow([{ html: '<span class="prop-name">Max Output Tokens</span>' }, ...selectedModels.map(m => ({ html: m.max_output_tokens == null ? '—' : `${formatNumber(m.max_output_tokens)} tok` }))]);
    // Reasoning
    addRow([{ html: '<span class="prop-name">Reasoning</span>' }, ...selectedModels.map(m => ({ html: m.reasoning === true ? 'Yes' : (m.reasoning === false ? 'No' : '—') }))]);
    // Modalities (separate rows)
    addRow([{ html: '<span class="prop-name">Modalities — Input</span>' }, ...selectedModels.map(m => ({ html: `${((m.modalities && m.modalities.input) || []).join(', ') || '—'}` }))]);
    addRow([{ html: '<span class="prop-name">Modalities — Output</span>' }, ...selectedModels.map(m => ({ html: `${((m.modalities && m.modalities.output) || []).join(', ') || '—'}` }))]);

    // Pricing (Text — prefer Base for Anthropic)
    addRow([{ html: '<span class="prop-name">$ text</span>' }, ...selectedModels.map(m => {
      const p = textPreferredPricing(m);
      if (!p) return { html: '—' };
      const input = p.input == null ? '—' : `$${p.input}/Mtok`;
      const output = p.output == null ? '—' : `$${p.output}/Mtok`;
      return { html: `In ${input} · Out ${output}` };
    })]);

    // Additional commonly useful fields
    addRow([{ html: '<span class="prop-name">Training Data Cutoff</span>' }, ...selectedModels.map(m => ({ html: m.training_data_cutoff || '—' }))]);
    addRow([{ html: '<span class="prop-name">Capabilities</span>' }, ...selectedModels.map(m => ({ html: (m.capabilities || []).join(', ') || '—' }))]);
    addRow([{ html: '<span class="prop-name">Endpoints</span>' }, ...selectedModels.map(m => ({ html: (m.endpoints || []).join(', ') || '—' }))]);
    addRow([{ html: '<span class="prop-name">Tools</span>' }, ...selectedModels.map(m => ({ html: (m.tools || []).join(', ') || '—' }))]);
    addRow([{ html: '<span class="prop-name">Snapshots</span>' }, ...selectedModels.map(m => ({ html: (m.snapshots || []).join(', ') || '—' }))]);
    addRow([{ html: '<span class="prop-name">Last Updated</span>' }, ...selectedModels.map(m => ({ html: m.last_updated || '—' }))]);
    addRow([{ html: '<span class="prop-name">ID</span>' }, ...selectedModels.map(m => ({ html: m.id || '—' }))]);
    addRow([{ html: '<span class="prop-name">Source File</span>' }, ...selectedModels.map(m => ({ html: m.__filename || '—' }))]);

    // Dynamic: All JSON properties as dot paths, hide rows if all null
    function isPrimitive(x){
      return x === null || x === undefined || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean';
    }
    function isEmptyObject(obj){
      return obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0;
    }
    function flattenProps(obj, prefix=''){
      const out = {};
      if (!obj || typeof obj !== 'object') return out;
      for (const k of Object.keys(obj)){
        const v = obj[k];
        const path = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === undefined){
          out[path] = null;
        } else if (Array.isArray(v)){
          if (v.length === 0){
            out[path] = null;
          } else if (v.every(item => isPrimitive(item))){
            out[path] = v.join(', ');
          } else {
            out[path] = JSON.stringify(v);
          }
        } else if (typeof v === 'object'){
          if (isEmptyObject(v)){
            out[path] = null;
          }
          const child = flattenProps(v, path);
          for (const ck of Object.keys(child)) out[ck] = child[ck];
        } else {
          out[path] = v;
        }
      }
      return out;
    }
    const flattened = selectedModels.map(m => flattenProps(m));
    const allKeysSet = new Set();
    for (const f of flattened){
      for (const k of Object.keys(f)) allKeysSet.add(k);
    }
    const allKeys = Array.from(allKeysSet).sort();

    function displayVal(v){
      if (v === null || v === undefined || v === '') return '—';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      return escapeHtml(String(v));
    }
    function shortenKey(key){
      let s = key;
      s = s.replace(/^pricing\./, '$.');
      s = s.replace(/text_per_MTok/g, 'text');
      s = s.replace(/image_per_MTok/g, 'image');
      s = s.replace(/audio_per_MTok/g, 'audio');
      s = s.replace(/fine_tuning_per_MTok/g, 'fine_tune');
      s = s.replace(/embeddings_per_MTok/g, 'embeds');
      s = s.replace(/legacy_models_per_MTok/g, 'legacy');
      s = s.replace(/feature_specific/g, 'features');
      s = s.replace(/long_context/g, 'long_ctx');
      s = s.replace(/batch_processing/g, 'batch');
      s = s.replace(/cache_writes_5m/g, 'cache5m');
      s = s.replace(/cache_writes_1h/g, 'cache1h');
      s = s.replace(/cache_hits_refreshes/g, 'cache_hit');
      s = s.replace(/generic_limits/g, 'generic');
      s = s.replace(/rate_limits/g, 'rl');
      s = s.replace(/per_image/g, 'per_img');
      return s;
    }
    function isMeaningful(v){
      if (v === null || v === undefined) return false;
      if (typeof v === 'string') return v.trim() !== '' && v !== 'null' && v !== 'undefined';
      if (Array.isArray(v)) return v.length > 0; // should not happen post-flatten
      if (typeof v === 'object') return Object.keys(v).length > 0; // should not happen post-flatten
      return true; // numbers incl 0, booleans
    }

    // Optional: skip some rows already represented more readably above
    const skipPrefixes = [
      // Shown via custom rows above
      'modalities.input', 'modalities.output',
      'training_data_cutoff', 'capabilities', 'endpoints', 'tools', 'snapshots', 'last_updated', 'id', '__filename',
      'context_window', 'max_output_tokens', 'reasoning',
    ];

    for (const key of allKeys){
      if (skipPrefixes.some(p => key === p)) continue;
      // Only show if at least one model has meaningful value
      const anyVal = flattened.some(f => isMeaningful(f[key]));
      if (!anyVal) continue;
      addRow([
        { html: `<span class="prop-name">${escapeHtml(shortenKey(key))}</span>` },
        ...flattened.map(f => ({ html: displayVal(f[key]) }))
      ]);
    }

    // Attach tier change listeners
    for (const m of selectedModels){
      const sel = root.querySelector(`select[data-tier-for="${m.id}"]`);
      if (sel){
        sel.onchange = (e) => {
          const v = e.target.value;
          state.selectedTier[m.id] = v === '' ? null : v;
          renderGrid();
        };
      }
    }
  }

  async function init(){
    // timestamp
    const t = elNow();
    if (t) t.textContent = new Date().toLocaleString();

    // load bundle
    let bundle;
    try {
      const res = await fetch('./models.bundle.json', { cache: 'no-store' });
      bundle = await res.json();
    } catch(e){
      console.error('Failed to load models.bundle.json. Run: python build_ui.py', e);
      elGrid().innerHTML = '<div class="grid-cell">Failed to load data. Run <code>python model_catalog/build_ui.py</code> to generate models.bundle.json</div>';
      return;
    }
    state.models = (bundle.models || []).map(m => ({ ...m, id: m.id || `${m.provider}/${m.model_name}` }));
    state.provider = 'all';
    applyFilters();
    renderProviderOptions();
    renderChips();
    renderGrid();

    // wire inputs
    elSearch().addEventListener('input', (e) => {
      state.search = e.target.value;
      applyFilters();
      renderChips();
    });
    elProvider().addEventListener('change', (e) => {
      state.provider = e.target.value;
      applyFilters();
      renderChips();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
