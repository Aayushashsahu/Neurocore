/**
 * NeuroCharts — Scientific visualization charts for the NEUROCORE platform.
 * Pure HTML5 Canvas, zero external dependencies. ES2020+.
 *
 * Exports on window.NeuroCharts:
 *   MembranePotentialChart, RasterPlotChart, SpikeActivityChart, Benchmark
 */
(() => {
  'use strict';

  // ───────────────────────── Palette ─────────────────────────
  const C = Object.freeze({
    CYAN:       '#00D9FF',
    VIOLET:     '#8767FF',
    TEXT:       '#8292aa',
    GRID:       '#1c2a40',
    SURFACE:    '#0D1423',
    THRESHOLD:  '#e74c3c',
    RESET_V:    '#f39c12',
    BAR_ANN:    '#52627b',
    BAR_CLOCK:  '#8b79db',
    BAR_EVENT:  '#5ad7d1',
  });

  const PAD = Object.freeze({ left: 45, bottom: 25, top: 15, right: 15 });
  const FONT = '9px monospace';
  const WINDOW_SIZE = 50; // default auto-scroll window

  // ───────────────────── Shared helpers ──────────────────────

  /**
   * Reusable ResizeObserver manager that prevents observer loops,
   * handles initially hidden parent containers, and debounces with requestAnimationFrame.
   */
  class ChartResizeController {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {function(): void} onResize
     */
    constructor(canvas, onResize) {
      this._canvas = canvas;
      this._onResize = onResize;
      this._observer = null;
      this._lastW = 0;
      this._lastH = 0;
      this._rafId = null;

      if (typeof window !== 'undefined' && window.ResizeObserver && canvas) {
        const target = canvas.parentElement || canvas;
        this._observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const cr = entry.contentRect;
            const w = Math.round(cr.width);
            const h = Math.round(cr.height);
            // Skip initially collapsed or hidden layout (display: none / 0px)
            if (w <= 0 || h <= 0) continue;
            // Skip redundant redraws if dimensions haven't changed
            if (w === this._lastW && h === this._lastH) continue;
            this._lastW = w;
            this._lastH = h;
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = requestAnimationFrame(() => {
              this._onResize();
            });
          }
        });
        this._observer.observe(target);
      }
    }

    /** Disconnect observer and cancel pending animation frames to prevent leaks. */
    disconnect() {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      if (this._observer) {
        this._observer.disconnect();
        this._observer = null;
      }
    }
  }

  /**
   * Configure a canvas for HiDPI rendering and return the drawing area.
   * Handles collapsed parent dimensions gracefully.
   * @param {HTMLCanvasElement} canvas
   * @returns {{ ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number }}
   */
  function prepCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const parent = canvas.parentElement;
    const w = rect.width > 0 ? rect.width : (parent && parent.clientWidth > 0 ? parent.clientWidth : 300);
    const h = rect.height > 0 ? rect.height : (parent && parent.clientHeight > 0 ? parent.clientHeight : 150);
    const safeW = Math.max(10, Math.round(w));
    const safeH = Math.max(10, Math.round(h));
    canvas.width  = Math.round(safeW * dpr);
    canvas.height = Math.round(safeH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w: safeW, h: safeH, dpr };
  }

  /** Plot area rectangle (CSS-px). */
  function plotArea(w, h) {
    return {
      x: PAD.left,
      y: PAD.top,
      w: w - PAD.left - PAD.right,
      h: h - PAD.top  - PAD.bottom,
    };
  }

  /** Draw a horizontal dashed line across the plot area. */
  function hDash(ctx, pa, yPx, color, dash = [6, 4]) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(pa.x + 0.5, yPx + 0.5);
    ctx.lineTo(pa.x + pa.w + 0.5, yPx + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw grid + Y-axis labels. */
  function drawYGrid(ctx, pa, labels, minVal, maxVal) {
    ctx.save();
    ctx.strokeStyle = C.GRID;
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.fillStyle   = C.TEXT;
    ctx.font        = FONT;
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';
    for (const lbl of labels) {
      const frac = (lbl - minVal) / (maxVal - minVal);
      const yPx  = pa.y + pa.h - frac * pa.h;
      ctx.beginPath();
      ctx.moveTo(pa.x + 0.5, Math.round(yPx) + 0.5);
      ctx.lineTo(pa.x + pa.w + 0.5, Math.round(yPx) + 0.5);
      ctx.stroke();
      ctx.fillText(typeof lbl === 'number' ? lbl.toFixed(1) : String(lbl), pa.x - 4, yPx);
    }
    ctx.restore();
  }

  /** Draw X-axis step labels. */
  function drawXLabels(ctx, pa, startStep, endStep, stepCount) {
    ctx.save();
    ctx.fillStyle    = C.TEXT;
    ctx.font         = FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const interval = Math.max(1, Math.ceil(stepCount / 10));
    for (let s = startStep; s <= endStep; s++) {
      if ((s - startStep) % interval !== 0 && s !== endStep) continue;
      const frac = (s - startStep) / Math.max(1, endStep - startStep);
      const xPx  = pa.x + frac * pa.w;
      ctx.fillText(String(s), xPx, pa.y + pa.h + 4);
    }
    ctx.restore();
  }

  /** Clear canvas (transparent). */
  function clearCanvas(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
  }

  // ════════════════════════════════════════════════════════════
  //  A.  MembranePotentialChart
  // ════════════════════════════════════════════════════════════

  class MembranePotentialChart {
    /** @type {HTMLCanvasElement} */
    #canvas;
    #ctx;
    #w = 0;
    #h = 0;
    #neuronId = 0;
    #resizeController = null;

    // cached data
    #potentials        = [];
    #threshold         = 0.65;
    #thresholdHistory  = [];
    #resetVoltage      = 0.0;
    #spikeTimes        = [];
    #currentStep       = 0;

    /**
     * Create a MembranePotentialChart.
     * @param {HTMLCanvasElement} canvasElement - Target canvas.
     * @param {object} [options]
     * @param {number} [options.windowSize=50] - Visible step window.
     */
    constructor(canvasElement, options = {}) {
      this.#canvas = canvasElement;
      this.windowSize = options.windowSize ?? WINDOW_SIZE;
      this.resize();
      this.#resizeController = new ChartResizeController(this.#canvas, () => this.resize());
    }

    /** Clean up observer listeners and animation loops. */
    destroy() {
      this.#resizeController?.disconnect();
      this.#resizeController = null;
    }

    /** Resize canvas to match its CSS dimensions. */
    resize() {
      const { ctx, w, h } = prepCanvas(this.#canvas);
      this.#ctx = ctx;
      this.#w   = w;
      this.#h   = h;
      this.#draw();
    }

    /** Clear all data and repaint blank chart. */
    clear() {
      this.#potentials        = [];
      this.#thresholdHistory  = [];
      this.#spikeTimes        = [];
      this.#currentStep       = 0;
      this.#draw();
    }

    /**
     * Set the neuron being observed (purely informational label).
     * @param {number|string} id
     */
    setNeuronId(id) {
      this.#neuronId = id;
      this.#draw();
    }

    /**
     * Push new simulation frame data and redraw.
     * @param {object} data
     * @param {number[]} data.potentials  - Full potential history array.
     * @param {number}   [data.threshold]
     * @param {number[]} [data.thresholdHistory] - Dynamic threshold trajectory array.
     * @param {number}   [data.resetVoltage]
     * @param {number[]} [data.spikeTimes]  - Step indices where spikes occurred.
     * @param {number}   [data.currentStep]
     */
    update(data) {
      this.#potentials        = data.potentials        ?? this.#potentials;
      this.#threshold         = data.threshold         ?? this.#threshold;
      this.#thresholdHistory  = data.thresholdHistory  ?? this.#thresholdHistory;
      this.#resetVoltage      = data.resetVoltage      ?? this.#resetVoltage;
      this.#spikeTimes        = data.spikeTimes        ?? this.#spikeTimes;
      this.#currentStep       = data.currentStep       ?? this.#currentStep;
      this.#draw();
    }

    // ── internal ──

    #draw() {
      const ctx = this.#ctx;
      if (!ctx) return;
      clearCanvas(ctx, this.#w, this.#h);
      const pa = plotArea(this.#w, this.#h);

      const minV = 0;
      const maxV = 1.2;

      // Y grid
      drawYGrid(ctx, pa, [0.0, 0.3, 0.6, 0.9, 1.2], minV, maxV);

      // reset voltage dashed line
      const rvY = pa.y + pa.h - ((this.#resetVoltage - minV) / (maxV - minV)) * pa.h;
      hDash(ctx, pa, rvY, C.RESET_V);

      // determine visible window
      const pts = this.#potentials;
      const totalSteps = pts.length;
      const winStart = Math.max(0, totalSteps - this.windowSize);
      const winEnd   = Math.max(this.windowSize - 1, totalSteps - 1);
      const visiblePts = pts.slice(winStart);

      // X labels
      const stepOffset = this.#currentStep - totalSteps + 1;
      drawXLabels(ctx, pa, winStart + stepOffset, winStart + stepOffset + (winEnd - winStart), winEnd - winStart + 1);

      const stepW = pa.w / Math.max(1, this.windowSize - 1);

      // Dynamic adaptive threshold vs static threshold rendering
      const thHist = this.#thresholdHistory;
      const visibleTh = thHist.length > 0 ? thHist.slice(Math.max(0, thHist.length - this.windowSize)) : [];
      const currentTh = visibleTh.length > 0 ? visibleTh[visibleTh.length - 1] : this.#threshold;
      const isDynamicThreshold = visibleTh.length > 1 && visibleTh.some(v => Math.abs(v - visibleTh[0]) > 0.001);

      if (isDynamicThreshold) {
        // Draw dynamic adaptive threshold trajectory curve across time
        ctx.save();
        ctx.strokeStyle = C.THRESHOLD;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        for (let i = 0; i < visibleTh.length; i++) {
          const x = pa.x + i * stepW + 0.5;
          const thVal = Math.max(minV, Math.min(maxV, visibleTh[i]));
          const y = pa.y + pa.h - ((thVal - minV) / (maxV - minV)) * pa.h + 0.5;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        // Static threshold mode: clean horizontal dashed line
        const thY = pa.y + pa.h - ((currentTh - minV) / (maxV - minV)) * pa.h;
        hDash(ctx, pa, thY, C.THRESHOLD);
      }

      if (visiblePts.length < 2) return;

      // membrane potential curve (smooth via quadratic interpolation)
      ctx.save();
      ctx.strokeStyle = C.CYAN;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();

      for (let i = 0; i < visiblePts.length; i++) {
        const x = pa.x + i * stepW + 0.5;
        const y = pa.y + pa.h - ((visiblePts[i] - minV) / (maxV - minV)) * pa.h + 0.5;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // quadratic smooth midpoint
          const px = pa.x + (i - 1) * stepW + 0.5;
          const py = pa.y + pa.h - ((visiblePts[i - 1] - minV) / (maxV - minV)) * pa.h + 0.5;
          const cx = (px + x) / 2;
          const cy = (py + y) / 2;
          ctx.quadraticCurveTo(px, py, cx, cy);
        }
      }
      // finish last segment
      const lastX = pa.x + (visiblePts.length - 1) * stepW + 0.5;
      const lastY = pa.y + pa.h - ((visiblePts[visiblePts.length - 1] - minV) / (maxV - minV)) * pa.h + 0.5;
      ctx.lineTo(lastX, lastY);
      ctx.stroke();
      ctx.restore();

      // spike markers
      ctx.save();
      ctx.fillStyle = C.CYAN;
      for (const sTime of this.#spikeTimes) {
        const idx = sTime - winStart - stepOffset;
        if (idx < 0 || idx >= visiblePts.length) continue;
        const sx = pa.x + idx * stepW + 0.5;
        const sv = visiblePts[idx] ?? currentTh;
        const sy = pa.y + pa.h - ((sv - minV) / (maxV - minV)) * pa.h + 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // neuron ID & live threshold readout label
      if (this.#neuronId !== undefined) {
        ctx.save();
        ctx.fillStyle = C.TEXT;
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const thLabel = isDynamicThreshold ? `Vth(t)=${currentTh.toFixed(2)} [ADAPTIVE]` : `Vth=${currentTh.toFixed(2)}`;
        ctx.fillText(`Neuron ${String(this.#neuronId).padStart(2, '0')} · ${thLabel}`, pa.x + 4, pa.y + 2);
        ctx.restore();
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  //  B.  RasterPlotChart
  // ════════════════════════════════════════════════════════════

  class RasterPlotChart {
    #canvas;
    #ctx;
    #w = 0;
    #h = 0;
    #resizeController = null;

    #spikeRaster  = new Map();
    #neuronCount  = 0;
    #currentStep  = 0;

    /**
     * @param {HTMLCanvasElement} canvasElement
     * @param {object} [options]
     * @param {number} [options.windowSize=50]
     */
    constructor(canvasElement, options = {}) {
      this.#canvas = canvasElement;
      this.windowSize = options.windowSize ?? WINDOW_SIZE;
      this.resize();
      this.#resizeController = new ChartResizeController(this.#canvas, () => this.resize());
    }

    /** Clean up observer listeners. */
    destroy() {
      this.#resizeController?.disconnect();
      this.#resizeController = null;
    }

    /** Resize and redraw. */
    resize() {
      const { ctx, w, h } = prepCanvas(this.#canvas);
      this.#ctx = ctx;
      this.#w   = w;
      this.#h   = h;
      this.#draw();
    }

    /** Clear data. */
    clear() {
      this.#spikeRaster = new Map();
      this.#neuronCount = 0;
      this.#currentStep = 0;
      this.#draw();
    }

    /**
     * @param {object} data
     * @param {Map<number, number[]>} data.spikeRaster - neuronId → array of spike step indices.
     * @param {number} data.neuronCount
     * @param {number} data.currentStep
     */
    update(data) {
      this.#spikeRaster = data.spikeRaster  ?? this.#spikeRaster;
      this.#neuronCount = data.neuronCount  ?? this.#neuronCount;
      this.#currentStep = data.currentStep  ?? this.#currentStep;
      this.#draw();
    }

    #draw() {
      const ctx = this.#ctx;
      if (!ctx) return;
      clearCanvas(ctx, this.#w, this.#h);
      const pa = plotArea(this.#w, this.#h);
      const nc = Math.max(1, this.#neuronCount);

      // visible time window
      const winEnd   = this.#currentStep;
      const winStart = Math.max(0, winEnd - this.windowSize + 1);
      const winSpan  = Math.max(1, this.windowSize);

      // Y-axis grid every 10 neurons
      ctx.save();
      ctx.strokeStyle  = C.GRID;
      ctx.lineWidth    = 1;
      ctx.setLineDash([]);
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      const yStep = Math.max(1, nc < 20 ? 5 : 10);
      for (let n = 0; n <= nc; n += yStep) {
        const yPx = pa.y + (n / nc) * pa.h;
        ctx.beginPath();
        ctx.moveTo(pa.x + 0.5, Math.round(yPx) + 0.5);
        ctx.lineTo(pa.x + pa.w + 0.5, Math.round(yPx) + 0.5);
        ctx.stroke();
        ctx.fillText(String(n), pa.x - 4, yPx);
      }
      ctx.restore();

      // X labels
      drawXLabels(ctx, pa, winStart, winEnd, winSpan);

      // spikes
      ctx.save();
      ctx.fillStyle = C.CYAN;
      for (const [neuronId, times] of this.#spikeRaster) {
        if (neuronId >= nc) continue;
        const yPx = pa.y + (neuronId / nc) * pa.h;
        for (const t of times) {
          if (t < winStart || t > winEnd) continue;
          const frac = (t - winStart) / winSpan;
          const xPx  = pa.x + frac * pa.w;
          ctx.beginPath();
          ctx.arc(xPx + 0.5, yPx + 0.5, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  C.  SpikeActivityChart
  // ════════════════════════════════════════════════════════════

  class SpikeActivityChart {
    #canvas;
    #ctx;
    #w = 0;
    #h = 0;
    #resizeController = null;

    #spikeFrequency = [];
    #totalSpikes    = 0;
    #activeCount    = 0;
    #inactiveCount  = 0;
    #currentStep    = 0;

    /**
     * @param {HTMLCanvasElement} canvasElement
     * @param {object} [options]
     * @param {number} [options.windowSize=50]
     */
    constructor(canvasElement, options = {}) {
      this.#canvas = canvasElement;
      this.windowSize = options.windowSize ?? WINDOW_SIZE;
      this.resize();
      this.#resizeController = new ChartResizeController(this.#canvas, () => this.resize());
    }

    /** Clean up observer listeners. */
    destroy() {
      this.#resizeController?.disconnect();
      this.#resizeController = null;
    }

    /** Resize and redraw. */
    resize() {
      const { ctx, w, h } = prepCanvas(this.#canvas);
      this.#ctx = ctx;
      this.#w   = w;
      this.#h   = h;
      this.#draw();
    }

    /** Clear data. */
    clear() {
      this.#spikeFrequency = [];
      this.#totalSpikes    = 0;
      this.#activeCount    = 0;
      this.#inactiveCount  = 0;
      this.#currentStep    = 0;
      this.#draw();
    }

    /**
     * @param {object} data
     * @param {number[]} data.spikeFrequency - Spike count per time bin.
     * @param {number}   data.totalSpikes
     * @param {number}   data.activeCount
     * @param {number}   data.inactiveCount
     * @param {number}   data.currentStep
     */
    update(data) {
      this.#spikeFrequency = data.spikeFrequency ?? this.#spikeFrequency;
      this.#totalSpikes    = data.totalSpikes    ?? this.#totalSpikes;
      this.#activeCount    = data.activeCount    ?? this.#activeCount;
      this.#inactiveCount  = data.inactiveCount  ?? this.#inactiveCount;
      this.#currentStep    = data.currentStep    ?? this.#currentStep;
      this.#draw();
    }

    #draw() {
      const ctx = this.#ctx;
      if (!ctx) return;
      clearCanvas(ctx, this.#w, this.#h);
      const pa = plotArea(this.#w, this.#h);

      const freq     = this.#spikeFrequency;
      const total    = freq.length;
      const winStart = Math.max(0, total - this.windowSize);
      const visible  = freq.slice(winStart);
      const maxY     = Math.max(1, ...visible) * 1.15;

      // Y grid
      const yTicks = 5;
      ctx.save();
      ctx.strokeStyle  = C.GRID;
      ctx.lineWidth    = 1;
      ctx.setLineDash([]);
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= yTicks; i++) {
        const val = (maxY / yTicks) * i;
        const yPx = pa.y + pa.h - (i / yTicks) * pa.h;
        ctx.beginPath();
        ctx.moveTo(pa.x + 0.5, Math.round(yPx) + 0.5);
        ctx.lineTo(pa.x + pa.w + 0.5, Math.round(yPx) + 0.5);
        ctx.stroke();
        ctx.fillText(Math.round(val).toString(), pa.x - 4, yPx);
      }
      ctx.restore();

      // X labels
      const stepOff = this.#currentStep - total + 1;
      drawXLabels(ctx, pa, winStart + stepOff, winStart + stepOff + visible.length - 1, visible.length);

      if (visible.length === 0) return;

      const barW = pa.w / Math.max(1, this.windowSize);

      // bars
      ctx.save();
      ctx.fillStyle = 'rgba(0,217,255,0.45)';
      for (let i = 0; i < visible.length; i++) {
        const bh = (visible[i] / maxY) * pa.h;
        const x  = pa.x + i * barW;
        const y  = pa.y + pa.h - bh;
        ctx.fillRect(x + 1, y, Math.max(1, barW - 2), bh);
      }
      ctx.restore();

      // frequency line
      ctx.save();
      ctx.strokeStyle = C.VIOLET;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i < visible.length; i++) {
        const x = pa.x + (i + 0.5) * barW + 0.5;
        const y = pa.y + pa.h - (visible[i] / maxY) * pa.h + 0.5;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // running totals (top-right)
      ctx.save();
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      const rx = pa.x + pa.w - 4;
      const ry = pa.y + 2;
      ctx.fillText(`Total: ${this.#totalSpikes}`, rx, ry);
      ctx.fillText(`Active: ${this.#activeCount}`, rx, ry + 12);
      ctx.fillText(`Inactive: ${this.#inactiveCount}`, rx, ry + 24);
      ctx.restore();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  D.  Benchmark Charts (namespace)
  // ════════════════════════════════════════════════════════════

  const Benchmark = Object.freeze({

    /**
     * D1 — Grouped bar chart: ANN vs time-stepped SNN vs event-driven SNN.
     * @param {HTMLCanvasElement} canvas
     * @param {{ groups: { label: string, ann: number, clock: number, event: number }[] }} data
     */
    renderGroupedBar(canvas, data) {
      const { ctx, w, h } = prepCanvas(canvas);
      clearCanvas(ctx, w, h);
      const pa = plotArea(w, h);

      const groups = data.groups;
      if (!groups || groups.length === 0) return;

      // find max value for Y scale
      let maxVal = 0;
      for (const g of groups) {
        maxVal = Math.max(maxVal, g.ann, g.clock, g.event);
      }
      maxVal = maxVal * 1.15 || 1;

      // Y grid (5 ticks)
      const yTicks = 5;
      ctx.save();
      ctx.strokeStyle  = C.GRID;
      ctx.lineWidth    = 1;
      ctx.setLineDash([]);
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= yTicks; i++) {
        const val = (maxVal / yTicks) * i;
        const yPx = pa.y + pa.h - (i / yTicks) * pa.h;
        ctx.beginPath();
        ctx.moveTo(pa.x + 0.5, Math.round(yPx) + 0.5);
        ctx.lineTo(pa.x + pa.w + 0.5, Math.round(yPx) + 0.5);
        ctx.stroke();
        ctx.fillText(_shortNum(val), pa.x - 4, yPx);
      }
      ctx.restore();

      // bars
      const groupW     = pa.w / groups.length;
      const barCount   = 3;
      const barPad     = 4;
      const totalPad   = barPad * (barCount + 1);
      const barW       = Math.max(4, (groupW - totalPad) / barCount);
      const colors     = [C.BAR_ANN, C.BAR_CLOCK, C.BAR_EVENT];
      const labels     = ['Dense ANN', 'Time-stepped SNN', 'Event-driven SNN'];

      for (let gi = 0; gi < groups.length; gi++) {
        const g    = groups[gi];
        const vals = [g.ann, g.clock, g.event];
        const gx   = pa.x + gi * groupW;

        for (let bi = 0; bi < barCount; bi++) {
          const bh = (vals[bi] / maxVal) * pa.h;
          const bx = gx + barPad * (bi + 1) + bi * barW;
          ctx.fillStyle = colors[bi];
          ctx.fillRect(bx, pa.y + pa.h - bh, barW, bh);
        }

        // group label
        ctx.save();
        ctx.fillStyle    = C.TEXT;
        ctx.font         = FONT;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(g.label, gx + groupW / 2, pa.y + pa.h + 4);
        ctx.restore();
      }

      // legend
      _drawLegend(ctx, pa, labels, colors);

      // "SIMULATED PROXY" label
      _drawWatermark(ctx, pa, 'SIMULATED PROXY');
    },

    /**
     * D2 — Sparsity vs neuron updates line chart.
     * @param {HTMLCanvasElement} canvas
     * @param {{ sparsityLevels: number[], ann: number[], clock: number[], event: number[] }} data
     */
    renderSparsityChart(canvas, data) {
      const { ctx, w, h } = prepCanvas(canvas);
      clearCanvas(ctx, w, h);
      const pa = plotArea(w, h);

      const levels = data.sparsityLevels ?? [];
      const series = [
        { vals: data.ann,   color: C.BAR_ANN,   label: 'Dense ANN' },
        { vals: data.clock, color: C.BAR_CLOCK,  label: 'Time-stepped SNN' },
        { vals: data.event, color: C.BAR_EVENT,  label: 'Event-driven SNN' },
      ];

      let maxY = 0;
      for (const s of series) {
        if (s.vals) maxY = Math.max(maxY, ...s.vals);
      }
      maxY = maxY * 1.15 || 1;
      const minX = levels.length ? levels[0]  : 0;
      const maxX = levels.length ? levels[levels.length - 1] : 95;

      // Y grid
      const yTicks = 5;
      ctx.save();
      ctx.strokeStyle  = C.GRID;
      ctx.lineWidth    = 1;
      ctx.setLineDash([]);
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= yTicks; i++) {
        const val = (maxY / yTicks) * i;
        const yPx = pa.y + pa.h - (i / yTicks) * pa.h;
        ctx.beginPath();
        ctx.moveTo(pa.x + 0.5, Math.round(yPx) + 0.5);
        ctx.lineTo(pa.x + pa.w + 0.5, Math.round(yPx) + 0.5);
        ctx.stroke();
        ctx.fillText(_shortNum(val), pa.x - 4, yPx);
      }
      ctx.restore();

      // X labels (sparsity %)
      ctx.save();
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      const xInterval = Math.max(1, Math.ceil(levels.length / 8));
      for (let i = 0; i < levels.length; i++) {
        if (i % xInterval !== 0 && i !== levels.length - 1) continue;
        const frac = (levels[i] - minX) / Math.max(1, maxX - minX);
        ctx.fillText(`${levels[i]}%`, pa.x + frac * pa.w, pa.y + pa.h + 4);
      }
      ctx.restore();

      // lines
      for (const s of series) {
        if (!s.vals || s.vals.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < s.vals.length; i++) {
          const frac = levels.length ? (levels[i] - minX) / Math.max(1, maxX - minX) : i / Math.max(1, s.vals.length - 1);
          const x    = pa.x + frac * pa.w + 0.5;
          const y    = pa.y + pa.h - (s.vals[i] / maxY) * pa.h + 0.5;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      _drawLegend(ctx, pa, series.map(s => s.label), series.map(s => s.color));
      _drawWatermark(ctx, pa, 'ILLUSTRATIVE');
    },

    /**
     * D3 — Horizontal bar chart for latency comparison.
     * @param {HTMLCanvasElement} canvas
     * @param {{ ann: number, clock: number, event: number }} data
     */
    renderLatencyChart(canvas, data) {
      const { ctx, w, h } = prepCanvas(canvas);
      clearCanvas(ctx, w, h);
      const pa = plotArea(w, h);

      const items = [
        { label: 'Dense ANN',          value: data.ann   ?? 0, color: C.BAR_ANN   },
        { label: 'Time-stepped SNN',   value: data.clock ?? 0, color: C.BAR_CLOCK },
        { label: 'Event-driven SNN',   value: data.event ?? 0, color: C.BAR_EVENT },
      ];

      const maxVal = Math.max(1, ...items.map(i => i.value)) * 1.15;
      const barH   = Math.min(30, (pa.h - 10) / items.length - 6);

      // X grid
      const xTicks = 5;
      ctx.save();
      ctx.strokeStyle  = C.GRID;
      ctx.lineWidth    = 1;
      ctx.setLineDash([]);
      ctx.fillStyle    = C.TEXT;
      ctx.font         = FONT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i <= xTicks; i++) {
        const val = (maxVal / xTicks) * i;
        const xPx = pa.x + (i / xTicks) * pa.w;
        ctx.beginPath();
        ctx.moveTo(Math.round(xPx) + 0.5, pa.y + 0.5);
        ctx.lineTo(Math.round(xPx) + 0.5, pa.y + pa.h + 0.5);
        ctx.stroke();
        ctx.fillText(_shortNum(val), xPx, pa.y + pa.h + 4);
      }
      ctx.restore();

      // bars
      for (let i = 0; i < items.length; i++) {
        const item   = items[i];
        const yCenter = pa.y + ((i + 0.5) / items.length) * pa.h;
        const bw     = (item.value / maxVal) * pa.w;
        ctx.fillStyle = item.color;
        ctx.fillRect(pa.x, yCenter - barH / 2, bw, barH);

        // label on the left
        ctx.save();
        ctx.fillStyle    = C.TEXT;
        ctx.font         = FONT;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, pa.x - 4, yCenter);
        ctx.restore();

        // value on bar
        ctx.save();
        ctx.fillStyle    = '#fff';
        ctx.font         = FONT;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(_shortNum(item.value), pa.x + bw + 4, yCenter);
        ctx.restore();
      }

      _drawWatermark(ctx, pa, 'SIMULATED PROXY');
    },

    /**
     * D4 — Generate CSV from benchmark data and trigger browser download.
     * @param {object} data - Benchmark data object (groups array or key-value).
     * @param {string} filename
     */
    downloadCSV(data, filename = 'benchmark.csv') {
      let csv = '';

      if (Array.isArray(data.groups)) {
        csv = 'Metric,Dense ANN,Time-stepped SNN,Event-driven SNN,Unit,Measurement Type\n';
        for (const g of data.groups) {
          const unit = g.unit || 'evaluations';
          const type = g.type || 'Modelled Algorithmic';
          csv += `${_escCSV(g.label)},${g.ann},${g.clock},${g.event},${_escCSV(unit)},${_escCSV(type)}\n`;
        }
      } else {
        // generic key-value
        const keys = Object.keys(data);
        csv = keys.join(',') + '\n';
        const len  = Array.isArray(data[keys[0]]) ? data[keys[0]].length : 1;
        for (let i = 0; i < len; i++) {
          csv += keys.map(k => Array.isArray(data[k]) ? data[k][i] : data[k]).join(',') + '\n';
        }
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });

  // ───────────── Benchmark helpers ──────────────

  /** Draw a legend bar at the top of the chart. */
  function _drawLegend(ctx, pa, labels, colors) {
    ctx.save();
    ctx.font         = FONT;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    let lx = pa.x + 4;
    const ly = pa.y + 2;
    for (let i = 0; i < labels.length; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(lx, ly, 10, 8);
      lx += 14;
      ctx.fillStyle = C.TEXT;
      ctx.fillText(labels[i], lx, ly + 4);
      lx += ctx.measureText(labels[i]).width + 12;
    }
    ctx.restore();
  }

  /** Draw a small watermark label in the bottom-right corner. */
  function _drawWatermark(ctx, pa, text) {
    ctx.save();
    ctx.fillStyle    = 'rgba(130,146,170,0.4)';
    ctx.font         = '8px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, pa.x + pa.w - 2, pa.y + pa.h - 2);
    ctx.restore();
  }

  /** Shorten large numbers: 12500 → "12.5k". */
  function _shortNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  /** Escape a CSV field. */
  function _escCSV(s) {
    s = String(s);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  // ════════════════════════════════════════════════════════════
  //  E.  NeuralActivityMap (2D Spatial Network & Heatmap)
  // ════════════════════════════════════════════════════════════

  class NeuralActivityMap {
    #canvas;
    #ctx;
    #w = 0;
    #h = 0;
    #nodes = [];
    #edges = [];
    #neuronCount = 48;
    #spiked = [];
    #active = [];
    #potentials = [];
    #resizeController = null;

    /**
     * @param {HTMLCanvasElement} canvasElement
     */
    constructor(canvasElement) {
      this.#canvas = canvasElement;
      this.resize();
      this.#resizeController = new ChartResizeController(this.#canvas, () => this.resize());
    }

    /** Clean up observer listeners. */
    destroy() {
      this.#resizeController?.disconnect();
      this.#resizeController = null;
    }

    resize() {
      const { ctx, w, h } = prepCanvas(this.#canvas);
      this.#ctx = ctx;
      this.#w = w;
      this.#h = h;
      this.#generateLayout();
      this.draw();
    }

    /**
     * Synchronize with actual SNN engine topology.
     * @param {{ neuronCount: number, connections: Array<{ sourceId: number, targetId: number, weight?: number }> }} topology
     */
    setTopology(topology) {
      if (!topology) return;
      this.#neuronCount = topology.neuronCount || 48;
      const rawConnections = topology.connections || [];
      this.#edges = rawConnections.map(c => ({
        from: c.sourceId !== undefined ? c.sourceId : c.from,
        to: c.targetId !== undefined ? c.targetId : c.to,
        weight: c.weight || 0.2,
      }));
      this.#generateLayout();
      this.draw();
    }

    setNeuronCount(count, connections = null) {
      this.#neuronCount = count || 48;
      if (connections && connections.length > 0) {
        this.#edges = connections.map(c => ({
          from: c.sourceId !== undefined ? c.sourceId : c.from,
          to: c.targetId !== undefined ? c.targetId : c.to,
          weight: c.weight || 0.2,
        }));
      } else {
        this.#edges = [];
      }
      this.#generateLayout();
      this.draw();
    }

    #generateLayout() {
      const w = this.#w || 280;
      const h = this.#h || 240;
      const count = this.#neuronCount;
      const cols = Math.ceil(Math.sqrt(count * 1.4));
      const rows = Math.ceil(count / cols);
      const padX = 26;
      const padY = 24;
      const usableW = Math.max(100, w - padX * 2);
      const usableH = Math.max(80, h - padY * 2);

      this.#nodes = [];
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const jitterX = Math.sin(i * 9.2) * 5;
        const jitterY = Math.cos(i * 6.7) * 5;
        const x = padX + (cols === 1 ? 0.5 : col / (cols - 1)) * usableW + jitterX;
        const y = padY + (rows === 1 ? 0.5 : row / (rows - 1)) * usableH + jitterY;
        this.#nodes.push({ id: i, x, y, r: 3.5 });
      }

      // Generate clean nearest-neighbor edges if not provided
      if (this.#edges.length === 0) {
        this.#edges = [];
        this.#nodes.forEach(nA => {
          this.#nodes
            .filter(nB => nB.id < nA.id && Math.hypot(nB.x - nA.x, nB.y - nA.y) < Math.min(w, h) * 0.42)
            .sort((a, b) => Math.hypot(a.x - nA.x, a.y - nA.y) - Math.hypot(b.x - nA.x, b.y - nA.y))
            .slice(0, 2)
            .forEach(nB => this.#edges.push({ from: nB.id, to: nA.id }));
        });
      }
    }

    clear() {
      this.#spiked = [];
      this.#active = [];
      this.#potentials = [];
      this.draw();
    }

    update(data) {
      this.#spiked = data.spiked || [];
      this.#active = data.active || [];
      this.#potentials = data.potentials || [];
      if (data.neuronCount && data.neuronCount !== this.#neuronCount) {
        this.setNeuronCount(data.neuronCount, data.connections);
      } else {
        this.draw();
      }
    }

    draw() {
      const ctx = this.#ctx;
      if (!ctx || !this.#w || !this.#h) return;
      clearCanvas(ctx, this.#w, this.#h);

      const spikedSet = new Set(this.#spiked);
      const activeSet = new Set(this.#active);

      // 1. Draw synaptic lines
      ctx.lineWidth = 0.8;
      for (const edge of this.#edges) {
        const nA = this.#nodes[edge.from];
        const nB = this.#nodes[edge.to];
        if (!nA || !nB) continue;

        const isSpiking = spikedSet.has(edge.from) || spikedSet.has(edge.to);
        const isActive = activeSet.has(edge.from) && activeSet.has(edge.to);

        ctx.strokeStyle = isSpiking
          ? 'rgba(0, 217, 255, 0.75)'
          : (isActive ? 'rgba(0, 224, 184, 0.35)' : 'rgba(25, 45, 68, 0.28)');
        ctx.beginPath();
        ctx.moveTo(nA.x, nA.y);
        ctx.lineTo(nB.x, nB.y);
        ctx.stroke();
      }

      // 2. Draw neuron nodes
      for (const node of this.#nodes) {
        const isSpike = spikedSet.has(node.id);
        const isActive = activeSet.has(node.id);
        const v = this.#potentials[node.id] || 0;

        if (isSpike) {
          // Expanding spike ring
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 217, 255, 0.25)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = '#00D9FF';
          ctx.fill();
        } else if (isActive || v > 0.2) {
          const intensity = Math.min(1, v);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r * 1.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 224, 184, ${0.4 + intensity * 0.5})`;
          ctx.fill();
          ctx.strokeStyle = '#00D9FF';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
          ctx.fillStyle = '#1D3045';
          ctx.fill();
          ctx.strokeStyle = '#2A4560';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // 3. Technical Micro-Overlay (Top corners)
      ctx.fillStyle = 'rgba(129, 149, 169, 0.6)';
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`2D TOPOLOGY · N=${this.#nodes.length}`, 8, 12);
      ctx.textAlign = 'right';
      ctx.fillText(`${spikedSet.size} SPIKING`, this.#w - 8, 12);
    }
  }

  // ───────────────── Public API ──────────────────

  window.NeuroCharts = Object.freeze({
    MembranePotentialChart,
    RasterPlotChart,
    SpikeActivityChart,
    NeuralActivityMap,
    Benchmark,
  });
})();
