/**
 * NEUROCORE Three.js 3D Neural Network Visualization
 * 
 * Provides immersive 3D neural network visualizations for the NEUROCORE platform.
 * Loaded as an ES module with Three.js from CDN via importmap.
 * All public API is attached to window.NeuroViz.
 * 
 * @module three-viz
 */

import * as THREE from 'three';
import { OrbitControls } from 'three-orbit-controls';

/* ════════════════════════════════════════════════════════════════════════════
   Constants & Palette
   ════════════════════════════════════════════════════════════════════════════ */

const COLORS = {
  active:     0x00D9FF,
  inactive:   0x2a4060,
  connection: 0x1a3550,
  particle:   0x00D9FF,
  violet:     0x8767FF,
};

const AUTO_ROTATE_SPEED   = 0.3;   // rad/s
const IDLE_RESUME_DELAY   = 3000;  // ms before auto-rotation resumes
const PARALLAX_STRENGTH   = 0.015;
const NEURON_RADIUS       = 0.35;
const NEURON_DETAIL       = 1;     // IcosahedronGeometry detail

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ════════════════════════════════════════════════════════════════════════════
   WebGL Detection
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Tests whether the browser supports WebGL.
 * @returns {boolean}
 */
function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

/**
 * Inserts a static SVG neural network placeholder into the container.
 * @param {HTMLElement} container
 */
function insertFallbackSVG(container) {
  const svg = `
  <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"
       style="width:100%;height:100%;opacity:0.5">
    <defs>
      <radialGradient id="ng">
        <stop offset="0%" stop-color="#00D9FF" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#2a4060" stop-opacity="0.6"/>
      </radialGradient>
    </defs>
    ${generateSVGLayers()}
  </svg>`;
  container.innerHTML = svg;
}

/** @returns {string} SVG markup for a simple layered neural net */
function generateSVGLayers() {
  const layers = [[60,100],[60,160],[60,220],[200,80],[200,140],[200,200],[200,260],[340,120],[340,180]];
  let lines = '';
  let circles = '';
  // Connect first layer to second
  for (let i = 0; i < 3; i++) {
    for (let j = 3; j < 7; j++) {
      lines += `<line x1="${layers[i][0]}" y1="${layers[i][1]}" x2="${layers[j][0]}" y2="${layers[j][1]}" stroke="#1a3550" stroke-width="1" opacity="0.5"/>`;
    }
  }
  // Connect second to third
  for (let i = 3; i < 7; i++) {
    for (let j = 7; j < 9; j++) {
      lines += `<line x1="${layers[i][0]}" y1="${layers[i][1]}" x2="${layers[j][0]}" y2="${layers[j][1]}" stroke="#1a3550" stroke-width="1" opacity="0.5"/>`;
    }
  }
  layers.forEach(([x, y]) => {
    circles += `<circle cx="${x}" cy="${y}" r="10" fill="url(#ng)"/>`;
  });
  return lines + circles;
}

/* ════════════════════════════════════════════════════════════════════════════
   VizInstance — Encapsulates one Three.js scene
   ════════════════════════════════════════════════════════════════════════════ */

class VizInstance {
  /**
   * @param {HTMLElement} container   DOM element to render into
   * @param {'hero'|'sim'} mode       Visualization mode
   */
  constructor(container, mode) {
    this.container = container;
    this.mode = mode;
    this.disposed = false;
    this.visible = true;
    this.animationId = null;
    this.idleTimer = null;
    this.userInteracting = false;
    this.clock = new THREE.Clock();

    /** @type {THREE.Mesh[]} */
    this.neurons = [];
    /** @type {{ line: THREE.Line, from: THREE.Mesh, to: THREE.Mesh, highlight: boolean }[]} */
    this.connections = [];
    /** @type {{ mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, t: number, speed: number }[]} */
    this.particles = [];

    this._mouseX = 0;
    this._mouseY = 0;
    this._cameraBase = new THREE.Vector3();

    this._init();
  }

  /* ── Setup ─────────────────────────────────────────────────────────── */

  _init() {
    const w = this.container.clientWidth  || 800;
    const h = this.container.clientHeight || 600;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const dist = this.mode === 'hero' ? 18 : 14;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(0, 2, dist);
    this._cameraBase.copy(this.camera.position);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    const point1 = new THREE.PointLight(COLORS.active, 1.2, 50);
    point1.position.set(5, 8, 10);
    const point2 = new THREE.PointLight(COLORS.violet, 0.6, 40);
    point2.position.set(-6, -4, 8);
    this.scene.add(ambient, point1, point2);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 30;
    this.controls.autoRotate = !REDUCED_MOTION;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED * (180 / Math.PI) * 0.1; // Three.js uses deg/s internally

    // Interaction tracking for auto-rotation pause/resume
    const onInteractStart = () => {
      this.userInteracting = true;
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
    };
    const onInteractEnd = () => {
      this.userInteracting = false;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (!REDUCED_MOTION && !this.disposed) {
          this.controls.autoRotate = true;
        }
      }, IDLE_RESUME_DELAY);
    };

    this.renderer.domElement.addEventListener('pointerdown', onInteractStart);
    this.renderer.domElement.addEventListener('pointerup', onInteractEnd);
    this.renderer.domElement.addEventListener('wheel', () => {
      onInteractStart();
      onInteractEnd();
    });

    // Parallax
    this._onMouseMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      this._mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      this._mouseY = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    };
    this.container.addEventListener('mousemove', this._onMouseMove);

    // Resize
    this._onResize = () => {
      if (this.disposed) return;
      const rw = this.container.clientWidth;
      const rh = this.container.clientHeight;
      if (rw === 0 || rh === 0) return;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', this._onResize);

    // IntersectionObserver — pause render when off-screen
    this._observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible && !this.animationId && !this.disposed) {
        this._animate();
      }
    }, { threshold: 0.05 });
    this._observer.observe(this.container);

    // Build the network
    this._buildNetwork();

    // Start render loop
    this._animate();
  }

  /* ── Network Construction ──────────────────────────────────────────── */

  _buildNetwork() {
    const neuronCount = this.mode === 'hero' ? 60 : 30;
    const layerCount  = this.mode === 'hero' ? 4  : 3;
    const spread      = this.mode === 'hero' ? 7  : 5;

    // Shared geometries
    this._neuronGeo = new THREE.IcosahedronGeometry(NEURON_RADIUS, NEURON_DETAIL);
    this._particleGeo = new THREE.SphereGeometry(0.06, 6, 6);

    // Distribute neurons across layers
    const layerCounts = this._distributePerLayer(neuronCount, layerCount);
    const layerSpacing = (spread * 2) / (layerCount - 1 || 1);

    let neuronIdx = 0;
    for (let l = 0; l < layerCount; l++) {
      const count = layerCounts[l];
      const x = -spread + l * layerSpacing;

      for (let n = 0; n < count; n++) {
        const angle = (n / count) * Math.PI * 2 + l * 0.5;
        const radius = spread * 0.4 + Math.random() * spread * 0.25;
        const y = Math.cos(angle) * radius * 0.6 + (Math.random() - 0.5) * 1.5;
        const z = Math.sin(angle) * radius * 0.6 + (Math.random() - 0.5) * 1.5;

        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.inactive,
          emissive: COLORS.inactive,
          emissiveIntensity: 0.15,
          roughness: 0.4,
          metalness: 0.3,
        });
        const mesh = new THREE.Mesh(this._neuronGeo, mat);
        mesh.position.set(x, y, z);
        mesh.userData = { layer: l, index: neuronIdx, baseEmissive: 0.15, active: false };
        this.scene.add(mesh);
        this.neurons.push(mesh);
        neuronIdx++;
      }
    }

    // Create connections between adjacent layers
    this._buildConnections(layerCounts);
  }

  /**
   * Distributes neuronCount across layerCount layers.
   * @param {number} total
   * @param {number} layers
   * @returns {number[]}
   */
  _distributePerLayer(total, layers) {
    const base = Math.floor(total / layers);
    const remainder = total % layers;
    const counts = Array(layers).fill(base);
    // Put extra neurons in the middle layers
    for (let i = 0; i < remainder; i++) {
      counts[Math.floor(layers / 2) + (i % 2 === 0 ? 0 : -1)] += 1;
    }
    return counts;
  }

  /**
   * Creates connections (lines) between neurons in adjacent layers.
   * @param {number[]} layerCounts
   */
  _buildConnections(layerCounts) {
    const connectionMat = new THREE.LineBasicMaterial({
      color: COLORS.connection,
      transparent: true,
      opacity: 0.5,
    });
    const highlightMat = new THREE.LineBasicMaterial({
      color: COLORS.violet,
      transparent: true,
      opacity: 0.4,
    });

    let offsetA = 0;
    for (let l = 0; l < layerCounts.length - 1; l++) {
      const countA = layerCounts[l];
      const countB = layerCounts[l + 1];
      const offsetB = offsetA + countA;

      for (let a = 0; a < countA; a++) {
        // Connect to a subset of next-layer neurons (keeps it readable)
        const connectTo = Math.min(countB, Math.max(2, Math.ceil(countB * 0.5)));
        const targets = this._pickRandom(countB, connectTo);

        for (const b of targets) {
          const nA = this.neurons[offsetA + a];
          const nB = this.neurons[offsetB + b];
          const isHighlight = Math.random() < 0.15;
          const mat = isHighlight ? highlightMat.clone() : connectionMat.clone();

          const geometry = new THREE.BufferGeometry().setFromPoints([
            nA.position, nB.position,
          ]);
          const line = new THREE.Line(geometry, mat);
          this.scene.add(line);
          this.connections.push({ line, from: nA, to: nB, highlight: isHighlight });

          // Create a travelling particle for this connection
          if (!REDUCED_MOTION && Math.random() < 0.35) {
            this._addParticle(nA.position, nB.position, isHighlight);
          }
        }
      }
      offsetA += countA;
    }
  }

  /**
   * Picks `count` unique random indices from [0, total).
   * @param {number} total
   * @param {number} count
   * @returns {number[]}
   */
  _pickRandom(total, count) {
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, count);
  }

  /**
   * Adds a spike-propagation particle along a connection.
   * @param {THREE.Vector3} from
   * @param {THREE.Vector3} to
   * @param {boolean} highlight
   */
  _addParticle(from, to, highlight) {
    const mat = new THREE.MeshBasicMaterial({
      color: highlight ? COLORS.violet : COLORS.particle,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(this._particleGeo, mat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      t: Math.random(),              // start at random phase
      speed: 0.15 + Math.random() * 0.2,
    });
  }

  /* ── Animation Loop ────────────────────────────────────────────────── */

  _animate() {
    if (this.disposed) return;
    if (!this.visible) {
      this.animationId = null;
      return;
    }

    this.animationId = requestAnimationFrame(() => this._animate());
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Update controls
    this.controls.update();

    // Parallax offset
    if (!this.userInteracting) {
      this.camera.position.x = this._cameraBase.x + this._mouseX * PARALLAX_STRENGTH * this._cameraBase.z;
      this.camera.position.y = this._cameraBase.y - this._mouseY * PARALLAX_STRENGTH * this._cameraBase.z;
    }

    // Neuron pulsation
    for (const neuron of this.neurons) {
      const ud = neuron.userData;
      if (ud.active) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4 + ud.index * 0.7);
        neuron.material.emissiveIntensity = 0.4 + pulse * 0.6;
        neuron.scale.setScalar(1.0 + pulse * 0.12);
      } else {
        // Subtle ambient pulse for inactive neurons
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.5 + ud.index * 0.4);
        neuron.material.emissiveIntensity = ud.baseEmissive + pulse * 0.05;
        neuron.scale.setScalar(1.0);
      }
    }

    // Particle propagation
    if (!REDUCED_MOTION) {
      for (const p of this.particles) {
        p.t += p.speed * dt;
        if (p.t > 1) p.t -= 1;
        p.mesh.position.lerpVectors(p.from, p.to, p.t);
        p.mesh.material.opacity = 0.3 + 0.55 * Math.sin(p.t * Math.PI);
      }
    }

    // Hero mode: randomly flash neurons
    if (this.mode === 'hero') {
      if (Math.random() < 0.02) {
        const idx = Math.floor(Math.random() * this.neurons.length);
        this._flashNeuron(idx, true);
        setTimeout(() => this._flashNeuron(idx, false), 400 + Math.random() * 600);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Activate or deactivate a neuron visually.
   * @param {number} idx
   * @param {boolean} active
   */
  _flashNeuron(idx, active) {
    if (idx < 0 || idx >= this.neurons.length || this.disposed) return;
    const n = this.neurons[idx];
    n.userData.active = active;
    n.material.color.set(active ? COLORS.active : COLORS.inactive);
    n.material.emissive.set(active ? COLORS.active : COLORS.inactive);
  }

  /* ── Public: Update sim neurons ────────────────────────────────────── */

  /**
   * Updates neuron visuals based on simulation state.
   * @param {{ potentials: number[], spiked: number[], active: number[] }} states
   */
  updateNeurons(states) {
    if (this.disposed || this.mode !== 'sim') return;
    const { potentials = [], spiked = [], active = [] } = states;

    // Build lookup sets for quick access
    const spikedSet = new Set(spiked);
    const activeSet = new Set(active);

    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      if (spikedSet.has(i)) {
        // Spiking — bright flash
        n.userData.active = true;
        n.material.color.set(0xffffff);
        n.material.emissive.set(COLORS.active);
        n.material.emissiveIntensity = 1.0;
        n.scale.setScalar(1.25);
      } else if (activeSet.has(i)) {
        n.userData.active = true;
        n.material.color.set(COLORS.active);
        n.material.emissive.set(COLORS.active);
      } else {
        n.userData.active = false;
        n.material.color.set(COLORS.inactive);
        n.material.emissive.set(COLORS.inactive);
      }

      // Map membrane potential to emissive intensity for active neurons
      if (potentials[i] !== undefined && !spikedSet.has(i)) {
        const v = Math.max(0, Math.min(1, potentials[i]));
        n.material.emissiveIntensity = 0.1 + v * 0.6;
        // Lerp color from inactive toward active based on potential
        n.material.color.set(COLORS.inactive).lerp(new THREE.Color(COLORS.active), v * 0.6);
        n.material.emissive.set(COLORS.inactive).lerp(new THREE.Color(COLORS.active), v * 0.6);
      }
    }
  }

  /* ── Public: Reset Camera ──────────────────────────────────────────── */

  /** Smoothly resets camera to its default position. */
  resetCamera() {
    if (this.disposed) return;
    const target = this._cameraBase.clone();
    const start = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let t = 0;

    const step = () => {
      if (this.disposed) return;
      t += 0.03;
      if (t >= 1) {
        this.camera.position.copy(target);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        return;
      }
      const ease = t * t * (3 - 2 * t); // smoothstep
      this.camera.position.lerpVectors(start, target, ease);
      this.controls.target.lerpVectors(startTarget, new THREE.Vector3(0, 0, 0), ease);
      this.controls.update();
      requestAnimationFrame(step);
    };
    step();
  }

  /* ── Dispose ───────────────────────────────────────────────────────── */

  /** Fully disposes all Three.js resources and DOM elements. */
  dispose() {
    this.disposed = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    clearTimeout(this.idleTimer);

    // Remove event listeners
    window.removeEventListener('resize', this._onResize);
    this.container.removeEventListener('mousemove', this._onMouseMove);

    // IntersectionObserver
    this._observer?.disconnect();

    // Dispose controls
    this.controls?.dispose();

    // Dispose scene objects
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Dispose shared geometries
    this._neuronGeo?.dispose();
    this._particleGeo?.dispose();

    // Dispose renderer
    this.renderer?.dispose();

    // Remove canvas
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this.neurons = [];
    this.connections = [];
    this.particles = [];
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   Module-level state
   ════════════════════════════════════════════════════════════════════════════ */

/** @type {VizInstance|null} */
let heroViz = null;
/** @type {VizInstance|null} */
let simViz = null;

/* ════════════════════════════════════════════════════════════════════════════
   Public API — attached to window.NeuroViz
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Initializes the hero section 3D neural network visualization.
 * Creates a large, decorative neural network with ~60 neurons that
 * auto-rotates and features ambient spike activity.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @returns {VizInstance|null} The viz instance, or null if WebGL is unavailable
 */
function initHeroViz(container) {
  if (!container) {
    console.warn('[NeuroViz] initHeroViz: no container provided');
    return null;
  }
  if (!hasWebGL()) {
    insertFallbackSVG(container);
    return null;
  }
  if (heroViz) heroViz.dispose();
  heroViz = new VizInstance(container, 'hero');
  return heroViz;
}

/**
 * Initializes the simulation lab 3D neural network visualization.
 * Creates a tighter network with ~30 neurons, designed to reflect
 * real-time simulation data via updateSimViz().
 *
 * @param {HTMLElement} container - DOM element to render into
 * @returns {VizInstance|null} The viz instance, or null if WebGL is unavailable
 */
function initSimViz(container) {
  if (!container) {
    console.warn('[NeuroViz] initSimViz: no container provided');
    return null;
  }
  if (!hasWebGL()) {
    insertFallbackSVG(container);
    return null;
  }
  if (simViz) simViz.dispose();
  simViz = new VizInstance(container, 'sim');
  return simViz;
}

/**
 * Updates the simulation visualization with new neuron state data.
 * Has no effect if the sim viz has not been initialized.
 *
 * @param {{ potentials: number[], spiked: number[], active: number[] }} neuronStates
 *   - potentials: membrane potential for each neuron (0–1 normalized)
 *   - spiked: array of neuron indices that fired this timestep
 *   - active: array of neuron indices that are currently above resting threshold
 */
function updateSimViz(neuronStates) {
  if (!simViz) return;
  simViz.updateNeurons(neuronStates);
}

/**
 * Resets the camera to its default position for both hero and sim
 * visualizations, if they are active.
 */
function resetCamera() {
  heroViz?.resetCamera();
  simViz?.resetCamera();
}

/**
 * Disposes all active Three.js visualizations and frees GPU resources.
 * Call this when navigating away from pages with 3D content.
 */
function disposeViz() {
  if (heroViz) {
    heroViz.dispose();
    heroViz = null;
  }
  if (simViz) {
    simViz.dispose();
    simViz = null;
  }
}

/* ── Attach to window ────────────────────────────────────────────────── */

window.NeuroViz = {
  initHeroViz,
  initSimViz,
  updateSimViz,
  resetCamera,
  disposeViz,
};

try {
  window.dispatchEvent(new CustomEvent('neuroviz-ready'));
} catch (e) {
  // ignore in non-browser envs
}

export { initHeroViz, initSimViz, updateSimViz, resetCamera, disposeViz };
