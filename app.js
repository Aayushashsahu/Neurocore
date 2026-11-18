/**
 * NEUROCORE — Adaptive Event-Driven Neuromorphic Computing Platform
 * Main Frontend Application Controller (v2.2.2)
 *
 * Coordinates:
 * - Single-page application navigation & responsive sidebar
 * - Three.js 3D neural network visualizers (Hero & Simulation Lab)
 * - SNN Simulation Engine (LIF neurons, event queue, adaptive policies)
 * - Scientific canvas charts (Membrane potential, Spike raster, Activity)
 * - Active synaptic event queue inspector
 * - Empirical Benchmark Lab (Multi-trial statistical benchmarking, paired execution, reproducible CSV/JSON export)
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
      if (!initialBenchmarkRunDone) {
        initialBenchmarkRunDone = true;
        runBenchmarkCampaign();
      } else {
        resizeBenchmarkCharts();
      }
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
      if (typeof simEngine.setInspectedNeuron === 'function') {
        simEngine.setInspectedNeuron(selectedNeuronId);
      }
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
    if (simEngine && typeof simEngine.setInspectedNeuron === 'function') {
      simEngine.setInspectedNeuron(selectedNeuronId);
    }
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
      const spikeCounts = simEngine ? simEngine.neurons.map(n => n.spikeCount) : [];
      window.NeuroViz.updateSimViz({
        potentials: state.potentials,
        spiked: state.spiked,
        active: state.active,
        step: state.currentStep,
        spikeCounts,
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
    $('#updatesMetric').textContent = state.neuronIntegrations.toLocaleString();
    $('#activeMetric').textContent = state.activeCount.toLocaleString();
    const inactEl = $('#inactiveMetric');
    if (inactEl) inactEl.textContent = state.inactiveCount.toLocaleString();
    $('#densityMetric').textContent = `${densityPct.toFixed(1)}%`;
    const simTimeEl = $('#metricSimTime');
    if (simTimeEl) simTimeEl.textContent = `Step ${String(state.step).padStart(3, '0')}`;

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
    $('#networkFrame').textContent = `STEP ${String(state.step).padStart(3, '0')}`;
    $('#networkStatus').textContent = `${state.spiked.length} spikes in step ${state.step}`;

    // 8. Update Event Queue Visualization
    updateEventQueueUI();

    // 9. Log Events for Salient Timesteps
    if (state.step === 1 || state.spiked.length > 0 || state.step === targetTotalSteps) {
      const label = state.step === 1 ? 'START' : state.spiked.length > 0 ? 'SPIKE' : 'STEP';
      const msg = state.spiked.length > 0
        ? `${state.spiked.length} neuron(s) fired: [${state.spiked.slice(0, 5).join(', ')}${state.spiked.length > 5 ? '…' : ''}]`
        : `Step ${state.step} evaluated (${state.neuronIntegrations} integrations)`;
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
        <td>Step ${String(due).padStart(3, '0')}</td>
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
    $('#networkFrame').textContent = 'STEP 000';
    ['#spikesMetric', '#updatesMetric', '#activeMetric', '#inactiveMetric', '#densityMetric'].forEach(sel => {
      const el = $(sel);
      if (el) el.textContent = '—';
    });
    const simTimeEl = $('#metricSimTime');
    if (simTimeEl) simTimeEl.textContent = 'Step 000';
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
    row.innerHTML = `<span class="log-time">Step ${String(time).padStart(3, '0')}</span><span class="log-type">${type}</span><span class="log-message">${message}</span>`;
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
      version: '2.1.1',
      simEngineVersion: state.simEngineVersion || '2.1.1-sparse',
      timestamp: new Date().toISOString(),
      experimentMetadata: {
        id: `EXP-NC-${simConfig.seed}-${Date.now().toString(36).toUpperCase()}`,
        engine: 'SimulationEngine (Mulberry32 PRNG + Sparse Geometric Sampler)',
        model: 'Leaky Integrate-and-Fire (LIF, Lazy Decay)',
        timeUnit: 'discrete simulation steps (normalized)',
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
        neuronIntegrations: state.neuronIntegrations,
        lazyDecayEvaluations: state.lazyDecayEvaluations,
        externalInputEvents: state.externalInputEvents,
        scheduledSynapticEvents: state.scheduledEvents,
        deliveredSynapticEvents: state.deliveredEvents,
        pendingEventsInQueue: state.pendingEvents,
        queueInsertions: state.queueInsertions,
        queueRemovals: state.queueRemovals,
        eventAccountingInvariantVerified: state.scheduledEvents === state.deliveredEvents + state.pendingEvents,
        executionDurationMs: state.executionDurationMs,
        totalExecutionDurationMs: state.totalExecutionDurationMs,
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

  // 3D Synaptic Connectivity Modes
  $$('#simConnModes .mode-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.dataset.connMode;
      if (!mode) return;
      $$('#simConnModes .mode-pill').forEach(b => b.classList.toggle('selected', b === e.currentTarget));
      if (window.NeuroViz && typeof window.NeuroViz.setConnectivityMode === 'function') {
        window.NeuroViz.setConnectivityMode(mode);
        const labels = {
          curated: 'Curated (Dominant Pathways)',
          full: 'Full Graph (Complete Synaptic Mesh)',
          active: 'Active Pathways Only',
        };
        toast(`Synaptic Display: ${labels[mode] || mode}`);
      }
    });
  });

  // Interactive Neuron Selection from 3D Viewport
  window.addEventListener('neurocore-select-neuron', (e) => {
    const id = e.detail?.id;
    if (id !== undefined && id !== null) {
      selectedNeuronId = id;
      if (simEngine && typeof simEngine.setInspectedNeuron === 'function') {
        simEngine.setInspectedNeuron(selectedNeuronId);
      }
      const inspectSelect = $('#membraneNeuronSelect') || $('#inspectNeuron');
      if (inspectSelect) inspectSelect.value = selectedNeuronId;
      if (membraneChart) {
        membraneChart.setNeuronId(selectedNeuronId);
      }
      refreshChartsFromEngine();
      toast(`Inspecting Neuron #${String(selectedNeuronId).padStart(2, '0')}`);
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
  // EXPERIMENTAL BENCHMARK LAB (v2.2.0 EMPIRICAL PLATFORM)
  // ─────────────────────────────────────────────────────────────────────────

  let activeExperimentRunner = null;
  let latestExperimentResult = null;
  let currentCampaignPreset = 'quick';
  let initialBenchmarkRunDone = false;

  // File download helper
  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Format Mean ± SD helper
  function formatMeanSD(stat, unit = '') {
    if (!stat || stat.mean === null || stat.mean === undefined) return '—';
    const meanStr = Number(stat.mean).toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(stat.mean) ? 0 : 1,
      maximumFractionDigits: 1,
    });
    const sdVal = stat.sd !== undefined ? stat.sd : stat.sampleStdDev;
    if (sdVal === null || sdVal === undefined) {
      return `${meanStr} (N<2)`;
    }
    const sdStr = Number(sdVal).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${meanStr} ± ${sdStr}${unit ? ' ' + unit : ''}`;
  }

  // Render complete empirical experiment results to the DOM & Canvas charts
  function renderExperimentResults(result) {
    if (!result) return;
    const summaries = result.summaries || [];
    const config = result.campaignConfig || {};

    // 1. Overview Strip & Parity Audit
    const idTag = $('#expIdTag');
    if (idTag) idTag.textContent = result.experimentId;

    const summaryTitle = $('#expSummaryTitle');
    if (summaryTitle) {
      summaryTitle.textContent = `${config.campaignType ? config.campaignType.toUpperCase() : 'EMPIRICAL'} CAMPAIGN: ${result.completedTrialsCount} trials completed across ${config.modes?.join(' & ') || 'modes'}.`;
    }

    const parityPill = $('#expParityPill');
    if (parityPill && result.parityVerification) {
      const tol = result.parityVerification.voltageTolerance ?? result.parityVerification.tolerance ?? 1e-7;
      if (result.parityVerification.totalPairedChecked === 0 || result.parityVerification.parityMatchRate === null) {
        parityPill.className = 'eos-pill dim';
        parityPill.textContent = 'PARITY AUDIT: N/A';
      } else if (result.parityVerification.allMatched) {
        parityPill.className = 'eos-pill pass';
        parityPill.textContent = `PARITY PASS (100% · ΔV ≤ ${tol.toExponential(0)})`;
      } else {
        parityPill.className = 'eos-pill fail';
        parityPill.textContent = `PARITY AUDIT: ${result.parityVerification.passedCount}/${result.parityVerification.totalPairedChecked} MATCHED`;
      }
    }

    const trialsPill = $('#expTrialsCountPill');
    if (trialsPill) {
      trialsPill.textContent = `${result.completedTrialsCount} / ${result.totalTrialsPlanned} TRIALS`;
    }

    // 2. Locate representative / baseline summaries
    const getSummary = (metric, mode) => {
      return summaries.find(s => s.metric === metric && ((s.mode || s.strategy) === mode)) || null;
    };
    const eventIntegrations = getSummary('Neuron Integrations', 'event');
    const clockIntegrations = getSummary('Neuron Integrations', 'clock');
    const deliveredEvents = getSummary('Delivered Synaptic Events', 'event');
    const spikeCount = getSummary('Total Spike Count', 'event');
    const kernelDuration = getSummary('Simulation Kernel Duration', 'event');

    // 3. Populate 6 Empirical KPI Cards
    if ($('#kpiEventIntegrations')) {
      $('#kpiEventIntegrations').textContent = formatMeanSD(eventIntegrations);
      const evCi = eventIntegrations?.ciFormatted ? ` | 95% CI: ${eventIntegrations.ciFormatted}` : '';
      $('#kpiEventIntegrationsSub').textContent = eventIntegrations
        ? `N=${eventIntegrations.n}${evCi} | Med: ${eventIntegrations.median.toLocaleString()}`
        : 'Mean ± Sample SD';
    }

    if ($('#kpiClockIntegrations')) {
      $('#kpiClockIntegrations').textContent = formatMeanSD(clockIntegrations);
      const clCi = clockIntegrations?.ciFormatted ? ` | 95% CI: ${clockIntegrations.ciFormatted}` : '';
      $('#kpiClockIntegrationsSub').textContent = clockIntegrations
        ? `N=${clockIntegrations.n}${clCi} | Med: ${clockIntegrations.median.toLocaleString()}`
        : 'Mean ± Sample SD';
    }

    if ($('#kpiReduction')) {
      if (result.pairedComparisons && result.pairedComparisons.length > 0) {
        const primaryPair = result.pairedComparisons[0];
        const redMean = primaryPair.meanIntegrationsReductionPct;
        const redSD = primaryPair.sdIntegrationsReductionPct;
        $('#kpiReduction').textContent = redSD !== null && redSD !== undefined
          ? `${redMean.toFixed(1)}% ± ${redSD.toFixed(1)}%`
          : `${redMean.toFixed(1)}%`;
        const redCi = primaryPair.ciIntegrationsReductionPct;
        const ciStr = redCi ? ` | 95% CI: [${redCi.lower.toFixed(1)}%, ${redCi.upper.toFixed(1)}%]` : '';
        $('#kpiReductionSub').textContent = `Paired reduction (N=${primaryPair.nPaired} seeds)${ciStr}`;
      } else {
        $('#kpiReduction').textContent = '—';
        $('#kpiReductionSub').textContent = 'Algorithmic compute reduction';
      }
    }

    if ($('#kpiDeliveredEvents')) {
      $('#kpiDeliveredEvents').textContent = formatMeanSD(deliveredEvents);
      $('#kpiDeliveredEventsSub').textContent = deliveredEvents
        ? `Min: ${deliveredEvents.min.toLocaleString()} | Max: ${deliveredEvents.max.toLocaleString()}`
        : 'Mean ± Sample SD';
    }

    if ($('#kpiSpikeCount')) {
      $('#kpiSpikeCount').textContent = formatMeanSD(spikeCount);
      $('#kpiSpikeCountSub').textContent = spikeCount
        ? `N=${spikeCount.n} trials | Med: ${spikeCount.median.toLocaleString()}`
        : 'Mean ± Sample SD';
    }

    if ($('#kpiKernelDuration')) {
      $('#kpiKernelDuration').textContent = formatMeanSD(kernelDuration, 'ms');
      $('#kpiKernelDurationSub').textContent = kernelDuration
        ? `Browser performance.now() | Med: ${kernelDuration.median.toFixed(1)}ms`
        : 'Measured browser runtime (ms)';
    }

    // 4. Theoretical Dense ANN Reference Box (Matrix-Vector Multiply baseline)
    const nNodes = config.neuronCount || 48;
    const nSteps = config.simulationSteps || 50;
    const annOps = nNodes * nNodes * nSteps;
    if ($('#annOpsEstimate')) $('#annOpsEstimate').textContent = `${annOps.toLocaleString()} MACs`;
    if ($('#annOpsFormula')) $('#annOpsFormula').textContent = `${nNodes} × ${nNodes} × ${nSteps} steps (Dense full matrix multiply)`;

    // 5. Render Canvas Charts via NeuroCharts.Benchmark
    if (window.NeuroCharts && window.NeuroCharts.Benchmark) {
      const Bench = window.NeuroCharts.Benchmark;

      // Chart 1: Grouped Bar Chart with Error Bars
      const groupedCanvas = $('#benchGroupedCanvas');
      if (groupedCanvas && Bench.renderGroupedBarWithErrors) {
        const clDelivered = getSummary('Delivered Synaptic Events', 'clock');
        const clLazy = getSummary('Lazy Decay Evaluations', 'clock');
        const evLazy = getSummary('Lazy Decay Evaluations', 'event');
        const evQueue = getSummary('Queue Operations (Push+Pop)', 'event');

        Bench.renderGroupedBarWithErrors(groupedCanvas, {
          groups: [
            {
              label: 'Neuron Integrations',
              clockMean: clockIntegrations?.mean || 0,
              clockSD: clockIntegrations?.sd ?? clockIntegrations?.sampleStdDev ?? 0,
              eventMean: eventIntegrations?.mean || 0,
              eventSD: eventIntegrations?.sd ?? eventIntegrations?.sampleStdDev ?? 0,
            },
            {
              label: 'Delivered Events',
              clockMean: clDelivered?.mean || 0,
              clockSD: clDelivered?.sd ?? clDelivered?.sampleStdDev ?? 0,
              eventMean: deliveredEvents?.mean || 0,
              eventSD: deliveredEvents?.sd ?? deliveredEvents?.sampleStdDev ?? 0,
            },
            {
              label: 'Lazy Decays',
              clockMean: clLazy?.mean || 0,
              clockSD: clLazy?.sd ?? clLazy?.sampleStdDev ?? 0,
              eventMean: evLazy?.mean || 0,
              eventSD: evLazy?.sd ?? evLazy?.sampleStdDev ?? 0,
            },
            {
              label: 'Queue Ops',
              clockMean: 0,
              clockSD: 0,
              eventMean: evQueue?.mean || 0,
              eventSD: evQueue?.sd ?? evQueue?.sampleStdDev ?? 0,
            },
          ],
        });
      }

      // Chart 2: Empirical Sparsity Sensitivity Curve
      const sparsityCanvas = $('#benchSparsityCanvas');
      if (sparsityCanvas && Bench.renderEmpiricalSparsitySensitivity) {
        const sparsityGroups = new Map();
        summaries.filter(s => s.metric === 'Neuron Integrations').forEach(s => {
          if (!sparsityGroups.has(s.sparsity)) {
            sparsityGroups.set(s.sparsity, { clock: null, event: null });
          }
          const m = s.mode || s.strategy;
          if (m === 'clock') sparsityGroups.get(s.sparsity).clock = s;
          if (m === 'event') sparsityGroups.get(s.sparsity).event = s;
        });

        const sortedSparsities = Array.from(sparsityGroups.keys()).sort((a, b) => a - b);
        const clockMeans = sortedSparsities.map(sp => sparsityGroups.get(sp).clock?.mean || 0);
        const clockSDs = sortedSparsities.map(sp => sparsityGroups.get(sp).clock?.sd ?? sparsityGroups.get(sp).clock?.sampleStdDev ?? 0);
        const eventMeans = sortedSparsities.map(sp => sparsityGroups.get(sp).event?.mean || 0);
        const eventSDs = sortedSparsities.map(sp => sparsityGroups.get(sp).event?.sd ?? sparsityGroups.get(sp).event?.sampleStdDev ?? 0);

        Bench.renderEmpiricalSparsitySensitivity(sparsityCanvas, {
          levels: sortedSparsities.length > 0 ? sortedSparsities : [70],
          clockSeries: { label: 'Time-stepped SNN', means: clockMeans, sds: clockSDs },
          eventSeries: { label: 'Event-driven SNN', means: eventMeans, sds: eventSDs },
        });
      }

      // Chart 3: Measured Kernel Duration Distribution
      const latencyCanvas = $('#benchLatencyCanvas');
      if (latencyCanvas && Bench.renderKernelDurationChart) {
        const eventBySeed = new Map(result.rawTrials.filter(t => t.mode === 'event').map(t => [t.seed, t]));
        const clockTrials = result.rawTrials.filter(t => t.mode === 'clock');
        const trialsData = [];
        clockTrials.forEach((ct, idx) => {
          const et = eventBySeed.get(ct.seed);
          if (et) {
            trialsData.push({
              index: idx + 1,
              clockDur: ct.kernelDurationMs,
              eventDur: et.kernelDurationMs,
            });
          }
        });
        const clDurSummary = getSummary('Simulation Kernel Duration', 'clock');
        const evDurSummary = getSummary('Simulation Kernel Duration', 'event');

        Bench.renderKernelDurationChart(latencyCanvas, {
          trials: trialsData,
          meanClock: clDurSummary?.mean || 0,
          meanEvent: evDurSummary?.mean || 0,
        });
      }
    }

    // 6. Populate Empirical Results Table
    const tbody = $('#expResultsTbody');
    if (tbody) {
      tbody.innerHTML = '';
      summaries.forEach(s => {
        const tr = document.createElement('tr');
        const meanFormatted = Number(s.mean).toLocaleString(undefined, {
          minimumFractionDigits: Number.isInteger(s.mean) ? 0 : 2,
          maximumFractionDigits: 2,
        });
        const sdVal = s.sd !== undefined ? s.sd : s.sampleStdDev;
        const sdFormatted = sdVal !== null && sdVal !== undefined
          ? Number(sdVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : 'N/A (N<2)';
        const medFormatted = Number(s.median).toLocaleString(undefined, {
          minimumFractionDigits: Number.isInteger(s.median) ? 0 : 2,
          maximumFractionDigits: 2,
        });
        const minFormatted = Number(s.min).toLocaleString(undefined, {
          minimumFractionDigits: Number.isInteger(s.min) ? 0 : 2,
          maximumFractionDigits: 2,
        });
        const maxFormatted = Number(s.max).toLocaleString(undefined, {
          minimumFractionDigits: Number.isInteger(s.max) ? 0 : 2,
          maximumFractionDigits: 2,
        });
        const strat = s.strategy || s.mode;
        const stratPill = strat === 'event'
          ? '<span class="eos-pill" style="padding:2px 6px; font-size:8px;">EVENT</span>'
          : '<span class="eos-pill dim" style="padding:2px 6px; font-size:8px;">CLOCK</span>';
        const ciFormatted = s.ciFormatted || (s.confidenceInterval95 ? s.confidenceInterval95.formatted : (s.ciLower !== null && s.ciUpper !== null && s.ciLower !== undefined ? `[${s.ciLower.toFixed(1)}, ${s.ciUpper.toFixed(1)}]` : 'N/A'));

        tr.innerHTML = `
          <td><strong>${s.metric}</strong></td>
          <td>${stratPill}</td>
          <td class="num">${s.n}</td>
          <td class="num" style="color: ${strat === 'event' ? 'var(--cyan)' : 'var(--text)'}; font-weight:600;">${meanFormatted}</td>
          <td class="num" style="color: var(--muted);">${sdFormatted}</td>
          <td class="num" style="color: var(--cyan); font-family: var(--font-mono); font-size: 10px;">${ciFormatted}</td>
          <td class="num">${medFormatted}</td>
          <td class="num">${minFormatted}</td>
          <td class="num">${maxFormatted}</td>
          <td><small style="color: var(--faint);">${s.unit}</small></td>
        `;
        tbody.appendChild(tr);
      });
      if ($('#expTableRowsTag')) {
        $('#expTableRowsTag').textContent = `${summaries.length} METRICS AUDITED`;
      }
    }

    // 7. Enable Dataset Export Buttons
    if ($('#exportRawCSVBtn')) $('#exportRawCSVBtn').disabled = false;
    if ($('#exportSummaryCSVBtn')) $('#exportSummaryCSVBtn').disabled = false;
    if ($('#exportCompleteJSONBtn')) $('#exportCompleteJSONBtn').disabled = false;
  }

  // Execute an empirical campaign
  async function runBenchmarkCampaign() {
    if (!window.NeuroExperiment || !window.NeuroExperiment.ExperimentRunner) {
      toast('Experiment runner module not available.');
      return;
    }

    const runBtn = $('#runCampaignBtn');
    const cancelBtn = $('#cancelCampaignBtn');
    const statusBadge = $('#benchCampaignStatus');
    const progressFill = $('#expProgressFill');
    const progressText = $('#expProgressText');
    const progressPct = $('#expProgressPct');

    // Collect config
    const neuronCount = parseInt($('#expNeuronCount')?.value || '48', 10);
    const sparsity = parseInt($('#expSparsity')?.value || '70', 10);
    const steps = parseInt($('#expSteps')?.value || '50', 10);
    const reps = parseInt($('#expReps')?.value || '10', 10);
    const baseSeed = parseInt($('#expBaseSeed')?.value || '42', 10);
    const connectionDensity = parseFloat($('#expDensity')?.value || '25') / 100;
    const firingThreshold = parseFloat($('#expThreshold')?.value || '65') / 100;
    const adaptiveThreshold = $('#expAdaptiveThresh')?.checked || false;
    const adaptiveTemporal = $('#expAdaptiveTemporal')?.checked || false;

    const campaignConfig = {
      campaignType: currentCampaignPreset,
      neuronCount,
      sparsity,
      simulationSteps: steps,
      repetitions: reps,
      baseSeed,
      connectionDensity,
      firingThreshold,
      adaptiveThreshold,
      adaptiveTemporal,
      modes: ['event', 'clock'],
    };

    // UI State: Running
    if (runBtn) runBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = false;
    if (statusBadge) statusBadge.innerHTML = '<span class="pulse-dot" style="background:var(--cyan)"></span> RUNNING EMPIRICAL CAMPAIGN';
    if (progressFill) progressFill.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (progressText) progressText.textContent = 'Initializing isolated simulation instances...';

    activeExperimentRunner = new window.NeuroExperiment.ExperimentRunner(window.SimulationEngine, window.SeededPRNG);

    try {
      const result = await activeExperimentRunner.runCampaign(campaignConfig, {
        onProgress: (p) => {
          const pct = p.progressPct ?? p.percent ?? 0;
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressPct) progressPct.textContent = `${pct}%`;
          if (progressText) {
            const m = (p.mode || p.currentMode || 'snn').toUpperCase();
            const cur = p.completedTrials ?? p.trialIndex ?? 0;
            const tot = p.totalTrials ?? 0;
            const seed = p.trialSeed !== undefined ? `Seed ${p.trialSeed}` : '';
            progressText.textContent = p.statusText || `Trial ${cur}/${tot}: ${m} mode (${seed})...`;
          }
        },
      });

      latestExperimentResult = result;
      renderExperimentResults(result);

      if (progressFill) progressFill.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      if (progressText) {
        progressText.textContent = result.status === 'cancelled'
          ? `Campaign cancelled after ${result.completedTrialsCount} trials.`
          : `Campaign completed: ${result.completedTrialsCount} trials executed.`;
      }
      if (statusBadge) {
        statusBadge.innerHTML = result.status === 'cancelled'
          ? '<span class="pulse-dot" style="background:#EF4444"></span> RUN CANCELLED'
          : '<span class="pulse-dot"></span> BENCHMARK READY';
      }

      toast(result.status === 'cancelled'
        ? `Campaign cancelled after ${result.completedTrialsCount} trials.`
        : `Completed ${result.completedTrialsCount} empirical trials with full statistical audit.`);
    } catch (err) {
      console.error('Experiment campaign error:', err);
      toast(`Experiment run failed: ${err.message}`);
      if (statusBadge) statusBadge.innerHTML = '<span class="pulse-dot" style="background:#EF4444"></span> RUN ERROR';
    } finally {
      if (runBtn) runBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = true;
      activeExperimentRunner = null;
    }
  }

  // Cancel active campaign
  function cancelBenchmarkCampaign() {
    if (activeExperimentRunner) {
      activeExperimentRunner.cancel();
      const cancelBtn = $('#cancelCampaignBtn');
      if (cancelBtn) cancelBtn.disabled = true;
      const progressText = $('#expProgressText');
      if (progressText) progressText.textContent = 'Cancelling experiment run...';
    }
  }

  // Resize charts hook
  function resizeBenchmarkCharts() {
    if (latestExperimentResult) {
      renderExperimentResults(latestExperimentResult);
    }
  }

  // Wire Benchmark Event Listeners
  function initBenchmarkEventListeners() {
    // Campaign Preset Pills
    $$('#expCampaignPreset .mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#expCampaignPreset .mode-pill').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        currentCampaignPreset = btn.dataset.preset;

        // Preset adjustments
        if (currentCampaignPreset === 'quick') {
          if ($('#expNeuronCount')) $('#expNeuronCount').value = '48';
          if ($('#expSparsity')) $('#expSparsity').value = '70';
          if ($('#expSteps')) $('#expSteps').value = '50';
          if ($('#expReps')) $('#expReps').value = '10';
          toast('Selected Campaign: Quick (10 Paired Reps)');
        } else if (currentCampaignPreset === 'sparsity_sweep') {
          if ($('#expReps')) $('#expReps').value = '5';
          toast('Selected Campaign: Sparsity Sweep (50%–95%)');
        } else if (currentCampaignPreset === 'scale_sweep') {
          if ($('#expReps')) $('#expReps').value = '5';
          toast('Selected Campaign: Scaling Sweep (24–96 Nodes)');
        } else if (currentCampaignPreset === 'factorial') {
          if ($('#expReps')) $('#expReps').value = '10';
          toast('Selected Campaign: Full Factorial Matrix (4 sizes × 4 sparsities × 10 paired reps = 320 runs)');
        } else if (currentCampaignPreset === 'custom') {
          toast('Selected Campaign: Custom Experiment');
        }
      });
    });

    // Randomize seed button
    $('#expRandomSeedBtn')?.addEventListener('click', () => {
      const randSeed = Math.floor(Math.random() * 900000) + 10000;
      const seedInput = $('#expBaseSeed');
      if (seedInput) seedInput.value = randSeed;
    });

    // Range input value updates
    $('#expDensity')?.addEventListener('input', (e) => {
      const out = $('#expDensityOut');
      if (out) out.textContent = (parseFloat(e.target.value) / 100).toFixed(2);
    });
    $('#expThreshold')?.addEventListener('input', (e) => {
      const out = $('#expThresholdOut');
      if (out) out.textContent = (parseFloat(e.target.value) / 100).toFixed(2);
    });

    // Run & Cancel buttons
    $('#runCampaignBtn')?.addEventListener('click', runBenchmarkCampaign);
    $('#cancelCampaignBtn')?.addEventListener('click', cancelBenchmarkCampaign);

    // Export Buttons
    $('#exportRawCSVBtn')?.addEventListener('click', () => {
      if (!latestExperimentResult || !window.NeuroExperiment?.generateRawCSV) return;
      const csv = window.NeuroExperiment.generateRawCSV(latestExperimentResult);
      downloadBlob(csv, `neurocore-experiment-${latestExperimentResult.experimentId}-raw-trials.csv`, 'text/csv;charset=utf-8;');
      toast('Raw trial dataset exported.');
    });

    $('#exportSummaryCSVBtn')?.addEventListener('click', () => {
      if (!latestExperimentResult || !window.NeuroExperiment?.generateSummaryCSV) return;
      const csv = window.NeuroExperiment.generateSummaryCSV(latestExperimentResult);
      downloadBlob(csv, `neurocore-experiment-${latestExperimentResult.experimentId}-summary-stats.csv`, 'text/csv;charset=utf-8;');
      toast('Statistical summary dataset exported.');
    });

    $('#exportCompleteJSONBtn')?.addEventListener('click', () => {
      if (!latestExperimentResult || !window.NeuroExperiment?.generateExperimentJSON) return;
      const json = window.NeuroExperiment.generateExperimentJSON(latestExperimentResult);
      downloadBlob(json, `neurocore-experiment-${latestExperimentResult.experimentId}-complete.json`, 'application/json;charset=utf-8;');
      toast('Complete portable experiment JSON exported.');
    });
  }

  initBenchmarkEventListeners();

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
    const hash = window.location.hash ? window.location.hash.slice(1) : 'overview';
    if (pageNames[hash]) {
      navigate(hash);
    } else {
      navigate('overview');
    }
  }
})();
