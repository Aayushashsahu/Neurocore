/**
 * NEUROCORE Platform — Enhanced SNN Simulation Engine
 * 
 * A self-contained, modular Leaky Integrate-and-Fire (LIF) spiking neural
 * network simulation engine. Supports event-driven and time-stepped execution
 * modes, adaptive threshold policies, and adaptive temporal binning.
 * 
 * @file simulation-engine.js
 * @version 2.0.0
 * @license MIT
 */

'use strict';

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
    /** @type {number} Remaining refractory timesteps. */
    this.refractoryTimer = 0;

    /** @type {number[]} Full membrane-potential history. */
    this.potentialHistory = [];
    /** @type {number[]} Timesteps at which the neuron spiked. */
    this.spikeTimes = [];
    /** @type {number} Cumulative spike count. */
    this.spikeCount = 0;
  }

  /**
   * Advance the neuron by one timestep.
   *
   * @param {number} input  Total weighted synaptic input for this step.
   * @param {number} [step] Current simulation timestep (for spike recording).
   * @returns {boolean} `true` if the neuron fired.
   */
  update(input, step) {
    // Refractory guard
    if (this.refractoryTimer > 0) {
      this.refractoryTimer--;
      this.membranePotential = this.resetVoltage;
      this.potentialHistory.push(this.membranePotential);
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
      if (step !== undefined) this.spikeTimes.push(step);
      this.membranePotential = this.resetVoltage;
      this.refractoryTimer = this.refractoryPeriod;
    }

    this.potentialHistory.push(this.membranePotential);
    return spiked;
  }

  /**
   * Reset the neuron to its initial idle state (preserves configuration).
   */
  reset() {
    this.membranePotential = 0.0;
    this.refractoryTimer = 0;
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
  }

  /** @returns {number} Number of queued events. */
  get size() {
    return this._heap.length;
  }

  /**
   * Insert an event into the queue.
   * @param {{time: number, sourceId: number, targetId: number, weight: number}} event
   */
  push(event) {
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

    /** Total neuron updates performed (for benchmarking). */
    this.updateCount = 0;
    /** Total spikes generated this run. */
    this.totalSpikeCount = 0;

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

    /* ---- outgoing connections index (source → connections[]) ---- */
    /** @private @type {Map<number, SynapticConnection[]>} */
    this._outgoing = new Map();

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
   * Creates neurons and random synaptic connections according to
   * `connectionDensity`. Resets all recorded data.
   *
   * @param {SimConfig} [config]
   */
  init(config = {}) {
    let sparsity = config.inputSparsity ?? 0.7;
    if (sparsity > 1) sparsity = sparsity / 100;

    this.config = {
      neuronCount: 48,
      connectionDensity: 0.3,
      inputSparsity: sparsity,
      firingThreshold: 0.65,
      executionMode: 'event',
      adaptiveThreshold: false,
      adaptiveTemporal: false,
      steps: 30,
      ...config,
      inputSparsity: sparsity,
    };

    const cfg = this.config;
    this._currentThreshold = cfg.firingThreshold;

    // --- neurons ---
    this.neurons = [];
    for (let i = 0; i < cfg.neuronCount; i++) {
      this.neurons.push(
        new LIFNeuron(i, { threshold: cfg.firingThreshold })
      );
    }

    // --- random connections ---
    this.connections = [];
    this._outgoing = new Map();
    for (let i = 0; i < cfg.neuronCount; i++) {
      this._outgoing.set(i, []);
    }

    for (let src = 0; src < cfg.neuronCount; src++) {
      for (let tgt = 0; tgt < cfg.neuronCount; tgt++) {
        if (src === tgt) continue;
        if (Math.random() < cfg.connectionDensity) {
          const weight = 0.05 + Math.random() * 0.45;   // 0.05–0.5
          const delay = 1 + Math.floor(Math.random() * 3); // 1–3
          const conn = new SynapticConnection(src, tgt, weight, delay);
          this.connections.push(conn);
          this._outgoing.get(src).push(conn);
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
   * Does not alter the network topology or config.
   */
  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.currentStep = 0;
    this.updateCount = 0;
    this.totalSpikeCount = 0;
    this.eventQueue.clear();

    this.membranePotentialHistory = new Map();
    this.spikeRaster = new Map();
    this.spikeFrequency = [];
    this.eventQueueSnapshots = [];
    this.thresholdHistory = [];
    this.binSizeHistory = [];
    this._binSize = 1;
    this._binAccumulator = new Map();

    if (this.config) {
      this._currentThreshold = this.config.firingThreshold;
    }

    for (const n of this.neurons) {
      n.threshold = this._currentThreshold;
      n.reset();
      this.membranePotentialHistory.set(n.id, []);
      this.spikeRaster.set(n.id, []);
    }

    this._pauseResolve = null;
    this._runResolve = null;
  }

  /* ==================================================================
   *  step — single timestep
   * ================================================================== */

  /**
   * Execute a single simulation timestep.
   *
   * In **event-driven** mode only neurons with pending events (or stochastic
   * input) are updated. In **clock** (time-stepped) mode every neuron is
   * updated unconditionally.
   */
  step() {
    if (!this.config) {
      this.init();
    }
    const cfg = this.config;
    const step = this.currentStep;

    // --- adaptive temporal binning ---
    let isBinStep = true; // should we process neurons this step?
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

    // --- determine per-neuron input ---
    /** @type {Map<number, number>} neuronId → total input this step */
    const inputMap = new Map();

    // Stochastic external input (inputSparsity = probability that a neuron
    // does NOT receive input, so probability of input = 1 - inputSparsity)
    const inputProb = 1.0 - cfg.inputSparsity;
    for (const n of this.neurons) {
      if (Math.random() < inputProb) {
        const ext = 0.1 + Math.random() * 0.25; // small random current
        inputMap.set(n.id, (inputMap.get(n.id) ?? 0) + ext);
      }
    }

    // Process event queue: deliver all events scheduled for this timestep
    while (this.eventQueue.size > 0 && this.eventQueue.peek().time <= step) {
      const ev = this.eventQueue.pop();
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
        for (const n of this.neurons) {
          this.membranePotentialHistory.get(n.id).push(n.membranePotential);
        }
        this.currentStep++;
        return;
      }
      // Processing step: use accumulated input, then clear accumulator
      for (const [nid, val] of this._binAccumulator) {
        inputMap.set(nid, val);
      }
      this._binAccumulator.clear();
    }

    // --- update neurons ---
    const spikedIds = [];
    const isEventDriven = cfg.executionMode === 'event';

    for (const n of this.neurons) {
      const inp = inputMap.get(n.id) ?? 0;

      // Event-driven: skip neurons with zero input that are not in refractory
      if (isEventDriven && inp === 0 && n.refractoryTimer === 0) {
        // Still apply leak so membrane decays
        n.membranePotential *= n.leakFactor;
        n.potentialHistory.push(n.membranePotential);
        this.membranePotentialHistory.get(n.id).push(n.membranePotential);
        continue;
      }

      this.updateCount++;
      const spiked = n.update(inp, step);
      this.membranePotentialHistory.get(n.id).push(n.membranePotential);

      if (spiked) {
        spikedIds.push(n.id);
        this.spikeRaster.get(n.id).push(step);
        this.totalSpikeCount++;

        // Enqueue post-synaptic events
        const outgoing = this._outgoing.get(n.id);
        if (outgoing) {
          for (const conn of outgoing) {
            this.eventQueue.push({
              time: step + conn.delay,
              sourceId: conn.sourceId,
              targetId: conn.targetId,
              weight: conn.weight,
            });
          }
        }
      }
    }

    // --- record data ---
    this.spikeFrequency.push(spikedIds.length);
    this.eventQueueSnapshots.push(this.eventQueue.size);

    // --- adaptive threshold ---
    if (cfg.adaptiveThreshold) {
      const activeRatio = spikedIds.length / this.neurons.length;
      if (activeRatio > 0.15) {
        this._currentThreshold = Math.min(1.1, this._currentThreshold + 0.05);
      } else if (activeRatio < 0.05) {
        this._currentThreshold = Math.max(0.2, this._currentThreshold - 0.03);
      }
      // Apply updated threshold to all neurons
      for (const n of this.neurons) {
        n.threshold = this._currentThreshold;
      }
      this.thresholdHistory.push(this._currentThreshold);
    }

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
   *  getState — snapshot
   * ================================================================== */

  /**
   * Return a snapshot of the current simulation state.
   *
   * @returns {SimState}
   */
  getState() {
    const potentials = this.neurons.map((n) => n.membranePotential);

    // Neurons that spiked on the most recent step
    const lastStep = this.currentStep - 1;
    const spiked = this.neurons
      .filter((n) => n.spikeTimes.includes(lastStep))
      .map((n) => n.id);

    // Active = membrane potential above 25 % of threshold
    const active = this.neurons
      .filter((n) => n.membranePotential > n.threshold * 0.25)
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

    const historyObj = {};
    for (const [id, vals] of this.membranePotentialHistory) {
      historyObj[id] = vals.slice();
    }

    return {
      step: this.currentStep,
      potentials,
      spiked,
      active,
      inactive,
      spikeCount: this.totalSpikeCount,
      updateCount: this.updateCount,
      eventQueueSize: this.eventQueue.size,
      spikeRaster: spikeRasterObj,
      membranePotentialHistory: historyObj,
      spikeFrequency: this.spikeFrequency.slice(),
      activeCount: active.length,
      inactiveCount: inactive.length,
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
 *  Export on window
 * ==================================================================== */

window.SimulationEngine = SimulationEngine;
