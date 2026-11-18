/**
 * NEUROCORE Platform — Interactive Architecture Diagram
 *
 * Self-contained vanilla JS module that renders a 5-layer architecture
 * diagram with click-to-expand accordion, animated data-flow connections,
 * and a hardware-backends section.
 *
 * Usage:
 *   <div id="arch"></div>
 *   <script src="architecture-interactive.js"></script>
 *   <script>ArchitectureDiagram.init(document.getElementById('arch'));</script>
 *
 * @module ArchitectureDiagram
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  STYLE INJECTION                                                   */
  /* ------------------------------------------------------------------ */

  const NS = 'arch-interactive';

  const CSS = `
/* ===== base ===== */
.${NS}-root {
  --surface: #0D1423;
  --border: #1c2a40;
  --text: #ffffff;
  --text-muted: #8292aa;
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: var(--text);
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
  user-select: none;
  -webkit-user-select: none;
}

/* ===== layer card ===== */
.${NS}-layer {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 0;
  cursor: pointer;
  transition: box-shadow 0.25s ease, transform 0.18s ease;
  overflow: hidden;
  border-left-width: 4px;
  min-height: 44px;
}
.${NS}-layer:hover {
  box-shadow: 0 0 18px rgba(0,0,0,0.5);
  transform: translateY(-1px);
}
.${NS}-layer:active {
  transform: translateY(0);
}

/* header row (always visible) */
.${NS}-layer-header {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  gap: 14px;
  min-height: 44px;
}
.${NS}-layer-num {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.6;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}
.${NS}-layer-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.${NS}-layer-info {
  flex: 1;
  min-width: 0;
}
.${NS}-layer-name {
  font-weight: 600;
  font-size: 15px;
  line-height: 1.3;
}
.${NS}-layer-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  margin-top: 2px;
}
.${NS}-layer-chevron {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  transition: transform 0.3s ease;
  opacity: 0.5;
}
.${NS}-layer.expanded .${NS}-layer-chevron {
  transform: rotate(180deg);
}

/* expandable detail panel */
.${NS}-detail {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease 0.05s, padding 0.3s ease;
  padding: 0 18px;
}
.${NS}-layer.expanded .${NS}-detail {
  max-height: 600px;
  opacity: 1;
  padding: 0 18px 18px;
}

.${NS}-detail-section {
  margin-bottom: 14px;
}
.${NS}-detail-section:last-child { margin-bottom: 0; }
.${NS}-detail-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.${NS}-detail-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.${NS}-detail-list li {
  font-size: 13px;
  color: var(--text);
  padding: 3px 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.${NS}-detail-list li::before {
  content: '›';
  flex-shrink: 0;
  opacity: 0.5;
  margin-top: -1px;
}

/* component grid */
.${NS}-comp-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.${NS}-comp-chip {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
}

/* status badge */
.${NS}-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(255,255,255,0.06);
}
.${NS}-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

/* io row */
.${NS}-io-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.${NS}-io-col { flex: 1; min-width: 140px; }

/* ===== connection ===== */
.${NS}-connection {
  position: relative;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.${NS}-conn-line {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--border);
  transform: translateX(-50%);
}
.${NS}-conn-dot {
  position: absolute;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  transform: translateX(-50%);
  animation: ${NS}-flow 2s linear infinite;
}
@keyframes ${NS}-flow {
  0%   { top: 100%; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 0%; opacity: 0; }
}
.${NS}-conn-label {
  position: relative;
  z-index: 1;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
  background: var(--surface);
  padding: 2px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  white-space: nowrap;
}

/* ===== hardware section ===== */
.${NS}-hw-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  text-align: center;
  margin: 32px 0 14px;
}
.${NS}-hw-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
@media (max-width: 700px) {
  .${NS}-hw-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px) {
  .${NS}-hw-grid { grid-template-columns: 1fr; }
}
.${NS}-hw-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  transition: border-color 0.2s, box-shadow 0.25s, transform 0.18s;
}
.${NS}-hw-card:hover {
  border-color: #2e4260;
  box-shadow: 0 0 20px rgba(0,0,0,0.4);
  transform: translateY(-2px);
}
.${NS}-hw-icon {
  font-size: 28px;
  margin-bottom: 8px;
  line-height: 1;
}
.${NS}-hw-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.${NS}-hw-meta {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.${NS}-hw-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.${NS}-hw-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

/* ===== reduced motion ===== */
@media (prefers-reduced-motion: reduce) {
  .${NS}-conn-dot { animation: none; opacity: 0.5; top: 50%; }
  .${NS}-detail { transition: none; }
  .${NS}-layer { transition: none; }
  .${NS}-layer-chevron { transition: none; }
  .${NS}-hw-card { transition: none; }
}
`;

  /* ------------------------------------------------------------------ */
  /*  DATA                                                              */
  /* ------------------------------------------------------------------ */

  const LAYERS = [
    {
      num: '05',
      name: 'Experiment Orchestration',
      color: '#b78dff',
      icon: '🧪',
      desc: 'Reproducible experiment runner, configuration management',
      responsibilities: [
        'Reproducible experiment runner',
        'Configuration management',
        'Result aggregation and statistical analysis',
      ],
      components: [
        'YAML config parser',
        'Random seed manager',
        'Warm-up controller',
        'Confidence interval calculator',
        'Hardware manifest',
      ],
      inputs: ['Experiment YAML files', 'Hardware config'],
      outputs: ['Reproducible results', 'Statistical reports'],
      status: 'PLANNED',
      statusColor: '#8292aa',
    },
    {
      num: '04',
      name: 'Measurement & Optimization',
      color: '#60d9ce',
      icon: '📊',
      desc: 'Performance profiling, activity measurement',
      responsibilities: [
        'Performance profiling',
        'Activity measurement',
        'Multi-objective optimisation',
      ],
      components: [
        'Spike counter',
        'Synaptic event tracker',
        'Neuron update profiler',
        'Latency timer',
        'Memory monitor',
        'Energy interface',
      ],
      inputs: ['Runtime metrics from Layer 03'],
      outputs: ['Pareto analysis', 'Profiling reports'],
      status: 'CONCEPT',
      statusColor: '#8292aa',
    },
    {
      num: '03',
      name: 'Adaptive Computation Engine',
      color: '#e6b66f',
      icon: '⚙️',
      desc: 'Pluggable adaptive policies',
      responsibilities: [
        'Pluggable adaptive policies',
        'Computation cost reduction',
        'Dynamic parameter adjustment',
      ],
      components: [
        'Activity-modulated threshold',
        'Adaptive temporal bins',
        'Confidence-based early exit',
      ],
      inputs: ['Event scheduling data', 'Neuron dynamics'],
      outputs: ['Policy-adjusted parameters'],
      status: 'DEMO',
      statusExtra: 'browser simulation',
      statusColor: '#e6b66f',
    },
    {
      num: '02',
      name: 'Core Neuromorphic Runtime',
      color: '#649eff',
      icon: '🧠',
      desc: 'Event-driven and time-stepped execution',
      responsibilities: [
        'Event-driven and time-stepped execution',
        'Neuron dynamics simulation',
        'Synaptic weight management',
      ],
      components: [
        'Timestamped event queue',
        'Scheduler',
        'LIF neuron model',
        'Adaptive LIF',
        'Sparse synaptic updates',
      ],
      inputs: ['Encoded spike events'],
      outputs: ['Neuron state', 'Spike events', 'Event queue'],
      status: 'DEMO',
      statusExtra: 'browser simulation',
      statusColor: '#649eff',
    },
    {
      num: '01',
      name: 'Workload Interface',
      color: '#6ad5a8',
      icon: '📡',
      desc: 'Input data handling and event conversion',
      responsibilities: [
        'Input data handling and event conversion',
        'Multi-modal sensor support',
        'Spike encoding strategies',
      ],
      components: [
        'Event vision (DVS)',
        'IoT sensor streams',
        'Synthetic signal generator',
        'Rate encoder',
        'Temporal encoder',
        'Latency encoder',
      ],
      inputs: ['Raw sensor data', 'Synthetic signals'],
      outputs: ['Encoded spike events'],
      status: 'PLANNED',
      statusColor: '#8292aa',
    },
  ];

  const CONNECTIONS = [
    { label: 'experiment config', color: '#b78dff' },
    { label: 'computation metrics', color: '#60d9ce' },
    { label: 'event scheduling', color: '#e6b66f' },
    { label: 'encoded spike events', color: '#649eff' },
  ];

  const HARDWARE = [
    {
      icon: '💻',
      name: 'CPU',
      strategy: 'Multi-threaded event queue',
      optimization: 'SIMD spike batching',
      status: 'DEMO TARGET',
      dotColor: '#6ad5a8',
    },
    {
      icon: '🎮',
      name: 'GPU',
      strategy: 'Massively parallel timestep',
      optimization: 'Sparse matrix kernels',
      status: 'PLANNED',
      dotColor: '#8292aa',
    },
    {
      icon: '🍓',
      name: 'Raspberry Pi',
      strategy: 'Optimised single-core loop',
      optimization: 'Fixed-point arithmetic',
      status: 'PLANNED',
      dotColor: '#8292aa',
    },
    {
      icon: '📟',
      name: 'ESP32',
      strategy: 'Bare-metal event loop',
      optimization: 'Quantised 8-bit weights',
      status: 'STRETCH',
      dotColor: '#e6b66f',
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  HELPERS                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Create a DOM element with optional class list and attributes.
   * @param {string} tag
   * @param {string} [cls]
   * @param {Object<string,string>} [attrs]
   * @returns {HTMLElement}
   */
  const el = (tag, cls, attrs) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  /** Chevron-down SVG */
  const chevronSvg = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add(`${NS}-layer-chevron`);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    svg.appendChild(path);
    return svg;
  };

  /* ------------------------------------------------------------------ */
  /*  BUILDERS                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Build one layer card.
   * @param {Object} layer
   * @returns {HTMLElement}
   */
  function buildLayerCard(layer) {
    const card = el('div', `${NS}-layer`);
    card.style.borderLeftColor = layer.color;

    // header
    const header = el('div', `${NS}-layer-header`);
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-label', `Layer ${layer.num}: ${layer.name}`);

    const num = el('span', `${NS}-layer-num`);
    num.textContent = layer.num;

    const icon = el('span', `${NS}-layer-icon`);
    icon.style.background = layer.color + '1a';
    icon.textContent = layer.icon;

    const info = el('div', `${NS}-layer-info`);
    const name = el('div', `${NS}-layer-name`);
    name.textContent = layer.name;
    const desc = el('div', `${NS}-layer-desc`);
    desc.textContent = layer.desc;
    info.append(name, desc);

    header.append(num, icon, info, chevronSvg());
    card.appendChild(header);

    // detail panel
    const detail = el('div', `${NS}-detail`);

    // status
    const statusSec = el('div', `${NS}-detail-section`);
    const badge = el('span', `${NS}-status`);
    const dot = el('span', `${NS}-status-dot`);
    dot.style.background = layer.statusColor;
    badge.append(dot);
    const statusText = layer.statusExtra
      ? `${layer.status} — ${layer.statusExtra}`
      : layer.status;
    badge.append(document.createTextNode(statusText));
    statusSec.appendChild(badge);
    detail.appendChild(statusSec);

    // responsibilities
    detail.appendChild(buildListSection('Responsibilities', layer.responsibilities));

    // components grid
    const compSec = el('div', `${NS}-detail-section`);
    const compLabel = el('div', `${NS}-detail-label`);
    compLabel.textContent = 'Components';
    compSec.appendChild(compLabel);
    const grid = el('div', `${NS}-comp-grid`);
    layer.components.forEach((c) => {
      const chip = el('span', `${NS}-comp-chip`);
      chip.textContent = c;
      grid.appendChild(chip);
    });
    compSec.appendChild(grid);
    detail.appendChild(compSec);

    // inputs / outputs
    const ioRow = el('div', `${NS}-io-row`);
    const inCol = el('div', `${NS}-io-col`);
    inCol.appendChild(buildListSection('Inputs', layer.inputs));
    const outCol = el('div', `${NS}-io-col`);
    outCol.appendChild(buildListSection('Outputs', layer.outputs));
    ioRow.append(inCol, outCol);
    const ioSec = el('div', `${NS}-detail-section`);
    ioSec.appendChild(ioRow);
    detail.appendChild(ioSec);

    card.appendChild(detail);
    return card;
  }

  /**
   * Build a labeled list section.
   * @param {string} title
   * @param {string[]} items
   * @returns {HTMLElement}
   */
  function buildListSection(title, items) {
    const sec = el('div', `${NS}-detail-section`);
    const lbl = el('div', `${NS}-detail-label`);
    lbl.textContent = title;
    sec.appendChild(lbl);
    const ul = el('ul', `${NS}-detail-list`);
    items.forEach((item) => {
      const li = el('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  /**
   * Build animated connection strip between two layers.
   * @param {Object} conn
   * @returns {HTMLElement}
   */
  function buildConnection(conn) {
    const wrap = el('div', `${NS}-connection`);

    // vertical line
    wrap.appendChild(el('div', `${NS}-conn-line`));

    // animated dots (3 staggered)
    for (let i = 0; i < 3; i++) {
      const dot = el('div', `${NS}-conn-dot`);
      dot.style.background = conn.color;
      dot.style.boxShadow = `0 0 6px ${conn.color}`;
      dot.style.animationDelay = `${i * 0.65}s`;
      wrap.appendChild(dot);
    }

    // label
    const label = el('span', `${NS}-conn-label`);
    label.textContent = conn.label;
    wrap.appendChild(label);

    return wrap;
  }

  /**
   * Build hardware backend cards section.
   * @returns {HTMLElement}
   */
  function buildHardwareSection() {
    const frag = document.createDocumentFragment();

    const title = el('div', `${NS}-hw-title`);
    title.textContent = 'Target Execution Backends';
    frag.appendChild(title);

    const grid = el('div', `${NS}-hw-grid`);

    HARDWARE.forEach((hw) => {
      const card = el('div', `${NS}-hw-card`);

      const icon = el('div', `${NS}-hw-icon`);
      icon.textContent = hw.icon;

      const name = el('div', `${NS}-hw-name`);
      name.textContent = hw.name;

      const meta = el('div', `${NS}-hw-meta`);
      meta.innerHTML =
        `<div>${hw.strategy}</div>` +
        `<div style="margin-top:2px;">${hw.optimization}</div>`;

      const status = el('div', `${NS}-hw-status`);
      const dot = el('span', `${NS}-hw-status-dot`);
      dot.style.background = hw.dotColor;
      status.append(dot, document.createTextNode(hw.status));

      card.append(icon, name, meta, status);
      grid.appendChild(card);
    });

    frag.appendChild(grid);
    return frag;
  }

  /* ------------------------------------------------------------------ */
  /*  MODULE STATE                                                      */
  /* ------------------------------------------------------------------ */

  /** @type {HTMLElement|null} */
  let _root = null;
  /** @type {HTMLStyleElement|null} */
  let _style = null;
  /** @type {AbortController|null} */
  let _ac = null;

  /* ------------------------------------------------------------------ */
  /*  PUBLIC API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Initialise the interactive architecture diagram inside the given
   * container element.
   *
   * @param {HTMLElement} container - The DOM element to render into.
   *   Its contents will be replaced.
   */
  function init(container) {
    if (!container || !(container instanceof HTMLElement)) {
      throw new TypeError('ArchitectureDiagram.init() requires an HTMLElement');
    }

    // clean up any previous instance
    dispose();

    // inject styles
    _style = document.createElement('style');
    _style.textContent = CSS;
    document.head.prepend(_style);

    // root wrapper
    _root = el('div', `${NS}-root`);
    _ac = new AbortController();
    const signal = _ac.signal;

    // build layers + connections
    const layerEls = [];
    LAYERS.forEach((layer, i) => {
      const card = buildLayerCard(layer);
      layerEls.push(card);
      _root.appendChild(card);

      // connection between this layer and the next
      if (i < LAYERS.length - 1) {
        _root.appendChild(buildConnection(CONNECTIONS[i]));
      }
    });

    // accordion behaviour
    const toggle = (card) => {
      const isExpanding = !card.classList.contains('expanded');
      // collapse all
      layerEls.forEach((c) => {
        c.classList.remove('expanded');
        const h = c.querySelector(`.${NS}-layer-header`);
        if (h) h.setAttribute('aria-expanded', 'false');
      });
      if (isExpanding) {
        card.classList.add('expanded');
        const h = card.querySelector(`.${NS}-layer-header`);
        if (h) h.setAttribute('aria-expanded', 'true');
      }
    };

    layerEls.forEach((card) => {
      const header = card.querySelector(`.${NS}-layer-header`);
      header.addEventListener(
        'click',
        () => toggle(card),
        { signal },
      );
      header.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(card);
          }
        },
        { signal },
      );
    });

    // hardware section
    _root.appendChild(buildHardwareSection());

    // mount
    container.textContent = '';
    container.appendChild(_root);
  }

  /**
   * Dispose of all event listeners and injected DOM created by
   * {@link init}. Safe to call multiple times.
   */
  function dispose() {
    if (_ac) {
      _ac.abort();
      _ac = null;
    }
    if (_style && _style.parentNode) {
      _style.parentNode.removeChild(_style);
      _style = null;
    }
    if (_root && _root.parentNode) {
      _root.parentNode.removeChild(_root);
      _root = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  EXPORT                                                            */
  /* ------------------------------------------------------------------ */

  window.ArchitectureDiagram = { init, dispose };
})();
