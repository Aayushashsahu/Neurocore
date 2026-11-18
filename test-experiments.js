/**
 * Automated Test Suite for NEUROCORE v2.2.0 Experiment Runner & Statistical Benchmarking
 * 
 * Verifies:
 * - Statistical functions: Mean, Sample SD (n-1 denominator), Median, Min, Max
 * - Deterministic seed derivation and paired trial reproducibility
 * - Single trial execution using real SimulationEngine instances
 * - Output parity between paired Event-Driven and Time-Stepped SNNs
 * - Multi-trial campaign aggregation with sample standard deviations
 * - Cancellation handling and incomplete-run exclusion
 * - CSV and JSON serialization integrity
 */

const {
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
} = require('./experiment-runner.js');

const { SimulationEngine } = require('./simulation-engine.js');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('  NEUROCORE v2.2.0 EXPERIMENT RUNNER & STATISTICAL TEST SUITE');
  console.log('===============================================================\n');

  // --- SUITE 1: Statistical Functions ---
  console.log('--- SUITE 1: Statistical Functions ---');
  const sampleData = [10, 12, 23, 23, 16, 23, 21, 16];
  // Mean = (10+12+23+23+16+23+21+16)/8 = 144/8 = 18.0
  assert(mean(sampleData) === 18, `Mean calculated accurately (expected 18, got ${mean(sampleData)})`);

  // Sample variance = sum((x - 18)^2) / 7
  // (10-18)^2 = 64
  // (12-18)^2 = 36
  // (23-18)^2 = 25 * 3 = 75
  // (16-18)^2 = 4 * 2 = 8
  // (21-18)^2 = 9
  // Sum = 64 + 36 + 75 + 8 + 9 = 192. Variance = 192 / 7 = 27.42857. SD = sqrt(27.42857) = 5.237229
  const sdVal = sampleStdDev(sampleData);
  assert(Math.abs(sdVal - 5.237229) < 0.0001, `Sample SD uses (n-1) denominator (expected ~5.2372, got ${sdVal.toFixed(4)})`);

  // Edge cases
  assert(sampleStdDev([42]) === null, 'Sample SD returns null when N < 2');
  assert(sampleStdDev([]) === null, 'Sample SD returns null when empty array');
  assert(mean([]) === 0, 'Mean of empty array returns 0');

  // Median
  assert(median([3, 1, 2]) === 2, 'Median of odd array is middle element (2)');
  assert(median([4, 1, 3, 2]) === 2.5, 'Median of even array is average of middle two (2.5)');
  assert(min([5, 2, 9, 1, 7]) === 1, 'Min correctly identified');
  assert(max([5, 2, 9, 1, 7]) === 9, 'Max correctly identified');

  // --- SUITE 2: Deterministic Seed Derivation ---
  console.log('\n--- SUITE 2: Deterministic Seed Derivation ---');
  const seed0a = deriveTrialSeed(42, 0);
  const seed0b = deriveTrialSeed(42, 0);
  const seed1 = deriveTrialSeed(42, 1);
  assert(seed0a === seed0b, `Derived seed is deterministic for identical repetition index (Seed: ${seed0a})`);
  assert(seed0a !== seed1, `Different repetition index produces distinct seed (${seed0a} vs ${seed1})`);

  // --- SUITE 3: Real Single Trial Execution ---
  console.log('\n--- SUITE 3: Real Single Trial Execution ---');
  const trialParams = {
    experimentId: 'TEST-EXP-01',
    trialId: 'TEST-EXP-01-T0',
    repetitionIndex: 0,
    seed: 42,
    mode: 'event',
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    simulationSteps: 30,
    adaptiveThreshold: false,
    adaptiveTemporal: false,
  };

  const trialRes = executeTrial(trialParams, SimulationEngine);
  assert(trialRes.status === 'completed', 'Trial completed successfully');
  assert(trialRes.neuronIntegrations > 0, `Recorded genuine neuron integrations (${trialRes.neuronIntegrations})`);
  assert(trialRes.invariantValid === true, 'Conservation invariant Scheduled = Delivered + Pending holds');
  assert(trialRes.initDurationMs >= 0, `Recorded init duration (${trialRes.initDurationMs} ms)`);
  assert(trialRes.kernelDurationMs >= 0, `Recorded kernel execution duration (${trialRes.kernelDurationMs} ms)`);

  // --- SUITE 4: Paired Trial Parity ---
  console.log('\n--- SUITE 4: Paired Trial Parity ---');
  const pairedClockParams = { ...trialParams, mode: 'clock', trialId: 'TEST-EXP-01-T0-CLOCK' };
  const pairedEventParams = { ...trialParams, mode: 'event', trialId: 'TEST-EXP-01-T0-EVENT' };

  const clockRes = executeTrial(pairedClockParams, SimulationEngine);
  const eventRes = executeTrial(pairedEventParams, SimulationEngine);

  assert(clockRes.spikeCount === eventRes.spikeCount,
    `Paired trial spike count parity (Clock: ${clockRes.spikeCount}, Event: ${eventRes.spikeCount})`);
  assert(clockRes.deliveredEvents === eventRes.deliveredEvents,
    `Paired trial delivered synaptic events parity (Clock: ${clockRes.deliveredEvents}, Event: ${eventRes.deliveredEvents})`);
  assert(eventRes.neuronIntegrations <= clockRes.neuronIntegrations,
    `Event-driven integrations <= Time-stepped integrations (${eventRes.neuronIntegrations} <= ${clockRes.neuronIntegrations})`);

  // --- SUITE 5: Campaign Execution & Statistical Aggregation ---
  console.log('\n--- SUITE 5: Campaign Execution & Statistical Aggregation ---');
  const runner = new ExperimentRunner(SimulationEngine);

  let progressReportCount = 0;
  const campaignRes = await runner.runCampaign({
    campaignType: 'quick',
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    simulationSteps: 25,
    repetitions: 4,
    baseSeed: 100,
    modes: ['event', 'clock'],
  }, {
    onProgress: (prog) => {
      progressReportCount++;
    }
  });

  assert(campaignRes.status === 'completed', 'Campaign completed successfully');
  assert(campaignRes.completedTrialsCount === 8, `All 8 trials completed (4 reps x 2 modes = ${campaignRes.completedTrialsCount})`);
  assert(progressReportCount > 0, `Progress callbacks invoked during run (${progressReportCount} times)`);
  assert(campaignRes.parityVerification.allMatched === true, `Scientific parity check 100% matched across all paired seeds`);

  // Check statistical summaries
  const eventIntSummary = campaignRes.summaries.find(s => s.metric === 'Neuron Integrations' && s.mode === 'event');
  assert(eventIntSummary !== undefined, 'Found Neuron Integrations summary for event mode');
  assert(eventIntSummary.n === 4, `Sample size N=4 (got ${eventIntSummary.n})`);
  assert(typeof eventIntSummary.mean === 'number', `Mean is a valid number (${eventIntSummary.mean})`);
  assert(typeof eventIntSummary.sd === 'number', `Sample SD is a valid number (${eventIntSummary.sd})`);

  // Check paired comparison
  assert(campaignRes.pairedComparisons.length > 0, 'Computed paired comparisons');
  const pairedComp = campaignRes.pairedComparisons[0];
  assert(pairedComp.nPaired === 4, `Paired sample size N=4 (got ${pairedComp.nPaired})`);
  assert(pairedComp.meanIntegrationsReductionPct > 0,
    `Mean integration reduction percentage calculated (${pairedComp.meanIntegrationsReductionPct.toFixed(2)}%)`);

  // --- SUITE 6: Cancellation Behavior ---
  console.log('\n--- SUITE 6: Cancellation Behavior ---');
  const cancelRunner = new ExperimentRunner(SimulationEngine);

  // Trigger campaign and cancel on first progress report
  const cancelPromise = cancelRunner.runCampaign({
    campaignType: 'quick',
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    simulationSteps: 25,
    repetitions: 10,
    baseSeed: 200,
    modes: ['event', 'clock'],
  }, {
    onProgress: (prog) => {
      if (prog.completedTrials >= 2) {
        cancelRunner.cancel();
      }
    }
  });

  const cancelRes = await cancelPromise;
  assert(cancelRes.status === 'cancelled', 'Campaign status marked as cancelled');
  assert(cancelRes.completedTrialsCount < 20, `Halted early before completing all 20 runs (completed ${cancelRes.completedTrialsCount})`);

  // --- SUITE 7: CSV & JSON Serialization ---
  console.log('\n--- SUITE 7: CSV & JSON Serialization ---');
  const rawCSV = generateRawCSV(campaignRes);
  assert(typeof rawCSV === 'string' && rawCSV.startsWith('Experiment ID,Trial ID'), 'Raw CSV header valid');
  assert(rawCSV.split('\n').length >= 9, 'Raw CSV has header + 8 trial rows');

  const summaryCSV = generateSummaryCSV(campaignRes);
  assert(typeof summaryCSV === 'string' && summaryCSV.startsWith('Metric,Execution Mode'), 'Summary CSV header valid');

  const jsonStr = generateExperimentJSON(campaignRes);
  const parsedJSON = JSON.parse(jsonStr);
  assert(parsedJSON.experimentId === campaignRes.experimentId, 'JSON serialization valid and parseable');
  assert(parsedJSON.simEngineVersion === '2.1.1-sparse', 'JSON preserves simulation engine version');
  assert(parsedJSON.experimentRunnerVersion === '2.2.0', 'JSON preserves experiment runner version');

  console.log('\n===============================================================');
  console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EXPERIMENT RUNNER & STATISTICAL INVARIANTS VERIFIED!\n');
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
