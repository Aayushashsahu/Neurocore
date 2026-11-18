# NEUROCORE — Adaptive Event-Driven Neuromorphic Computing Platform

**Version:** v2.2.1  
**Status:** Interactive Research Platform Prototype  
**Live Deployment:** [https://neurocore-gilt.vercel.app/](https://neurocore-gilt.vercel.app/)  
**Deployment Platform:** Vercel (Static Web Application)  
**Mathematical Specification:** [docs/MATHEMATICAL_MODEL.md](docs/MATHEMATICAL_MODEL.md)

NEUROCORE is an interactive scientific computing and visualization platform for exploring event-driven Spiking Neural Networks (SNNs), adaptive neuromorphic computation policies, and hardware-aware edge profiling.

> *"Intelligence that computes only when it matters."*

---

## What's New in v2.2.1 — Mathematical Validation, Scientific Integrity & Experimental Methodology

### 1. Formalized Discrete-Time LIF Mathematical Model
- **Explicit Discrete-Time Equations:** Normalized subthreshold dynamics $\tilde{V}_i(t) = \lambda V_i(t-1) + I_i(t)$ with leak factor $\lambda = \exp(-\Delta t / \tau_m)$, instantaneous threshold comparison $\tilde{V}_i(t) \ge \theta_i(t)$, hard reset to $V_{\text{reset}} = 0.0$, and saturation ceiling $V_{\text{max}} = 1.2$.
- **Strict Execution Sequence:** Every evaluation cycle strictly enforces: Refractory Status Check $\to$ Leak Decay $\to$ Input Integration $\to$ Saturation Limiting $\to$ Threshold Comparison $\to$ Spike Dispatch & Reset.
- **Refractory Invariant:** During absolute refractory period $R=2$, inputs are suppressed without altering potential, and accounted under `refractoryChecks` rather than `neuronIntegrations`.

### 2. Analytical & Numerical Lazy Decay Equivalence
- **Closed-Form Exponential Decay:** Replaced discrete iterative multiplications with closed-form evaluation $V_i(t) = V_i(t_{\text{last}}) \cdot \lambda^{t - t_{\text{last}}}$.
- **Numerical Validation:** Validated across 5 standard leak factors ($\lambda \in \{0.50, 0.70, 0.85, 0.95, 0.99\}$) and multi-step idle intervals, proving numerical deviation from sequential clock decay is within IEEE 754 machine epsilon ($\le 1.11 \times 10^{-16}$).

### 3. Full Differential Parity Verification Protocol (`verifyDifferentialParity`)
- **5-Point Parity Audit:** Compares paired Clock and Event executions across:
  1. *Network Topology:* Identical node counts, connections, directed pairs, weights, and delays.
  2. *External Inputs:* Exact stochastic event counts and targeted neurons.
  3. *Per-Neuron Spike Rasters:* Exact equality of spike timestamp vectors ($\text{Raster}_{\text{clock}}[i] \equiv \text{Raster}_{\text{event}}[i]$).
  4. *Step-by-Step Membrane Trajectories:* Continuous voltage trajectory parity across all neurons and steps within tolerance $|V_{\text{clock}} - V_{\text{event}}| \le 10^{-7}$.
  5. *Synaptic Conservation:* Scheduled and delivered event parity.
- **Divergence Diagnostics:** On synthetic discrepancy injection, audit pinpoint accurate diagnostics identifying the exact neuron ID, timestep, and voltage difference.

### 4. Rigorous Operation Counter Accounting
- **Eliminated Overcounting:** Resolved bug where time-stepped mode classified ordinary updates as lazy decays (`lazyDecayEvaluations` is strictly 0 in Clock Mode).
- **Non-Refractory Integration Tracking:** `neuronIntegrations` counts strictly active additions of current to non-refractory neurons; refractory checks are tracked separately under `refractoryChecks`.
- **Clock Evaluations:** Tracked as $N \times \text{steps}$ in clock mode, strictly 0 in event mode.

### 5. Experimental Timing Methodology & JIT Bias Mitigation
- **Isolated Warm-up Runs:** Automatically executes unrecorded warm-up trials to prime the JavaScript JIT compiler (V8) before recording sample statistics, isolating cold-start compilation overhead.
- **Balanced Alternating Execution Order:** Alternates execution order within paired repetitions (Rep 0: Clock $\to$ Event; Rep 1: Event $\to$ Clock) to eliminate systematic warmup bias.
- **Granular Timing Breakdown:** Tracks engine initialization duration (`initDurationMs`), simulation kernel duration (`kernelDurationMs`), average step duration (`avgStepDurationMs`), and warm-up time (`warmupDurationMs`).

### 6. Statistical Rigor with Student's t-Distribution
- **Exact Student's t Critical Values:** Embeds exact critical value lookup table for degrees of freedom $df \in [1, 100]$ plus Cornish-Fisher expansion for $df > 100$.
- **95% Confidence Intervals:** Computes exact 95% Confidence Intervals for sample means and paired difference percentage reductions ($\bar{x} \pm t_{0.975, df} \cdot \text{SEM}$).
- **Zero-Denominator Protection:** Explicit mathematical handling for paired reductions when reference clock activity is 0, preventing NaN or Infinite values.

### 7. Crossed Factorial Campaign Matrix (`Full Factorial (4×4 Matrix)`)
- **4×4 Parameter Matrix:** Evaluates 4 network sizes ($24, 48, 72, 96$ neurons) crossed with 4 input sparsities ($50\%, 70\%, 90\%, 95\%$) across 10 paired repetitions = 320 empirical simulation runs.
- **Preset Pill in UI:** One-click launch from the Campaign Presets bar with live progress tracking and paired comparisons for all 16 cells.

### 8. Comprehensive Documentation & Validation Suites
- **Mathematical Specification Document:** Created `docs/MATHEMATICAL_MODEL.md` featuring 16 exhaustive sections covering all equations, proofs, scheduler lifecycles, and known limitations.
- **146 Automated Tests:**
  - `test-simulation.js`: 58 tests across 6 suites verifying LIF equations, lazy decay equivalence, conservation invariants, deterministic seeds, and adaptive policies.
  - `test-experiments.js`: 88 tests across 9 suites verifying Student's t CIs, paired differences, differential parity, warm-up exclusion, alternating order, factorial campaigns, cancellation, and CSV/JSON serialization.

---

## What's New in v2.2.0 — Experimental Results Dashboard & Statistical Benchmarking

### 1. Genuine Multi-Trial Empirical Benchmarking (`experiment-runner.js`)
- **Automated Experiment Campaign Orchestration:** Completely replaced illustrative estimates with live multi-trial execution using isolated instances of the deterministic Leaky Integrate-and-Fire simulation engine.
- **Deterministic PRNG Hash Sequences:** Uses independent, mathematically derived seed sequences (`deriveTrialSeed(baseSeed, repIndex)`) via Mulberry32 so that every trial is fully deterministic and reproducible.
- **Non-Blocking Asynchronous Chunking:** Executes multi-run campaigns asynchronously yielding execution slices back to the browser event loop (`setTimeout(..., 0)`), ensuring 60fps UI responsiveness during 20–60 trial batches.
- **Responsive Cancellation:** Real-time cooperative cancellation support allows users to halt active campaigns immediately while retaining all completed trial records.

### 2. Rigorous Sample Statistics ($n-1$ Denominator)
- **Unbiased Sample Standard Deviation:** Computes sample standard deviation with Bessel's correction:
  $$s = \sqrt{\frac{1}{n-1} \sum_{i=1}^n (x_i - \bar{x})^2}$$
  Guarantees strict mathematical handling of edge cases, returning `null` / `N/A` when sample size $N < 2$.
- **Complete Descriptive Statistics:** Computes Sample Size ($N$), Mean ($\bar{x}$), Sample SD ($s$), Median, Minimum, and Maximum for 13+ empirical metrics including neuron integrations, lazy decay evaluations, scheduled synaptic events, delivered synaptic events, spike counts, queue operations, and measured kernel runtimes.
- **Formatted Results:** Standardized notation across all KPI cards, tables, and tooltips as `Mean ± SD`.

### 3. Paired Execution Analysis & Compute Reduction
- **Paired Trials on Identical Seeds:** For each repetition, evaluates Time-Stepped SNN and Event-Driven SNN on the exact same topology and stochastic input sequence.
- **Paired Difference Analysis:** Computes paired differences ($\Delta x_i = x_{\text{clock}, i} - x_{\text{event}, i}$) and calculates the true mean percentage reduction:
  $$\text{Reduction} = \frac{1}{n} \sum_{i=1}^n \left( \frac{x_{\text{clock}, i} - x_{\text{event}, i}}{x_{\text{clock}, i}} \right) \times 100\% \pm s_{\text{paired}}$$
- **Scientific Parity Audit:** Every paired repetition automatically verifies 100% mathematical equality between Time-stepped and Event-driven modes for spike counts, delivered synaptic events, and spike raster timing.

### 4. Interactive Campaign Presets
- **Quick (10 Paired Reps):** 20 total simulation runs (10 clock, 10 event) at 48 neurons, 70% input sparsity, and 50 steps for instant interactive benchmarking (~80–120ms total).
- **Sparsity Sweep (50%–95%):** Automated multi-point sensitivity analysis across 50%, 70%, 80%, 90%, and 95% input sparsity levels.
- **Scaling Sweep (24–96 Nodes):** Multi-scale network evaluation across 24, 48, 72, and 96 neurons to observe algorithmic overhead scaling.
- **Custom Experiment:** Full control over network size, sparsity, simulation steps, repetition count (5 to 30), base seed, synaptic density, firing threshold, and adaptive policies.

### 5. Upgraded Scientific Visualizations (`charts.js`)
- **Empirical Grouped Bar Chart with Error Whiskers:** Visualizes computational activity (Neuron Integrations, Delivered Events, Lazy Decays, Queue Operations) comparing Time-stepped and Event-driven SNNs with precise $\pm \text{SD}$ whiskers.
- **Empirical Sparsity Sensitivity Curve:** Plots measured neuron integration scaling across sparsity levels with node circles and error bounds.
- **Simulation Kernel Runtime Distribution:** Displays measured per-trial browser kernel execution duration (`performance.now()`) with mean lines.

### 6. Strict Separation of Dense ANN Analytical Baseline
- **Analytical Matrix-Vector Multiply:** Dense feedforward ANN workloads ($N_{\text{inputs}} \times N_{\text{outputs}} \times T_{\text{steps}}$) are strictly isolated in a dedicated Theoretical Reference box. They are never simulated by the LIF kernel, preventing any confusion between empirical SNN measurements and theoretical arithmetic baselines.

### 7. Reproducible Dataset Exporters
- **Raw Trials CSV:** Full trial-by-trial record with timestamp, seed, repetition index, execution mode, network parameters, and all 13+ measured counters.
- **Statistical Summary CSV:** Aggregated summary table formatted with metric, strategy, $N$, Mean, Sample SD, Median, Min, Max, and units.
- **Complete Portable JSON:** Clean JSON export free of non-serializable Proxies or internal pointers for reproducible offline Python/R analysis.

### 8. Automated Test Suite (`test-experiments.js`)
- **38 Automated Tests:** Covers statistical calculations ($n-1$ SD, $N<2$ null check, median), deterministic seed derivation, single-trial execution, paired parity verification, multi-trial campaign execution, cancellation behavior, and CSV/JSON formatting.
- **Run Locally:** Execute `node test-experiments.js` alongside `node test-simulation.js`.

---

## What's New in v2.1.1

### 1. Genuine Sparse Event-Driven Runtime ($O(K)$ Active-Neuron Scheduler)
- **Active-Neuron Scheduling:** Replaced full $O(N)$ per-timestep network scanning with an active-neuron scheduler that processes strictly neurons receiving delivered synaptic events or external inputs ($K \ll N$).
- **Geometric Skip-Sampling for Bernoulli Inputs:** External stochastic inputs are generated using closed-form geometric skip sampling ($k = \lfloor \ln(U) / \ln(1 - p) \rfloor$) driven by the Mulberry32 PRNG. This samples external inputs in $O(M)$ steps without scanning idle neurons, handling both 0% and 100% sparsity extremes deterministically.
- **Lazy Membrane Potential Decay:** Idle neurons do not compute step-by-step decay. Instead, membrane potential is lazily evaluated on-demand upon incoming event arrival or user inspection using exact exponential decay:
  $$V(t) = V_{\text{last}} \cdot \lambda^{\Delta t}$$
  Refractory boundary tracking ensures exact mathematical equivalence with continuous time-stepped simulation ($< 10^{-12}$ delta).
- **Sparse Event Trace with On-Demand Reconstruction:** Replaced dense $O(N \times T)$ potential histories with lightweight sparse event traces (`updateEvents`), reconstructing continuous membrane trajectories on-demand for inspected neurons without memory bloat.
- **Dual-Mode Parity:** Both time-stepped (`clock`) and event-driven (`event`) execution modes generate mathematically identical spike rasters and total delivered synaptic events.

### 2. Scientific Metric Integrity & Conservation Invariant
- **9 Distinct Metric Counters:** Tracks exact computational components: `neuronIntegrations`, `lazyDecayEvaluations`, `externalInputEvents`, `scheduledEvents`, `deliveredEvents`, `pendingEvents`, `queueInsertions`, `queueRemovals`, and measured browser `executionDurationMs`.
- **Conservation Invariant:** Enforces the strict conservation equality after every single simulation step:
  $$\text{Scheduled Events} = \text{Delivered Events} + \text{Pending Events}$$
  Backed by matching queue insertions and removals ($\text{Insertions} = \text{Scheduled}$, $\text{Removals} = \text{Delivered}$).
- **Honest Attribution:** Algorithmic operation counts (integrations, heap ops, events) are strictly distinguished from measured browser execution duration (`performance.now()`). Hardware energy and power metrics are explicitly marked as modeled proxies.

### 3. Discrete Simulation Step Conventions & Normalized Units
- **Time Convention:** Replaced speculative physical millisecond labels ("T+N.0 ms") with discrete simulation step indices (`Step 000`, `Step 001`, `Step 002`).
- **Activity Units:** Standardized population activity metrics as `spikes/step` rather than continuous-time Hz.
- **Membrane Potential:** Formatted in normalized voltage units ($[0.0, 1.2]$).

### 4. Adaptive Threshold ($V_{th}(t)$) Trajectory Visualization
- **Dynamic Threshold Tracking:** The Membrane Potential chart dynamically plots the evolving adaptive threshold curve $V_{th}(t)$ across time steps for the inspected neuron when adaptive thresholding is enabled, and a fixed horizontal reference line in static mode.

### 5. Resilient Canvas Lifecycle Management (`ChartResizeController`)
- **Unified Resize Controller:** Replaced fragmented resize listeners with a unified `ChartResizeController` using `ResizeObserver` across all four scientific canvas viewports (`MembranePotentialChart`, `RasterPlotChart`, `SpikeActivityChart`, `NeuralActivityMap`).
- **Collapsed Dimension Guards & Debouncing:** Debounced via `requestAnimationFrame` with guards against collapsed parent containers during tab switching or backgrounding, plus full teardown on chart destroy.

### 6. Automated Validation Test Suite (`test-simulation.js`)
- **Automated Verification:** 41 comprehensive automated tests across 5 test suites (`Suite A`: LIF Neuron Model Correctness, `Suite B`: Sparse Scheduler & Geometric Sampler, `Suite C`: Mode Equivalence, `Suite D`: Conservation Invariants, `Suite E`: Deterministic Reproducibility).
- **Run Locally:** Execute `node test-simulation.js` for instant regression testing.

### 7. Simulation Lab 3D Neuromorphic Visualization Refinement
- **Volumetric 3D Spatial Topology:** Redesigned the central 3D network into an asymmetric volumetric architecture spanning three functional tiers: Sensory Input Layer (lower-left, anterior), Associative Neuromorphic Core (elevated, deep central dome), and Spike Output Projection Hub (right mid-anterior, descending forward) with organic golden-spiral volume distribution across 12 to 96 neurons.
- **Synaptic Connectivity Modes:** Introduced three rendering modes with dedicated UI controls:
  - *Curated (Default):* Displays a clean, readable skeleton of dominant outgoing synapses and inter-cluster projection arcs using smooth Quadratic Bezier curves.
  - *Full Graph:* Renders 100% of the actual simulation connection graph as an intricate, delicate volumetric synaptic mesh.
  - *Active Only:* Hides resting lines to focus purely on dynamic event-driven spike propagation pathways.
- **Active Spike Propagation & Dynamic Pathway Illumination:** When neurons fire, their actual directed outgoing synapses illuminate in electric cyan or recurrent violet with traveling luminous particles traversing the 3D curved axons, triggering post-synaptic depolarization pulses upon arrival.
- **High-Visibility Phosphorescent Materials & Studio Rim Lighting:** Resting neurons feature visible slate-cyan bodies with subtle phosphorescent inner glow and dedicated rear rim lighting, eliminating pitch-black nodes.
- **Intelligent Camera Auto-Framing:** Dynamically computes the 3D bounding volume to frame the network occupying ~75% of the viewport with smooth reset tweening.
- **Interactive Raycast Inspection:** Hovering over any 3D neuron displays a glassmorphic HUD tooltip showing Neuron ID, Cluster, Membrane Voltage, Firing State, Spike Count, In/Out Synapses, and Mean Weight; clicking any neuron immediately selects it for real-time membrane potential trace inspection.

---

## Key Highlights & Capabilities

### 1. 3D Neural Network Visualization (Three.js WebGL)
- **Interactive 3D Node Mesh:** Multi-layered spherical neuron nodes rendered in high performance WebGL using Three.js with full mouse orbit, drag rotation, and zoom controls.
- **Spike Propagation:** Dynamic pulse particles travelling along synaptic connections between firing and target neurons.
- **Visual State Mapping:** Real-time illumination of spiking neurons (`#00D9FF` cyan glow) with smooth decay to idle states (`#2a4060`).
- **Performance Optimized:** Viewport occlusion culling with `IntersectionObserver`, automatic GPU resource disposal, and graceful SVG fallback when WebGL is unavailable.
- **Camera Controls:** Instant camera reset and smooth parallax.

### 2. SNN Simulation Lab (Leaky Integrate-and-Fire)
- **Modular LIF Simulation Engine (`simulation-engine.js`):** Interconnected Leaky Integrate-and-Fire neurons with configurable resting potentials, membrane leak factors, firing thresholds ($V_{th}$), post-spike reset voltages ($V_{reset}$), and refractory periods.
- **Dual Execution Modes:**
  - **Event-Driven:** Processes only active incoming spike events from the priority queue; idle neurons skip computation.
  - **Time-Stepped:** Evaluates every neuron at each discrete timestep $\Delta t$.
- **Adaptive Policies:**
  - *Adaptive Threshold:* Dynamically modulates firing threshold based on incoming signal density.
  - *Adaptive Temporal Bins:* Coarsens temporal resolution during low-activity intervals.
- **Full Playback Controls:** Start, Pause, Resume, Single-Step interval, Reset state, and adjust playback speed (0.5x, 1x, 2x, 5x).
- **Live Scientific Canvas Charts (`charts.js`):**
  - **Membrane Potential Trace:** Real-time continuous voltage curve for any inspectable neuron, displaying firing threshold and reset level markers.
  - **Spike Raster Plot:** Two-dimensional scatter plot (Neuron Index vs. Timestep) demonstrating temporal sparsity.
  - **Spike Activity & Frequency Graph:** Population spike counts per step with overlaid frequency trend.
- **Active Synaptic Event Queue:** Live table of scheduled synaptic events displaying source neuron, target neuron, delivery timestamp, synaptic weight, and delivery status.

### 3. Benchmark Lab
- **Multi-Strategy Comparative Analysis:** Compares Dense ANN baselines, Time-stepped SNNs, and Event-driven SNNs.
- **Metrics Tracked:** Modeled neuron updates, synaptic events, state evaluations, and estimated proxy cycle latencies across configurable input sparsity levels (0% to 95%).
- **Interactive Visualizations:**
  - Grouped bar chart comparing execution modes across multiple compute metrics.
  - Sparsity sensitivity curve illustrating update reductions as input sparsity increases.
  - Latency proxy chart modeling event queue scheduling overhead vs. compute savings.
- **CSV Data Export:** One-click download of the complete benchmark dataset for offline analysis.
- **Measurement Integrity:** Explicit distinction between modeled computational proxies and physical hardware readings.

### 4. Interactive 5-Layer System Architecture
- **5-Layer Accordion (`architecture-interactive.js`):**
  1. *Layer 01 — Workload Interface:* DVS event vision, IoT sensors, rate/temporal encoding.
  2. *Layer 02 — Core Neuromorphic Runtime:* Timestamped event queue, LIF dynamics, sparse synaptic updates.
  3. *Layer 03 — Adaptive Computation Engine:* Threshold adaptation, temporal scaling, confidence-based early exit.
  4. *Layer 04 — Measurement & Optimization:* Activity counters, Pareto profiling, physical power meter interface.
  5. *Layer 05 — Experiment Orchestration:* YAML configuration, seed control, statistical reproducibility.
- **Hardware Abstraction Layer:** Status tracking across Commodity CPU (Initial Target), GPU (Planned), Raspberry Pi 5 (Planned ARM), and ESP32-S3 (Stretch Goal).

---

## Project Structure

```text
neurocore-platform/
├── index.html                   # Main application entry point & semantic markup
├── styles.css                   # Futuristic dark scientific interface stylesheet
├── app.js                       # Primary application controller & event coordinator
├── simulation-engine.js         # Modular Leaky Integrate-and-Fire SNN engine
├── experiment-runner.js         # Multi-trial empirical experiment runner & statistics
├── charts.js                    # Scientific HTML5 canvas charts (zero external dependencies)
├── three-viz.js                 # Three.js 3D neural network visualizers (ES module)
├── architecture-interactive.js  # Interactive 5-layer architecture diagram module
├── test-simulation.js           # Automated validation test suite for SNN engine (41 tests)
├── test-experiments.js          # Automated validation test suite for experiment runner (38 tests)
├── start-neurocore.bat          # Windows one-click local server launcher
└── README.md                    # Platform documentation
```

---

## Running Locally

NEUROCORE is completely static and requires zero build steps or package installations.

### Option 1: Quick Launch (Windows)
Double-click `start-neurocore.bat` in the project root. It will spin up a local server and open <http://localhost:8000> in your default browser.

### Option 2: Python HTTP Server
```bash
cd neurocore-platform
python -m http.server 8000
```
Open <http://localhost:8000> or <https://neurocore-gilt.vercel.app/> in your browser.

### Option 3: Node.js (npx serve)
```bash
cd neurocore-platform
npx serve .
```

---

## Deployment (Vercel)

This repository is structured for zero-configuration deployment on Vercel:
- **Framework Preset:** Other / Static HTML
- **Root Directory:** `./`
- **Build Command:** *(none required)*
- **Output Directory:** `./`
- **Live URL:** [https://neurocore-gilt.vercel.app/](https://neurocore-gilt.vercel.app/)

---

## Technical Specifications & Philosophy

- **Zero Heavy Build Toolchains:** Pure modern ES2020+ JavaScript, modular CSS custom properties, and native Canvas/WebGL APIs.
- **Self-Contained Scientific Charts:** Custom canvas plotting engine avoiding bulky external chart dependencies.
- **Evidence-First Science:** Computational proxies (state updates, synaptic events) are strictly separated from empirical hardware metrics (Joules, wall-clock ms).

---

© 2026 NEUROCORE Research Project · Adaptive Event-Driven Edge Intelligence
