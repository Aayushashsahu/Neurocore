/**
 * NEUROCORE v2.2.2 — Comprehensive SNN Simulation Engine Automated Test Suite
 *
 * Verifies:
 * - Suite A: LIF Neuron Model Dynamics & Invariants (leakage, thresholds, refractory, ceilings)
 * - Suite B: Sparse Event-Driven Scheduler, Geometric Skip-Sampler & Multi-Leak Lazy Decay
 * - Suite C: Execution Mode Comparison (Spike parity, raster match, operation counter audit)
 * - Suite D: Conservation Invariant: Scheduled = Delivered + Pending
 * - Suite E: Deterministic Reproducibility with Seeded PRNG
 * - Suite F: Adaptive Policies Validation (Threshold adaptation bounds, temporal binning)
 * - Suite G: v2.2.2 Scientific Integrity Invariants (Counters, input tracing, default parameters)
 */

const { SimulationEngine, LIFNeuron, SynapticConnection, EventQueue, SeededPRNG } = require('./simulation-engine.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed++;
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passed++;
    console.log(`✅ PASS: ${message}`);
  }
}

function assertClose(a, b, epsilon = 1e-6, message = '') {
  const diff = Math.abs(a - b);
  assert(diff <= epsilon, `${message} (expected ${b}, got ${a}, diff ${diff})`);
}

console.log('===============================================================');
console.log('  NEUROCORE v2.2.2 AUTOMATED SIMULATION ENGINE TEST SUITE');
console.log('===============================================================\n');

// ════════════════════════════════════════════════════════════════
// SUITE A: LIF NEURON MODEL CORRECTNESS
// ════════════════════════════════════════════════════════════════
console.log('--- SUITE A: LIF Neuron Model Correctness ---');

// A1: Subthreshold integration & exponential leak
{
  const n = new LIFNeuron(0, { threshold: 0.65, leakFactor: 0.8, resetVoltage: 0.0 });
  n.update(0.3, 0); // V = 0.3
  assertClose(n.membranePotential, 0.3, 1e-12, 'A1.1: Direct input integration without prior leak');

  n.update(0.0, 1); // V = 0.3 * 0.8 = 0.24
  assertClose(n.membranePotential, 0.24, 1e-12, 'A1.2: Exponential leak after 1 idle step');

  n.update(0.0, 2); // V = 0.24 * 0.8 = 0.192
  assertClose(n.membranePotential, 0.192, 1e-12, 'A1.3: Exponential leak after 2 idle steps');
}

// A2: Threshold crossing, spike generation, and reset
{
  const n = new LIFNeuron(0, { threshold: 0.65, resetVoltage: 0.0, refractoryPeriod: 2 });
  const spiked1 = n.update(0.4, 0); // V = 0.4
  assert(!spiked1, 'A2.1: Subthreshold input does not spike');
  assert(n.membranePotential === 0.4, 'A2.2: Potential equals 0.4');

  const spiked2 = n.update(0.35, 1); // V = 0.4 * 0.78 + 0.35 = 0.312 + 0.35 = 0.662 >= 0.65!
  assert(spiked2, 'A2.3: Threshold crossing triggers spike');
  assert(n.spikeCount === 1, 'A2.4: Cumulative spike count incremented to 1');
  assert(n.spikeTimes.includes(1), 'A2.5: Spike recorded at step 1');
  assert(n.membranePotential === 0.0, 'A2.6: Membrane potential immediately reset to resetVoltage 0.0');
}

// A3: Refractory period suppression
{
  const n = new LIFNeuron(0, { threshold: 0.65, resetVoltage: 0.0, refractoryPeriod: 2 });
  n.update(0.7, 0); // Fires at step 0! Refractory for steps 1 and 2.
  assert(n.spikeCount === 1, 'A3.1: Spiked at step 0');

  // Step 1: in refractory
  const spikedStep1 = n.update(0.8, 1); // Large input should be ignored!
  assert(!spikedStep1, 'A3.2: Input suppressed during refractory step 1');
  assert(n.membranePotential === 0.0, 'A3.3: Potential clamped at resetVoltage during refractory step 1');

  // Step 2: in refractory
  const spikedStep2 = n.update(0.9, 2); // Still in refractory!
  assert(!spikedStep2, 'A3.4: Input suppressed during refractory step 2');
  assert(n.membranePotential === 0.0, 'A3.5: Potential clamped at resetVoltage during refractory step 2');

  // Step 3: exited refractory!
  const spikedStep3 = n.update(0.7, 3); // Should fire!
  assert(spikedStep3, 'A3.6: Neuron fires again after refractory period expires');
  assert(n.spikeCount === 2, 'A3.7: Cumulative spike count is now 2');
}

// A4: Upper bound ceiling clamp
{
  const n = new LIFNeuron(0, { threshold: 2.0 }); // High threshold so it won't fire
  n.update(2.5, 0);
  assert(n.membranePotential === 1.2, 'A4: Potential clamped to ceiling of 1.2');
}

// ════════════════════════════════════════════════════════════════
// SUITE B: SPARSE EVENT-DRIVEN SCHEDULER & GEOMETRIC SAMPLER
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE B: Sparse Event-Driven Scheduler & Geometric Sampler ---');

// B1: 100% Input Sparsity (No external input)
{
  const engine = new SimulationEngine({ neuronCount: 24, inputSparsity: 1.0, executionMode: 'event', seed: 42 });
  engine.init({ neuronCount: 24, inputSparsity: 1.0, executionMode: 'event', seed: 42 });
  engine.step();
  assert(engine.externalInputEvents === 0, 'B1.1: 100% sparsity generates 0 external events');
  assert(engine.neuronIntegrations === 0, 'B1.2: Silent network performs 0 neuron integrations in event-driven mode');
}

// B2: 0% Input Sparsity (All neurons receive input)
{
  const engine = new SimulationEngine({ neuronCount: 24, inputSparsity: 0.0, executionMode: 'event', seed: 42 });
  engine.init({ neuronCount: 24, inputSparsity: 0.0, executionMode: 'event', seed: 42 });
  engine.step();
  assert(engine.externalInputEvents === 24, 'B2.1: 0% sparsity generates inputs for all 24 neurons');
  assert(engine.neuronIntegrations === 24, 'B2.2: Evaluates all 24 active neurons');
}

// B3: Mathematical Equivalence of Lazy Decay vs Step-by-Step Decay across 5 leak factors
{
  const leakFactors = [0.50, 0.70, 0.85, 0.95, 0.99];
  let leakTestsPassed = 0;
  for (const leak of leakFactors) {
    const n = new LIFNeuron(0, { leakFactor: leak, resetVoltage: 0.0 });
    n.integrateAndFire(0.5, 0); // V = 0.5 at step 0

    // 10 steps of idle decay
    const decayedV = n.lazyDecay(10);
    const expectedV = 0.5 * Math.pow(leak, 10);
    assertClose(decayedV, expectedV, 1e-12, `B3: Lazy decay equivalence at leak factor ${leak}`);
    leakTestsPassed++;
  }
  assert(leakTestsPassed === 5, 'B3.1: Verified mathematical lazy decay across all 5 standard leak factors (0.50, 0.70, 0.85, 0.95, 0.99)');
}

// B4: Lazy Decay with Intervening Refractory Period
{
  const n = new LIFNeuron(0, { leakFactor: 0.78, resetVoltage: 0.0, refractoryPeriod: 2 });
  n.integrateAndFire(0.8, 5); // Fires at step 5! Refractory until step 7.
  assert(n.spikeTimes.includes(5), 'B4.1: Spiked at step 5');
  assert(n.refractoryUntil === 7, 'B4.2: Refractory until step 7');

  // Query during refractory: step 6
  const vDuringRef = n.lazyDecay(6);
  assert(vDuringRef === 0.0, 'B4.3: Potential is 0.0 during refractory at step 6');

  // Query after refractory: step 9 (exited at 7, 2 steps of decay from resetVoltage 0.0)
  const vAfterRef = n.lazyDecay(9);
  assert(vAfterRef === 0.0, 'B4.4: Potential decayed from resetVoltage 0.0 remains 0.0 at step 9');
}

// ════════════════════════════════════════════════════════════════
// SUITE C: EXECUTION-MODE COMPARISON & OPERATION COUNTER AUDIT
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE C: Execution-Mode Comparison (Event-Driven vs Time-Stepped) ---');

{
  const seed = 98765;
  const steps = 30;

  // Run 1: Time-Stepped SNN
  const clockEngine = new SimulationEngine({ neuronCount: 36, inputSparsity: 0.4, firingThreshold: 0.45, executionMode: 'clock', seed });
  clockEngine.init({ neuronCount: 36, inputSparsity: 0.4, firingThreshold: 0.45, executionMode: 'clock', seed });
  for (let s = 0; s < steps; s++) clockEngine.step();
  const clockState = clockEngine.getState();

  // Run 2: Event-Driven SNN with identical seed & config
  const eventEngine = new SimulationEngine({ neuronCount: 36, inputSparsity: 0.4, firingThreshold: 0.45, executionMode: 'event', seed });
  eventEngine.init({ neuronCount: 36, inputSparsity: 0.4, firingThreshold: 0.45, executionMode: 'event', seed });
  for (let s = 0; s < steps; s++) eventEngine.step();
  const eventState = eventEngine.getState();

  // Compare spike counts
  assert(clockState.spikeCount === eventState.spikeCount, `C1: Spike counts match (Clock: ${clockState.spikeCount}, Event: ${eventState.spikeCount})`);
  assert(clockState.deliveredEvents === eventState.deliveredEvents, `C2: Delivered synaptic events match (Clock: ${clockState.deliveredEvents}, Event: ${eventState.deliveredEvents})`);
  assert(clockState.scheduledEvents === eventState.scheduledEvents, `C3: Scheduled synaptic events match (Clock: ${clockState.scheduledEvents}, Event: ${eventState.scheduledEvents})`);

  // Compare spike raster across all neurons
  let rasterMatch = true;
  for (let i = 0; i < 36; i++) {
    const cRaster = clockState.spikeRaster[i] || [];
    const eRaster = eventState.spikeRaster[i] || [];
    if (JSON.stringify(cRaster) !== JSON.stringify(eRaster)) {
      rasterMatch = false;
      break;
    }
  }
  assert(rasterMatch, 'C4: Spike raster is 100% identical for all neurons across all steps');

  // Verify genuine computational savings: event mode must perform significantly fewer neuron integrations!
  console.log(`    Time-stepped integrations: ${clockState.neuronIntegrations}`);
  console.log(`    Event-driven integrations: ${eventState.neuronIntegrations}`);
  assert(eventState.neuronIntegrations < clockState.neuronIntegrations, 'C5: Event-driven execution achieves genuine reduction in neuron integrations');

  // Verify operation counter integrity: clock mode must NOT count lazy decay evaluations!
  assert(clockState.lazyDecayEvaluations === 0, 'C6.1: Clock mode does not classify ordinary updates as lazy decay (lazyDecayEvaluations === 0)');
  assert(eventState.lazyDecayEvaluations > 0, `C6.2: Event mode performs actual lazy decay evaluations (${eventState.lazyDecayEvaluations})`);
  assert(clockState.clockEvaluations === 36 * 30, `C6.3: Clock evaluations equals N x steps (${clockState.clockEvaluations})`);
  assert(clockState.refractoryChecks === 36 * 30, 'C6.4: Clock mode performs refractory check for every neuron evaluation');
  assert(clockState.thresholdEvaluations > 0, 'C6.5: Threshold comparisons tracked accurately');
}

// ════════════════════════════════════════════════════════════════
// SUITE D: CONSERVATION INVARIANT: SCHEDULED = DELIVERED + PENDING
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE D: Conservation Invariant: Scheduled = Delivered + Pending ---');

{
  const engine = new SimulationEngine({ neuronCount: 48, inputSparsity: 0.3, firingThreshold: 0.4, executionMode: 'event', seed: 42 });
  engine.init({ neuronCount: 48, inputSparsity: 0.3, firingThreshold: 0.4, executionMode: 'event', seed: 42 });

  let invariantPreserved = true;
  for (let s = 1; s <= 40; s++) {
    engine.step();
    const st = engine.getState();
    if (st.scheduledEvents !== st.deliveredEvents + st.pendingEvents) {
      invariantPreserved = false;
      console.error(`Step ${s} violation: Scheduled ${st.scheduledEvents} != Delivered ${st.deliveredEvents} + Pending ${st.pendingEvents}`);
      break;
    }
  }
  assert(invariantPreserved, 'D1: Invariant Scheduled = Delivered + Pending holds after every single step for 40 steps');

  const finalSt = engine.getState();
  assert(finalSt.queueInsertions === finalSt.scheduledEvents, `D2: Queue insertions (${finalSt.queueInsertions}) equals scheduled events (${finalSt.scheduledEvents})`);
  assert(finalSt.queueRemovals === finalSt.deliveredEvents, `D3: Queue removals (${finalSt.queueRemovals}) equals delivered events (${finalSt.deliveredEvents})`);
}

// ════════════════════════════════════════════════════════════════
// SUITE E: DETERMINISTIC REPRODUCIBILITY WITH SEEDED PRNG
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE E: Deterministic Reproducibility with Seeded PRNG ---');

{
  // Run 1: Seed 42
  const e1 = new SimulationEngine({ neuronCount: 36, seed: 42, inputSparsity: 0.5 });
  e1.init({ neuronCount: 36, seed: 42, inputSparsity: 0.5 });
  for (let s = 0; s < 25; s++) e1.step();
  const st1 = e1.getState();

  // Run 2: Seed 42 fresh instance
  const e2 = new SimulationEngine({ neuronCount: 36, seed: 42, inputSparsity: 0.5 });
  e2.init({ neuronCount: 36, seed: 42, inputSparsity: 0.5 });
  for (let s = 0; s < 25; s++) e2.step();
  const st2 = e2.getState();

  assert(st1.spikeCount === st2.spikeCount, `E1.1: Identical seeds produce identical total spikes (${st1.spikeCount})`);
  assert(st1.deliveredEvents === st2.deliveredEvents, `E1.2: Identical seeds produce identical delivered events (${st1.deliveredEvents})`);
  assert(st1.neuronIntegrations === st2.neuronIntegrations, `E1.3: Identical seeds produce identical neuron integrations (${st1.neuronIntegrations})`);
  assert(JSON.stringify(st1.spikeRaster) === JSON.stringify(st2.spikeRaster), 'E1.4: Identical seeds produce identical spike rasters');

  // Reset and rerun e1
  e1.reset();
  for (let s = 0; s < 25; s++) e1.step();
  const st1Rerun = e1.getState();
  assert(st1.spikeCount === st1Rerun.spikeCount, `E2: Reset followed by rerun reproduces identical run (${st1Rerun.spikeCount})`);

  // Run 3: Seed 999 (Different seed must produce different dynamics)
  const e3 = new SimulationEngine({ neuronCount: 36, seed: 999, inputSparsity: 0.5 });
  e3.init({ neuronCount: 36, seed: 999, inputSparsity: 0.5 });
  for (let s = 0; s < 25; s++) e3.step();
  const st3 = e3.getState();

  assert(st1.spikeCount !== st3.spikeCount || st1.deliveredEvents !== st3.deliveredEvents, 'E3: Different seeds produce distinct simulation runs');
}

// ════════════════════════════════════════════════════════════════
// SUITE F: ADAPTIVE POLICIES VALIDATION
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE F: Adaptive Policies Validation ---');

// F1: Adaptive Threshold Dynamics
{
  const engine = new SimulationEngine({
    neuronCount: 20,
    inputSparsity: 0.0, // High activity ensures active ratio > 0.15
    firingThreshold: 0.65,
    adaptiveThreshold: true,
    seed: 42,
  });
  engine.init({
    neuronCount: 20,
    inputSparsity: 0.0,
    firingThreshold: 0.65,
    adaptiveThreshold: true,
    seed: 42,
  });

  const initialThresh = engine.thresholdHistory[0];
  assert(initialThresh === 0.65, 'F1.1: Initial threshold matches configured value (0.65)');

  // Run steps and observe threshold modulation
  for (let s = 0; s < 10; s++) engine.step();
  const finalThresh = engine.thresholdHistory[engine.thresholdHistory.length - 1];
  assert(finalThresh <= 1.1 && finalThresh >= 0.2, `F1.2: Adaptive threshold stays within [0.2, 1.1] bounds (${finalThresh})`);

  // Verify all neurons received updated threshold
  const allSynced = engine.neurons.every(n => Math.abs(n.threshold - finalThresh) < 1e-9);
  assert(allSynced, 'F1.3: All neurons remain synchronized with adaptive threshold');

  // Verify reset restores initial threshold
  engine.reset();
  assert(engine.thresholdHistory[0] === 0.65, 'F1.4: Reset restores initial firing threshold');
  assert(engine.neurons.every(n => n.threshold === 0.65), 'F1.5: Neurons reset to configured threshold');
}

// F2: Adaptive Temporal Binning Mechanism
{
  const engine = new SimulationEngine({
    neuronCount: 24,
    inputSparsity: 0.95, // High sparsity triggers bin size 2 (sparsity >= 0.65)
    firingThreshold: 0.65,
    adaptiveTemporal: true,
    seed: 42,
  });
  engine.init({
    neuronCount: 24,
    inputSparsity: 0.95,
    firingThreshold: 0.65,
    adaptiveTemporal: true,
    seed: 42,
  });

  // Step 0 is step % 2 === 0 (isBinStep true)
  engine.step();
  // Step 1 is step % 2 !== 0 (deferred step)
  engine.step();

  assert(engine.binSizeHistory.length >= 2, 'F2.1: Bin size transitions recorded in history');
  assert(engine.binSizeHistory.includes(2), 'F2.2: Sparse activity triggers bin size 2');

  // Characterize that adaptive temporal binning is an approximation policy
  engine.reset();
  assert(engine.binSizeHistory.length === 0, 'F2.3: Reset clears temporal binning state');
}

// ════════════════════════════════════════════════════════════════
// SUITE G: v2.2.2 SCIENTIFIC INTEGRITY INVARIANTS
// ════════════════════════════════════════════════════════════════
console.log('\n--- SUITE G: v2.2.2 Scientific Integrity Invariants ---');

// G1: Engine Version & Default Parameter Audit
{
  assert(SimulationEngine.VERSION === '2.2.2-validated', `G1.1: SimulationEngine.VERSION is 2.2.2-validated (${SimulationEngine.VERSION})`);
  const defaultNeuron = new LIFNeuron(0);
  assertClose(defaultNeuron.leakFactor, 0.78, 1e-9, `G1.2: LIFNeuron default leakFactor is 0.78 (${defaultNeuron.leakFactor})`);
}

// G2: Granular Counter Auditing (activeIntegrations, lazyDecayCalls, lazyExponentialEvaluations)
{
  const clockEng = new SimulationEngine({
    neuronCount: 16,
    steps: 20,
    executionMode: 'clock',
    seed: 101,
  });
  clockEng.init({ neuronCount: 16, steps: 20, executionMode: 'clock', seed: 101 });
  for (let s = 0; s < 20; s++) clockEng.step();

  assert(clockEng.clockEvaluations === 16 * 20, `G2.1: Clock evaluations equals N x T = 320 (${clockEng.clockEvaluations})`);
  assert(clockEng.lazyDecayCalls === 0, `G2.2: Clock mode lazyDecayCalls is strictly 0 (${clockEng.lazyDecayCalls})`);
  assert(clockEng.lazyExponentialEvaluations === 0, `G2.3: Clock mode lazyExponentialEvaluations is strictly 0 (${clockEng.lazyExponentialEvaluations})`);
  assert(clockEng.activeIntegrations <= clockEng.neuronIntegrations, `G2.4: Active integrations (${clockEng.activeIntegrations}) <= total integrations (${clockEng.neuronIntegrations})`);

  const eventEng = new SimulationEngine({
    neuronCount: 16,
    steps: 20,
    executionMode: 'event',
    seed: 101,
  });
  eventEng.init({ neuronCount: 16, steps: 20, executionMode: 'event', seed: 101 });
  for (let s = 0; s < 20; s++) eventEng.step();

  assert(eventEng.clockEvaluations === 0, `G2.5: Event mode clock evaluations is strictly 0 (${eventEng.clockEvaluations})`);
  assert(eventEng.lazyDecayCalls > 0, `G2.6: Event mode lazyDecayCalls is tracked (${eventEng.lazyDecayCalls})`);
  assert(eventEng.lazyExponentialEvaluations <= eventEng.lazyDecayCalls, `G2.7: Lazy exponential evaluations (${eventEng.lazyExponentialEvaluations}) <= lazy decay calls (${eventEng.lazyDecayCalls})`);
  assert(eventEng.activeIntegrations <= eventEng.neuronIntegrations, `G2.8: Active integrations (${eventEng.activeIntegrations}) <= neuron integrations (${eventEng.neuronIntegrations})`);
}

// G3: Input Tracing & Current Bounds [0.10, 0.35)
{
  const tracedEng = new SimulationEngine({
    neuronCount: 12,
    steps: 15,
    traceInputs: true,
    inputSparsity: 0.5,
    seed: 777,
  });
  tracedEng.init({ neuronCount: 12, steps: 15, traceInputs: true, inputSparsity: 0.5, seed: 777 });
  for (let s = 0; s < 15; s++) tracedEng.step();

  const trace = tracedEng.getInputTrace();
  assert(trace.length > 0, `G3.1: Input trace captured ${trace.length} stochastic inputs`);
  const allInRange = trace.every(e => e.current >= 0.10 && e.current < 0.35);
  assert(allInRange, 'G3.2: All external input currents lie strictly within [0.10, 0.35)');
  assert(trace.every(e => e.step >= 0 && e.step < 15 && e.targetId >= 0 && e.targetId < 12), 'G3.3: Trace step and targetId indices are strictly valid');

  tracedEng.reset();
  assert(tracedEng.getInputTrace().length === 0, 'G3.4: Reset clears input trace');
}

console.log('\n===============================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL SCIENTIFIC INTEGRITY & PERFORMANCE INVARIANTS VERIFIED!\n');
}
