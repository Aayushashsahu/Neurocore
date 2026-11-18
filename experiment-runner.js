/**
 * NEUROCORE — Experimental Runner & Statistical Benchmarking Engine (v2.2.0)
 * 
 * Provides reproducible, multi-trial empirical SNN simulation campaigns,
 * sample statistics calculation (Mean, Sample SD with n-1 denominator, Median, Min, Max),
 * paired-seed comparison between Event-Driven and Time-Stepped execution strategies,
 * scientific parity verification, and structured data exports (CSV & JSON).
 * 
 * @file experiment-runner.js
 * @version 2.2.0
 * @license MIT
 */

'use strict';

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    const simEngineModule = require('./simulation-engine.js');
    module.exports = factory(simEngineModule.SimulationEngine, simEngineModule.SeededPRNG);
  } else {
    // Browser global
    root.NeuroExperiment = factory(root.SimulationEngine, root.SeededPRNG);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(SimulationEngineClass, SeededPRNGClass) {

  /* ══════════════════════════════════════════════════════════════════════════
   * 1. RIGOROUS STATISTICAL HELPER FUNCTIONS
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Calculate arithmetic mean of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum / arr.length;
  }

  /**
   * Calculate sample standard deviation with (n - 1) denominator.
   * Returns null if n < 2 (cannot calculate sample standard deviation).
   * @param {number[]} arr
   * @returns {number|null}
   */
  function sampleStdDev(arr) {
    if (!arr || arr.length < 2) return null;
    const m = mean(arr);
    let sumSqDiff = 0;
    for (let i = 0; i < arr.length; i++) {
      const diff = arr[i] - m;
      sumSqDiff += diff * diff;
    }
    return Math.sqrt(sumSqDiff / (arr.length - 1));
  }

  /**
   * Calculate median of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function median(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Return minimum value of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function min(arr) {
    if (!arr || arr.length === 0) return 0;
    let m = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < m) m = arr[i];
    }
    return m;
  }

  /**
   * Return maximum value of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function max(arr) {
    if (!arr || arr.length === 0) return 0;
    let m = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > m) m = arr[i];
    }
    return m;
  }

  /**
   * Deterministically derive repetition seed from base seed and repetition index.
   * @param {number} baseSeed
   * @param {number} repIndex
   * @returns {number} 32-bit positive integer seed
   */
  function deriveTrialSeed(baseSeed, repIndex) {
    let t = (baseSeed + repIndex * 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % 900000) + 10000;
  }

  /**
   * Compute comprehensive statistical summary for an array of metric values.
   * @param {number[]} values
   * @param {string} metric
   * @param {string} unit
   * @param {string} mode
   * @returns {object}
   */
  function computeMetricStats(values, metric, unit, mode) {
    const n = values.length;
    const m = mean(values);
    const sd = sampleStdDev(values);
    const med = median(values);
    const mn = min(values);
    const mx = max(values);
    return {
      metric,
      unit,
      mode,
      strategy: mode,
      n,
      mean: m,
      sd,
      sampleStdDev: sd,
      median: med,
      min: mn,
      max: mx,
      formatted: sd !== null ? `${m.toFixed(1)} ± ${sd.toFixed(1)}` : `${m.toFixed(1)} (N=1)`,
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 2. SINGLE TRIAL RUNNER
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Execute an individual trial on an isolated SimulationEngine instance.
   * @param {object} trialParams
   * @param {function} [EngineConstructor=SimulationEngineClass]
   * @returns {object} Raw trial record
   */
  function executeTrial(trialParams, EngineConstructor = SimulationEngineClass) {
    if (!EngineConstructor) {
      throw new Error('SimulationEngine class is not available.');
    }

    const {
      experimentId,
      trialId,
      repetitionIndex,
      seed,
      mode,
      neuronCount,
      connectionDensity = 0.25,
      sparsity = 70,
      firingThreshold = 0.65,
      simulationSteps = 50,
      adaptiveThreshold = false,
      adaptiveTemporal = false,
    } = trialParams;

    // Fresh isolated engine instance
    const engine = new EngineConstructor();

    // 1. Measure initialization duration separately
    const tInitStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    engine.init({
      neuronCount,
      connectionDensity,
      inputSparsity: sparsity,
      firingThreshold,
      simulationSteps,
      steps: simulationSteps,
      executionMode: mode,
      mode,
      adaptiveThreshold,
      adaptiveTemporal,
      seed,
    });
    const initDurationMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - tInitStart;

    // 2. Measure simulation kernel duration separately
    const tKernelStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    for (let step = 0; step < simulationSteps; step++) {
      engine.step();
    }
    const kernelDurationMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - tKernelStart;
    const avgStepDurationMs = simulationSteps > 0 ? (kernelDurationMs / simulationSteps) : 0;

    // 3. Capture exact simulation engine counters
    const queueSize = engine.eventQueue ? (typeof engine.eventQueue.size === 'function' ? engine.eventQueue.size() : (engine.eventQueue.size ?? engine.eventQueue._heap?.length ?? 0)) : 0;
    const queueIns = engine.eventQueue ? engine.eventQueue.insertions : engine.scheduledEventCount;
    const queueRems = engine.eventQueue ? engine.eventQueue.removals : engine.deliveredEventCount;

    // 4. Verify mathematical conservation invariant: Scheduled = Delivered + Pending
    const invariantValid = (engine.scheduledEventCount === engine.deliveredEventCount + queueSize);

    // 5. Build spike summary
    const perNeuronSpikes = engine.neurons ? engine.neurons.map(n => n.spikeCount) : [];
    const spikeTimes = [];
    if (engine.neurons) {
      engine.neurons.forEach(n => {
        if (n.spikeTimes && n.spikeTimes.length > 0) {
          spikeTimes.push(...n.spikeTimes);
        }
      });
    }

    // Parity signature for verification across modes
    const paritySignature = `${engine.totalSpikeCount}_${engine.deliveredEventCount}_${spikeTimes.length}`;

    return {
      experimentId,
      trialId,
      repetitionIndex,
      seed,
      mode,
      neuronCount,
      connectionDensity,
      sparsity,
      firingThreshold,
      simulationSteps,
      adaptiveThreshold,
      adaptiveTemporal,

      // Computational metrics
      neuronIntegrations: engine.neuronIntegrations,
      lazyDecayEvaluations: engine.lazyDecayEvaluations,
      externalInputEvents: engine.externalInputEvents,
      spikeCount: engine.totalSpikeCount,
      scheduledEvents: engine.scheduledEventCount,
      deliveredEvents: engine.deliveredEventCount,
      pendingEvents: queueSize,
      queueInsertions: queueIns,
      queueRemovals: queueRems,
      queueOperations: queueIns + queueRems,

      // Performance metrics
      initDurationMs: Number(initDurationMs.toFixed(3)),
      kernelDurationMs: Number(kernelDurationMs.toFixed(3)),
      avgStepDurationMs: Number(avgStepDurationMs.toFixed(4)),

      // Scientific verification
      invariantValid,
      paritySignature,
      perNeuronSpikes,
      status: 'completed',
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 3. EXPERIMENT RUNNER CLASS
   * ══════════════════════════════════════════════════════════════════════════ */

  class ExperimentRunner {
    constructor(EngineConstructor = SimulationEngineClass) {
      this.EngineConstructor = EngineConstructor;
      this.isRunning = false;
      this.isCancelled = false;
      this.currentExperimentId = null;
      this.rawTrials = [];
      this.progressCallback = null;
    }

    /**
     * Cancel an active running experiment.
     */
    cancel() {
      if (this.isRunning) {
        this.isCancelled = true;
      }
    }

    /**
     * Run an experiment campaign asynchronously.
     * Yields control to the browser between trials so UI stays responsive.
     * 
     * @param {object} campaignConfig
     * @param {object} [callbacks]
     * @param {function} [callbacks.onProgress]
     * @param {function} [callbacks.onComplete]
     * @param {function} [callbacks.onError]
     * @returns {Promise<object>}
     */
    async runCampaign(campaignConfig, callbacks = {}) {
      if (this.isRunning) {
        throw new Error('An experiment campaign is already running.');
      }

      this.isRunning = true;
      this.isCancelled = false;
      this.rawTrials = [];
      this.progressCallback = callbacks.onProgress || null;

      const timestamp = Date.now();
      const experimentId = `EXP-NC-${timestamp}-${Math.floor(Math.random() * 900 + 100)}`;
      this.currentExperimentId = experimentId;

      const {
        campaignType = 'quick', // 'quick' | 'sparsity_sweep' | 'scale_sweep' | 'custom'
        neuronCount = 48,
        connectionDensity = 0.25,
        sparsity = 70,
        firingThreshold = 0.65,
        simulationSteps = 50,
        repetitions = 10,
        baseSeed = 42,
        adaptiveThreshold = false,
        adaptiveTemporal = false,
        modes = ['event', 'clock'],
        sweepValues = null, // for sweeps
      } = campaignConfig;

      // 1. Build trial execution plan
      const plan = [];

      if (campaignType === 'sparsity_sweep') {
        const sparsities = sweepValues || [50, 70, 80, 90, 95];
        for (const sp of sparsities) {
          for (let r = 0; r < repetitions; r++) {
            const seed = deriveTrialSeed(baseSeed + sp * 13, r);
            for (const mode of modes) {
              plan.push({
                experimentId,
                trialId: `${experimentId}-SP${sp}-R${r}-${mode.toUpperCase()}`,
                repetitionIndex: r,
                seed,
                mode,
                neuronCount,
                connectionDensity,
                sparsity: sp,
                firingThreshold,
                simulationSteps,
                adaptiveThreshold,
                adaptiveTemporal,
              });
            }
          }
        }
      } else if (campaignType === 'scale_sweep') {
        const sizes = sweepValues || [24, 48, 72, 96];
        for (const sz of sizes) {
          for (let r = 0; r < repetitions; r++) {
            const seed = deriveTrialSeed(baseSeed + sz * 17, r);
            for (const mode of modes) {
              plan.push({
                experimentId,
                trialId: `${experimentId}-SZ${sz}-R${r}-${mode.toUpperCase()}`,
                repetitionIndex: r,
                seed,
                mode,
                neuronCount: sz,
                connectionDensity,
                sparsity,
                firingThreshold,
                simulationSteps,
                adaptiveThreshold,
                adaptiveTemporal,
              });
            }
          }
        }
      } else {
        // Quick or Custom single-point campaign
        for (let r = 0; r < repetitions; r++) {
          const seed = deriveTrialSeed(baseSeed, r);
          for (const mode of modes) {
            plan.push({
              experimentId,
              trialId: `${experimentId}-R${r}-${mode.toUpperCase()}`,
              repetitionIndex: r,
              seed,
              mode,
              neuronCount,
              connectionDensity,
              sparsity,
              firingThreshold,
              simulationSteps,
              adaptiveThreshold,
              adaptiveTemporal,
            });
          }
        }
      }

      const totalTrials = plan.length;
      let completedTrials = 0;

      // 2. Execute trials with asynchronous chunking
      for (let i = 0; i < plan.length; i++) {
        if (this.isCancelled) {
          break;
        }

        const trialParams = plan[i];

        try {
          const trialRecord = executeTrial(trialParams, this.EngineConstructor);
          this.rawTrials.push(trialRecord);
          completedTrials++;
        } catch (err) {
          this.rawTrials.push({
            ...trialParams,
            status: 'failed',
            error: err.message,
          });
        }

        // Progress notification
        if (typeof this.progressCallback === 'function') {
          const pct = Math.round((completedTrials / totalTrials) * 100);
          const modeStr = trialParams.mode || 'event';
          this.progressCallback({
            completedTrials,
            trialIndex: completedTrials,
            totalTrials,
            currentRep: trialParams.repetitionIndex + 1,
            totalReps: repetitions,
            currentMode: modeStr,
            mode: modeStr,
            currentConfig: `N=${trialParams.neuronCount}, Sparsity=${trialParams.sparsity}%`,
            percent: pct,
            progressPct: pct,
            trialSeed: trialParams.seed,
            step: trialParams.simulationSteps,
            totalSteps: trialParams.simulationSteps,
            statusText: `Running trial ${completedTrials}/${totalTrials} (${modeStr === 'event' ? 'Event-Driven' : 'Time-Stepped'} SNN, Seed ${trialParams.seed})...`,
          });
        }

        // Yield control to browser thread to keep UI completely fluid
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      this.isRunning = false;
      const finalStatus = this.isCancelled ? 'cancelled' : 'completed';

      // 3. Compute statistical summaries across completed trials only
      const results = this.aggregateResults(this.rawTrials, campaignConfig, experimentId, finalStatus);

      if (callbacks.onComplete) {
        callbacks.onComplete(results);
      }

      return results;
    }

    /**
     * Compute comprehensive statistical summaries and paired comparisons.
     * @param {object[]} rawTrials
     * @param {object} campaignConfig
     * @param {string} experimentId
     * @param {string} status
     * @returns {object} Full results bundle
     */
    aggregateResults(rawTrials, campaignConfig, experimentId, status) {
      const completed = rawTrials.filter(t => t.status === 'completed');

      // 1. Group by configuration key: `${neuronCount}_${sparsity}`
      const configGroups = new Map();
      completed.forEach(t => {
        const key = `${t.neuronCount}_${t.sparsity}`;
        if (!configGroups.has(key)) {
          configGroups.set(key, {
            neuronCount: t.neuronCount,
            sparsity: t.sparsity,
            eventTrials: [],
            clockTrials: [],
          });
        }
        if (t.mode === 'event') {
          configGroups.get(key).eventTrials.push(t);
        } else {
          configGroups.get(key).clockTrials.push(t);
        }
      });

      const summaries = [];
      const pairedComparisons = [];
      let totalParityChecks = 0;
      let passedParityChecks = 0;

      // 2. Compute summaries per group
      configGroups.forEach(group => {
        const { neuronCount, sparsity, eventTrials, clockTrials } = group;

        const metricsList = [
          { key: 'neuronIntegrations', label: 'Neuron Integrations', unit: 'integrations' },
          { key: 'lazyDecayEvaluations', label: 'Lazy Decay Evaluations', unit: 'evaluations' },
          { key: 'deliveredEvents', label: 'Delivered Synaptic Events', unit: 'events' },
          { key: 'scheduledEvents', label: 'Scheduled Synaptic Events', unit: 'events' },
          { key: 'spikeCount', label: 'Total Spike Count', unit: 'spikes' },
          { key: 'queueOperations', label: 'Queue Operations (Push+Pop)', unit: 'ops' },
          { key: 'kernelDurationMs', label: 'Simulation Kernel Duration', unit: 'ms' },
        ];

        metricsList.forEach(({ key, label, unit }) => {
          if (eventTrials.length > 0) {
            const evVals = eventTrials.map(t => t[key]);
            const sEv = computeMetricStats(evVals, label, unit, 'event');
            sEv.neuronCount = neuronCount;
            sEv.sparsity = sparsity;
            summaries.push(sEv);
          }
          if (clockTrials.length > 0) {
            const clVals = clockTrials.map(t => t[key]);
            const sCl = computeMetricStats(clVals, label, unit, 'clock');
            sCl.neuronCount = neuronCount;
            sCl.sparsity = sparsity;
            summaries.push(sCl);
          }
        });

        // 3. Paired Differences (match by seed)
        const eventBySeed = new Map(eventTrials.map(t => [t.seed, t]));
        const pairedDiffs = {
          neuronIntegrations: [],
          deliveredEvents: [],
          spikeCount: [],
          kernelDurationMs: [],
          reductionPct: [],
        };

        clockTrials.forEach(clTrial => {
          const evTrial = eventBySeed.get(clTrial.seed);
          if (evTrial) {
            totalParityChecks++;
            // Check scientific parity: spike counts and delivered events must match on identical seeds
            const parityMatch = (clTrial.spikeCount === evTrial.spikeCount) &&
                                (clTrial.deliveredEvents === evTrial.deliveredEvents);
            if (parityMatch) passedParityChecks++;

            const intDiff = clTrial.neuronIntegrations - evTrial.neuronIntegrations;
            pairedDiffs.neuronIntegrations.push(intDiff);

            const synDiff = clTrial.deliveredEvents - evTrial.deliveredEvents;
            pairedDiffs.deliveredEvents.push(synDiff);

            const spkDiff = clTrial.spikeCount - evTrial.spikeCount;
            pairedDiffs.spikeCount.push(spkDiff);

            const durDiff = clTrial.kernelDurationMs - evTrial.kernelDurationMs;
            pairedDiffs.kernelDurationMs.push(durDiff);

            const pctRed = clTrial.neuronIntegrations > 0
              ? (intDiff / clTrial.neuronIntegrations) * 100
              : 0;
            pairedDiffs.reductionPct.push(pctRed);
          }
        });

        if (pairedDiffs.reductionPct.length > 0) {
          pairedComparisons.push({
            neuronCount,
            sparsity,
            nPaired: pairedDiffs.reductionPct.length,
            meanIntegrationsReductionPct: mean(pairedDiffs.reductionPct),
            sdIntegrationsReductionPct: sampleStdDev(pairedDiffs.reductionPct),
            meanIntegrationDiff: mean(pairedDiffs.neuronIntegrations),
            sdIntegrationDiff: sampleStdDev(pairedDiffs.neuronIntegrations),
            meanDeliveredDiff: mean(pairedDiffs.deliveredEvents),
            meanSpikeDiff: mean(pairedDiffs.spikeCount),
            meanDurationDiffMs: mean(pairedDiffs.kernelDurationMs),
            sdDurationDiffMs: sampleStdDev(pairedDiffs.kernelDurationMs),
          });
        }
      });

      const parityRate = totalParityChecks > 0 ? (passedParityChecks / totalParityChecks) : 1.0;

      return {
        experimentId,
        createdAt: new Date().toISOString(),
        status,
        campaignConfig,
        totalTrialsPlanned: rawTrials.length,
        completedTrialsCount: completed.length,
        cancelledTrialsCount: rawTrials.length - completed.length,
        parityVerification: {
          totalPairedChecked: totalParityChecks,
          passedCount: passedParityChecks,
          parityMatchRate: Number((parityRate * 100).toFixed(1)),
          allMatched: passedParityChecks === totalParityChecks,
        },
        summaries,
        pairedComparisons,
        rawTrials,
        simEngineVersion: '2.1.1-sparse',
        experimentRunnerVersion: '2.2.0',
      };
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 4. EXPORT UTILITIES (CSV & JSON)
   * ══════════════════════════════════════════════════════════════════════════ */

  function _escCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Export raw trial data to CSV format.
   * @param {object} experimentResult
   * @returns {string} CSV string
   */
  function generateRawCSV(experimentResult) {
    const trials = experimentResult.rawTrials || [];
    const headers = [
      'Experiment ID',
      'Trial ID',
      'Repetition',
      'Seed',
      'Execution Mode',
      'Neuron Count',
      'Connection Density',
      'Input Sparsity (%)',
      'Firing Threshold',
      'Simulation Steps',
      'Adaptive Threshold',
      'Adaptive Temporal',
      'Neuron Integrations',
      'Lazy Decay Evaluations',
      'External Input Events',
      'Spike Count',
      'Scheduled Synapses',
      'Delivered Synapses',
      'Pending Synapses',
      'Queue Insertions',
      'Queue Removals',
      'Queue Total Operations',
      'Init Duration (ms)',
      'Kernel Duration (ms)',
      'Avg Step Duration (ms)',
      'Invariant Conservation Valid',
      'Status',
    ];

    let csv = headers.join(',') + '\n';
    for (const t of trials) {
      const row = [
        _escCSV(t.experimentId),
        _escCSV(t.trialId),
        t.repetitionIndex !== undefined ? t.repetitionIndex + 1 : '',
        t.seed,
        t.mode === 'event' ? 'Event-Driven SNN' : 'Time-Stepped SNN',
        t.neuronCount,
        t.connectionDensity,
        t.sparsity,
        t.firingThreshold,
        t.simulationSteps,
        t.adaptiveThreshold ? 'TRUE' : 'FALSE',
        t.adaptiveTemporal ? 'TRUE' : 'FALSE',
        t.neuronIntegrations ?? '',
        t.lazyDecayEvaluations ?? '',
        t.externalInputEvents ?? '',
        t.spikeCount ?? '',
        t.scheduledEvents ?? '',
        t.deliveredEvents ?? '',
        t.pendingEvents ?? '',
        t.queueInsertions ?? '',
        t.queueRemovals ?? '',
        t.queueOperations ?? '',
        t.initDurationMs ?? '',
        t.kernelDurationMs ?? '',
        t.avgStepDurationMs ?? '',
        t.invariantValid ? 'TRUE' : 'FALSE',
        _escCSV(t.status),
      ];
      csv += row.join(',') + '\n';
    }
    return csv;
  }

  /**
   * Export statistical summary data to CSV format.
   * @param {object} experimentResult
   * @returns {string} CSV string
   */
  function generateSummaryCSV(experimentResult) {
    const summaries = experimentResult.summaries || [];
    const headers = [
      'Metric',
      'Execution Mode',
      'Neuron Count',
      'Input Sparsity (%)',
      'N (Completed Runs)',
      'Mean',
      'Sample SD (n-1)',
      'Median',
      'Min',
      'Max',
      'Unit',
      'Formatted (Mean ± SD)',
    ];

    let csv = headers.join(',') + '\n';
    for (const s of summaries) {
      const row = [
        _escCSV(s.metric),
        s.mode === 'event' ? 'Event-Driven SNN' : 'Time-Stepped SNN',
        s.neuronCount,
        s.sparsity,
        s.n,
        s.mean !== undefined ? s.mean.toFixed(2) : '',
        s.sd !== null && s.sd !== undefined ? s.sd.toFixed(2) : 'N/A',
        s.median !== undefined ? s.median.toFixed(2) : '',
        s.min !== undefined ? s.min.toFixed(2) : '',
        s.max !== undefined ? s.max.toFixed(2) : '',
        _escCSV(s.unit),
        _escCSV(s.formatted),
      ];
      csv += row.join(',') + '\n';
    }
    return csv;
  }

  /**
   * Export clean, portable JSON representation without Proxies.
   * @param {object} experimentResult
   * @returns {string} JSON string
   */
  function generateExperimentJSON(experimentResult) {
    // Sanitize any non-plain objects
    const cleanObject = JSON.parse(JSON.stringify(experimentResult, (key, value) => {
      if (typeof value === 'bigint') return value.toString();
      return value;
    }, 2));
    return JSON.stringify(cleanObject, null, 2);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 5. PUBLIC MODULE API
   * ══════════════════════════════════════════════════════════════════════════ */

  return {
    mean,
    sampleStdDev,
    median,
    min,
    max,
    deriveTrialSeed,
    computeMetricStats,
    executeTrial,
    ExperimentRunner,
    generateRawCSV,
    generateSummaryCSV,
    generateExperimentJSON,
  };
});
