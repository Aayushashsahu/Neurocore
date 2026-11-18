# NEUROCORE — Research Platform Prototype

A responsive, self-contained frontend prototype for the NEUROCORE college research project.

## Run it

**Option 1 — quick start (Python installed):**

```bash
cd neurocore-platform
python -m http.server 8000
```

Open <https://neurocore-gilt.vercel.app/> in your browser.

**Option 2 — VS Code:**

1. Extract the ZIP file.
2. Open the `neurocore-platform` folder in VS Code.
3. Use the Live Server extension to open `index.html`.

You can also open `index.html` directly in a modern browser. A local server is recommended for the smoothest experience.

## What's included

- **Overview:** project landing dashboard and research positioning.
- **Simulation lab:** adjustable toy LIF network with event-driven and time-stepped modes, live network rendering, spike activity counters and event trace.
- **Benchmark lab:** adjustable sparsity and a modelled update-opportunity comparison.
- **Architecture:** proposed five-layer NEUROCORE v2 software architecture.
- **Hardware explorer:** CPU, GPU, Raspberry Pi 5 and ESP32-S3 target status.
- **Research:** research questions, E1–E4 experiment plan and measurement methodology.

## Important prototype limitations

- This is a frontend-only demonstration; it has no backend, database, trained model or hardware connection.
- The simulation is a simplified discrete LIF demonstration implemented in browser JavaScript. It is intended to explain concepts and is not the final optimized NEUROCORE runtime.
- Benchmark values are illustrative browser-side workload counters, not measured performance results.
- No latency, energy, power, device utilization or accuracy results are claimed.
- Hardware targets are labelled as planned or pending until they are physically available and tested.

## Project files

```text
neurocore-platform/
├── index.html   # Application structure and page content
├── styles.css   # Responsive dark scientific interface
├── app.js       # Navigation, simulator and benchmark interactions
└── README.md    # Setup and prototype notes
```

## Next engineering milestones

1. Move LIF simulation and event scheduling into a tested backend/runtime module.
2. Add real datasets and a trained baseline before making accuracy comparisons.
3. Record repeatable CPU measurements with a hardware/software manifest.
4. Add a physical power meter interface before reporting true energy.
5. Implement GPU / Raspberry Pi / ESP32-S3 integrations only when the respective hardware is available.
