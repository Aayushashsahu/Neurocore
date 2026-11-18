/**
 * NEUROCORE v2.1.1 — Comprehensive SNN Simulation Engine Automated Test Suite
 *
 * Verifies:
 * - Suite A: LIF Neuron Model Dynamics & Invariants
 * - Suite B: Sparse Event-Driven Scheduler & Geometric Skip-Sampler
 * - Suite C: Execution Mode Comparison (Event-Driven vs Time-Stepped)
 * - Suite D: Conservation Invariant: Scheduled = Delivered + Pending
 * - Suite E: Deterministic Reproducibility with Seeded PRNG
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
console.log('  NEUROCORE v2.1.1 AUTOMATED SIMULATION ENGINE TEST SUITE');
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

// B3: Mathematical Equivalence of Lazy Decay vs Step-by-Step Decay
{
  const n = new LIFNeuron(0, { leakFactor: 0.78, resetVoltage: 0.0 });
  n.integrateAndFire(0.5, 0); // V = 0.5 at step 0
  assertClose(n.membranePotential, 0.5, 1e-12, 'B3.1: Initial potential set to 0.5 at step 0');

  // Let 10 steps elapse without input, then query step 10
  const decayedV = n.lazyDecay(10);
  const expectedV = 0.5 * Math.pow(0.78, 10);
  assertClose(decayedV, expectedV, 1e-12, 'B3.2: Lazy decay over 10 steps matches mathematical power function');
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
// SUITE C: EXECUTION-MODE COMPARISON (EVENT-DRIVEN VS TIME-STEPPED)
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

console.log('\n===============================================================');
console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL SCIENTIFIC INTEGRITY & PERFORMANCE INVARIANTS VERIFIED!\n');
}
