# NEUROCORE — Adaptive Event-Driven Neuromorphic Computing Platform

**Version:** v2.1.1  
**Status:** Interactive Research Platform Prototype  
**Live Deployment:** [https://neurocore-gilt.vercel.app/](https://neurocore-gilt.vercel.app/)  
**Deployment Platform:** Vercel (Static Web Application)

NEUROCORE is an interactive scientific computing and visualization platform for exploring event-driven Spiking Neural Networks (SNNs), adaptive neuromorphic computation policies, and hardware-aware edge profiling.

> *"Intelligence that computes only when it matters."*

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
├── charts.js                    # Scientific HTML5 canvas charts (zero external dependencies)
├── three-viz.js                 # Three.js 3D neural network visualizers (ES module)
├── architecture-interactive.js  # Interactive 5-layer architecture diagram module
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
