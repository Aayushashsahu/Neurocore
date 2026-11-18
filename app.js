(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const pageNames = {
    overview: 'Overview', simulator: 'Simulation lab', benchmarks: 'Benchmark lab',
    architecture: 'Architecture', hardware: 'Hardware', research: 'Research'
  };
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function navigate(page) {
    if (!pageNames[page]) return;
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    $('#currentSection').textContent = pageNames[page];
    $('#sidebar').classList.remove('open');
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  $$('[data-goto]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.goto)));
  $('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  // About modal
  const modal = $('#infoModal');
  $('#infoButton').addEventListener('click', () => modal.classList.add('open'));
  $('#closeModal').addEventListener('click', () => modal.classList.remove('open'));
  $('#modalOkay').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });

  // ---- Simulation playground ----
  const canvas = $('#networkCanvas');
  const ctx = canvas.getContext('2d');
  const sim = {
    nodeCount: 48, sparsity: 70, threshold: 0.65, steps: 30, mode: 'event',
    adaptiveThreshold: false, adaptiveTemporal: false, running: false,
    nodes: [], edges: [], frame: 0, lastResult: null
  };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawNetwork();
  }

  function createNetwork(count) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || 640);
    const height = Math.max(200, rect.height || 310);
    const cols = Math.ceil(Math.sqrt(count * 1.55));
    const rows = Math.ceil(count / cols);
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const jitterX = Math.sin(i * 12.9898) * 8;
      const jitterY = Math.cos(i * 7.233) * 7;
      const marginX = 44, marginY = 38;
      const usableW = Math.max(180, width - marginX * 2);
      const usableH = Math.max(100, height - marginY * 2);
      nodes.push({
        id: i, x: marginX + (cols === 1 ? .5 : col / (cols - 1)) * usableW + jitterX,
        y: marginY + (rows === 1 ? .5 : row / (rows - 1)) * usableH + jitterY,
        v: 0, fired: 0, active: 0, incoming: 0
      });
    }
    const edges = [];
    nodes.forEach(node => {
      const candidates = nodes.filter(other => other.id !== node.id && other.id < node.id && Math.hypot(other.x - node.x, other.y - node.y) < Math.min(width, height) * .43);
      candidates.sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y));
      candidates.slice(0, 2 + (node.id % 2)).forEach(source => edges.push({ from: source.id, to: node.id }));
    });
    sim.nodes = nodes;
    sim.edges = edges;
    drawNetwork();
  }

  function drawNetwork() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    // Synaptic connections
    ctx.lineWidth = 0.75;
    sim.edges.forEach(edge => {
      const a = sim.nodes[edge.from], b = sim.nodes[edge.to];
      if (!a || !b) return;
      const lit = a.active > 0 && b.active > 0;
      ctx.strokeStyle = lit ? 'rgba(91,224,218,.52)' : 'rgba(74,111,144,.18)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    // Neurons
    sim.nodes.forEach(node => {
      const active = node.active > 0;
      const r = active ? 4.2 : 2.9;
      if (active) {
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 15);
        glow.addColorStop(0, 'rgba(87,230,222,.33)');
        glow.addColorStop(1, 'rgba(87,230,222,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(node.x, node.y, 15, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = active ? '#8ff8ed' : '#415c78';
      ctx.strokeStyle = active ? '#b9ffff' : '#66839e';
      ctx.lineWidth = active ? 1.2 : .65;
      ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
  }

  function syncControls() {
    $('#neuronCountOut').textContent = `${sim.nodeCount} neurons`;
    $('#sparsityOut').textContent = `${sim.sparsity}%`;
    $('#thresholdOut').textContent = (sim.threshold).toFixed(2);
    $('#stepsOut').textContent = `${sim.steps} steps`;
  }
  $('#neuronCount').addEventListener('input', e => { sim.nodeCount = +e.target.value; syncControls(); createNetwork(sim.nodeCount); });
  $('#inputSparsity').addEventListener('input', e => { sim.sparsity = +e.target.value; syncControls(); });
  $('#firingThreshold').addEventListener('input', e => { sim.threshold = +e.target.value / 100; syncControls(); });
  $('#simulationSteps').addEventListener('input', e => { sim.steps = +e.target.value; syncControls(); });
  $$('#executionMode button').forEach(button => button.addEventListener('click', () => {
    sim.mode = button.dataset.mode;
    $$('#executionMode button').forEach(b => b.classList.toggle('selected', b === button));
  }));
  $('#adaptiveThreshold').addEventListener('change', e => sim.adaptiveThreshold = e.target.checked);
  $('#adaptiveTemporal').addEventListener('change', e => sim.adaptiveTemporal = e.target.checked);

  function addLog(time, type, message) {
    const log = $('#eventLog');
    const empty = $('.empty-log', log);
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = 'log-entry';
    const timeEl = document.createElement('span'); timeEl.className = 'log-time'; timeEl.textContent = `T+${String(time).padStart(2, '0')}`;
    const typeEl = document.createElement('span'); typeEl.className = 'log-type'; typeEl.textContent = type;
    const msgEl = document.createElement('span'); msgEl.className = 'log-message'; msgEl.textContent = message;
    row.append(timeEl, typeEl, msgEl);
    log.append(row);
    while (log.children.length > 28) log.removeChild(log.firstElementChild);
    $('#logCount').textContent = `${log.children.length} EVENTS`;
    log.scrollTop = log.scrollHeight;
  }

  function updateMetrics(result) {
    $('#spikesMetric').textContent = result.spikes.toLocaleString();
    $('#updatesMetric').textContent = result.updates.toLocaleString();
    $('#activeMetric').textContent = result.active.toLocaleString();
    $('#densityMetric').textContent = `${result.density.toFixed(1)}%`;
  }

  async function runSimulation() {
    if (sim.running) return;
    sim.running = true;
    const runButton = $('#runSimulation');
    runButton.disabled = true;
    runButton.innerHTML = '<span class="run-icon">◌</span> Simulating…';
    $('#eventLog').innerHTML = '';
    $('#logCount').textContent = '0 EVENTS';
    $('#canvasPlaceholder').classList.add('hidden');
    sim.nodes.forEach(n => { n.v = Math.random() * .15; n.fired = 0; n.active = 0; n.incoming = 0; });
    const queue = [];
    let spikes = 0, updates = 0, inputEvents = 0, maxThreshold = sim.threshold;
    const firedSet = new Set();
    const baseInputProb = (1 - sim.sparsity / 100) * .48;
    // Under low activity, the demo groups adjacent input steps into wider temporal bins.
    const temporalBin = sim.adaptiveTemporal && sim.sparsity >= 65 ? 2 : 1;
    const effectiveSteps = Math.ceil(sim.steps / temporalBin);
    const delay = 42;
    addLog(0, 'INIT', `${sim.nodeCount} LIF neurons · ${sim.steps} requested steps`);
    addLog(0, 'CONFIG', `${sim.mode === 'event' ? 'Event-driven' : 'Time-stepped'} mode · ${(sim.threshold).toFixed(2)} threshold`);
    if (temporalBin > 1) addLog(0, 'ADAPT', `Low-activity input grouped into ${temporalBin}-step temporal bins`);

    for (let stepIndex = 0; stepIndex < effectiveSteps; stepIndex++) {
      const t = stepIndex * temporalBin;
      sim.frame = Math.min(sim.steps, t + temporalBin);
      sim.nodes.forEach(n => { n.active = Math.max(0, n.active - 1); });
      const external = [];
      const binnedInputProb = 1 - Math.pow(1 - baseInputProb, temporalBin);
      for (let i = 0; i < sim.nodeCount; i++) if (Math.random() < binnedInputProb) external.push(i);
      inputEvents += external.length;
      const due = queue.filter(ev => ev.time <= stepIndex);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].time <= stepIndex) queue.splice(i, 1);
      due.forEach(ev => { if (sim.nodes[ev.target]) sim.nodes[ev.target].incoming += ev.weight; });
      external.forEach(id => { sim.nodes[id].incoming += .35 + Math.random() * .45; });

      let threshold = sim.threshold;
      const activityRatio = external.length / sim.nodeCount;
      if (sim.adaptiveThreshold) {
        threshold = clamp(sim.threshold + (activityRatio > .16 ? .12 : activityRatio < .06 ? -.08 : 0), .2, 1.1);
        maxThreshold = threshold;
      }
      const touched = sim.mode === 'clock'
        ? sim.nodes
        : sim.nodes.filter(n => n.incoming > 0 || n.v >= threshold * .82);
      updates += touched.length;
      const firedNow = [];
      touched.forEach(node => {
        // Discrete LIF update: membrane leak + incoming synaptic current.
        node.v = Math.max(0, node.v * .78 + node.incoming);
        node.incoming = 0;
        if (node.v >= threshold) {
          node.v = 0;
          node.fired++;
          node.active = 3;
          firedNow.push(node.id);
          firedSet.add(node.id);
        }
      });
      spikes += firedNow.length;
      // Schedule outgoing synaptic events from newly firing neurons.
      firedNow.forEach(id => {
        sim.edges.filter(edge => edge.from === id).forEach(edge => {
          queue.push({ time: stepIndex + 1 + (edge.to % 3 === 0 ? 1 : 0), target: edge.to, weight: .18 + (edge.to % 4) * .035 });
        });
      });
      if (stepIndex === 0 || firedNow.length > 0 || stepIndex === effectiveSteps - 1) {
        const label = stepIndex === 0 ? 'INPUT' : firedNow.length ? 'SPIKE' : 'STEP';
        const message = stepIndex === 0 ? `${external.length} input events received` : firedNow.length ? `${firedNow.length} neuron(s) crossed threshold` : 'Final state update';
        addLog(Math.min(sim.steps, t + temporalBin), label, message);
      }
      $('#networkFrame').textContent = `FRAME ${String(Math.min(sim.steps, t + temporalBin)).padStart(2, '0')}`;
      $('#networkStatus').textContent = `${firedNow.length} spikes in bin ${stepIndex + 1}`;
      drawNetwork();
      await sleep(delay);
    }

    const totalOpportunities = sim.nodeCount * effectiveSteps;
    const density = totalOpportunities ? (updates / totalOpportunities) * 100 : 0;
    const result = { spikes, updates, active: firedSet.size, density, inputEvents, totalOpportunities, threshold: maxThreshold };
    sim.lastResult = result;
    updateMetrics(result);
    addLog(sim.steps, 'DONE', `${spikes} spikes · ${updates.toLocaleString()} neuron updates`);
    $('#networkStatus').textContent = 'Simulation complete';
    runButton.disabled = false;
    runButton.innerHTML = '<span class="run-icon">▶</span> Run simulation <span class="button-shortcut">↵</span>';
    sim.running = false;
    toast('Simulation completed. Results are shown above.');
  }

  $('#runSimulation').addEventListener('click', runSimulation);
  $('#clearSimulation').addEventListener('click', () => {
    if (sim.running) return;
    $('#eventLog').innerHTML = '<div class="empty-log"><span>⌁</span> Simulation events will appear here after execution.</div>';
    $('#logCount').textContent = '0 EVENTS';
    $('#canvasPlaceholder').classList.remove('hidden');
    $('#networkStatus').textContent = 'Awaiting execution';
    $('#networkFrame').textContent = 'FRAME —';
    ['#spikesMetric', '#updatesMetric', '#activeMetric', '#densityMetric'].forEach(id => $(id).textContent = '—');
    sim.nodes.forEach(n => { n.v = 0; n.active = 0; n.incoming = 0; });
    drawNetwork();
    toast('Visualisation cleared.');
  });
  $('#resetSim').addEventListener('click', () => {
    if (sim.running) return;
    $('#neuronCount').value = 48; $('#inputSparsity').value = 70; $('#firingThreshold').value = 65; $('#simulationSteps').value = 30;
    $('#adaptiveThreshold').checked = false; $('#adaptiveTemporal').checked = false;
    sim.nodeCount = 48; sim.sparsity = 70; sim.threshold = .65; sim.steps = 30; sim.mode = 'event'; sim.adaptiveThreshold = false; sim.adaptiveTemporal = false;
    $$('#executionMode button').forEach(b => b.classList.toggle('selected', b.dataset.mode === 'event'));
    syncControls(); createNetwork(sim.nodeCount);
    $('#clearSimulation').click();
  });

  // ---- Benchmark illustration ----
  function updateBenchmark() {
    const sparsity = +$('#benchSparsity').value;
    const workload = 10000;
    const activeShare = (100 - sparsity) / 100;
    const eventUpdates = Math.round(workload * activeShare);
    const reduction = 100 - Math.round(eventUpdates / workload * 100);
    $('#benchSparsityOut').textContent = `${sparsity}%`;
    $('#benchWorkload').textContent = workload.toLocaleString();
    $('#benchEventUpdates').textContent = eventUpdates.toLocaleString();
    $('#benchClockUpdates').textContent = workload.toLocaleString();
    $('#benchSkipped').textContent = `${reduction}%`;
    $('#compareEvent').textContent = eventUpdates.toLocaleString();
    $('#modeledReduction').textContent = `${reduction}% fewer updates`;
    $('#barEvent').style.height = `${Math.max(1, activeShare * 100)}%`;
    $('#barEvent span').textContent = eventUpdates >= 1000 ? `${(eventUpdates / 1000).toFixed(eventUpdates % 1000 ? 1 : 0)}k` : String(eventUpdates);
    $('#barAnn').style.height = '100%'; $('#barClock').style.height = '100%';
    $('#barAnn span').textContent = '10k'; $('#barClock span').textContent = '10k';
  }
  $('#benchSparsity').addEventListener('input', updateBenchmark);
  $('#refreshBench').addEventListener('click', () => { updateBenchmark(); toast('Illustrative workload counters recalculated.'); });

  // Startup
  syncControls();
  resizeCanvas();
  createNetwork(sim.nodeCount);
  updateBenchmark();
  window.addEventListener('resize', () => { resizeCanvas(); createNetwork(sim.nodeCount); });
  if (window.location.hash && pageNames[window.location.hash.slice(1)]) navigate(window.location.hash.slice(1));
})();
