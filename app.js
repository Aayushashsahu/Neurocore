/**
 * NEUROCORE — Adaptive Event-Driven Neuromorphic Computing Platform
 * Main Frontend Application Controller (v2.0.0)
 *
 * Coordinates:
 * - Single-page application navigation & responsive sidebar
 * - Three.js 3D neural network visualizers (Hero & Simulation Lab)
 * - SNN Simulation Engine (LIF neurons, event queue, adaptive policies)
 * - Scientific canvas charts (Membrane potential, Spike raster, Activity)
 * - Active synaptic event queue inspector
 * - Performance Benchmark Lab (Grouped bar, Sparsity curve, Latency proxy, CSV export)
 * - Interactive 5-layer architecture explorer
 */

(() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // DOM UTILITIES & CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const pageNames = {
    overview: 'Overview',
    simulator: 'Simulation lab',
    benchmarks: 'Benchmark lab',
    architecture: 'Architecture',
    hardware: 'Hardware',
    research: 'Research',
  };

  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NAVIGATION & VIEW SWITCHING
  // ─────────────────────────────────────────────────────────────────────────
  let currentPage = 'overview';

  function navigate(page) {
    if (!pageNames[page]) return;
    currentPage = page;

    // Toggle active pages & sidebar buttons
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('#currentSection').textContent = pageNames[page];
    $('#sidebar').classList.remove('open');
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Page-specific initialization & resize hooks
    if (page === 'overview') {
      initHero3D();
    } else if (page === 'simulator') {
      initSim3D();
      resizeSimCharts();
    } else if (page === 'benchmarks') {
      updateBenchmarks();
      resizeBenchmarkCharts();
    } else if (page === 'architecture') {
      initArchitectureDiagram();
    }
  }

  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
  $$('[data-goto]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.goto)));
  $('#mobileMenu')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  // About modal handlers
  const modal = $('#infoModal');
  $('#infoButton')?.addEventListener('click', () => modal?.classList.add('open'));
  $('#closeModal')?.addEventListener('click', () => modal?.classList.remove('open'));
  $('#modalOkay')?.addEventListener('click', () => modal?.classList.remove('open'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  // ─────────────────────────────────────────────────────────────────────────
  // 3D VISUALIZATION CONTROLLER (THREE.JS)
  // ─────────────────────────────────────────────────────────────────────────
  let hero3DInitialized = false;
  let sim3DInitialized = false;
  let heroRetries = 0;
  let simRetries = 0;

  function initHero3D() {
    const container = $('#hero-three-container');
    if (!container || hero3DInitialized) return;
    if (window.NeuroViz && typeof window.NeuroViz.initHeroViz === 'function') {
      window.NeuroViz.initHeroViz(container);
      hero3DInitialized = true;
    } else if (heroRetries < 25) {
      heroRetries++;
      setTimeout(initHero3D, 120);
    }
  }

  function initSim3D() {
    const container = $('#sim-three-container');
    if (!container || sim3DInitialized) return;
    if (window.NeuroViz && typeof window.NeuroViz.initSimViz === 'function') {
      window.NeuroViz.initSimViz(container);
      sim3DInitialized = true;
      if (simEngine && typeof window.NeuroViz.setSimTopology === 'function') {
        window.NeuroViz.setSimTopology(simEngine.getTopology());
      }
    } else if (simRetries < 25) {
      simRetries++;
      setTimeout(initSim3D, 120);
    }
  }

  window.addEventListener('neuroviz-ready', () => {
    if (currentPage === 'overview') initHero3D();
    else if (currentPage === 'simulator') initSim3D();
  });

  $('#resetSimCamera')?.addEventListener('click', () => {
    if (window.NeuroViz && typeof window.NeuroViz.resetCamera === 'function') {
      window.NeuroViz.resetCamera();
      toast('3D camera view reset.');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SNN SIMULATION ENGINE & SCIENTIFIC CHARTS
  // ─────────────────────────────────────────────────────────────────────────
  let simEngine = null;
  let membraneChart = null;
  let rasterChart = null;
  let activityChart = null;
  let activityMap = null;
  let selectedNeuronId = 0;

  // Simulation loop control
  let isSimRunning = false;
  let isSimPaused = false;
  let simIntervalId = null;
  let targetTotalSteps = 40;

  // Configuration state
  const simConfig = {
    neuronCount: 48,
    sparsity: 70,
    threshold: 0.65,
    steps: 40,
    mode: 'event',
    adaptiveThreshold: false,
    adaptiveTemporal: false,
    speedMultiplier: 1.0,
    seed: 42,
  };

  /**
   * Updates dynamic workstation runtime status indicator badge
   * @param {'IDLE'|'RUNNING'|'PAUSED'|'COMPLETED'} status
   */
  function setSimStatus(status) {
    const badge = $('#simStatusBadge');
    if (!badge) return;
    badge.className = 'sw-badge';
    if (status === 'RUNNING') {
      badge.classList.add('status-live');
      badge.innerHTML = '<span class="pulse-dot"></span> SNN RUNNING';
    } else if (status === 'PAUSED') {
      badge.classList.add('status-paused');
      badge.innerHTML = '<span class="pause-dot">❚❚</span> SNN PAUSED';
    } else if (status === 'COMPLETED') {
      badge.classList.add('status-complete');
      badge.innerHTML = '<span class="check-dot">✓</span> SNN COMPLETED';
    } else {
      badge.classList.add('status-idle');
      badge.innerHTML = '<span class="idle-dot">○</span> SNN IDLE';
    }
  }

  /**
   * Initializes or re-configures the simulation engine and charts
   */
  function initSimulation() {
    let topo = null;
    // Instantiate or reconfigure SimulationEngine
    if (window.SimulationEngine) {
      const engineOpts = {
        neuronCount: simConfig.neuronCount,
        inputSparsity: simConfig.sparsity / 100,
        firingThreshold: simConfig.threshold,
        executionMode: simConfig.mode,
        adaptiveThreshold: simConfig.adaptiveThreshold,
        adaptiveTemporal: simConfig.adaptiveTemporal,
        seed: simConfig.seed,
      };
      simEngine = new window.SimulationEngine(engineOpts);
      simEngine.init(engineOpts);
      topo = simEngine.getTopology();

      // Synchronize 3D Neural Mesh with actual engine topology
      if (window.NeuroViz && typeof window.NeuroViz.setSimTopology === 'function') {
        window.NeuroViz.setSimTopology(topo);
      }
    }

    // Initialize scientific charts if not already created
    if (window.NeuroCharts) {
      const mCanvas = $('#membraneChartCanvas');
      if (mCanvas && !membraneChart) {
        membraneChart = new window.NeuroCharts.MembranePotentialChart(mCanvas, { windowSize: 45 });
      }
      const rCanvas = $('#rasterChartCanvas');
      if (rCanvas && !rasterChart) {
        rasterChart = new window.NeuroCharts.RasterPlotChart(rCanvas, { windowSize: 45 });
      }
      const aCanvas = $('#activityChartCanvas');
      if (aCanvas && !activityChart) {
        activityChart = new window.NeuroCharts.SpikeActivityChart(aCanvas, { windowSize: 45 });
      }
      const mapCanvas = $('#neuralActivityMapCanvas');
      if (mapCanvas && !activityMap && window.NeuroCharts.NeuralActivityMap) {
        activityMap = new window.NeuroCharts.NeuralActivityMap(mapCanvas);
      }
    }

    // Synchronize 2D Neural Activity Map with actual engine topology
    if (activityMap && topo && typeof activityMap.setTopology === 'function') {
      activityMap.setTopology(topo);
    }

    populateNeuronSelector();
    updateSimModeBadge();
    resetSimUIState();
  }

  function populateNeuronSelector() {
    const sel = $('#membraneNeuronSelect');
    if (!sel) return;
    sel.innerHTML = '';
    for (let i = 0; i < simConfig.neuronCount; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Neuron ${String(i).padStart(2, '0')}`;
      if (i === selectedNeuronId) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  $('#membraneNeuronSelect')?.addEventListener('change', e => {
    selectedNeuronId = parseInt(e.target.value, 10) || 0;
    if (membraneChart) {
      membraneChart.setNeuronId(selectedNeuronId);
      refreshChartsFromEngine();
    }
  });

  function updateSimModeBadge() {
    const modeStr = simConfig.mode === 'event' ? 'EVENT-DRIVEN SNN' : 'TIME-STEPPED SNN';
    const badge = $('#simModeBadge');
    if (badge) badge.textContent = `MODE: ${modeStr}`;
    const topbarTag = $('#topbarModeTag');
    if (topbarTag) topbarTag.textContent = modeStr;
  }

  function resizeSimCharts() {
    membraneChart?.resize();
    rasterChart?.resize();
    activityChart?.resize();
    activityMap?.resize();
  }

  function syncControlOutputs() {
    $('#neuronCountOut').textContent = `${simConfig.neuronCount} neurons`;
    $('#sparsityOut').textContent = `${simConfig.sparsity}%`;
    $('#thresholdOut').textContent = Number(simConfig.threshold).toFixed(2);
    $('#stepsOut').textContent = `${simConfig.steps} steps`;

    const seedInput = $('#experimentSeed');
    if (seedInput && parseInt(seedInput.value, 10) !== simConfig.seed) {
      seedInput.value = simConfig.seed;
    }
    const hashDisp = $('#seedHashDisplay');
    if (hashDisp) {
      const hex = '0x' + (Number(simConfig.seed) >>> 0).toString(16).toUpperCase().padStart(8, '0');
      hashDisp.textContent = hex;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIMULATION PLAYBACK & STEPPING LOGIC
  // ─────────────────────────────────────────────────────────────────────────

  function getStepDelayMs() {
    const baseDelay = 55; // ms
    return Math.max(8, Math.round(baseDelay / simConfig.speedMultiplier));
  }

  function updatePlaybackButtons(running, paused) {
    const runBtn = $('#runSimulation');
    const pauseBtn = $('#pauseSimulation');
    const resumeBtn = $('#resumeSimulation');
    const stepBtn = $('#stepSimulation');

    if (runBtn) runBtn.disabled = running && !paused;
    if (pauseBtn) pauseBtn.disabled = !running || paused;
    if (resumeBtn) resumeBtn.disabled = !running || !paused;
    if (stepBtn) stepBtn.disabled = running && !paused;

    if (running && !paused) {
      runBtn.innerHTML = '<span class="run-icon">◌</span> Simulating…';
    } else {
      runBtn.innerHTML = '<span class="run-icon">▶</span> Run simulation <span class="button-shortcut">↵</span>';
    }
  }

  /**
   * Executes a single simulation step and refreshes all visualizers
   */
  function executeSimulationStep() {
    if (!simEngine) return false;

    const stepResult = simEngine.step();
    const state = simEngine.getState();

    // 1. Update 3D Neural Mesh
    if (window.NeuroViz && typeof window.NeuroViz.updateSimViz === 'function') {
      window.NeuroViz.updateSimViz({
        potentials: state.potentials,
        spiked: state.spiked,
        active: state.active,
      });
    }

    // 2. Update Membrane Potential Chart
    if (membraneChart) {
      const neuronHistory = state.membranePotentialHistory[selectedNeuronId] || [];
      const neuronSpikeTimes = (state.spikeRaster[selectedNeuronId] || []).filter(t => t <= state.step);
      membraneChart.update({
        potentials: neuronHistory,
        threshold: state.currentThreshold ?? simConfig.threshold,
        currentThreshold: state.currentThreshold,
        thresholdHistory: state.thresholdHistory,
        adaptiveThreshold: simConfig.adaptiveThreshold,
        resetVoltage: 0.0,
        spikeTimes: neuronSpikeTimes,
        currentStep: state.step,
      });
    }

    // 3. Update Spike Raster Plot
    if (rasterChart) {
      const rasterMap = new Map();
      for (const [idStr, times] of Object.entries(state.spikeRaster)) {
        rasterMap.set(parseInt(idStr, 10), times);
      }
      rasterChart.update({
        spikeRaster: rasterMap,
        neuronCount: simConfig.neuronCount,
        currentStep: state.step,
      });
      $('#rasterSpikeCount').textContent = `${state.spikeCount} SPIKES`;
    }

    // 4. Update Spike Activity & Frequency Chart
    if (activityChart) {
      activityChart.update({
        spikeFrequency: state.spikeFrequency,
        totalSpikes: state.spikeCount,
        activeCount: state.activeCount,
        inactiveCount: state.inactiveCount,
        currentStep: state.step,
      });
      const recentRate = state.spikeFrequency.length > 0 ? state.spikeFrequency[state.spikeFrequency.length - 1] : 0;
      $('#activityRate').textContent = `${recentRate} SPIKES/STEP`;
      const actRateTag = $('#activityRateTag');
      if (actRateTag) actRateTag.textContent = `${recentRate} SPIKES/STEP`;
    }

    // 5. Update 2D Neural Activity Map
    if (activityMap) {
      activityMap.update({
        potentials: state.potentials,
        spiked: state.spiked,
        active: state.active,
        neuronCount: simConfig.neuronCount,
      });
    }

    // 6. Update KPI Cards & Workstation Telemetry
    const totalOps = simConfig.neuronCount * Math.max(1, state.step);
    const densityPct = totalOps > 0 ? (state.updateCount / totalOps) * 100 : 0;
    const recentSpikeRate = state.spikeFrequency.length > 0 ? state.spikeFrequency[state.spikeFrequency.length - 1] : 0;

    $('#spikesMetric').textContent = state.spikeCount.toLocaleString();
    $('#updatesMetric').textContent = state.updateCount.toLocaleString();
    $('#activeMetric').textContent = state.activeCount.toLocaleString();
    const inactEl = $('#inactiveMetric');
    if (inactEl) inactEl.textContent = state.inactiveCount.toLocaleString();
    $('#densityMetric').textContent = `${densityPct.toFixed(1)}%`;
    const simTimeEl = $('#metricSimTime');
    if (simTimeEl) simTimeEl.textContent = `Step ${String(state.step).padStart(2, '0')} (T+${state.step}.0 ms)`;

    // Right column activity distribution & genuine metrics
    const fireRateEl = $('#firingRateMetric');
    if (fireRateEl) fireRateEl.textContent = `${recentSpikeRate} spikes/step`;
    const activePct = Math.min(100, Math.round((state.activeCount / Math.max(1, simConfig.neuronCount)) * 100));
    const distFill = $('#activityDistFill');
    if (distFill) distFill.style.width = `${activePct}%`;
    const synEventsEl = $('#synapticEventsMetric');
    if (synEventsEl) synEventsEl.textContent = `${state.deliveredEvents.toLocaleString()} delivered`;
    const schedEventsEl = $('#scheduledEventsMetric');
    if (schedEventsEl) schedEventsEl.textContent = `${state.scheduledEvents.toLocaleString()} scheduled`;
    const queueSizeEl = $('#queueSizeMetric');
    if (queueSizeEl) queueSizeEl.textContent = `${state.pendingEvents} PENDING`;

    // 7. Update Frame and Status
    $('#networkFrame').textContent = `STEP ${String(state.step).padStart(2, '0')}`;
    $('#networkStatus').textContent = `${state.spiked.length} spikes in step ${state.step}`;

    // 8. Update Event Queue Visualization
    updateEventQueueUI();

    // 9. Log Events for Salient Timesteps
    if (state.step === 1 || state.spiked.length > 0 || state.step === targetTotalSteps) {
      const label = state.step === 1 ? 'START' : state.spiked.length > 0 ? 'SPIKE' : 'STEP';
      const msg = state.spiked.length > 0
        ? `${state.spiked.length} neuron(s) fired: [${state.spiked.slice(0, 5).join(', ')}${state.spiked.length > 5 ? '…' : ''}]`
        : `Step ${state.step} evaluated`;
      addLog(state.step, label, msg);
    }

    return state.step < targetTotalSteps;
  }

  function refreshChartsFromEngine() {
    if (!simEngine) return;
    const state = simEngine.getState();
    if (membraneChart) {
      const neuronHistory = state.membranePotentialHistory[selectedNeuronId] || [];
      const neuronSpikeTimes = (state.spikeRaster[selectedNeuronId] || []).filter(t => t <= state.step);
      membraneChart.update({
        potentials: neuronHistory,
        threshold: state.currentThreshold ?? simConfig.threshold,
        currentThreshold: state.currentThreshold,
        thresholdHistory: state.thresholdHistory,
        adaptiveThreshold: simConfig.adaptiveThreshold,
        resetVoltage: 0.0,
        spikeTimes: neuronSpikeTimes,
        currentStep: state.step,
      });
    }
  }

  function updateEventQueueUI() {
    const tbody = $('#eventQueueBody');
    const badge = $('#queueLengthTag');
    if (!tbody || !simEngine) return;

    const rawQueue = simEngine.eventQueue ? (simEngine.eventQueue.events || simEngine.eventQueue._heap || []) : [];
    badge.textContent = `${rawQueue.length} EVENTS IN QUEUE`;

    if (rawQueue.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-table">No pending synaptic events in queue</td></tr>';
      return;
    }

    const rows = rawQueue.slice(0, 12).map(ev => {
      const due = ev.deliveryStep ?? ev.time ?? 0;
      const src = ev.sourceId ?? ev.src ?? '—';
      const tgt = ev.targetId ?? ev.target ?? '—';
      const wt = typeof ev.weight === 'number' ? ev.weight.toFixed(3) : '0.250';
      const status = due <= (simEngine.currentStep || 0) ? '<span style="color:var(--cyan)">DUE NOW</span>' : 'SCHEDULED';
      return `<tr>
        <td>T+${due}</td>
        <td>Neuron ${src}</td>
        <td>Neuron ${tgt}</td>
        <td>${wt}</td>
        <td>${status}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
  }

  function startSimulationLoop() {
    if (isSimRunning && !isSimPaused) return;

    if (!isSimPaused) {
      // Starting from scratch
      targetTotalSteps = simConfig.steps;
      initSimulation();
      $('#canvasPlaceholder')?.classList.add('hidden');
      $('#eventLog').innerHTML = '';
      $('#logCount').textContent = '0 EVENTS';
      addLog(0, 'INIT', `${simConfig.neuronCount} LIF neurons · ${simConfig.mode.toUpperCase()} mode · Seed ${simConfig.seed}`);
      addLog(0, 'CONFIG', `Vth=${simConfig.threshold.toFixed(2)}, Sparsity=${simConfig.sparsity}%`);
    }

    isSimRunning = true;
    isSimPaused = false;
    updatePlaybackButtons(true, false);
    setSimStatus('RUNNING');

    function loop() {
      if (!isSimRunning || isSimPaused) return;
      const hasMore = executeSimulationStep();
      if (hasMore) {
        simIntervalId = setTimeout(loop, getStepDelayMs());
      } else {
        // Simulation finished
        isSimRunning = false;
        isSimPaused = false;
        updatePlaybackButtons(false, false);
        setSimStatus('COMPLETED');
        $('#networkStatus').textContent = 'Simulation complete';
        addLog(targetTotalSteps, 'DONE', 'Simulation completed successfully.');
        toast('Simulation completed.');
      }
    }

    simIntervalId = setTimeout(loop, getStepDelayMs());
  }

  function pauseSimulation() {
    if (!isSimRunning || isSimPaused) return;
    clearTimeout(simIntervalId);
    isSimPaused = true;
    updatePlaybackButtons(true, true);
    setSimStatus('PAUSED');
    $('#networkStatus').textContent = 'Simulation paused';
    toast('Simulation paused.');
  }

  function resumeSimulation() {
    if (!isSimRunning || !isSimPaused) return;
    setSimStatus('RUNNING');
    $('#networkStatus').textContent = 'Simulation resumed';
    toast('Simulation resumed.');
    startSimulationLoop();
  }

  function stepSimulationOnce() {
    if (isSimRunning && !isSimPaused) {
      pauseSimulation();
    }
    if (!simEngine || simEngine.currentStep === 0) {
      initSimulation();
      $('#canvasPlaceholder')?.classList.add('hidden');
    }
    const hasMore = executeSimulationStep();
    setSimStatus(hasMore ? 'PAUSED' : 'COMPLETED');
    toast('Stepped 1 interval.');
  }

  function resetSimUIState() {
    clearTimeout(simIntervalId);
    isSimRunning = false;
    isSimPaused = false;
    updatePlaybackButtons(false, false);
    setSimStatus('IDLE');

    $('#networkStatus').textContent = 'Awaiting execution';
    $('#networkFrame').textContent = 'STEP 00';
    ['#spikesMetric', '#updatesMetric', '#activeMetric', '#inactiveMetric', '#densityMetric'].forEach(sel => {
      const el = $(sel);
      if (el) el.textContent = '—';
    });
    const simTimeEl = $('#metricSimTime');
    if (simTimeEl) simTimeEl.textContent = 'T+00 ms';
    const fireRateEl = $('#firingRateMetric');
    if (fireRateEl) fireRateEl.textContent = '0 spikes/step';
    const distFill = $('#activityDistFill');
    if (distFill) distFill.style.width = '0%';
    const synEventsEl = $('#synapticEventsMetric');
    if (synEventsEl) synEventsEl.textContent = '—';
    const schedEventsEl = $('#scheduledEventsMetric');
    if (schedEventsEl) schedEventsEl.textContent = '—';
    const queueSizeEl = $('#queueSizeMetric');
    if (queueSizeEl) queueSizeEl.textContent = '0 PENDING';

    membraneChart?.clear();
    rasterChart?.clear();
    activityChart?.clear();
    activityMap?.clear();

    const tbody = $('#eventQueueBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-table">No pending synaptic events. Run or step simulation to observe queue activity.</td></tr>';
    $('#queueLengthTag').textContent = '0 EVENTS IN QUEUE';
  }

  function addLog(time, type, message) {
    const log = $('#eventLog');
    if (!log) return;
    const empty = $('.empty-log', log);
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `<span class="log-time">T+${String(time).padStart(2, '0')}</span><span class="log-type">${type}</span><span class="log-message">${message}</span>`;
    log.appendChild(row);

    while (log.children.length > 30) {
      log.removeChild(log.firstElementChild);
    }
    $('#logCount').textContent = `${log.children.length} EVENTS`;
    log.scrollTop = log.scrollHeight;
  }

  // Event Listeners for Simulation Controls
  $('#experimentSeed')?.addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
      simConfig.seed = val;
      syncControlOutputs();
      initSimulation();
      toast(`Experiment seed set to ${simConfig.seed}.`);
    }
  });

  $('#randomSeedBtn')?.addEventListener('click', () => {
    simConfig.seed = Math.floor(Math.random() * 900000) + 100000;
    syncControlOutputs();
    initSimulation();
    toast(`Generated new random seed: ${simConfig.seed}`);
  });

  // Export Experiment Configuration & Metadata (JSON)
  function exportExperimentJSON() {
    if (!simEngine) return;
    const state = simEngine.getState();
    const topo = simEngine.getTopology ? simEngine.getTopology() : null;

    const experimentData = {
      platform: 'NEUROCORE Adaptive Event-Driven Neuromorphic Computing Platform',
      version: '2.1.0',
      timestamp: new Date().toISOString(),
      experimentMetadata: {
        id: `EXP-NC-${simConfig.seed}-${Date.now().toString(36).toUpperCase()}`,
        engine: 'SimulationEngine (Mulberry32 PRNG)',
        model: 'Leaky Integrate-and-Fire (LIF)',
      },
      configuration: {
        seed: simConfig.seed,
        seedHex: '0x' + (Number(simConfig.seed) >>> 0).toString(16).toUpperCase().padStart(8, '0'),
        neuronCount: simConfig.neuronCount,
        connectionDensity: topo ? topo.connectionDensity : 0.18,
        totalSynapses: topo ? topo.connectionCount : 0,
        inputSparsity: simConfig.sparsity / 100,
        sparsityPercentage: `${simConfig.sparsity}%`,
        firingThreshold: simConfig.threshold,
        currentAdaptiveThreshold: state.currentThreshold ?? simConfig.threshold,
        simulationSteps: simConfig.steps,
        executionMode: simConfig.mode,
        adaptivePolicies: {
          adaptiveThreshold: simConfig.adaptiveThreshold,
          adaptiveTemporal: simConfig.adaptiveTemporal,
        },
        speedMultiplier: simConfig.speedMultiplier,
      },
      topologySummary: topo ? {
        neuronCount: topo.neuronCount,
        connectionCount: topo.connectionCount,
        density: topo.connectionDensity,
        sampleConnections: topo.connections.slice(0, 50),
      } : null,
      runtimeMetrics: {
        evaluatedSteps: state.step,
        totalSpikesFired: state.spikeCount,
        scheduledSynapticEvents: state.scheduledEvents,
        deliveredSynapticEvents: state.deliveredEvents,
        pendingEventsInQueue: state.pendingEvents,
        neuronStateUpdates: state.updateCount,
        activeNeuronCount: state.activeCount,
        inactiveNeuronCount: state.inactiveCount,
        finalStepSpikes: state.spiked,
        spikeFrequencies: state.spikeFrequency,
        thresholdHistory: state.thresholdHistory,
      },
    };

    const jsonString = JSON.stringify(experimentData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurocore-experiment-seed-${simConfig.seed}-steps-${state.step || simConfig.steps}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Exported experiment config for seed ${simConfig.seed}.`);
  }

  $('#exportExperimentJson')?.addEventListener('click', exportExperimentJSON);

  $('#neuronCount')?.addEventListener('input', e => {
    simConfig.neuronCount = parseInt(e.target.value, 10);
    syncControlOutputs();
    initSimulation();
  });

  $('#inputSparsity')?.addEventListener('input', e => {
    simConfig.sparsity = parseInt(e.target.value, 10);
    syncControlOutputs();
    if (simEngine && simEngine.config) simEngine.config.inputSparsity = simConfig.sparsity / 100;
  });

  $('#firingThreshold')?.addEventListener('input', e => {
    simConfig.threshold = parseInt(e.target.value, 10) / 100;
    syncControlOutputs();
    if (simEngine && simEngine.config) {
      simEngine.config.firingThreshold = simConfig.threshold;
      simEngine._currentThreshold = simConfig.threshold;
    }
  });

  $('#simulationSteps')?.addEventListener('input', e => {
    simConfig.steps = parseInt(e.target.value, 10);
    syncControlOutputs();
  });

  $('#simSpeed')?.addEventListener('change', e => {
    simConfig.speedMultiplier = parseFloat(e.target.value) || 1.0;
  });

  $$('#executionMode button').forEach(button => {
    button.addEventListener('click', () => {
      simConfig.mode = button.dataset.mode;
      $$('#executionMode button').forEach(b => b.classList.toggle('selected', b === button));
      updateSimModeBadge();
      initSimulation();
      toast(`Switched to ${simConfig.mode === 'event' ? 'Event-Driven' : 'Time-Stepped'} mode.`);
    });
  });

  $('#adaptiveThreshold')?.addEventListener('change', e => {
    simConfig.adaptiveThreshold = e.target.checked;
    if (simEngine && simEngine.config) simEngine.config.adaptiveThreshold = e.target.checked;
    toast(`Adaptive threshold ${e.target.checked ? 'enabled' : 'disabled'}.`);
  });

  $('#adaptiveTemporal')?.addEventListener('change', e => {
    simConfig.adaptiveTemporal = e.target.checked;
    if (simEngine && simEngine.config) simEngine.config.adaptiveTemporal = e.target.checked;
    toast(`Adaptive temporal bins ${e.target.checked ? 'enabled' : 'disabled'}.`);
  });

  $('#runSimulation')?.addEventListener('click', startSimulationLoop);
  $('#pauseSimulation')?.addEventListener('click', pauseSimulation);
  $('#resumeSimulation')?.addEventListener('click', resumeSimulation);
  $('#stepSimulation')?.addEventListener('click', stepSimulationOnce);
  $('#resetSimBtn')?.addEventListener('click', () => {
    initSimulation();
    toast('Simulation reset.');
  });

  $('#clearSimulation')?.addEventListener('click', () => {
    if (isSimRunning) pauseSimulation();
    resetSimUIState();
    $('#canvasPlaceholder')?.classList.remove('hidden');
    $('#eventLog').innerHTML = '<div class="empty-log"><span>⌁</span> Simulation events will appear here during execution.</div>';
    $('#logCount').textContent = '0 EVENTS';
    toast('Visualization cleared.');
  });

  $('#resetSim')?.addEventListener('click', () => {
    if (isSimRunning) pauseSimulation();
    $('#neuronCount').value = 48;
    $('#inputSparsity').value = 70;
    $('#firingThreshold').value = 65;
    $('#simulationSteps').value = 40;
    $('#simSpeed').value = '1';
    $('#adaptiveThreshold').checked = false;
    $('#adaptiveTemporal').checked = false;
    const seedInput = $('#experimentSeed');
    if (seedInput) seedInput.value = 42;

    simConfig.seed = 42;
    simConfig.neuronCount = 48;
    simConfig.sparsity = 70;
    simConfig.threshold = 0.65;
    simConfig.steps = 40;
    simConfig.mode = 'event';
    simConfig.speedMultiplier = 1.0;
    simConfig.adaptiveThreshold = false;
    simConfig.adaptiveTemporal = false;

    $$('#executionMode button').forEach(b => b.classList.toggle('selected', b.dataset.mode === 'event'));
    syncControlOutputs();
    initSimulation();
    $('#clearSimulation')?.click();
    toast('Settings reset to defaults.');
  });

  // 3D HUD Control Actions
  $('#toggleRotateBtn')?.addEventListener('click', () => {
    if (window.NeuroViz && typeof window.NeuroViz.toggleAutoRotate === 'function') {
      const isRotating = window.NeuroViz.toggleAutoRotate();
      $('#toggleRotateBtn').textContent = isRotating ? '↺ Rotating' : '↺ Rotate';
      toast(`Auto-rotation ${isRotating ? 'enabled' : 'paused'}.`);
    }
  });

  $('#zoomInBtn')?.addEventListener('click', () => {
    if (window.NeuroViz && typeof window.NeuroViz.zoom3D === 'function') {
      window.NeuroViz.zoom3D(0.85);
    }
  });

  $('#zoomOutBtn')?.addEventListener('click', () => {
    if (window.NeuroViz && typeof window.NeuroViz.zoom3D === 'function') {
      window.NeuroViz.zoom3D(1.15);
    }
  });

  $('#toggle3DPauseBtn')?.addEventListener('click', () => {
    if (window.NeuroViz && typeof window.NeuroViz.togglePause3D === 'function') {
      const isPaused = window.NeuroViz.togglePause3D();
      $('#toggle3DPauseBtn').textContent = isPaused ? '▶ Resume 3D' : '⏸ Pause 3D';
      toast(`3D visualizer ${isPaused ? 'paused' : 'resumed'}.`);
    }
  });

  // Workload Preset Selector
  $('#simWorkloadPreset')?.addEventListener('change', e => {
    if (isSimRunning) pauseSimulation();
    const preset = e.target.value;
    if (preset === 'poisson') {
      simConfig.neuronCount = 72;
      simConfig.sparsity = 25;
      simConfig.threshold = 0.50;
      simConfig.steps = 50;
      simConfig.mode = 'event';
      simConfig.adaptiveThreshold = true;
      simConfig.adaptiveTemporal = true;
      $('#neuronCount').value = 72;
      $('#inputSparsity').value = 25;
      $('#firingThreshold').value = 50;
      $('#simulationSteps').value = 50;
      $('#adaptiveThreshold').checked = true;
      $('#adaptiveTemporal').checked = true;
    } else if (preset === 'isolated') {
      simConfig.neuronCount = 36;
      simConfig.sparsity = 90;
      simConfig.threshold = 0.80;
      simConfig.steps = 30;
      simConfig.mode = 'clock';
      simConfig.adaptiveThreshold = false;
      simConfig.adaptiveTemporal = false;
      $('#neuronCount').value = 36;
      $('#inputSparsity').value = 90;
      $('#firingThreshold').value = 80;
      $('#simulationSteps').value = 30;
      $('#adaptiveThreshold').checked = false;
      $('#adaptiveTemporal').checked = false;
    } else {
      // default
      simConfig.neuronCount = 48;
      simConfig.sparsity = 70;
      simConfig.threshold = 0.65;
      simConfig.steps = 40;
      simConfig.mode = 'event';
      simConfig.adaptiveThreshold = false;
      simConfig.adaptiveTemporal = false;
      $('#neuronCount').value = 48;
      $('#inputSparsity').value = 70;
      $('#firingThreshold').value = 65;
      $('#simulationSteps').value = 40;
      $('#adaptiveThreshold').checked = false;
      $('#adaptiveTemporal').checked = false;
    }
    $$('#executionMode button').forEach(b => b.classList.toggle('selected', b.dataset.mode === simConfig.mode));
    syncControlOutputs();
    updateSimModeBadge();
    initSimulation();
    $('#clearSimulation')?.click();
    toast(`Loaded preset: ${preset.toUpperCase()}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BENCHMARK LAB (CANVAS CHARTS & CSV EXPORT)
  // ─────────────────────────────────────────────────────────────────────────

  function updateBenchmarks() {
    const sparsitySlider = $('#benchSparsity');
    const sparsity = sparsitySlider ? parseInt(sparsitySlider.value, 10) : 70;
    const workload = 10000;
    const activeShare = (100 - sparsity) / 100;
    const eventUpdates = Math.round(workload * activeShare);
    const reduction = 100 - Math.round((eventUpdates / workload) * 100);

    // Update KPI counters
    $('#benchSparsityOut').textContent = `${sparsity}%`;
    $('#benchWorkload').textContent = workload.toLocaleString();
    $('#benchEventUpdates').textContent = eventUpdates.toLocaleString();
    $('#benchClockUpdates').textContent = workload.toLocaleString();
    $('#benchSkipped').textContent = `${reduction}%`;
    $('#compareEvent').textContent = eventUpdates.toLocaleString();
    $('#modeledReduction').textContent = `${reduction}% fewer updates`;

    if (!window.NeuroCharts || !window.NeuroCharts.Benchmark) return;
    const Bench = window.NeuroCharts.Benchmark;

    // 1. Grouped Bar Chart (Neuron Updates, Synaptic Events, State Evaluations)
    const groupedCanvas = $('#benchGroupedCanvas');
    if (groupedCanvas) {
      Bench.renderGroupedBar(groupedCanvas, {
        groups: [
          {
            label: 'Neuron Updates',
            ann: 10000,
            clock: 10000,
            event: eventUpdates,
          },
          {
            label: 'Synaptic Events',
            ann: 25000,
            clock: 25000,
            event: Math.round(25000 * activeShare * 0.88),
          },
          {
            label: 'State Evals',
            ann: 10000,
            clock: 10000,
            event: Math.round(eventUpdates * 1.08),
          },
        ],
      });
    }

    // 2. Sparsity Curve Chart (0% to 95%)
    const sparsityCanvas = $('#benchSparsityCanvas');
    if (sparsityCanvas) {
      const levels = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
      const annCurve = levels.map(() => 10000);
      const clockCurve = levels.map(() => 10000);
      const eventCurve = levels.map(s => Math.round(10000 * ((100 - s) / 100)));

      Bench.renderSparsityChart(sparsityCanvas, {
        sparsityLevels: levels,
        ann: annCurve,
        clock: clockCurve,
        event: eventCurve,
      });
    }

    // 3. Latency Comparison Chart (Normalized Proxy Cycles)
    const latencyCanvas = $('#benchLatencyCanvas');
    if (latencyCanvas) {
      // Model overhead: event queue overhead ~25 cycles, compute scales with activeShare
      const eventLatency = Math.round(26 + activeShare * 68);
      Bench.renderLatencyChart(latencyCanvas, {
        ann: 100,
        clock: 92,
        event: eventLatency,
      });
    }
  }

  function resizeBenchmarkCharts() {
    updateBenchmarks();
  }

  $('#benchSparsity')?.addEventListener('input', updateBenchmarks);
  $('#refreshBench')?.addEventListener('click', () => {
    updateBenchmarks();
    toast('Benchmark metrics recalculated.');
  });

  $('#downloadBenchCSV')?.addEventListener('click', () => {
    if (!window.NeuroCharts || !window.NeuroCharts.Benchmark) return;
    const sparsitySlider = $('#benchSparsity');
    const sparsity = sparsitySlider ? parseInt(sparsitySlider.value, 10) : 70;
    const activeShare = (100 - sparsity) / 100;
    const eventUpdates = Math.round(10000 * activeShare);

    const benchmarkData = {
      groups: [
        { label: 'Neuron Updates', ann: 10000, clock: 10000, event: eventUpdates },
        { label: 'Synaptic Events', ann: 25000, clock: 25000, event: Math.round(25000 * activeShare * 0.88) },
        { label: 'State Evaluations', ann: 10000, clock: 10000, event: Math.round(eventUpdates * 1.08) },
        { label: 'Modeled Relative Latency', ann: 100, clock: 92, event: Math.round(26 + activeShare * 68) },
      ],
    };

    window.NeuroCharts.Benchmark.downloadCSV(benchmarkData, `neurocore-benchmark-sparsity-${sparsity}pct.csv`);
    toast('Benchmark CSV downloaded.');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INTERACTIVE ARCHITECTURE DIAGRAM
  // ─────────────────────────────────────────────────────────────────────────
  let archDiagramMounted = false;

  function initArchitectureDiagram() {
    const container = $('#interactiveArchContainer');
    if (!container || archDiagramMounted) return;
    if (window.ArchitectureDiagram && typeof window.ArchitectureDiagram.init === 'function') {
      window.ArchitectureDiagram.init(container);
      archDiagramMounted = true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WINDOW RESIZE & LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (currentPage === 'simulator') {
      resizeSimCharts();
    } else if (currentPage === 'benchmarks') {
      resizeBenchmarkCharts();
    }
  });

  // Initial startup sequence
  document.addEventListener('DOMContentLoaded', () => {
    syncControlOutputs();
    initSimulation();
    updateBenchmarks();

    // Check URL hash for direct routing
    const hash = window.location.hash ? window.location.hash.slice(1) : 'overview';
    if (pageNames[hash]) {
      navigate(hash);
    } else {
      navigate('overview');
    }
  });

  // Fallback startup if DOMContentLoaded has already fired
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    syncControlOutputs();
    initSimulation();
    updateBenchmarks();
    const hash = window.location.hash ? window.location.hash.slice(1) : 'overview';
    if (pageNames[hash]) {
      navigate(hash);
    } else {
      navigate('overview');
    }
  }
})();
