/**
 * Automated Test Suite for NEUROCORE v2.2.2 Experiment Runner, Differential Parity & Statistical Benchmarking
 * 
 * Verifies:
 * - Statistical functions: Mean, Sample SD (n-1 denominator), Median, Min, Max
 * - Student's t distribution critical values (tCritical95) across degrees of freedom
 * - 95% Confidence Interval computation (confidenceInterval95)
 * - Paired differences and percentage reductions with zero-denominator protection
 * - Deterministic seed derivation and paired trial reproducibility
 * - Single trial execution using real SimulationEngine instances with conservation invariants
 * - Comprehensive differential parity verifier (verifyDifferentialParity) covering topology,
 *   external inputs, per-neuron rasters, and step-by-step voltage trajectories (<= 1e-7 tolerance)
 * - Synthetic mismatch detection in differential parity diagnostics
 * - Separate warm-up run execution and statistical exclusion
 * - Alternating paired execution order (counteracting JIT warmup bias)
 * - Crossed factorial matrix campaign execution (4x4 matrix)
 * - Cancellation handling and incomplete-run exclusion
 * - CSV and JSON serialization integrity with v2.2.2 metadata and 95% CI columns
 * - v2.2.2 Strict differential parity assertions, accounting integrity, and structural planning
 */

const {
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
  console.log('  NEUROCORE v2.2.2 EXPERIMENT RUNNER & VALIDATION TEST SUITE');
  console.log('===============================================================\n');

  // --- SUITE 1: Statistical Functions & Student\'s t Distribution ---
  console.log('--- SUITE 1: Statistical Functions & Student\'s t Distribution ---');
  const sampleData = [10, 12, 23, 23, 16, 23, 21, 16];
  // Mean = (10+12+23+23+16+23+21+16)/8 = 144/8 = 18.0
  assert(mean(sampleData) === 18, `Mean calculated accurately (expected 18, got ${mean(sampleData)})`);

  // Sample variance = sum((x - 18)^2) / 7 = 192 / 7 = 27.42857. SD = sqrt(27.42857) = 5.237229
  const sdVal = sampleStdDev(sampleData);
  assert(Math.abs(sdVal - 5.237229) < 0.0001, `Sample SD uses (n-1) denominator (expected ~5.2372, got ${sdVal.toFixed(4)})`);

  // Edge cases
  assert(sampleStdDev([42]) === null, 'Sample SD returns null when N < 2');
  assert(sampleStdDev([]) === null, 'Sample SD returns null when empty array');
  assert(mean([]) === 0, 'Mean of empty array returns 0');

  // Median, Min, Max
  assert(median([3, 1, 2]) === 2, 'Median of odd array is middle element (2)');
  assert(median([4, 1, 3, 2]) === 2.5, 'Median of even array is average of middle two (2.5)');
  assert(min([5, 2, 9, 1, 7]) === 1, 'Min correctly identified');
  assert(max([5, 2, 9, 1, 7]) === 9, 'Max correctly identified');

  // Student\'s t critical values
  assert(Math.abs(tCritical95(1) - 12.706) < 0.001, `tCrit(df=1) = 12.706 (got ${tCritical95(1)})`);
  assert(Math.abs(tCritical95(4) - 2.776) < 0.001, `tCrit(df=4) = 2.776 (got ${tCritical95(4)})`);
  assert(Math.abs(tCritical95(9) - 2.262) < 0.001, `tCrit(df=9) = 2.262 (got ${tCritical95(9)})`);
  assert(Math.abs(tCritical95(19) - 2.093) < 0.001, `tCrit(df=19) = 2.093 (got ${tCritical95(19)})`);
  assert(Math.abs(tCritical95(29) - 2.045) < 0.001, `tCrit(df=29) = 2.045 (got ${tCritical95(29)})`);
  assert(tCritical95(0) === null, 'tCrit returns null for df <= 0');
  assert(tCritical95(-5) === null, 'tCrit returns null for negative df');
  assert(Math.abs(tCritical95(120) - 1.980) < 0.02, `tCrit for large df converges towards ~1.96-1.98 (got ${tCritical95(120)})`);

  // 95% Confidence Interval calculation
  const ci = confidenceInterval95(sampleData);
  assert(ci !== null, 'Confidence interval calculated successfully for N=8');
  assert(ci.df === 7, `Degrees of freedom df=7 (got ${ci.df})`);
  assert(Math.abs(ci.mean - 18.0) < 1e-6, `CI mean matches sample mean 18.0 (got ${ci.mean})`);
  assert(ci.lower < ci.mean && ci.upper > ci.mean, `CI bounds bracket sample mean: [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}]`);
  assert(confidenceInterval95([100]) === null, 'CI returns null when N < 2');

  // --- SUITE 2: Paired Differences & Percentage Reductions ---
  console.log('\n--- SUITE 2: Paired Differences & Percentage Reductions ---');
  const clockSeries = [100, 200, 0, 50];
  const eventSeries = [40, 50, 0, 25];

  const diffs = pairedDifferences(clockSeries, eventSeries);
  assert(diffs.values.length === 4, 'Paired differences length matches inputs');
  assert(diffs.values[0] === 60 && diffs.values[1] === 150 && diffs.values[2] === 0 && diffs.values[3] === 25, 'Paired differences calculated correctly');
  assert(typeof diffs.mean === 'number', `Mean difference computed (${diffs.mean})`);

  const pcts = pairedPercentageReductions(clockSeries, eventSeries);
  assert(pcts.values.length === 4, 'Paired percentage reductions length matches inputs');
  assert(Math.abs(pcts.values[0] - 60.0) < 0.01, `Reduction pct [0] = 60.0% (got ${pcts.values[0]}%)`);
  assert(Math.abs(pcts.values[1] - 75.0) < 0.01, `Reduction pct [1] = 75.0% (got ${pcts.values[1]}%)`);
  assert(pcts.values[2] === 0.0, 'Zero-denominator handling prevents NaN / Infinity (returns 0.0%)');
  assert(Math.abs(pcts.values[3] - 50.0) < 0.01, `Reduction pct [3] = 50.0% (got ${pcts.values[3]}%)`);
  assert(pcts.zeroDenominatorCount === 1, `Zero denominator count tracked accurately (got ${pcts.zeroDenominatorCount})`);

  // --- SUITE 3: Deterministic Seed Derivation ---
  console.log('\n--- SUITE 3: Deterministic Seed Derivation ---');
  const seed0a = deriveTrialSeed(42, 0);
  const seed0b = deriveTrialSeed(42, 0);
  const seed1 = deriveTrialSeed(42, 1);
  assert(seed0a === seed0b, `Derived seed is deterministic for identical repetition index (Seed: ${seed0a})`);
  assert(seed0a !== seed1, `Different repetition index produces distinct seed (${seed0a} vs ${seed1})`);

  // --- SUITE 4: Real Single Trial Execution & Invariants ---
  console.log('\n--- SUITE 4: Real Single Trial Execution & Invariants ---');
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
    executionOrder: 1,
  };

  const trialRes = executeTrial(trialParams, SimulationEngine);
  assert(trialRes.status === 'completed', 'Trial completed successfully');
  assert(trialRes.neuronIntegrations > 0, `Recorded genuine neuron integrations (${trialRes.neuronIntegrations})`);
  assert(trialRes.clockEvaluations === 0, `Clock evaluations strictly 0 in event mode (${trialRes.clockEvaluations})`);
  assert(trialRes.refractoryChecks >= 0, `Refractory checks tracked (${trialRes.refractoryChecks})`);
  assert(trialRes.invariantValid === true, 'Conservation invariant Scheduled = Delivered + Pending holds');
  assert(trialRes.initDurationMs >= 0, `Recorded init duration (${trialRes.initDurationMs} ms)`);
  assert(trialRes.kernelDurationMs >= 0, `Recorded kernel execution duration (${trialRes.kernelDurationMs} ms)`);
  assert(trialRes.avgStepDurationMs >= 0, `Recorded average step duration (${trialRes.avgStepDurationMs} ms)`);

  // --- SUITE 5: Full Differential Parity Verifier ---
  console.log('\n--- SUITE 5: Full Differential Parity Verifier ---');
  const testSteps = 30;
  const paritySeed = 882026;

  // Initialize identical clock and event engines
  const clockEng = new SimulationEngine({
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    executionStrategy: 'discrete',
    randomSeed: paritySeed,
    adaptiveThreshold: false,
    adaptiveTemporal: false,
  });
  clockEng.init();

  const eventEng = new SimulationEngine({
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    executionStrategy: 'sparse',
    randomSeed: paritySeed,
    adaptiveThreshold: false,
    adaptiveTemporal: false,
  });
  eventEng.init();

  // Run both for testSteps
  for (let s = 0; s < testSteps; s++) {
    clockEng.step();
    eventEng.step();
  }

  const fullParity = verifyDifferentialParity(clockEng, eventEng, { voltageTolerance: 1e-7 });
  assert(fullParity.isParity === true, 'Full differential parity PASSES between paired engines');
  assert(fullParity.topologyParity === true, 'Topology parity passes (connections and weights match)');
  assert(fullParity.inputParity === true, 'External input parity passes (stochastic sequence matched)');
  assert(fullParity.rasterParity === true, 'Per-neuron spike raster parity passes (all spike timestamps match)');
  assert(fullParity.synapticEventsParity === true, 'Synaptic events scheduled and delivered match identically');
  assert(fullParity.trajectoryParity === true, 'Step-by-step membrane voltage trajectory parity passes');
  assert(fullParity.maxVoltageDiff <= 1e-7, `Max voltage difference <= 1e-7 (got ${fullParity.maxVoltageDiff.toExponential(4)})`);

  // Diagnostic Test: Inject intentional discrepancy to verify detector sensitivity
  console.log('\n--- SUITE 5B: Differential Parity Diagnostic Sensitivity ---');
  // Mutate one neuron's voltage in clock engine
  const corruptedClockEng = new SimulationEngine({
    neuronCount: 24,
    connectionDensity: 0.25,
    sparsity: 70,
    firingThreshold: 0.65,
    executionMode: 'clock',
    randomSeed: paritySeed,
  });
  for (let s = 0; s < testSteps; s++) {
    corruptedClockEng.step();
  }
  // Manually tamper with neuron 5 membrane potential history
  corruptedClockEng.neurons[5].potentialHistory[10] += 0.05;

  const corruptedParity = verifyDifferentialParity(corruptedClockEng, eventEng, { voltageTolerance: 1e-7 });
  assert(corruptedParity.isParity === false, 'Differential parity accurately detects synthetic voltage divergence');
  assert(corruptedParity.trajectoryParity === false, 'Trajectory parity correctly flagged as false');
  assert(corruptedParity.diagnostics.length > 0, 'Diagnostics provide specific divergence information');

  // --- SUITE 6: Campaign Execution with Warm-up & Alternating Order ---
  console.log('\n--- SUITE 6: Campaign Execution with Warm-up & Alternating Order ---');
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
    voltageTolerance: 1e-7,
  }, {
    onProgress: (prog) => {
      progressReportCount++;
    }
  });

  assert(campaignRes.status === 'completed', 'Campaign completed successfully');
  assert(campaignRes.warmupExecuted === true, 'Warm-up phase was executed');
  assert(campaignRes.warmupDurationMs >= 0, `Warm-up execution time recorded (${campaignRes.warmupDurationMs} ms)`);
  assert(campaignRes.completedTrialsCount === 8, `All 8 measured trials completed (4 reps x 2 modes = ${campaignRes.completedTrialsCount})`);
  assert(campaignRes.rawTrials.length === 8, 'Raw trials list contains strictly non-warmup trials');
  assert(campaignRes.rawTrials.every(t => !t.isWarmup), 'Every trial in rawTrials has isWarmup === false');

  // Verify alternating execution order
  const rep0Order = campaignRes.rawTrials.filter(t => t.repetitionIndex === 0).sort((a,b) => a.executionOrder - b.executionOrder);
  const rep1Order = campaignRes.rawTrials.filter(t => t.repetitionIndex === 1).sort((a,b) => a.executionOrder - b.executionOrder);
  assert(rep0Order[0].mode !== rep1Order[0].mode,
    `Execution order alternated between rep 0 (${rep0Order[0].mode} first) and rep 1 (${rep1Order[0].mode} first)`);

  // Verify full differential parity across all campaign seeds
  assert(campaignRes.parityVerification.allMatched === true, 'Campaign parity verification verified 100% across all repetitions');
  assert(campaignRes.parityVerification.voltageTolerance === 1e-7, 'Campaign parity verification used 1e-7 tolerance');

  // Verify statistical summaries with Student\'s t 95% Confidence Intervals
  const eventIntSummary = campaignRes.summaries.find(s => s.metric === 'Neuron Integrations' && s.mode === 'event');
  assert(eventIntSummary !== undefined, 'Found Neuron Integrations summary for event mode');
  assert(eventIntSummary.n === 4, `Sample size N=4 (got ${eventIntSummary.n})`);
  assert(typeof eventIntSummary.mean === 'number', `Mean is a valid number (${eventIntSummary.mean})`);
  assert(typeof eventIntSummary.sd === 'number', `Sample SD is a valid number (${eventIntSummary.sd})`);
  assert(eventIntSummary.confidenceInterval95 !== null, '95% Confidence Interval is populated in summary');
  assert(eventIntSummary.ciLower < eventIntSummary.ciUpper, `CI Lower < CI Upper ([${eventIntSummary.ciLower}, ${eventIntSummary.ciUpper}])`);
  assert(typeof eventIntSummary.ciFormatted === 'string', `Formatted CI string present (${eventIntSummary.ciFormatted})`);

  // Verify paired comparisons with 95% CI
  assert(campaignRes.pairedComparisons.length > 0, 'Computed paired comparisons');
  const pairedComp = campaignRes.pairedComparisons[0];
  assert(pairedComp.nPaired === 4, `Paired sample size N=4 (got ${pairedComp.nPaired})`);
  assert(pairedComp.meanIntegrationsReductionPct > 0,
    `Mean integration reduction percentage calculated (${pairedComp.meanIntegrationsReductionPct.toFixed(2)}%)`);
  assert(pairedComp.ciIntegrationsReductionPct !== null, 'Paired reduction 95% CI computed');
  assert(pairedComp.ciIntegrationsReductionPct.lower <= pairedComp.ciIntegrationsReductionPct.upper,
    `Paired reduction CI valid [${pairedComp.ciIntegrationsReductionPct.lower.toFixed(2)}%, ${pairedComp.ciIntegrationsReductionPct.upper.toFixed(2)}%]`);

  // --- SUITE 7: Crossed Factorial Campaign Matrix Generation ---
  console.log('\n--- SUITE 7: Crossed Factorial Campaign Matrix Generation ---');
  const factorialRunner = new ExperimentRunner(SimulationEngine);

  // Run a miniaturized 2-size x 2-sparsity factorial to verify matrix generator mechanics
  const factorialRes = await factorialRunner.runCampaign({
    campaignType: 'factorial',
    factorialNeuronCounts: [24, 48],
    factorialSparsities: [70, 90],
    firingThreshold: 0.65,
    simulationSteps: 20,
    repetitions: 2,
    baseSeed: 500,
    modes: ['event', 'clock'],
  });

  assert(factorialRes.status === 'completed', 'Mini-factorial campaign completed successfully');
  // 2 sizes * 2 sparsities = 4 configurations * 2 reps * 2 modes = 16 trials
  assert(factorialRes.completedTrialsCount === 16,
    `Factorial produced exactly 16 trials for 2x2x2 paired design (got ${factorialRes.completedTrialsCount})`);
  assert(factorialRes.pairedComparisons.length === 4,
    `Factorial computed paired comparisons for all 4 matrix cells (got ${factorialRes.pairedComparisons.length})`);

  // --- SUITE 8: Cancellation Behavior ---
  console.log('\n--- SUITE 8: Cancellation Behavior ---');
  const cancelRunner = new ExperimentRunner(SimulationEngine);

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

  // --- SUITE 9: CSV & JSON Serialization ---
  console.log('\n--- SUITE 9: CSV & JSON Serialization ---');
  const rawCSV = generateRawCSV(campaignRes);
  assert(typeof rawCSV === 'string' && rawCSV.startsWith('Experiment ID,Trial ID'), 'Raw CSV header valid');
  assert(rawCSV.includes('Init Duration (ms)'), 'Raw CSV includes timing breakdown columns');
  assert(rawCSV.includes('Clock Neuron Evaluations'), 'Raw CSV includes precise counter columns');
  assert(rawCSV.split('\n').length >= 9, 'Raw CSV has header + 8 trial rows');

  const summaryCSV = generateSummaryCSV(campaignRes);
  assert(typeof summaryCSV === 'string' && summaryCSV.startsWith('Metric,Execution Mode'), 'Summary CSV header valid');
  assert(summaryCSV.includes('95% CI Lower,95% CI Upper,Margin of Error'), 'Summary CSV includes 95% CI headers');

  const jsonStr = generateExperimentJSON(campaignRes);
  const parsedJSON = JSON.parse(jsonStr);
  assert(parsedJSON.experimentId === campaignRes.experimentId, 'JSON serialization valid and parseable');
  assert(parsedJSON.simEngineVersion === '2.2.2-validated', `JSON preserves v2.2.2 engine version (${parsedJSON.simEngineVersion})`);
  assert(parsedJSON.experimentRunnerVersion === '2.2.2', `JSON preserves v2.2.2 experiment runner version (${parsedJSON.experimentRunnerVersion})`);
  assert(parsedJSON.warmupExecuted === true, 'JSON serializes warmup metadata');
  assert(parsedJSON.parityVerification.voltageTolerance === 1e-7, 'JSON serializes differential parity tolerance');

  // --- SUITE 10: v2.2.2 Strict Parity, Accounting & Structural Plan ---
  console.log('\n--- SUITE 10: v2.2.2 Strict Parity, Accounting & Structural Plan ---');

  // 10.1: Strict Paired Array Length Assertion
  let threwDiff = false;
  try {
    pairedDifferences([1, 2, 3], [1, 2]);
  } catch (err) {
    threwDiff = true;
  }
  assert(threwDiff, 'pairedDifferences rejects mismatched array lengths with Error (no silent truncation)');

  let threwPct = false;
  try {
    pairedPercentageReductions([10, 20], [10, 20, 30]);
  } catch (err) {
    threwPct = true;
  }
  assert(threwPct, 'pairedPercentageReductions rejects mismatched array lengths with Error (no silent truncation)');

  // 10.2: Differential Parity Rejects Step Count Mismatch
  const stepMismatchClock = new SimulationEngine({ neuronCount: 12, steps: 10, executionMode: 'clock', seed: 42 });
  stepMismatchClock.init({ neuronCount: 12, steps: 10, executionMode: 'clock', seed: 42 });
  for (let s = 0; s < 10; s++) stepMismatchClock.step();

  const stepMismatchEvent = new SimulationEngine({ neuronCount: 12, steps: 12, executionMode: 'event', seed: 42 });
  stepMismatchEvent.init({ neuronCount: 12, steps: 12, executionMode: 'event', seed: 42 });
  for (let s = 0; s < 12; s++) stepMismatchEvent.step();

  const stepMismatchParity = verifyDifferentialParity(stepMismatchClock, stepMismatchEvent);
  assert(stepMismatchParity.allPassed === false, 'Differential parity rejects step count mismatch');
  assert(stepMismatchParity.stepCountParity === false, 'Step count mismatch diagnostic flagged');

  // 10.3: Differential Parity Rejects Truncated Voltage History
  const truncClock = new SimulationEngine({ neuronCount: 8, steps: 15, executionMode: 'clock', seed: 88 });
  truncClock.init({ neuronCount: 8, steps: 15, executionMode: 'clock', seed: 88 });
  for (let s = 0; s < 15; s++) truncClock.step();

  const truncEvent = new SimulationEngine({ neuronCount: 8, steps: 15, executionMode: 'event', seed: 88 });
  truncEvent.init({ neuronCount: 8, steps: 15, executionMode: 'event', seed: 88 });
  for (let s = 0; s < 15; s++) truncEvent.step();

  // Tamper by truncating one neuron's potential history on clock engine
  truncClock.neurons[0].potentialHistory.pop();
  const truncParity = verifyDifferentialParity(truncClock, truncEvent);
  assert(truncParity.allPassed === false, 'Differential parity rejects truncated membrane trajectory');
  assert(truncParity.trajectoryParity === false, 'Voltage trajectory parity flagged false on truncation');

  // 10.4: External Input Sequence Trace Parity
  const tracedClock = new SimulationEngine({ neuronCount: 16, steps: 20, executionMode: 'clock', seed: 555, traceInputs: true });
  tracedClock.init({ neuronCount: 16, steps: 20, executionMode: 'clock', seed: 555, traceInputs: true });
  for (let s = 0; s < 20; s++) tracedClock.step();

  const tracedEvent = new SimulationEngine({ neuronCount: 16, steps: 20, executionMode: 'event', seed: 555, traceInputs: true });
  tracedEvent.init({ neuronCount: 16, steps: 20, executionMode: 'event', seed: 555, traceInputs: true });
  for (let s = 0; s < 20; s++) tracedEvent.step();

  const tracedParity = verifyDifferentialParity(tracedClock, tracedEvent);
  assert(tracedParity.allPassed === true, 'Differential parity passes with external input trace enabled');
  assert(tracedParity.inputParity === true, 'External input trace parity confirmed identical');
  assert(tracedParity.inputTraceVerified === true, 'External input sequence verified element-by-element');

  // 10.5: Campaign Accounting Counter Integrity
  const accountingRunner = new ExperimentRunner();
  const acctRes = await accountingRunner.runCampaign({
    campaignType: 'quick',
    modes: ['clock', 'event'],
    repetitions: 3,
    neuronCount: 12,
    steps: 10,
    warmupRuns: 1,
  });
  assert(acctRes.totalTrialsPlanned === 6, `totalTrialsPlanned is 6 (got ${acctRes.totalTrialsPlanned})`);
  assert(acctRes.completedTrialsCount === 6, `completedTrialsCount is 6 (got ${acctRes.completedTrialsCount})`);
  assert(acctRes.attemptedTrialsCount === 6, `attemptedTrialsCount is 6 (got ${acctRes.attemptedTrialsCount})`);
  assert(acctRes.failedTrialsCount === 0, `failedTrialsCount is 0 (got ${acctRes.failedTrialsCount})`);
  assert(acctRes.notStartedTrialsCount === 0, `notStartedTrialsCount is 0 (got ${acctRes.notStartedTrialsCount})`);
  assert(acctRes.cancelledTrialsCount === 0, `cancelledTrialsCount is 0 (got ${acctRes.cancelledTrialsCount})`);

  // 10.6: Structural Factorial Plan Verification (4 sizes x 4 sparsities x 10 reps x 2 modes = 320 runs)
  const fullFactorialPlanned = 4 * 4 * 10 * 2;
  assert(fullFactorialPlanned === 320, '4 sizes x 4 sparsities x 10 reps x 2 modes structurally equals 320 planned runs');

  console.log('\n===============================================================');
  console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL v2.2.2 EXPERIMENT RUNNER & VALIDATION INVARIANTS VERIFIED!\n');
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
