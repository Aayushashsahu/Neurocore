# NEUROCORE — Adaptive Event-Driven Neuromorphic Computing Platform

**Version:** v2.0.0  
**Status:** Interactive Research Platform Prototype  
**Live Deployment:** [https://neurocore-gilt.vercel.app/](https://neurocore-gilt.vercel.app/)  
**Deployment Platform:** Vercel (Static Web Application)

NEUROCORE is an interactive scientific computing and visualization platform for exploring event-driven Spiking Neural Networks (SNNs), adaptive neuromorphic computation policies, and hardware-aware edge profiling.

> *"Intelligence that computes only when it matters."*

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
