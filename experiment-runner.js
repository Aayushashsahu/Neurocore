/**
 * NEUROCORE — Experimental Runner & Statistical Benchmarking Engine (v2.2.1)
 * 
 * Provides rigorous, reproducible, multi-trial empirical SNN simulation campaigns,
 * Student's t distribution 95% confidence intervals, sample statistics calculation
 * (Mean, Sample SD with n-1 denominator, Median, Min, Max), paired-seed differential
 * parity audit (topologies, stochastic input sequences, spike rasters, and step-by-step
 * membrane trajectories), balanced alternating execution order, warm-up isolation,
 * crossed factorial campaigns, and structured data exports (CSV & JSON).
 * 
 * @file experiment-runner.js
 * @version 2.2.2
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
   * 1. RIGOROUS STATISTICAL HELPER FUNCTIONS & CONFIDENCE INTERVALS
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
   * Calculate sample standard deviation with unbiased (n - 1) Bessel's correction denominator.
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
   * Handles both odd and even sample sizes.
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
   * Two-tailed 95% critical value t_(0.975, df) from Student's t distribution.
   * Uses exact statistical values for df=1..40, 50, 60, 70, 80, 90, 100, 120 and
   * high-precision Cornish-Fisher expansion for larger df.
   * 
   * @param {number} df Degrees of freedom (n - 1)
   * @returns {number|null} t-critical value, or null if df < 1
   */
  function tCritical95(df) {
    if (typeof df !== 'number' || isNaN(df) || df < 1) return null;
    const roundedDf = Math.round(df);

    const table = {
      1: 12.7062, 2: 4.3027, 3: 3.1824, 4: 2.7764, 5: 2.5706,
      6: 2.4469, 7: 2.3646, 8: 2.3060, 9: 2.2622, 10: 2.2281,
      11: 2.2010, 12: 2.1788, 13: 2.1604, 14: 2.1448, 15: 2.1314,
      16: 2.1199, 17: 2.1098, 18: 2.1009, 19: 2.0930, 20: 2.0860,
      21: 2.0796, 22: 2.0739, 23: 2.0687, 24: 2.0639, 25: 2.0595,
      26: 2.0555, 27: 2.0518, 28: 2.0484, 29: 2.0452, 30: 2.0423,
      31: 2.0395, 32: 2.0369, 33: 2.0345, 34: 2.0322, 35: 2.0301,
      36: 2.0281, 37: 2.0262, 38: 2.0244, 39: 2.0227, 40: 2.0211,
      50: 2.0086, 60: 2.0003, 70: 1.9944, 80: 1.9901, 90: 1.9867,
      100: 1.9840, 120: 1.9799,
    };

    if (table[roundedDf] !== undefined) {
      return table[roundedDf];
    }

    // High-accuracy Cornish-Fisher expansion for intermediate or large df:
    // t ≈ z + (z^3 + z)/(4*df) + (5*z^5 + 16*z^3 + 3*z)/(96*df^2)
    const z = 1.959963984540054; // standard normal 0.975 quantile
    const z3 = z * z * z;
    const z5 = z3 * z * z;
    const term1 = (z3 + z) / (4 * roundedDf);
    const term2 = (5 * z5 + 16 * z3 + 3 * z) / (96 * roundedDf * roundedDf);
    return Number((z + term1 + term2).toFixed(4));
  }

  /**
   * Calculate 95% confidence interval for a numeric sample using Student's t distribution.
   * Returns null if n < 2.
   * 
   * @param {number[]} arr
   * @returns {object|null}
   */
  function confidenceInterval95(arr) {
    if (!arr || arr.length < 2) return null;
    const n = arr.length;
    const m = mean(arr);
    const sd = sampleStdDev(arr);
    if (sd === null) return null;
    const df = n - 1;
    const tCrit = tCritical95(df);
    if (tCrit === null) return null;
    const sem = sd / Math.sqrt(n);
    const marginOfError = tCrit * sem;
    return {
      n,
      df,
      mean: m,
      sd,
      sem,
      tCritical: Number(tCrit.toFixed(4)),
      marginOfError: Number(marginOfError.toFixed(4)),
      lower: Number((m - marginOfError).toFixed(4)),
      upper: Number((m + marginOfError).toFixed(4)),
      formatted: `[${(m - marginOfError).toFixed(2)}, ${(m + marginOfError).toFixed(2)}]`,
    };
  }

  /**
   * Compute paired differences D_i = clock[i] - event[i] and comprehensive statistics.
   * Rejects mismatched array lengths to prevent silent truncation.
   * @param {number[]} clockVals
   * @param {number[]} eventVals
   * @returns {object}
   */
  function pairedDifferences(clockVals, eventVals) {
    if (!clockVals || !eventVals) {
      throw new Error('pairedDifferences requires both clockVals and eventVals arrays.');
    }
    if (clockVals.length !== eventVals.length) {
      throw new Error(`Paired array length mismatch: Clock has ${clockVals.length} items, Event has ${eventVals.length} items.`);
    }
    const n = clockVals.length;
    const diffs = [];
    for (let i = 0; i < n; i++) {
      diffs.push(clockVals[i] - eventVals[i]);
    }
    const m = mean(diffs);
    const sd = sampleStdDev(diffs);
    const ci = confidenceInterval95(diffs);
    return {
      n,
      values: diffs,
      mean: m,
      sd,
      sampleStdDev: sd,
      median: median(diffs),
      min: min(diffs),
      max: max(diffs),
      confidenceInterval95: ci,
      ciFormatted: ci ? ci.formatted : 'N/A',
    };
  }

  /**
   * Compute paired percentage reductions R_i = ((clock[i] - event[i]) / clock[i]) * 100%.
   * Handles zero denominators explicitly without distorting data.
   * Rejects mismatched array lengths to prevent silent truncation.
   * @param {number[]} clockVals
   * @param {number[]} eventVals
   * @returns {object}
   */
  function pairedPercentageReductions(clockVals, eventVals) {
    if (!clockVals || !eventVals) {
      throw new Error('pairedPercentageReductions requires both clockVals and eventVals arrays.');
    }
    if (clockVals.length !== eventVals.length) {
      throw new Error(`Paired array length mismatch: Clock has ${clockVals.length} items, Event has ${eventVals.length} items.`);
    }
    const n = clockVals.length;
    const reductions = [];
    let zeroDenominatorCount = 0;

    for (let i = 0; i < n; i++) {
      const c = clockVals[i];
      const e = eventVals[i];
      if (c === 0) {
        zeroDenominatorCount++;
        if (e === 0) {
          reductions.push(0); // identical zero activity
        }
        // If e > 0 with c = 0, mathematically undefined; excluded from average
      } else {
        reductions.push(((c - e) / c) * 100);
      }
    }

    const m = mean(reductions);
    const sd = sampleStdDev(reductions);
    const ci = confidenceInterval95(reductions);
    return {
      nTotal: n,
      validPairs: reductions.length,
      zeroDenominatorCount,
      values: reductions,
      mean: m,
      sd,
      sampleStdDev: sd,
      median: median(reductions),
      min: min(reductions),
      max: max(reductions),
      confidenceInterval95: ci,
      ciFormatted: ci ? ci.formatted : 'N/A',
    };
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
   * Compute comprehensive statistical summary for an array of metric values,
   * including 95% confidence intervals.
   * 
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
    const ci = confidenceInterval95(values);
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
      confidenceInterval95: ci,
      ciLower: ci ? ci.lower : null,
      ciUpper: ci ? ci.upper : null,
      ciMarginOfError: ci ? ci.marginOfError : null,
      ciFormatted: ci ? ci.formatted : 'N/A',
      formatted: sd !== null ? `${m.toFixed(1)} ± ${sd.toFixed(1)}` : `${m.toFixed(1)} (N=1)`,
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 2. COMPREHENSIVE DIFFERENTIAL PARITY VERIFICATION
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Complete 5-part differential parity verifier between Clock and Event simulation runs.
   * Compares:
   * 1. Network Topology (Neuron count, connection count, per-connection src/tgt/weight/delay)
   * 2. External Input Sequence (Stochastic event count, targets, stimulus consistency)
   * 3. Neuron-Level Spike Rasters (Exact per-neuron spike timestamps: Clock[i] === Event[i])
   * 4. Step-by-Step Membrane Trajectories (|V_clock(i,t) - V_event(i,t)| <= tolerance)
   * 5. Synaptic Event Accounting (Scheduled, delivered, queue conservation)
   * 
   * @param {object} clockEngine Time-stepped reference SimulationEngine instance
   * @param {object} eventEngine Event-driven SimulationEngine instance
   * @param {object} [options]
   * @param {number} [options.voltageTolerance=1e-7] Floating-point comparison tolerance
   * @returns {object} Detailed parity audit report
   */
  function verifyDifferentialParity(clockEngine, eventEngine, options = {}) {
    const tolerance = options.voltageTolerance ?? 1e-7;
    const diagnostics = [];
    const nNeurons = clockEngine.neurons ? clockEngine.neurons.length : (clockEngine.neuronCount ?? 0);
    const cSteps = clockEngine.currentStep ?? clockEngine.simulationSteps ?? 0;
    const eSteps = eventEngine.currentStep ?? eventEngine.simulationSteps ?? 0;

    // 0. Simulation Step Count Parity
    let stepCountPassed = true;
    if (cSteps !== eSteps) {
      stepCountPassed = false;
      diagnostics.push(`Step count mismatch: Clock executed ${cSteps} steps, Event executed ${eSteps} steps`);
    }

    // 1. Topology Parity
    const cTopo = typeof clockEngine.getTopology === 'function' ? clockEngine.getTopology() : { neuronCount: 0, connectionCount: 0, connections: [] };
    const eTopo = typeof eventEngine.getTopology === 'function' ? eventEngine.getTopology() : { neuronCount: 0, connectionCount: 0, connections: [] };
    let topologyMismatches = 0;
    if (cTopo.neuronCount !== eTopo.neuronCount) {
      topologyMismatches++;
      diagnostics.push(`Neuron count mismatch: Clock has ${cTopo.neuronCount}, Event has ${eTopo.neuronCount}`);
    }
    if (cTopo.connectionCount !== eTopo.connectionCount) {
      topologyMismatches++;
      diagnostics.push(`Connection count mismatch: Clock has ${cTopo.connectionCount}, Event has ${eTopo.connectionCount}`);
    }
    if (cTopo.connections.length !== eTopo.connections.length) {
      topologyMismatches++;
      diagnostics.push(`Connection list length mismatch: Clock has ${cTopo.connections.length}, Event has ${eTopo.connections.length}`);
    }
    const topoCount = Math.min(cTopo.connections.length, eTopo.connections.length);
    for (let i = 0; i < topoCount; i++) {
      const c = cTopo.connections[i];
      const e = eTopo.connections[i];
      if (c.sourceId !== e.sourceId || c.targetId !== e.targetId ||
          Math.abs(c.weight - e.weight) > 1e-9 || c.delay !== e.delay) {
        topologyMismatches++;
      }
    }
    const topologyPassed = topologyMismatches === 0;
    if (!topologyPassed && !diagnostics.some(d => d.startsWith('Topology mismatch'))) {
      diagnostics.push(`Topology mismatch: ${topologyMismatches} structural discrepancies detected`);
    }

    // 2. Input Parity (Event counts & sequence trace when available)
    let inputPassed = (clockEngine.externalInputEvents === eventEngine.externalInputEvents);
    let inputTraceVerified = false;
    if (!inputPassed) {
      diagnostics.push(`External input count mismatch: Clock ${clockEngine.externalInputEvents} vs Event ${eventEngine.externalInputEvents}`);
    }
    const cTrace = typeof clockEngine.getInputTrace === 'function' ? clockEngine.getInputTrace() : (clockEngine.inputTrace || null);
    const eTrace = typeof eventEngine.getInputTrace === 'function' ? eventEngine.getInputTrace() : (eventEngine.inputTrace || null);
    if (cTrace && eTrace && (cTrace.length > 0 || eTrace.length > 0)) {
      inputTraceVerified = true;
      if (cTrace.length !== eTrace.length) {
        inputPassed = false;
        diagnostics.push(`External input trace length mismatch: Clock has ${cTrace.length} events, Event has ${eTrace.length} events`);
      } else {
        for (let k = 0; k < cTrace.length; k++) {
          const ct = cTrace[k];
          const et = eTrace[k];
          if (ct.step !== et.step || ct.targetId !== et.targetId || Math.abs(ct.current - et.current) > 1e-9) {
            inputPassed = false;
            diagnostics.push(`External input sequence divergence at index ${k}: Clock(step=${ct.step}, target=${ct.targetId}, current=${ct.current.toFixed(4)}) vs Event(step=${et.step}, target=${et.targetId}, current=${et.current.toFixed(4)})`);
            break;
          }
        }
      }
    }

    // 3. Spike Raster Parity (per-neuron exact timestamps)
    let rasterMismatches = 0;
    let firstRasterDivergence = null;
    for (let i = 0; i < nNeurons; i++) {
      const cSpikes = clockEngine.spikeRaster?.get ? (clockEngine.spikeRaster.get(i) || []) : (clockEngine.spikeRaster?.[i] || []);
      const eSpikes = eventEngine.spikeRaster?.get ? (eventEngine.spikeRaster.get(i) || []) : (eventEngine.spikeRaster?.[i] || []);
      if (cSpikes.length !== eSpikes.length) {
        rasterMismatches++;
        if (!firstRasterDivergence) {
          firstRasterDivergence = { neuronId: i, clockSpikes: cSpikes.slice(), eventSpikes: eSpikes.slice(), reason: `Count mismatch: Clock ${cSpikes.length} vs Event ${eSpikes.length}` };
        }
      } else {
        for (let s = 0; s < cSpikes.length; s++) {
          if (cSpikes[s] !== eSpikes[s]) {
            rasterMismatches++;
            if (!firstRasterDivergence) {
              firstRasterDivergence = { neuronId: i, clockSpikes: cSpikes.slice(), eventSpikes: eSpikes.slice(), divergentStep: cSpikes[s], eventStep: eSpikes[s] };
            }
            break;
          }
        }
      }
    }
    const rasterPassed = rasterMismatches === 0;
    if (!rasterPassed) {
      diagnostics.push(`Spike raster mismatch across ${rasterMismatches} neurons. First divergence at neuron ${firstRasterDivergence ? firstRasterDivergence.neuronId : 'N/A'}`);
    }

    // 4. Step-by-Step Membrane Potential Trajectory Parity (Full trajectory without Math.min truncation)
    let trajectoryComparisons = 0;
    let trajectoryMismatches = 0;
    let maxVoltageDelta = 0;
    let firstTrajectoryDivergence = null;
    let trajectoryIntegrityPassed = true;

    if (!stepCountPassed) {
      trajectoryIntegrityPassed = false;
    }

    for (let i = 0; i < nNeurons; i++) {
      const cHist = typeof clockEngine.getNeuronHistory === 'function' ? clockEngine.getNeuronHistory(i) : (clockEngine.membraneHistories?.[i] || null);
      const eHist = typeof eventEngine.getNeuronHistory === 'function' ? eventEngine.getNeuronHistory(i) : (eventEngine.membraneHistories?.[i] || null);

      if (!cHist || !eHist || !Array.isArray(cHist) || !Array.isArray(eHist)) {
        trajectoryIntegrityPassed = false;
        trajectoryMismatches++;
        diagnostics.push(`Missing membrane potential history for neuron ${i}`);
        continue;
      }

      if (cHist.length !== cSteps || eHist.length !== eSteps || cHist.length !== eHist.length) {
        trajectoryIntegrityPassed = false;
        trajectoryMismatches++;
        diagnostics.push(`Truncated or mismatched history length for neuron ${i}: expected ${cSteps}, got Clock ${cHist.length}, Event ${eHist.length}`);
        continue;
      }

      for (let s = 0; s < cSteps; s++) {
        trajectoryComparisons++;
        const cv = cHist[s];
        const ev = eHist[s];
        const delta = Math.abs(cv - ev);
        if (delta > maxVoltageDelta) maxVoltageDelta = delta;
        if (delta > tolerance) {
          trajectoryMismatches++;
          if (!firstTrajectoryDivergence) {
            firstTrajectoryDivergence = {
              neuronId: i,
              step: s,
              clockVoltage: cv,
              eventVoltage: ev,
              delta,
            };
          }
        }
      }
    }
    const trajectoryPassed = trajectoryIntegrityPassed && trajectoryMismatches === 0;
    if (!trajectoryPassed && !diagnostics.some(d => d.startsWith('Membrane trajectory mismatch') || d.startsWith('Truncated') || d.startsWith('Missing membrane') || d.startsWith('Step count mismatch'))) {
      diagnostics.push(`Membrane trajectory mismatch: ${trajectoryMismatches} point(s) exceeded tolerance ${tolerance}. Max delta: ${maxVoltageDelta}`);
    }

    // 5. Synaptic Events Parity & Conservation Invariants
    const cScheduled = clockEngine.scheduledEventCount ?? clockEngine.scheduledEvents ?? 0;
    const eScheduled = eventEngine.scheduledEventCount ?? eventEngine.scheduledEvents ?? 0;
    const cDelivered = clockEngine.deliveredEventCount ?? clockEngine.deliveredEvents ?? 0;
    const eDelivered = eventEngine.deliveredEventCount ?? eventEngine.deliveredEvents ?? 0;
    const cPending = clockEngine.eventQueue ? (typeof clockEngine.eventQueue.size === 'function' ? clockEngine.eventQueue.size() : (clockEngine.eventQueue.size ?? 0)) : (clockEngine.pendingEvents ?? 0);
    const ePending = eventEngine.eventQueue ? (typeof eventEngine.eventQueue.size === 'function' ? eventEngine.eventQueue.size() : (eventEngine.eventQueue.size ?? 0)) : (eventEngine.pendingEvents ?? 0);

    const cConservation = (cScheduled === cDelivered + cPending);
    const eConservation = (eScheduled === eDelivered + ePending);
    const countsMatch = (cScheduled === eScheduled) && (cDelivered === eDelivered) && (cPending === ePending);
    const synapticPassed = countsMatch && cConservation && eConservation;

    if (!countsMatch) {
      diagnostics.push(`Synaptic event count mismatch: Clock(sched=${cScheduled}, deliv=${cDelivered}, pend=${cPending}) vs Event(sched=${eScheduled}, deliv=${eDelivered}, pend=${ePending})`);
    }
    if (!cConservation) {
      diagnostics.push(`Clock engine conservation invariant violated: Scheduled(${cScheduled}) != Delivered(${cDelivered}) + Pending(${cPending})`);
    }
    if (!eConservation) {
      diagnostics.push(`Event engine conservation invariant violated: Scheduled(${eScheduled}) != Delivered(${eDelivered}) + Pending(${ePending})`);
    }

    const allPassed = stepCountPassed && topologyPassed && inputPassed && rasterPassed && trajectoryPassed && synapticPassed;

    return {
      allPassed,
      isParity: allPassed,
      tolerance,
      voltageTolerance: tolerance,
      stepCountParity: stepCountPassed,
      topologyParity: topologyPassed,
      inputParity: inputPassed,
      inputTraceVerified,
      rasterParity: rasterPassed,
      trajectoryParity: trajectoryPassed,
      synapticEventsParity: synapticPassed,
      maxVoltageDiff: maxVoltageDelta,
      diagnostics,
      topology: {
        passed: topologyPassed,
        connectionCount: cTopo.connectionCount,
        mismatches: topologyMismatches,
      },
      input: {
        passed: inputPassed,
        traceVerified: inputTraceVerified,
        clockInputs: clockEngine.externalInputEvents,
        eventInputs: eventEngine.externalInputEvents,
      },
      spikeRaster: {
        passed: rasterPassed,
        mismatchedNeurons: rasterMismatches,
        clockTotalSpikes: clockEngine.totalSpikeCount ?? clockEngine.spikeCount,
        eventTotalSpikes: eventEngine.totalSpikeCount ?? eventEngine.spikeCount,
        firstDivergence: firstRasterDivergence,
      },
      membraneTrajectory: {
        passed: trajectoryPassed,
        totalComparisons: trajectoryComparisons,
        mismatches: trajectoryMismatches,
        maxVoltageDelta,
        firstDivergence: firstTrajectoryDivergence,
      },
      synapticEvents: {
        passed: synapticPassed,
        clockConservation: cConservation,
        eventConservation: eConservation,
        clockScheduled: cScheduled,
        eventScheduled: eScheduled,
        clockDelivered: cDelivered,
        eventDelivered: eDelivered,
        clockPending: cPending,
        eventPending: ePending,
      },
      summary: allPassed
        ? `FULL DIFFERENTIAL PARITY VERIFIED (${trajectoryComparisons} trajectory points, max delta: ${maxVoltageDelta.toExponential(2)})`
        : `DIFFERENTIAL MISMATCH: ${diagnostics.join('; ')}`,
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 3. SINGLE TRIAL RUNNER
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
      executionOrder = 1,
      pairOrder = 'clock-first',
      isWarmup = false,
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
      traceInputs: Boolean(trialParams.traceInputs),
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

    // Parity signature for quick matching
    const paritySignature = `${engine.totalSpikeCount}_${engine.deliveredEventCount}_${spikeTimes.length}`;

    // Extract compact membrane histories for differential parity audit
    const membraneHistories = {};
    if (typeof engine.getNeuronHistory === 'function' && engine.neurons) {
      for (let i = 0; i < engine.neurons.length; i++) {
        membraneHistories[i] = engine.getNeuronHistory(i);
      }
    }

    const spikeRasterCopy = {};
    if (engine.spikeRaster) {
      for (const [id, times] of engine.spikeRaster) {
        spikeRasterCopy[id] = times.slice();
      }
    }

    return {
      experimentId,
      trialId,
      repetitionIndex,
      seed,
      mode,
      executionOrder,
      pairOrder,
      isWarmup,
      neuronCount,
      connectionDensity,
      sparsity,
      firingThreshold,
      simulationSteps,
      adaptiveThreshold,
      adaptiveTemporal,

      // Precise operation counters
      clockEvaluations: engine.clockEvaluations ?? (mode === 'clock' ? (neuronCount * simulationSteps) : 0),
      neuronIntegrations: engine.neuronIntegrations,
      activeIntegrations: engine.activeIntegrations ?? (mode === 'event' ? (engine.neuronIntegrations ?? 0) : 0),
      lazyDecayCalls: engine.lazyDecayCalls ?? (engine.lazyDecayEvaluations ?? 0),
      lazyDecayEvaluations: engine.lazyDecayEvaluations,
      lazyExponentialEvaluations: engine.lazyExponentialEvaluations ?? (engine.lazyDecayEvaluations ?? 0),
      thresholdEvaluations: engine.thresholdEvaluations ?? engine.neuronIntegrations,
      refractoryChecks: engine.refractoryChecks ?? (mode === 'clock' ? (neuronCount * simulationSteps) : engine.neuronIntegrations),
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

      // Scientific verification snapshots
      invariantValid,
      paritySignature,
      perNeuronSpikes,
      spikeRaster: spikeRasterCopy,
      membraneHistories,
      inputTrace: (trialParams.traceInputs && typeof engine.getInputTrace === 'function') ? engine.getInputTrace() : null,
      status: 'completed',
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 4. EXPERIMENT RUNNER CLASS
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
     * Run an experiment campaign asynchronously with balanced execution order and warmup isolation.
     * Yields control to the browser between trials so UI stays completely fluid.
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
        campaignType = 'quick', // 'quick' | 'sparsity_sweep' | 'scale_sweep' | 'factorial' | 'custom'
        neuronCount = 48,
        connectionDensity = 0.25,
        sparsity = 70,
        firingThreshold = 0.65,
        simulationSteps = 50,
        repetitions = 10,
        baseSeed = 42,
        adaptiveThreshold = false,
        adaptiveTemporal = false,
        sweepValues = null,
        voltageTolerance = 1e-7,
      } = campaignConfig;

      // 1. Separate Unrecorded Warm-up Phase to avoid JIT compilation cold-start bias
      const tWarmupStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      let warmupExecuted = false;
      try {
        const warmupSeed = (baseSeed + 99991) >>> 0;
        executeTrial({
          experimentId: `${experimentId}-WARMUP`,
          trialId: `${experimentId}-WARMUP-CLOCK`,
          repetitionIndex: 0,
          seed: warmupSeed,
          mode: 'clock',
          neuronCount: Math.min(24, neuronCount),
          connectionDensity,
          sparsity,
          firingThreshold,
          simulationSteps: Math.min(25, simulationSteps),
          adaptiveThreshold,
          adaptiveTemporal,
          executionOrder: 1,
          pairOrder: 'clock-first',
          isWarmup: true,
        }, this.EngineConstructor);

        executeTrial({
          experimentId: `${experimentId}-WARMUP`,
          trialId: `${experimentId}-WARMUP-EVENT`,
          repetitionIndex: 0,
          seed: warmupSeed,
          mode: 'event',
          neuronCount: Math.min(24, neuronCount),
          connectionDensity,
          sparsity,
          firingThreshold,
          simulationSteps: Math.min(25, simulationSteps),
          adaptiveThreshold,
          adaptiveTemporal,
          executionOrder: 2,
          pairOrder: 'clock-first',
          isWarmup: true,
        }, this.EngineConstructor);
        warmupExecuted = true;
      } catch (wErr) {
        // Warmup non-fatal
      }
      const warmupDurationMs = Number((((typeof performance !== 'undefined') ? performance.now() : Date.now()) - tWarmupStart).toFixed(2));

      // 2. Build trial execution plan with balanced alternating execution order
      const plan = [];

      if (campaignType === 'sparsity_sweep') {
        const sparsities = sweepValues || [50, 70, 80, 90, 95];
        for (const sp of sparsities) {
          for (let r = 0; r < repetitions; r++) {
            const seed = deriveTrialSeed(baseSeed + sp * 13, r);
            const pairOrder = (r % 2 === 0) ? 'clock-first' : 'event-first';
            const repModes = (r % 2 === 0) ? ['clock', 'event'] : ['event', 'clock'];
            repModes.forEach((mode, mIdx) => {
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
                executionOrder: mIdx + 1,
                pairOrder,
                isWarmup: false,
              });
            });
          }
        }
      } else if (campaignType === 'scale_sweep') {
        const sizes = sweepValues || [24, 48, 72, 96];
        for (const sz of sizes) {
          for (let r = 0; r < repetitions; r++) {
            const seed = deriveTrialSeed(baseSeed + sz * 17, r);
            const pairOrder = (r % 2 === 0) ? 'clock-first' : 'event-first';
            const repModes = (r % 2 === 0) ? ['clock', 'event'] : ['event', 'clock'];
            repModes.forEach((mode, mIdx) => {
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
                executionOrder: mIdx + 1,
                pairOrder,
                isWarmup: false,
              });
            });
          }
        }
      } else if (campaignType === 'factorial' || campaignType === 'full_factorial') {
        // Crossed Factorial Campaign: 4 network sizes x 4 sparsities x repetitions x 2 modes
        const sizes = campaignConfig.factorialNeuronCounts || [24, 48, 72, 96];
        const sparsities = campaignConfig.factorialSparsities || [50, 70, 90, 95];
        for (const sz of sizes) {
          for (const sp of sparsities) {
            for (let r = 0; r < repetitions; r++) {
              const seed = deriveTrialSeed(baseSeed + sz * 31 + sp * 13, r);
              const pairOrder = (r % 2 === 0) ? 'clock-first' : 'event-first';
              const repModes = (r % 2 === 0) ? ['clock', 'event'] : ['event', 'clock'];
              repModes.forEach((mode, mIdx) => {
                plan.push({
                  experimentId,
                  trialId: `${experimentId}-SZ${sz}-SP${sp}-R${r}-${mode.toUpperCase()}`,
                  repetitionIndex: r,
                  seed,
                  mode,
                  neuronCount: sz,
                  connectionDensity,
                  sparsity: sp,
                  firingThreshold,
                  simulationSteps,
                  adaptiveThreshold,
                  adaptiveTemporal,
                  executionOrder: mIdx + 1,
                  pairOrder,
                  isWarmup: false,
                });
              });
            }
          }
        }
      } else {
        // Quick or Custom single-point campaign with alternating execution order
        for (let r = 0; r < repetitions; r++) {
          const seed = deriveTrialSeed(baseSeed, r);
          const pairOrder = (r % 2 === 0) ? 'clock-first' : 'event-first';
          const repModes = (r % 2 === 0) ? ['clock', 'event'] : ['event', 'clock'];
          repModes.forEach((mode, mIdx) => {
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
              executionOrder: mIdx + 1,
              pairOrder,
              isWarmup: false,
            });
          });
        }
      }

      const totalTrialsPlanned = plan.length;
      let attemptedTrialsCount = 0;
      let completedTrialsCount = 0;
      let failedTrialsCount = 0;

      // 3. Execute trials with asynchronous chunking
      for (let i = 0; i < plan.length; i++) {
        if (this.isCancelled) {
          break;
        }

        attemptedTrialsCount++;
        const trialParams = plan[i];

        try {
          const trialRecord = executeTrial(trialParams, this.EngineConstructor);
          this.rawTrials.push(trialRecord);
          completedTrialsCount++;
        } catch (err) {
          failedTrialsCount++;
          this.rawTrials.push({
            ...trialParams,
            status: 'failed',
            error: err.message,
          });
        }

        // Progress notification
        if (typeof this.progressCallback === 'function') {
          const pct = Math.round((attemptedTrialsCount / totalTrialsPlanned) * 100);
          const modeStr = trialParams.mode || 'event';
          this.progressCallback({
            completedTrials: completedTrialsCount,
            attemptedTrials: attemptedTrialsCount,
            trialIndex: attemptedTrialsCount,
            totalTrials: totalTrialsPlanned,
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
            statusText: `Running trial ${attemptedTrialsCount}/${totalTrialsPlanned} (${modeStr === 'event' ? 'Event-Driven' : 'Time-Stepped'} SNN, Seed ${trialParams.seed}, Order: ${trialParams.pairOrder})...`,
          });
        }

        // Yield control to browser thread to keep UI completely fluid
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const notStartedTrialsCount = totalTrialsPlanned - attemptedTrialsCount;
      const cancelledTrialsCount = this.isCancelled ? notStartedTrialsCount : 0;
      this.isRunning = false;
      const finalStatus = this.isCancelled
        ? 'cancelled'
        : (failedTrialsCount > 0 ? (completedTrialsCount > 0 ? 'partial_failure' : 'failed') : 'completed');

      // 4. Compute statistical summaries and differential parity analysis across completed trials
      const results = this.aggregateResults(this.rawTrials, campaignConfig, experimentId, finalStatus, {
        warmup: {
          executed: warmupExecuted,
          trialsCount: warmupExecuted ? 2 : 0,
          durationMs: warmupDurationMs,
        },
        voltageTolerance,
        totalTrialsPlanned,
        attemptedTrialsCount,
        completedTrialsCount,
        failedTrialsCount,
        notStartedTrialsCount,
        cancelledTrialsCount,
      });

      if (callbacks.onComplete) {
        callbacks.onComplete(results);
      }

      return results;
    }

    /**
     * Compute comprehensive statistical summaries, paired difference comparisons with Student's t
     * confidence intervals, and full differential parity verification.
     * 
     * @param {object[]} rawTrials
     * @param {object} campaignConfig
     * @param {string} experimentId
     * @param {string} status
     * @param {object} [meta]
     * @returns {object} Full results bundle
     */
    aggregateResults(rawTrials, campaignConfig, experimentId, status, meta = {}) {
      const completed = rawTrials.filter(t => t.status === 'completed');
      const tolerance = meta.voltageTolerance ?? 1e-7;

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
      let maxObservedVoltageDelta = 0;
      const differentialAudits = [];

      // 2. Compute summaries per group
      configGroups.forEach(group => {
        const { neuronCount, sparsity, eventTrials, clockTrials } = group;

        const metricsList = [
          { key: 'neuronIntegrations', label: 'Neuron Integrations', unit: 'integrations' },
          { key: 'clockEvaluations', label: 'Clock Neuron Evaluations', unit: 'evaluations', modeFilter: 'clock' },
          { key: 'lazyDecayEvaluations', label: 'Lazy Decay Evaluations', unit: 'evaluations' },
          { key: 'thresholdEvaluations', label: 'Threshold Evaluations', unit: 'evaluations' },
          { key: 'refractoryChecks', label: 'Refractory Checks', unit: 'checks' },
          { key: 'deliveredEvents', label: 'Delivered Synaptic Events', unit: 'events' },
          { key: 'scheduledEvents', label: 'Scheduled Synaptic Events', unit: 'events' },
          { key: 'spikeCount', label: 'Total Spike Count', unit: 'spikes' },
          { key: 'queueOperations', label: 'Queue Operations (Push+Pop)', unit: 'ops' },
          { key: 'kernelDurationMs', label: 'Simulation Kernel Duration', unit: 'ms' },
          { key: 'initDurationMs', label: 'Engine Init Duration', unit: 'ms' },
        ];

        metricsList.forEach(({ key, label, unit, modeFilter }) => {
          if (eventTrials.length > 0 && modeFilter !== 'clock') {
            const evVals = eventTrials.map(t => t[key] ?? 0);
            const sEv = computeMetricStats(evVals, label, unit, 'event');
            sEv.neuronCount = neuronCount;
            sEv.sparsity = sparsity;
            summaries.push(sEv);
          }
          if (clockTrials.length > 0) {
            const clVals = clockTrials.map(t => t[key] ?? 0);
            const sCl = computeMetricStats(clVals, label, unit, 'clock');
            sCl.neuronCount = neuronCount;
            sCl.sparsity = sparsity;
            summaries.push(sCl);
          }
        });

        // 3. Paired Differences (match strictly by deterministic seed)
        const eventBySeed = new Map(eventTrials.map(t => [t.seed, t]));
        const pairedClockTrials = [];
        const pairedEventTrials = [];

        clockTrials.forEach(clTrial => {
          const evTrial = eventBySeed.get(clTrial.seed);
          if (evTrial) {
            pairedClockTrials.push(clTrial);
            pairedEventTrials.push(evTrial);

            totalParityChecks++;

            // Step-by-step differential parity check
            let rasterMatch = (clTrial.spikeCount === evTrial.spikeCount);
            let trajectoryMatch = true;
            let pairMaxDelta = 0;

            if (clTrial.spikeRaster && evTrial.spikeRaster) {
              for (let nid = 0; nid < neuronCount; nid++) {
                const cr = clTrial.spikeRaster[nid] || [];
                const er = evTrial.spikeRaster[nid] || [];
                if (cr.length !== er.length) {
                  rasterMatch = false;
                  break;
                }
                for (let s = 0; s < cr.length; s++) {
                  if (cr[s] !== er[s]) {
                    rasterMatch = false;
                    break;
                  }
                }
                if (!rasterMatch) break;
              }
            }

            if (clTrial.simulationSteps !== evTrial.simulationSteps) {
              trajectoryMatch = false;
            } else if (clTrial.membraneHistories && evTrial.membraneHistories) {
              const expectedSteps = clTrial.simulationSteps;
              for (let nid = 0; nid < neuronCount; nid++) {
                const ch = clTrial.membraneHistories[nid];
                const eh = evTrial.membraneHistories[nid];
                if (!ch || !eh || ch.length !== expectedSteps || eh.length !== expectedSteps) {
                  trajectoryMatch = false;
                  break;
                }
                for (let s = 0; s < expectedSteps; s++) {
                  const delta = Math.abs(ch[s] - eh[s]);
                  if (delta > pairMaxDelta) pairMaxDelta = delta;
                  if (delta > tolerance) {
                    trajectoryMatch = false;
                  }
                }
              }
            } else {
              trajectoryMatch = false;
            }

            if (pairMaxDelta > maxObservedVoltageDelta) {
              maxObservedVoltageDelta = pairMaxDelta;
            }

            const clInvariant = clTrial.invariantValid ?? (clTrial.scheduledEvents === clTrial.deliveredEvents + (clTrial.pendingEvents ?? 0));
            const evInvariant = evTrial.invariantValid ?? (evTrial.scheduledEvents === evTrial.deliveredEvents + (evTrial.pendingEvents ?? 0));
            const eventsMatch = (clTrial.deliveredEvents === evTrial.deliveredEvents) &&
                                (clTrial.scheduledEvents === evTrial.scheduledEvents) &&
                                clInvariant && evInvariant;

            const parityMatch = rasterMatch && trajectoryMatch && eventsMatch;
            if (parityMatch) passedParityChecks++;

            differentialAudits.push({
              seed: clTrial.seed,
              neuronCount,
              sparsity,
              pairOrder: clTrial.pairOrder,
              parityMatch,
              rasterMatch,
              trajectoryMatch,
              eventsMatch,
              pairMaxDelta,
            });
          }
        });

        if (pairedClockTrials.length > 0) {
          const clIntegrations = pairedClockTrials.map(t => t.neuronIntegrations);
          const evIntegrations = pairedEventTrials.map(t => t.neuronIntegrations);
          const clDelivered = pairedClockTrials.map(t => t.deliveredEvents);
          const evDelivered = pairedEventTrials.map(t => t.deliveredEvents);
          const clSpikes = pairedClockTrials.map(t => t.spikeCount);
          const evSpikes = pairedEventTrials.map(t => t.spikeCount);
          const clDuration = pairedClockTrials.map(t => t.kernelDurationMs);
          const evDuration = pairedEventTrials.map(t => t.kernelDurationMs);

          const diffIntegrations = pairedDifferences(clIntegrations, evIntegrations);
          const redIntegrations = pairedPercentageReductions(clIntegrations, evIntegrations);
          const diffDelivered = pairedDifferences(clDelivered, evDelivered);
          const diffSpikes = pairedDifferences(clSpikes, evSpikes);
          const diffDuration = pairedDifferences(clDuration, evDuration);

          pairedComparisons.push({
            neuronCount,
            sparsity,
            nPaired: pairedClockTrials.length,
            meanIntegrationsReductionPct: redIntegrations.mean,
            sdIntegrationsReductionPct: redIntegrations.sd,
            ciIntegrationsReductionPct: redIntegrations.confidenceInterval95,
            meanIntegrationDiff: diffIntegrations.mean,
            sdIntegrationDiff: diffIntegrations.sd,
            ciIntegrationDiff: diffIntegrations.confidenceInterval95,
            meanDeliveredDiff: diffDelivered.mean,
            meanSpikeDiff: diffSpikes.mean,
            meanDurationDiffMs: diffDuration.mean,
            sdDurationDiffMs: diffDuration.sd,
            ciDurationDiffMs: diffDuration.confidenceInterval95,
          });
        }
      });

      const parityRate = totalParityChecks > 0 ? (passedParityChecks / totalParityChecks) : null;
      const allMatched = totalParityChecks > 0 && passedParityChecks === totalParityChecks;

      return {
        experimentId,
        createdAt: new Date().toISOString(),
        status,
        algorithmVersion: 'v2.2.2-validated',
        simEngineVersion: '2.2.2-validated',
        experimentRunnerVersion: '2.2.2',
        campaignConfig,
        warmup: meta.warmup || { executed: false, trialsCount: 0, durationMs: 0 },
        warmupExecuted: meta.warmup ? meta.warmup.executed : false,
        warmupDurationMs: meta.warmup ? meta.warmup.durationMs : 0,
        totalTrialsPlanned: meta.totalTrialsPlanned ?? rawTrials.length,
        attemptedTrialsCount: meta.attemptedTrialsCount ?? rawTrials.length,
        completedTrialsCount: completed.length,
        failedTrialsCount: meta.failedTrialsCount ?? rawTrials.filter(t => t.status === 'failed').length,
        notStartedTrialsCount: meta.notStartedTrialsCount ?? 0,
        cancelledTrialsCount: meta.cancelledTrialsCount ?? 0,
        parityVerification: {
          totalPairedChecked: totalParityChecks,
          passedCount: passedParityChecks,
          parityMatchRate: parityRate !== null ? Number((parityRate * 100).toFixed(1)) : null,
          allMatched,
          statusText: totalParityChecks === 0 ? 'N/A (No paired comparisons)' : (allMatched ? 'PARITY VERIFIED' : 'PARITY FAILED'),
          maxObservedVoltageDelta,
          tolerance,
          voltageTolerance: tolerance,
          differentialAudits,
        },
        summaries,
        pairedComparisons,
        rawTrials,
      };
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 5. STRUCTURED REPRODUCIBLE DATA EXPORTERS (CSV & JSON)
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
      'Repetition Index',
      'Seed',
      'Execution Mode',
      'Execution Order In Pair',
      'Pair Mode Order',
      'Is Warmup Run',
      'Neuron Count',
      'Synaptic Density',
      'Input Sparsity (%)',
      'Firing Threshold',
      'Simulation Steps',
      'Adaptive Threshold',
      'Adaptive Temporal',
      'Clock Neuron Evaluations',
      'Neuron Integrations',
      'Active Integrations',
      'Lazy Decay Calls',
      'Lazy Decay Evaluations',
      'Lazy Exponential Evaluations',
      'Threshold Evaluations',
      'Refractory Checks',
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
        t.executionOrder ?? 1,
        _escCSV(t.pairOrder ?? 'clock-first'),
        t.isWarmup ? 'TRUE' : 'FALSE',
        t.neuronCount,
        t.connectionDensity,
        t.sparsity,
        t.firingThreshold,
        t.simulationSteps,
        t.adaptiveThreshold ? 'TRUE' : 'FALSE',
        t.adaptiveTemporal ? 'TRUE' : 'FALSE',
        t.clockEvaluations ?? '',
        t.neuronIntegrations ?? '',
        t.activeIntegrations ?? '',
        t.lazyDecayCalls ?? '',
        t.lazyDecayEvaluations ?? '',
        t.lazyExponentialEvaluations ?? '',
        t.thresholdEvaluations ?? '',
        t.refractoryChecks ?? '',
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
   * Export statistical summary data to CSV format with 95% Confidence Intervals.
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
      '95% CI Lower',
      '95% CI Upper',
      'Margin of Error',
      'Median',
      'Min',
      'Max',
      'Unit',
      'Formatted (Mean ± SD)',
    ];

    let csv = headers.join(',') + '\n';
    for (const s of summaries) {
      const ci = s.confidenceInterval95;
      const row = [
        _escCSV(s.metric),
        s.mode === 'event' ? 'Event-Driven SNN' : 'Time-Stepped SNN',
        s.neuronCount,
        s.sparsity,
        s.n,
        s.mean !== undefined ? s.mean.toFixed(2) : '',
        s.sd !== null && s.sd !== undefined ? s.sd.toFixed(2) : 'N/A',
        ci ? ci.lower.toFixed(2) : 'N/A',
        ci ? ci.upper.toFixed(2) : 'N/A',
        ci ? ci.marginOfError.toFixed(2) : 'N/A',
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
   * Export clean, portable JSON representation without Proxies or non-serializable objects.
   * @param {object} experimentResult
   * @returns {string} JSON string
   */
  function generateExperimentJSON(experimentResult) {
    const cleanObject = JSON.parse(JSON.stringify(experimentResult, (key, value) => {
      if (typeof value === 'bigint') return value.toString();
      return value;
    }, 2));
    return JSON.stringify(cleanObject, null, 2);
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * 6. PUBLIC MODULE API
   * ══════════════════════════════════════════════════════════════════════════ */

  return {
    mean,
    sampleStdDev,
    median,
    min,
    max,
    tCritical95,
    confidenceInterval95,
    pairedDifferences,
    pairedPercentageReductions,
    verifyDifferentialParity,
    deriveTrialSeed,
    computeMetricStats,
    executeTrial,
    ExperimentRunner,
    generateRawCSV,
    generateSummaryCSV,
    generateExperimentJSON,
  };
});
