/**
 * NEUROCORE Platform — Enhanced SNN Simulation Engine
 * 
 * A self-contained, modular Leaky Integrate-and-Fire (LIF) spiking neural
 * network simulation engine. Supports event-driven and time-stepped execution
 * modes, adaptive threshold policies, and adaptive temporal binning.
 * 
 * @file simulation-engine.js
 * @version 2.1.1
 * @license MIT
 */

'use strict';

/* ====================================================================
 *  SeededPRNG — Deterministic Pseudo-Random Number Generator (Mulberry32)
 * ==================================================================== */

/**
 * High-performance 32-bit deterministic seeded PRNG.
 * Ensures reproducible experiment generation, topology synthesis, and
 * stochastic input sequences across execution cycles.
 */
class SeededPRNG {
  /**
   * @param {number|string} [seed=42]
   */
  constructor(seed = 42) {
    this.seed = (typeof seed === 'number' ? seed : SeededPRNG.hashString(String(seed))) >>> 0;
    this._state = this.seed;
  }

  /**
   * 32-bit integer string hashing function.
   * @param {string} str
   * @returns {number}
   */
  static hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  /**
   * Generates a deterministic float in range [0, 1).
   * @returns {number}
   */
  random() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Resets PRNG state to initial seed.
   */
  reset() {
    this._state = this.seed;
  }
}

/* ====================================================================
 *  LIFNeuron — Leaky Integrate-and-Fire neuron model
 * ==================================================================== */

/**
 * A single Leaky Integrate-and-Fire neuron.
 *
 * Membrane potential is normalized to the range [0.0, ~1.2].
 * The neuron integrates weighted input, leaks toward resting potential,
 * fires when threshold is reached, and enters a refractory period.
 */
class LIFNeuron {
  /**
   * @param {number} id   Unique neuron identifier.
   * @param {object} [opts]
   * @param {number} [opts.threshold=0.65]       Firing threshold (normalized).
   * @param {number} [opts.resetVoltage=0.0]     Post-spike reset voltage.
   * @param {number} [opts.leakFactor=0.78]      Leak multiplier per timestep.
   * @param {number} [opts.refractoryPeriod=2]   Refractory duration in timesteps.
   */
  constructor(id, opts = {}) {
    /** @type {number} */
    this.id = id;
    /** @type {number} Membrane potential (V). */
    this.membranePotential = 0.0;
    /** @type {number} */
    this.threshold = opts.threshold ?? 0.65;
    /** @type {number} */
    this.resetVoltage = opts.resetVoltage ?? 0.0;
    /** @type {number} */
    this.leakFactor = opts.leakFactor ?? 0.78;
    /** @type {number} */
    this.refractoryPeriod = opts.refractoryPeriod ?? 2;
    /** @type {number} Remaining refractory timesteps (for discrete clock mode). */
    this.refractoryTimer = 0;
    /** @type {number} Step index until which the neuron is refractory (for lazy mode). */
    this.refractoryUntil = -1;
    /** @type {number} Last timestep when membrane potential was calculated. */
    this.lastUpdateStep = 0;

    /** @type {Array<{step: number, input: number, potential: number, spiked: boolean}>} Sparse event trace. */
    this.updateEvents = [{ step: 0, input: 0, potential: 0.0, spiked: false }];
    /** @type {number[]} Full membrane-potential history (populated in clock mode or on demand). */
    this.potentialHistory = [];
    /** @type {number[]} Timesteps at which the neuron spiked. */
    this.spikeTimes = [];
    /** @type {number} Cumulative spike count. */
    this.spikeCount = 0;
  }

  /**
   * Lazily decay membrane potential up to `currentStep` using exponential decay
   * and refractory boundary enforcement.
   *
   * Formula: V(t) = V(last) * leakFactor^(t - lastUpdate)
   *
   * @param {number} currentStep
   * @returns {number} Decayed membrane potential
   */
  lazyDecay(currentStep) {
    if (this.lastUpdateStep >= currentStep) {
      return this.membranePotential;
    }

    // 1. If currently inside refractory period
    if (currentStep <= this.refractoryUntil) {
      this.membranePotential = this.resetVoltage;
      this.lastUpdateStep = currentStep;
      return this.membranePotential;
    }

    // 2. If refractory period ended between lastUpdateStep and currentStep
    if (this.lastUpdateStep <= this.refractoryUntil) {
      const elapsed = currentStep - this.refractoryUntil;
      this.membranePotential = this.resetVoltage * Math.pow(this.leakFactor, elapsed);
    } else {
      // 3. Normal exponential decay from previous subthreshold potential
      const elapsed = currentStep - this.lastUpdateStep;
      this.membranePotential = this.membranePotential * Math.pow(this.leakFactor, elapsed);
    }

    this.lastUpdateStep = currentStep;
    return this.membranePotential;
  }

  /**
   * Integrate synaptic/external input for the current step and evaluate firing.
   * Used by the event-driven active-neuron scheduler.
   *
   * @param {number} input       Total incoming current at current step.
   * @param {number} currentStep Current simulation timestep.
   * @returns {boolean} `true` if the neuron fired.
   */
  integrateAndFire(input, currentStep) {
    this.lastUpdateStep = currentStep;

    // Guard against input during refractory period
    if (currentStep <= this.refractoryUntil) {
      this.membranePotential = this.resetVoltage;
      this.updateEvents.push({ step: currentStep, input, potential: this.membranePotential, spiked: false });
      return false;
    }

    // Integrate incoming current
    this.membranePotential += input;

    // Normalized upper bound ceiling
    if (this.membranePotential > 1.2) {
      this.membranePotential = 1.2;
    }

    // Threshold evaluation
    const spiked = this.membranePotential >= this.threshold;
    if (spiked) {
      this.spikeCount++;
      if (currentStep !== undefined) this.spikeTimes.push(currentStep);
      this.membranePotential = this.resetVoltage;
      this.refractoryUntil = currentStep + this.refractoryPeriod;
      this.refractoryTimer = this.refractoryPeriod;
    }

    this.updateEvents.push({ step: currentStep, input, potential: this.membranePotential, spiked });
    return spiked;
  }

  /**
   * Advance the neuron by one timestep in discrete time-stepped mode.
   *
   * @param {number} input  Total weighted synaptic input for this step.
   * @param {number} [step] Current simulation timestep (for spike recording).
   * @returns {boolean} `true` if the neuron fired.
   */
  update(input, step) {
    if (step !== undefined) this.lastUpdateStep = step;

    // Refractory guard
    if (this.refractoryTimer > 0) {
      this.refractoryTimer--;
      this.membranePotential = this.resetVoltage;
      this.potentialHistory.push(this.membranePotential);
      if (step !== undefined) {
        this.updateEvents.push({ step, input, potential: this.membranePotential, spiked: false });
      }
      return false;
    }

    // Leak + integrate
    this.membranePotential = this.membranePotential * this.leakFactor + input;

    // Clamp upper bound
    if (this.membranePotential > 1.2) {
      this.membranePotential = 1.2;
    }

    // Fire?
    const spiked = this.membranePotential >= this.threshold;
    if (spiked) {
      this.spikeCount++;
      if (step !== undefined) {
        this.spikeTimes.push(step);
        this.refractoryUntil = step + this.refractoryPeriod;
      }
      this.membranePotential = this.resetVoltage;
      this.refractoryTimer = this.refractoryPeriod;
    }

    this.potentialHistory.push(this.membranePotential);
    if (step !== undefined) {
      this.updateEvents.push({ step, input, potential: this.membranePotential, spiked });
    }
    return spiked;
  }

  /**
   * Reset the neuron to its initial idle state (preserves configuration).
   */
  reset() {
    this.membranePotential = 0.0;
    this.refractoryTimer = 0;
    this.refractoryUntil = -1;
    this.lastUpdateStep = 0;
    this.updateEvents = [{ step: 0, input: 0, potential: 0.0, spiked: false }];
    this.potentialHistory = [];
    this.spikeTimes = [];
    this.spikeCount = 0;
  }
}

/* ====================================================================
 *  SynapticConnection
 * ==================================================================== */

/**
 * A directed synaptic connection between two neurons.
 */
class SynapticConnection {
  /**
   * @param {number} sourceId  Pre-synaptic neuron id.
   * @param {number} targetId  Post-synaptic neuron id.
   * @param {number} weight    Synaptic weight (0.05 – 0.5).
   * @param {number} delay     Propagation delay in timesteps (1 – 3).
   */
  constructor(sourceId, targetId, weight, delay) {
    /** @type {number} */
    this.sourceId = sourceId;
    /** @type {number} */
    this.targetId = targetId;
    /** @type {number} */
    this.weight = weight;
    /** @type {number} */
    this.delay = delay;
  }
}

/* ====================================================================
 *  EventQueue — Binary min-heap by event time
 * ==================================================================== */

/**
 * Priority queue (binary min-heap) for timestamped synaptic events.
 */
class EventQueue {
  constructor() {
    /** @type {Array<{time: number, sourceId: number, targetId: number, weight: number}>} */
    this._heap = [];
    /** @type {number} Total cumulative insertions into heap. */
    this.insertions = 0;
    /** @type {number} Total cumulative removals from heap. */
    this.removals = 0;
  }

  /** @returns {number} Number of queued events. */
  get size() {
    return this._heap.length;
  }

  /** @returns {Array<{time: number, sourceId: number, targetId: number, weight: number}>} */
  get events() {
    return this._heap;
  }

  /**
   * Insert an event into the queue.
   * @param {{time: number, sourceId: number, targetId: number, weight: number}} event
   */
  push(event) {
    this.insertions++;
    this._heap.push(event);
    this._bubbleUp(this._heap.length - 1);
  }

  /**
   * Remove and return the earliest event.
   * @returns {{time: number, sourceId: number, targetId: number, weight: number}|undefined}
   */
  pop() {
    const heap = this._heap;
    if (heap.length === 0) return undefined;
    this.removals++;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  /**
   * Peek at the earliest event without removing it.
   * @returns {{time: number, sourceId: number, targetId: number, weight: number}|undefined}
   */
  peek() {
    return this._heap[0];
  }

  /** Remove all events. */
  clear() {
    this._heap.length = 0;
    this.insertions = 0;
    this.removals = 0;
  }

  /* ---- internal heap operations ---- */

  /** @private */
  _bubbleUp(i) {
    const heap = this._heap;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[i].time >= heap[parent].time) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  }

  /** @private */
  _sinkDown(i) {
    const heap = this._heap;
    const len = heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < len && heap[left].time < heap[smallest].time) smallest = left;
      if (right < len && heap[right].time < heap[smallest].time) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
}

/* ====================================================================
 *  SimulationEngine
 * ==================================================================== */

/**
 * @typedef {object} SimConfig
 * @property {number}  [neuronCount=48]
 * @property {number}  [connectionDensity=0.3]
 * @property {number}  [inputSparsity=0.7]
 * @property {number}  [firingThreshold=0.65]
 * @property {'event'|'clock'} [executionMode='event']
 * @property {boolean} [adaptiveThreshold=false]
 * @property {boolean} [adaptiveTemporal=false]
 * @property {number}  [steps=30]
 */

/**
 * @typedef {object} SimState
 * @property {number}   step
 * @property {number[]} potentials
 * @property {number[]} spiked
 * @property {number[]} active
 * @property {number[]} inactive
 * @property {number}   spikeCount
 * @property {number}   updateCount
 * @property {number}   eventQueueSize
 * @property {Object<number, number[]>} spikeRaster
 * @property {Object<number, number[]>} membranePotentialHistory
 * @property {number[]} spikeFrequency
 * @property {number}   activeCount
 * @property {number}   inactiveCount
 */

/**
 * Enhanced Spiking Neural Network simulation engine.
 *
 * Supports event-driven and time-stepped (clock) execution modes, adaptive
 * threshold modulation, adaptive temporal binning, and real-time data
 * recording with per-step callbacks.
 */
class SimulationEngine {
  constructor(config = null) {
    /** @type {LIFNeuron[]} */
    this.neurons = [];
    /** @type {SynapticConnection[]} */
    this.connections = [];
    /** @type {EventQueue} */
    this.eventQueue = new EventQueue();

    /** @type {SimConfig} */
    this.config = null;

    /** @type {boolean} */
    this.isRunning = false;
    /** @type {boolean} */
    this.isPaused = false;
    /** @type {number} */
    this.currentStep = 0;

    /** Total neuron state integration evaluations. */
    this.neuronIntegrations = 0;
    /** Total lazy membrane decay evaluations. */
    this.lazyDecayEvaluations = 0;
    /** Total external input events injected. */
    this.externalInputEvents = 0;
    /** Total neuron updates performed (alias for neuronIntegrations). */
    this.updateCount = 0;
    /** Total spikes generated this run. */
    this.totalSpikeCount = 0;
    /** Cumulative synaptic events scheduled into the event queue. */
    this.scheduledEventCount = 0;
    /** Cumulative synaptic events delivered to target neurons. */
    this.deliveredEventCount = 0;

    /** @type {number} Wall-clock execution duration of most recent step (ms). */
    this.lastStepExecutionMs = 0;
    /** @type {number} Cumulative wall-clock execution duration across steps (ms). */
    this.totalExecutionMs = 0;
    /** @type {string} Simulation algorithm engine release version. */
    this.simEngineVersion = '2.1.1-sparse';

    /** @type {number} ID of neuron currently inspected in frontend charts. */
    this.inspectedNeuronId = 0;

    /** @type {number|string} Experiment seed */
    this.seed = 42;
    /** @type {SeededPRNG|null} PRNG for network generation */
    this.prng = null;
    /** @type {SeededPRNG|null} PRNG for stochastic input generation */
    this.inputPRNG = null;

    /* ---- recorded data ---- */
    /** @type {Map<number, number[]>} neuronId → potential per step */
    this.membranePotentialHistory = new Map();
    /** @type {Map<number, number[]>} neuronId → spike timesteps */
    this.spikeRaster = new Map();
    /** @type {number[]} spike count per timestep */
    this.spikeFrequency = [];
    /** @type {number[]} event-queue size per step */
    this.eventQueueSnapshots = [];

    /* ---- adaptive threshold state ---- */
    /** @type {number[]} */
    this.thresholdHistory = [];
    /** @type {number} */
    this._currentThreshold = 0.65;

    /* ---- adaptive temporal binning state ---- */
    /** @type {number} current effective bin size */
    this._binSize = 1;
    /** @type {number[]} bin size per step */
    this.binSizeHistory = [];
    /** @type {Map<number, number>} accumulated input during temporal bin */
    this._binAccumulator = new Map();

    /* ---- step callback ---- */
    /**
     * Called after each simulation step with the current state snapshot.
     * @type {function(SimState): void | null}
     */
    this.onStep = null;

    /* ---- pause / resume plumbing ---- */
    /** @private */
    this._pauseResolve = null;
    /** @private */
    this._runResolve = null;

    /* ---- connection index lookups ---- */
    /** @private @type {Map<number, SynapticConnection[]>} */
    this._outgoing = new Map();
    /** @private @type {Map<number, SynapticConnection[]>} */
    this._incoming = new Map();

    if (config) {
      this.init(config);
    }
  }

  /* ==================================================================
   *  init — build network
   * ================================================================== */

  /**
   * Initialise (or re-initialise) the simulation with the given config.
   *
   * Creates neurons and deterministic synaptic connections according to
   * `connectionDensity` using a seeded PRNG. Resets all recorded data.
   *
   * @param {SimConfig} [config]
   */
  init(config = {}) {
    let sparsity = config.inputSparsity ?? 0.7;
    if (sparsity > 1) sparsity = sparsity / 100;
    const seed = config.seed !== undefined ? config.seed : 42;

    this.config = {
      neuronCount: 48,
      connectionDensity: 0.3,
      inputSparsity: sparsity,
      firingThreshold: 0.65,
      executionMode: 'event',
      adaptiveThreshold: false,
      adaptiveTemporal: false,
      steps: 30,
      seed,
      ...config,
      inputSparsity: sparsity,
      seed,
    };

    const cfg = this.config;
    this.seed = cfg.seed;
    this.prng = new SeededPRNG(this.seed);
    this.inputPRNG = new SeededPRNG(typeof this.seed === 'number' ? (this.seed + 1013) : SeededPRNG.hashString(String(this.seed) + '_in'));

    this._currentThreshold = cfg.firingThreshold;

    // --- neurons ---
    this.neurons = [];
    for (let i = 0; i < cfg.neuronCount; i++) {
      this.neurons.push(
        new LIFNeuron(i, { threshold: cfg.firingThreshold })
      );
    }

    // --- random connections with deterministic seeded PRNG ---
    this.connections = [];
    this._outgoing = new Map();
    this._incoming = new Map();
    for (let i = 0; i < cfg.neuronCount; i++) {
      this._outgoing.set(i, []);
      this._incoming.set(i, []);
    }

    for (let src = 0; src < cfg.neuronCount; src++) {
      for (let tgt = 0; tgt < cfg.neuronCount; tgt++) {
        if (src === tgt) continue;
        if (this.prng.random() < cfg.connectionDensity) {
          const weight = 0.05 + this.prng.random() * 0.45;   // 0.05–0.5
          const delay = 1 + Math.floor(this.prng.random() * 3); // 1–3
          const conn = new SynapticConnection(src, tgt, weight, delay);
          this.connections.push(conn);
          this._outgoing.get(src).push(conn);
          this._incoming.get(tgt).push(conn);
        }
      }
    }

    this.reset();
  }

  /* ==================================================================
   *  reset
   * ================================================================== */

  /**
   * Reset all runtime state and recorded data to initial conditions.
   * Does not alter the network topology or config. Resets PRNG state.
   */
  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.currentStep = 0;
    this.neuronIntegrations = 0;
    this.lazyDecayEvaluations = 0;
    this.externalInputEvents = 0;
    this.updateCount = 0;
    this.totalSpikeCount = 0;
    this.scheduledEventCount = 0;
    this.deliveredEventCount = 0;
    this.lastStepExecutionMs = 0;
    this.totalExecutionMs = 0;
    this.eventQueue.clear();

    if (this.prng) this.prng.reset();
    if (this.inputPRNG) this.inputPRNG.reset();

    this.membranePotentialHistory = new Map();
    this.spikeRaster = new Map();
    this.spikeFrequency = [];
    this.eventQueueSnapshots = [];
    this.binSizeHistory = [];
    this._binSize = 1;
    this._binAccumulator = new Map();

    if (this.config) {
      this._currentThreshold = this.config.firingThreshold;
    }
    this.thresholdHistory = [this._currentThreshold];

    for (const n of this.neurons) {
      n.threshold = this._currentThreshold;
      n.reset();
      this.membranePotentialHistory.set(n.id, []);
      this.spikeRaster.set(n.id, []);
    }

    this._pauseResolve = null;
    this._runResolve = null;
  }

  /**
   * Set the ID of the neuron currently inspected in the UI.
   * @param {number} id
   */
  setInspectedNeuron(id) {
    if (typeof id === 'number' && id >= 0 && id < this.neurons.length) {
      this.inspectedNeuronId = id;
    }
  }

  /* ==================================================================
   *  Sparse Input Sampler & Lazy Potential Helpers
   * ================================================================== */

  /**
   * Efficiently samples stochastic external input across the network.
   * For Bernoulli process with success probability p = 1 - inputSparsity:
   * - If p <= 0 (100% sparsity): no neurons receive input (0 PRNG draws).
   * - If p >= 1 (0% sparsity): all neurons receive input.
   * - If 0 < p < 1: uses geometric skip-sampling to determine the indices
   *   of active neurons directly without scanning all idle neurons:
   *   k ~ Geometric(p), index += 1 + k.
   *
   * @private
   * @returns {Map<number, number>} neuronId → external current
   */
  _sampleExternalInputs() {
    const inputMap = new Map();
    const p = 1.0 - (this.config?.inputSparsity ?? 0.7);
    const N = this.neurons.length;

    if (p <= 0 || N === 0) {
      return inputMap;
    }

    if (p >= 1.0) {
      for (let i = 0; i < N; i++) {
        const ext = 0.1 + this.inputPRNG.random() * 0.25;
        inputMap.set(i, ext);
        this.externalInputEvents++;
      }
      return inputMap;
    }

    // Geometric skip-sampling for exact Bernoulli process
    const q = 1.0 - p;
    const logQ = Math.log(q);
    let curr = -1;

    while (true) {
      const u = Math.max(1e-15, Math.min(1.0 - 1e-15, this.inputPRNG.random()));
      const k = Math.floor(Math.log(u) / logQ);
      curr += 1 + k;
      if (curr >= N) break;

      const ext = 0.1 + this.inputPRNG.random() * 0.25;
      inputMap.set(curr, ext);
      this.externalInputEvents++;
    }

    return inputMap;
  }

  /**
   * Calculate on-demand current membrane potential for a given neuron at `targetStep`.
   * Evaluates lazy exponential decay and refractory status if the neuron was idle.
   *
   * @param {number} id           Neuron identifier.
   * @param {number} [targetStep] Target simulation timestep.
   * @returns {number} Normalized membrane potential.
   */
  getNeuronPotentialAt(id, targetStep = this.currentStep) {
    const n = this.neurons[id];
    if (!n) return 0.0;
    if (this.config?.executionMode === 'clock') {
      return n.membranePotential;
    }

    const lastStep = n.lastUpdateStep ?? 0;
    if (lastStep >= targetStep) {
      return n.membranePotential;
    }

    // If currently in refractory period at targetStep
    if (targetStep <= (n.refractoryUntil ?? 0)) {
      return n.resetVoltage;
    }

    // If refractory period ended between lastStep and targetStep
    const refUntil = n.refractoryUntil ?? 0;
    if (lastStep <= refUntil && targetStep > refUntil) {
      const elapsed = targetStep - refUntil;
      return n.resetVoltage * Math.pow(n.leakFactor, elapsed);
    }

    // Normal exponential decay from last calculated potential
    const elapsed = targetStep - lastStep;
    return n.membranePotential * Math.pow(n.leakFactor, elapsed);
  }

  /**
   * Reconstruct the continuous step-by-step membrane potential trajectory for a neuron.
   * Uses sparse update event history and mathematically exact exponential decay.
   *
   * @param {number} id Neuron identifier.
   * @returns {number[]} Array of potentials from step 0 to currentStep.
   */
  getNeuronHistory(id) {
    const n = this.neurons[id];
    if (!n) return [];
    if (this.config?.executionMode === 'clock') {
      return n.potentialHistory.slice();
    }

    const history = [];
    const updateMap = new Map();
    for (const ev of n.updateEvents) {
      updateMap.set(ev.step, ev);
    }

    let v = 0.0;
    let refUntil = 0;
    const maxSteps = Math.max(1, this.currentStep);

    for (let s = 0; s < maxSteps; s++) {
      if (updateMap.has(s)) {
        const ev = updateMap.get(s);
        v = ev.potential;
        if (ev.spiked) {
          refUntil = s + n.refractoryPeriod;
        }
      } else {
        // Idle timestep
        if (s <= refUntil) {
          v = n.resetVoltage;
        } else {
          v = v * n.leakFactor;
        }
      }
      history.push(v);
    }

    return history;
  }

  /* ==================================================================
   *  step — single timestep
   * ================================================================== */

  /**
   * Execute a single simulation timestep.
   *
   * In **event-driven** mode only neurons with pending events (or stochastic
   * input) are evaluated using lazy membrane potential decay.
   * In **clock** (time-stepped) mode every neuron is updated unconditionally.
   */
  step() {
    if (!this.config) {
      this.init();
    }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const cfg = this.config;
    const step = this.currentStep;

    // --- adaptive temporal binning ---
    let isBinStep = true;
    if (cfg.adaptiveTemporal) {
      const sparsity = this._computeSparsity();
      if (sparsity >= 0.65) {
        this._binSize = 2;
      } else {
        this._binSize = 1;
      }
      this.binSizeHistory.push(this._binSize);

      if (this._binSize === 2 && step % 2 !== 0) {
        // Odd step of a 2-step bin: accumulate input only, defer processing
        isBinStep = false;
      }
    }

    // --- 1. Gather sparse inputs ---
    // Stochastic external input (geometric skip-sampler)
    const inputMap = this._sampleExternalInputs();

    // Process event queue: deliver all events scheduled for this timestep
    while (this.eventQueue.size > 0 && this.eventQueue.peek().time <= step) {
      const ev = this.eventQueue.pop();
      this.deliveredEventCount++;
      inputMap.set(ev.targetId, (inputMap.get(ev.targetId) ?? 0) + ev.weight);
    }

    // Accumulate for temporal binning
    if (cfg.adaptiveTemporal && this._binSize === 2) {
      for (const [nid, val] of inputMap) {
        this._binAccumulator.set(nid, (this._binAccumulator.get(nid) ?? 0) + val);
      }
      if (!isBinStep) {
        // Record placeholders for the deferred step
        this.spikeFrequency.push(0);
        this.eventQueueSnapshots.push(this.eventQueue.size);
        this.thresholdHistory.push(this._currentThreshold);
        this.currentStep++;
        const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this.lastStepExecutionMs = Math.max(0, t1 - t0);
        this.totalExecutionMs += this.lastStepExecutionMs;
        return;
      }
      // Processing step: use accumulated input, then clear accumulator
      for (const [nid, val] of this._binAccumulator) {
        inputMap.set(nid, val);
      }
      this._binAccumulator.clear();
    }

    // --- 2. Update neurons (Sparse Event-Driven vs Discrete Time-Stepped) ---
    const spikedIds = [];
    const isEventDriven = cfg.executionMode === 'event';

    if (isEventDriven) {
      // GENUINE SPARSE EVENT-DRIVEN EXECUTION:
      // Evaluate ONLY neurons receiving external input or delivered synaptic events.
      // Completely idle neurons skip evaluation; their membrane decay is evaluated lazily.
      for (const [nid, inp] of inputMap) {
        if (nid < 0 || nid >= this.neurons.length) continue;
        const n = this.neurons[nid];

        // Apply lazy decay from lastUpdateStep
        n.lazyDecay(step);
        this.lazyDecayEvaluations++;

        // Integrate incoming current & test threshold crossing
        this.neuronIntegrations++;
        const spiked = n.integrateAndFire(inp, step);

        if (spiked) {
          spikedIds.push(n.id);
          this.spikeRaster.get(n.id).push(step);
          this.totalSpikeCount++;

          // Enqueue post-synaptic events along actual directed outgoing connections
          const outgoing = this._outgoing.get(n.id);
          if (outgoing) {
            for (const conn of outgoing) {
              this.eventQueue.push({
                time: step + conn.delay,
                sourceId: conn.sourceId,
                targetId: conn.targetId,
                weight: conn.weight,
              });
              this.scheduledEventCount++;
            }
          }
        }
      }
    } else {
      // DISCRETE TIME-STEPPED (CLOCK) EXECUTION:
      // Evaluates every single neuron unconditionally at every timestep.
      for (const n of this.neurons) {
        const inp = inputMap.get(n.id) ?? 0;
        this.lazyDecayEvaluations++;
        this.neuronIntegrations++;
        const spiked = n.update(inp, step);

        if (spiked) {
          spikedIds.push(n.id);
          this.spikeRaster.get(n.id).push(step);
          this.totalSpikeCount++;

          const outgoing = this._outgoing.get(n.id);
          if (outgoing) {
            for (const conn of outgoing) {
              this.eventQueue.push({
                time: step + conn.delay,
                sourceId: conn.sourceId,
                targetId: conn.targetId,
                weight: conn.weight,
              });
              this.scheduledEventCount++;
            }
          }
        }
      }
    }

    // Alias for compatibility
    this.updateCount = this.neuronIntegrations;

    // --- 3. Event Accounting Invariant Assertion ---
    // Scheduled Synaptic Events = Delivered Synaptic Events + Pending Synaptic Events
    const pendingEvents = this.eventQueue.size;
    if (this.scheduledEventCount !== this.deliveredEventCount + pendingEvents) {
      console.warn(
        `[NEUROCORE INVARIANT VIOLATION] Step ${step}: Scheduled (${this.scheduledEventCount}) != Delivered (${this.deliveredEventCount}) + Pending (${pendingEvents})`
      );
    }

    // --- 4. Record step data ---
    this.spikeFrequency.push(spikedIds.length);
    this.eventQueueSnapshots.push(this.eventQueue.size);

    // --- 5. Adaptive threshold modulation ---
    if (cfg.adaptiveThreshold) {
      const activeRatio = spikedIds.length / this.neurons.length;
      if (activeRatio > 0.15) {
        this._currentThreshold = Math.min(1.1, this._currentThreshold + 0.05);
      } else if (activeRatio < 0.05) {
        this._currentThreshold = Math.max(0.2, this._currentThreshold - 0.03);
      }
      for (const n of this.neurons) {
        n.threshold = this._currentThreshold;
      }
    }
    this.thresholdHistory.push(this._currentThreshold);

    // --- 6. Execution duration accounting ---
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.lastStepExecutionMs = Math.max(0, t1 - t0);
    this.totalExecutionMs += this.lastStepExecutionMs;

    this.currentStep++;

    // --- onStep callback ---
    if (typeof this.onStep === 'function') {
      this.onStep(this.getState());
    }
  }

  /* ==================================================================
   *  run — multi-step async execution
   * ================================================================== */

  /**
   * Run the simulation for a given number of steps.
   *
   * Yields control back to the browser every 5 steps via `setTimeout`
   * so the UI remains responsive.
   *
   * @param {number} [steps]  Number of steps to execute (defaults to config.steps).
   * @returns {Promise<SimState>} Resolves with the final state snapshot.
   */
  run(steps) {
    const total = steps ?? this.config.steps;
    this.isRunning = true;
    this.isPaused = false;

    return new Promise((resolve) => {
      this._runResolve = resolve;
      let done = 0;

      const batch = () => {
        if (!this.isRunning) {
          resolve(this.getState());
          return;
        }

        // If paused, stash the continuation and wait for resume()
        if (this.isPaused) {
          this._pauseResolve = () => {
            // Continue where we left off
            setTimeout(batch, 0);
          };
          return;
        }

        const batchEnd = Math.min(done + 5, total);
        while (done < batchEnd) {
          if (this.isPaused) break;
          this.step();
          done++;
        }

        if (done >= total || !this.isRunning) {
          this.isRunning = false;
          resolve(this.getState());
        } else {
          setTimeout(batch, 0);
        }
      };

      setTimeout(batch, 0);
    });
  }

  /* ==================================================================
   *  pause / resume
   * ================================================================== */

  /**
   * Pause a currently running simulation.
   */
  pause() {
    if (this.isRunning) {
      this.isPaused = true;
    }
  }

  /**
   * Resume a paused simulation.
   */
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      if (typeof this._pauseResolve === 'function') {
        const fn = this._pauseResolve;
        this._pauseResolve = null;
        fn();
      }
    }
  }

  /* ==================================================================
   *  getTopology & getState — snapshots
   * ================================================================== */

  /**
   * Return the actual network topology and connection graph.
   * @returns {{ neuronCount: number, connectionCount: number, connectionDensity: number, seed: number|string, connections: Array<{ sourceId: number, targetId: number, weight: number, delay: number }> }}
   */
  getTopology() {
    return {
      neuronCount: this.neurons.length,
      connectionCount: this.connections.length,
      connectionDensity: this.config?.connectionDensity ?? 0.3,
      seed: this.seed,
      connections: this.connections.map((c) => ({
        sourceId: c.sourceId,
        targetId: c.targetId,
        weight: c.weight,
        delay: c.delay,
      })),
    };
  }

  /**
   * Return a snapshot of the current simulation state.
   *
   * @returns {SimState}
   */
  getState() {
    const potentials = this.neurons.map((n) => this.getNeuronPotentialAt(n.id, this.currentStep));

    // Neurons that spiked on the most recent step
    const lastStep = this.currentStep - 1;
    const spiked = this.neurons
      .filter((n) => n.spikeTimes.includes(lastStep))
      .map((n) => n.id);

    // Active = membrane potential above 25 % of threshold
    const active = this.neurons
      .filter((n) => potentials[n.id] > n.threshold * 0.25)
      .map((n) => n.id);

    const activeSet = new Set(active);
    const inactive = this.neurons
      .filter((n) => !activeSet.has(n.id))
      .map((n) => n.id);

    // Build plain objects from Maps for the public API
    const spikeRasterObj = {};
    for (const [id, times] of this.spikeRaster) {
      spikeRasterObj[id] = times.slice();
    }

    // On-demand history proxy: populates inspected neuron directly, reconstructs others on demand
    const historyObj = {};
    historyObj[this.inspectedNeuronId] = this.getNeuronHistory(this.inspectedNeuronId);
    const historyProxy = new Proxy(historyObj, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        const nid = parseInt(prop, 10);
        if (!isNaN(nid) && nid >= 0 && nid < this.neurons.length) {
          target[prop] = this.getNeuronHistory(nid);
          return target[prop];
        }
        return undefined;
      },
    });

    return {
      step: this.currentStep,
      potentials,
      spiked,
      active,
      inactive,
      spikeCount: this.totalSpikeCount,
      updateCount: this.neuronIntegrations, // compatibility alias
      neuronIntegrations: this.neuronIntegrations,
      lazyDecayEvaluations: this.lazyDecayEvaluations,
      externalInputEvents: this.externalInputEvents,
      scheduledEvents: this.scheduledEventCount,
      deliveredEvents: this.deliveredEventCount,
      pendingEvents: this.eventQueue.size,
      queueInsertions: this.eventQueue.insertions,
      queueRemovals: this.eventQueue.removals,
      eventQueueSize: this.eventQueue.size,
      currentThreshold: this._currentThreshold,
      thresholdHistory: this.thresholdHistory.slice(),
      seed: this.seed,
      neuronCount: this.neurons.length,
      connectionCount: this.connections.length,
      spikeRaster: spikeRasterObj,
      membranePotentialHistory: historyProxy,
      spikeFrequency: this.spikeFrequency.slice(),
      activeCount: active.length,
      inactiveCount: inactive.length,
      simEngineVersion: this.simEngineVersion,
      executionDurationMs: this.lastStepExecutionMs,
      totalExecutionDurationMs: this.totalExecutionMs,
    };
  }

  /* ==================================================================
   *  Private helpers
   * ================================================================== */

  /**
   * Compute activity sparsity (fraction of neurons that did NOT spike on the
   * most recent recorded step).
   * @private
   * @returns {number} 0.0 (all active) to 1.0 (all silent).
   */
  _computeSparsity() {
    if (this.spikeFrequency.length === 0) return 1.0;
    const lastSpikes = this.spikeFrequency[this.spikeFrequency.length - 1] ?? 0;
    return 1.0 - lastSpikes / this.neurons.length;
  }
}

/* ====================================================================
 *  Export on window and module
 * ==================================================================== */

SimulationEngine.LIFNeuron = LIFNeuron;
SimulationEngine.SynapticConnection = SynapticConnection;
SimulationEngine.EventQueue = EventQueue;
SimulationEngine.SeededPRNG = SeededPRNG;

if (typeof window !== 'undefined') {
  window.SimulationEngine = SimulationEngine;
  window.LIFNeuron = LIFNeuron;
  window.SynapticConnection = SynapticConnection;
  window.EventQueue = EventQueue;
  window.SeededPRNG = SeededPRNG;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SimulationEngine, LIFNeuron, SynapticConnection, EventQueue, SeededPRNG };
}
