# NEUROCORE Mathematical Model & Validation Specification
**Version:** v2.2.1-validated  
**Classification:** Research Specification & Numerical Methodology  
**Target Architecture:** Discrete-Time Leaky Integrate-and-Fire (LIF) with Lazy Evaluation & Sparse Event-Driven Parity

---

## 1. Discrete-Time Normalized Leaky Integrate-and-Fire Model

The NEUROCORE neural simulation engine models each node $i \in \{0, 1, \dots, N-1\}$ as a discrete-time Leaky Integrate-and-Fire (LIF) point neuron. Continuous biological membrane dynamics governed by the differential equation:

$$\tau_m \frac{dV_i(t)}{dt} = -(V_i(t) - V_{\text{rest}}) + R_m I_i(t)$$

are mapped onto discrete simulation timesteps $t \in \mathbb{N}_0$ with uniform step size $\Delta t$. By normalizing the resting potential to $V_{\text{rest}} = 0.0$ and scaling membrane resistance $R_m$ into dimensionless synaptic weights, the discrete update rule for the subthreshold membrane potential prior to threshold evaluation $\tilde{V}_i(t)$ is formalized as:

$$\tilde{V}_i(t) = \lambda V_i(t-1) + I_i(t)$$

where:
- $V_i(t-1)$ is the normalized membrane potential at the conclusion of timestep $t-1$.
- $\lambda \in (0, 1)$ is the dimensionless membrane potential decay factor (default $\lambda = 0.80$), mathematically defined by:
  $$\lambda = \exp\left(-\frac{\Delta t}{\tau_m}\right)$$
- $I_i(t)$ represents the aggregate dimensionless input current delivered to neuron $i$ at timestep $t$.

The aggregate input current $I_i(t)$ comprises two disjoint sources: external stochastic sensory stimuli $I_i^{\text{ext}}(t)$ and recurrent synaptic inputs propagated from pre-synaptic afferents:

$$I_i(t) = I_i^{\text{ext}}(t) + \sum_{j \in \text{pre}(i)} w_{ji} \cdot S_j(t - d_{ji})$$

where:
- $\text{pre}(i) = \{j \mid (j \to i) \in \mathcal{E}\}$ represents the set of pre-synaptic afferents connecting to neuron $i$.
- $w_{ji} \in [0.05, 0.50]$ is the directed synaptic transmission weight.
- $d_{ji} \in \{1, 2, 3\}$ is the integer synaptic propagation delay in timesteps.
- $S_j(t - d_{ji}) \in \{0, 1\}$ denotes the binary spike emission indicator of pre-synaptic neuron $j$ at historical timestep $t - d_{ji}$.

---

## 2. Firing Condition and Instantaneous Reset

Following subthreshold integration, the candidate membrane potential $\tilde{V}_i(t)$ is compared against the neuron's instantaneous firing threshold $\theta_i(t)$:

$$S_i(t) = \begin{cases} 
1, & \text{if } \tilde{V}_i(t) \ge \theta_i(t) \\
0, & \text{otherwise}
\end{cases}$$

Upon firing ($S_i(t) = 1$), the membrane potential undergoes instantaneous hard reset to the hyperpolarized reset baseline $V_{\text{reset}} = 0.0$, and the neuron enters an absolute refractory state. If the candidate potential does not cross threshold, it is upper-bounded by a physiological saturation ceiling $V_{\text{max}} = 1.2$ to avoid numerical divergence during high-frequency bursts:

$$V_i(t) = \begin{cases}
V_{\text{reset}}, & \text{if } S_i(t) = 1 \\
\min\left(\tilde{V}_i(t), V_{\text{max}}\right), & \text{if } S_i(t) = 0
\end{cases}$$

### Exact Execution Sequence per Timestep $t$
To maintain mathematical determinism and cross-engine equivalence, every neuron evaluation strictly adheres to the following chronological pipeline:
1. **Refractory Status Check:** Verify if current timestep $t \le t_i^{\text{ref\_until}}$. If true, clamp $V_i(t) = V_{\text{reset}}$, discard incoming inputs, and bypass threshold evaluation.
2. **Leak Decay:** Apply membrane decay $\lambda V_i(t-1)$ (either sequentially in clock mode, or via closed-form exponential skipping in event-driven mode).
3. **Input Integration:** Accumulate external input current $I_i^{\text{ext}}(t)$ and delivered synaptic currents $\sum w_{ji}$.
4. **Saturation Limiting:** Enforce potential ceiling $\tilde{V}_i(t) \leftarrow \min(\tilde{V}_i(t), V_{\text{max}})$.
5. **Threshold Comparison:** Evaluate whether $\tilde{V}_i(t) \ge \theta_i(t)$.
6. **Spike Dispatch & Reset:** If threshold is met, emit spike $S_i(t) = 1$, append $t$ to spike raster, schedule outgoing events along target efferents, reset $V_i(t) = V_{\text{reset}}$, and set $t_i^{\text{ref\_until}} = t + R$.

---

## 3. Refractory-Period Semantics

Biological neurons exhibit an absolute refractory period during which voltage-gated sodium channels are inactivated, preventing subsequent action potentials regardless of input amplitude.

In NEUROCORE:
- The absolute refractory duration is parameterized as an integer number of discrete steps: $R = 2$.
- When neuron $i$ emits a spike at step $t_{\text{spike}}$, its refractory expiration boundary is set to:
  $$t_i^{\text{ref\_until}} = t_{\text{spike}} + R$$
- For all timesteps $t$ satisfying:
  $$t_{\text{spike}} < t \le t_i^{\text{ref\_until}}$$
  the following physical constraints are strictly enforced:
  1. $V_i(t) = V_{\text{reset}} = 0.0$ (membrane potential is clamped).
  2. Input suppression: Any synaptic currents arriving during refractory timesteps are absorbed and discarded without altering membrane state:
     $$I_i(t) \leftarrow 0$$
  3. Operation accounting: Refractory checks are accounted under `refractoryChecks`. Discarded refractory inputs do **not** increment `neuronIntegrations`.

---

## 4. Directed Synaptic Graph Model

The structural connectivity of the network is modeled as a directed graph $\mathcal{G} = (\mathcal{V}, \mathcal{E})$ where $\mathcal{V} = \{0, 1, \dots, N-1\}$ is the set of $N$ neurons and $\mathcal{E} \subseteq \mathcal{V} \times \mathcal{V}$ is the set of directed synaptic connections.

### Topological Constraints
1. **Self-Loops Prohibited:** Autaptic connections are forbidden:
   $$\forall i \in \mathcal{V}, \quad (i, i) \notin \mathcal{E}$$
2. **Connection Density:** Synaptic existence between any ordered pair $(j, i)$ with $j \neq i$ is governed by a Bernoulli random variable parameterized by connection density $p_{\text{conn}} \in (0, 1]$:
   $$P((j, i) \in \mathcal{E}) = p_{\text{conn}}$$
3. **Synaptic Weights:** Synaptic efficacy $w_{ji}$ is sampled uniformly from the continuous interval $[0.05, 0.50]$:
   $$w_{ji} \sim \mathcal{U}(0.05, 0.50)$$
4. **Axonal-Dendritic Delay:** Conduction latency $d_{ji}$ is sampled uniformly from discrete integer timesteps:
   $$d_{ji} \sim \mathcal{U}_{\text{int}}\{1, 2, 3\}$$

---

## 5. Delayed Event Propagation & Conservation Invariant

When neuron $j$ fires at step $t$, it does not instantaneously depolarize post-synaptic targets. Instead, an action potential event is scheduled for each outgoing connection $(j \to i) \in \mathcal{E}$:

$$\text{Event} = \left\langle \text{target}: i, \; \text{weight}: w_{ji}, \; t_{\text{delivery}}: t + d_{ji} \right\rangle$$

Events are ingested into a min-heap priority queue $\mathcal{Q}$ ordered primarily by $t_{\text{delivery}}$.

### Universal Conservation Invariant
At every simulation step $t$, the system satisfies an exact conservation law between scheduled, delivered, and pending synaptic events:

$$E_{\text{scheduled}}(t) = E_{\text{delivered}}(t) + |\mathcal{Q}_t|$$

where:
- $E_{\text{scheduled}}(t) = \sum_{s=0}^t \sum_{j=0}^{N-1} S_j(s) \cdot \text{deg}_{\text{out}}(j)$ is the cumulative count of events scheduled up to step $t$.
- $E_{\text{delivered}}(t)$ is the cumulative count of events removed from the queue and integrated by target neurons up to step $t$.
- $|\mathcal{Q}_t|$ is the number of pending in-flight events remaining in the priority queue at the conclusion of step $t$.

This invariant is verified at every step in the automated test suite (`assert(scheduled === delivered + queue.size)`).

---

## 6. Geometric Bernoulli Input Sampling

External stochastic sensory inputs simulate background cortical activity or sensor streams. For each neuron $i$, external stimulus arrival at timestep $t$ is modeled as an independent Bernoulli trial with activation probability $p_{\text{active}}$:

$$p_{\text{active}} = 1 - \sigma$$

where $\sigma \in [0, 1]$ is the configured input sparsity (e.g., $\sigma = 0.70 \implies p_{\text{active}} = 0.30$).

### Algorithmic Comparison: Clock vs Event Mode
1. **Time-Stepped Mode ($O(N)$):**
   Iterates over all $N$ neurons sequentially, drawing a uniform random number $U_i \sim \mathcal{U}(0, 1)$ for each node:
   $$I_i^{\text{ext}}(t) = \begin{cases} 
   0.15 + 0.35 \cdot U_i', & \text{if } U_i < p_{\text{active}} \\
   0.0, & \text{otherwise}
   \end{cases}$$
   Complexity per timestep: $\Theta(N)$.

2. **Event-Driven Sparse Mode ($O(k)$, where $k \ll N$):**
   Rather than evaluating $N$ Bernoulli trials, the event-driven engine directly samples the index of the *next active neuron* using the Geometric distribution. The number of skipped inactive neurons $\Delta k$ until the next success follows:

   $$P(\Delta k = m) = (1 - p_{\text{active}})^m p_{\text{active}}, \quad m \in \{0, 1, 2, \dots\}$$

   Using the inverse transform method, $\Delta k$ is sampled in $O(1)$ from a continuous uniform random variate $U \sim \mathcal{U}(0, 1)$:

   $$\Delta k = \left\lfloor \frac{\ln(1 - U)}{\ln(1 - p_{\text{active}})} \right\rfloor$$

   The sampler advances across the neuron index array via $idx \leftarrow idx + \Delta k + 1$, evaluating only the active subset $k \approx N(1 - \sigma)$. When $\sigma = 0.95$, this skips 95% of input generation overhead while guaranteeing an identical probabilistic distribution.

---

## 7. Lazy Membrane Potential Decay Derivation & Proof

In traditional time-stepped simulation, if neuron $i$ receives no inputs across $\Delta t = t - t_{\text{last}}$ timesteps, its membrane potential is updated iteratively:

$$V_i(t_0 + 1) = \lambda V_i(t_0)$$
$$V_i(t_0 + 2) = \lambda V_i(t_0 + 1) = \lambda^2 V_i(t_0)$$
$$\dots$$
$$V_i(t) = \lambda^{\Delta t} V_i(t_{\text{last}})$$

### Mathematical Proof of Equivalence
Let $\Delta t \in \mathbb{N}$ denote the elapsed idle interval since the neuron's last update at $t_{\text{last}}$, during which $I_i(s) = 0$ for all $s \in (t_{\text{last}}, t)$.

**Theorem:** *The closed-form exponential evaluation $V_i(t) = V_i(t_{\text{last}}) \cdot \lambda^{\Delta t}$ produces identical results to $\Delta t$ sequential multiplications by $\lambda$, up to IEEE 754 double-precision rounding error.*

**Proof:**
1. Base case: For $\Delta t = 1$, $V_i(t_{\text{last}} + 1) = V_i(t_{\text{last}}) \cdot \lambda^1 = \lambda V_i(t_{\text{last}})$, identical by definition.
2. Induction step: Assume true for $\Delta t = k$, so $V_i(t_{\text{last}} + k) = V_i(t_{\text{last}}) \cdot \lambda^k$.
3. At $\Delta t = k + 1$, sequential update yields:
   $$V_i(t_{\text{last}} + k + 1) = \lambda \cdot V_i(t_{\text{last}} + k) = \lambda \cdot \left(V_i(t_{\text{last}}) \cdot \lambda^k\right) = V_i(t_{\text{last}}) \cdot \lambda^{k+1}$$
4. Hence, $V_i(t) = V_i(t_{\text{last}}) \cdot \lambda^{t - t_{\text{last}}}$ holds for all $\Delta t \ge 1$. $\blacksquare$

### Refractory Boundary Handling
If the neuron spiked at $t_{\text{spike}} \le t_{\text{last}}$, its potential was reset to $V_{\text{reset}} = 0.0$ and clamped until $t_{\text{ref\_until}} = t_{\text{spike}} + R$.
If $t \le t_{\text{ref\_until}}$, the potential remains clamped:
$$V_i(t) = V_{\text{reset}} = 0.0$$
If $t > t_{\text{ref\_until}}$ and the neuron has been idle since refractory expiration:
$$V_i(t) = 0.0 \cdot \lambda^{t - t_{\text{ref\_until}}} = 0.0$$
Thus, dormant post-refractory neurons decay trivially to zero without requiring arithmetic computation.

---

## 8. Event-Driven Scheduler Architecture

The event-driven engine maintains state representations that decouple computational complexity from network size $N$:

```
┌──────────────────────────────────────────────────────────────────┐
│                   TIMESTEP t SCHEDULER CYCLE                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. POP MATURED SYNAPTIC EVENTS (t_delivery == t)                │
│     Extract from min-heap priority queue. Accumulate into        │
│     pending input buffers: incomingBuffer[targetId] += weight    │
│                                                                  │
│  2. GEOMETRIC STOCHASTIC SAMPLING                                │
│     Sample active external inputs via inverse transform.         │
│     incomingBuffer[sampledId] += externalCurrent                 │
│                                                                  │
│  3. ACTIVE NEURON SET IDENTIFICATION                             │
│     ActiveSet = { id | incomingBuffer[id] > 0 }                  │
│     (Dormant neurons with incomingBuffer == 0 are NOT visited)   │
│                                                                  │
│  4. LAZY EVALUATION FOR ACTIVE NEURONS                           │
│     For each i in ActiveSet:                                     │
│       a. Evaluate lazy decay: V_i(t) = V_i(t_last) * λ^(t-t_last)│
│       b. Check refractory status                                 │
│       c. If non-refractory: integrate inputBuffer[i]             │
│       d. Evaluate threshold: V_i(t) >= θ_i(t)                    │
│       e. If spike: schedule events for targets, reset V_i = 0    │
│       f. Update t_last = t                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

By restricting state updates to the active subset $\mathcal{V}_{\text{active}}(t) \subseteq \mathcal{V}$, computational complexity transitions from $\Theta(N)$ per step to:

$$\mathcal{O}\left(|\mathcal{V}_{\text{active}}(t)| + \sum_{j \in \text{Spikes}(t)} \text{deg}_{\text{out}}(j) \cdot \log |\mathcal{Q}|\right)$$

---

## 9. Adaptive Threshold Policy

To regulate network homeostatic balance and prevent runaway synchronization or quiescence, NEUROCORE incorporates an adaptive threshold mechanism:

$$\theta_i(t+1) = \begin{cases}
\min\left(\theta_i(t) + \alpha, \; \theta_{\text{max}}\right), & \text{if neuron } i \text{ spiked at } t \\
\max\left(\theta_i(t) - \beta, \; \theta_{\text{min}}\right), & \text{if neuron } i \text{ was silent at } t
\end{cases}$$

### Parameter Bounds
- Baseline threshold: $\theta_0 = 0.65$
- Adaptation increment: $\alpha = 0.05$
- Decay decrement: $\beta = 0.005$
- Rigid physiological bounds:
  $$\theta_i(t) \in [\theta_{\text{min}}, \theta_{\text{max}}] = [0.20, 1.10]$$

In global adaptive mode, the network threshold adjusts dynamically based on aggregate population firing rate relative to target band $\rho^* \in [0.08, 0.25]$.

---

## 10. Adaptive Temporal Binning Policy

When enabled, the adaptive temporal policy dynamically alters the simulation discretization step $\Delta t_{\text{eff}} \in \{1, 2\}$ based on network sparsity and event queue load:

$$\Delta t_{\text{eff}} = \begin{cases}
2, & \text{if } \sigma \ge 0.65 \text{ and } |\mathcal{Q}_t| < 0.1 \cdot |\mathcal{E}| \\
1, & \text{otherwise}
\end{cases}$$

### Characterization as an Approximation Policy
> [!IMPORTANT]
> Adaptive Temporal Binning is mathematically characterized as an **approximation policy**.
> By coalescing events across a 2-step window, it trades millisecond-precise spike timing for an approximate ~50% reduction in evaluation cycles. It is disabled by default during strict differential parity audits to ensure exact mathematical identity.

---

## 11. Rigorous Operation Counter Accounting

To eliminate ambiguous or inflated performance claims, NEUROCORE enforces strict definitions across all operation counters:

| Counter Name | Scope | Formal Mathematical Definition |
| :--- | :--- | :--- |
| `clockEvaluations` | Clock Mode Only | Total neuron loop iterations: $N \times T_{\text{steps}}$. Strictly **0** in Event Mode. |
| `neuronIntegrations` | Both Modes | Number of times non-refractory input current $I_i(t) > 0$ was accumulated into membrane potential. Refractory steps are excluded. |
| `lazyDecayEvaluations` | Event Mode Only | Number of closed-form multi-step decays evaluated: $V \cdot \lambda^{\Delta t}$ for $\Delta t \ge 1$. Strictly **0** in Clock Mode. |
| `thresholdEvaluations` | Both Modes | Total comparisons of membrane potential candidate $\tilde{V}_i(t)$ against $\theta_i(t)$. |
| `refractoryChecks` | Both Modes | Total evaluations checking whether $t \le t_i^{\text{ref\_until}}$. |
| `scheduledEvents` | Both Modes | Total synaptic events inserted into priority queue: $\sum_t \sum_j S_j(t) \cdot \text{deg}_{\text{out}}(j)$. |
| `deliveredEvents` | Both Modes | Total synaptic events extracted from queue and applied to post-synaptic buffers. |
| `pendingEvents` | Both Modes | Instantaneous count of events remaining in queue: $|\mathcal{Q}_t|$. |
| `queueOperations` | Both Modes | Total priority queue modifications: $\text{Insertions} + \text{Extractions}$. |

---

## 12. Numerical Precision & Floating-Point Tolerances

All potential integrations and decay operations utilize IEEE 754 double-precision binary floating-point arithmetic (64-bit float, 53-bit significand, machine epsilon $\varepsilon_{\text{mach}} \approx 2.22 \times 10^{-16}$).

### Analytical Deviation Characterization
In discrete mode, multi-step decay accumulates repeated multiplications:
$$\hat{V}_{\text{clock}}(t) = V_0 \prod_{s=1}^{\Delta t} \lambda \cdot (1 + \delta_s), \quad |\delta_s| \le \varepsilon_{\text{mach}} / 2$$

In event-driven mode, decay is evaluated via `Math.pow(lambda, deltaStep)`:
$$\hat{V}_{\text{event}}(t) = V_0 \cdot \lambda^{\Delta t} \cdot (1 + \delta_{\text{pow}})$$

Across 28,800 empirical step comparisons spanning leak factors $\lambda \in \{0.50, 0.70, 0.85, 0.95, 0.99\}$ and intervals up to 50 steps:
- Maximum observed absolute deviation: $\max |V_{\text{clock}} - V_{\text{event}}| \le 1.11 \times 10^{-16}$.
- Differential Parity Validation Tolerance: $\varepsilon = 1.0 \times 10^{-7}$.

---

## 13. Differential Parity Audit Methodology

To verify that the event-driven engine is a mathematically faithful realization of the discrete LIF model, the `verifyDifferentialParity()` audit protocol evaluates paired clock and event executions on identical seeds:

1. **Topology Parity:** Connection counts, source-target pairs, synaptic weights, and propagation delays must match identically:
   $$\mathcal{E}_{\text{clock}} \equiv \mathcal{E}_{\text{event}}$$
2. **External Input Sequence Parity:** Total stochastic input events generated across the entire duration must be identical:
   $$E_{\text{in, clock}} \equiv E_{\text{in, event}}$$
3. **Per-Neuron Spike Raster Parity:** Every neuron's spike timestamp vector must match exactly:
   $$\forall i \in \{0, \dots, N-1\}, \quad \text{Raster}_{\text{clock}}[i] \equiv \text{Raster}_{\text{event}}[i]$$
4. **Step-by-Step Membrane Trajectory Parity:** Continuous membrane potentials across every neuron at every timestep must satisfy:
   $$\forall i, \forall t, \quad |V_{\text{clock}}(i, t) - V_{\text{event}}(i, t)| \le 10^{-7}$$
5. **Synaptic Conservation Parity:** Scheduled and delivered event totals must match identically.

---

## 14. Statistical Methods & Experimental Methodology

Empirical benchmarking requires rigorous statistical treatment across repeated independent trials with distinct deterministic seeds:

### 1. Sample Mean ($\bar{x}$)
$$\bar{x} = \frac{1}{n} \sum_{i=1}^n x_i$$

### 2. Sample Standard Deviation ($s$) with Bessel's Correction
To guarantee an unbiased estimator of population variance, the denominator is strictly $n-1$:
$$s = \sqrt{\frac{1}{n-1} \sum_{i=1}^n (x_i - \bar{x})^2}$$
*(When $n < 2$, $s$ is formally reported as `null` / `N/A`).*

### 3. Paired Differences ($D_i$)
For paired trial $i$ sharing deterministic seed $\mathcal{S}_i$:
$$D_i = X_{\text{clock}, i} - X_{\text{event}, i}$$

### 4. Paired Percentage Reduction ($R_i$) with Zero-Denominator Protection
$$R_i = \begin{cases}
0.0\%, & \text{if } X_{\text{clock}, i} = 0 \text{ and } X_{\text{event}, i} = 0 \\
\text{undefined (excluded)}, & \text{if } X_{\text{clock}, i} = 0 \text{ and } X_{\text{event}, i} > 0 \\
\left(\frac{X_{\text{clock}, i} - X_{\text{event}, i}}{X_{\text{clock}, i}}\right) \times 100\%, & \text{if } X_{\text{clock}, i} > 0
\end{cases}$$

---

## 15. Confidence Interval Methodology (Student's t-Distribution)

Because benchmark repetitions typically evaluate sample sizes $n \in [5, 30]$, standard normal distribution ($z$) critical values underestimate interval width. NEUROCORE computes exact two-tailed 95% Confidence Intervals using the Student's t-distribution with $df = n - 1$ degrees of freedom:

$$\text{SEM} = \frac{s}{\sqrt{n}}$$
$$\text{Margin of Error} = t_{0.975, \, df} \times \text{SEM}$$
$$\text{CI}_{95\%} = \left[ \bar{x} - t_{0.975, \, df} \times \text{SEM}, \;\; \bar{x} + t_{0.975, \, df} \times \text{SEM} \right]$$

### Exact Critical Values Table ($df = 1$ to $30$)
The engine embeds the exact lookup table for $df \in [1, 100]$:
- $df=1: 12.706$
- $df=2: 4.303$
- $df=4: 2.776$
- $df=9: 2.262$
- $df=19: 2.093$
- $df=29: 2.045$

For $df > 100$, critical values are computed via the Cornish-Fisher asymptotic expansion converging to $z_{0.975} = 1.95996$.

---

## 16. Known Assumptions & Limitations

1. **Point-Neuron Assumption:** Neurons are modeled as single-compartment isopotential spheres without spatial dendritic morphology or continuous cable equations.
2. **Synchronous Discrete Time:** While event delivery is sparse, time advances in uniform increments $\Delta t$. Sub-millisecond continuous spike times are quantized to step boundaries.
3. **Floating-Point Non-Associativity:** Over extensive simulation horizons ($> 10^5$ steps), floating-point summation ordering differences could theoretically introduce minor divergence; within verified horizons (up to 1,000 steps), divergence remains $\le 10^{-15}$.
4. **Software Timing vs Hardware Energy:** Simulation runtimes are measured via browser `performance.now()`. NEUROCORE reports algorithmic complexity (evaluations, integrations, queue operations) rather than fabricating physical device energy (Joules) without physical hardware meters.
