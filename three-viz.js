/**
 * NEUROCORE Three.js 3D Neural Network Visualization (v2.1.1)
 * 
 * Provides unified, organic 3D neuromorphic network visualizations for:
 * 1. Hero section: Organized cortical clusters with intentional synaptic pathways
 *    and sparse event-driven spike propagation.
 * 2. Simulation Lab: Volumetric, multi-layered 3D SNN mesh with asymmetric spatial
 *    topology, curated vs full vs active connectivity modes, curved axonal pathways,
 *    crisp rim lighting, interactive raycast inspection, and intelligent camera framing.
 * 
 * Loaded as an ES module with Three.js and OrbitControls from CDN via importmap.
 * All public API is attached to window.NeuroViz.
 * 
 * @module three-viz
 */

import * as THREE from 'three';
import { OrbitControls } from 'three-orbit-controls';

/* ════════════════════════════════════════════════════════════════════════════
   Constants & Scientific Neuromorphic Palette
   ════════════════════════════════════════════════════════════════════════════ */

const COLORS = {
  active:           0x00D9FF, // Electric cyan (spiking)
  activeGlow:       0x00FFFF, // High-intensity spike core
  turquoise:        0x00E0B8, // Turquoise indicator (depolarizing)
  blue:             0x328BFF, // Signal blue
  violet:           0x8767FF, // Secondary violet (recurrent / feedback)
  inactive:         0x1D3752, // Visible deep slate-cyan body (resting)
  inactiveEmissive: 0x0C2C46, // Soft phosphorescent resting glow
  inactiveEdge:     0x284360, // Wireframe edge
  connection:       0x0E2438, // Rest synapse (uncurated background)
  connCurated:      0x19456B, // Curated synapse rest
  connActive:       0x00D9FF, // Active transmitting synapse
  connViolet:       0x8767FF, // Active recurrent synapse
  particle:         0x00D9FF, // Spike particle
};

const AUTO_ROTATE_SPEED = 0.35; // subtle, slow rotation
const IDLE_RESUME_DELAY = 3500; // ms before auto-rotation resumes
const PARALLAX_STRENGTH = 0.012;
const REDUCED_MOTION    = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ════════════════════════════════════════════════════════════════════════════
   WebGL Detection & Graceful Fallback
   ════════════════════════════════════════════════════════════════════════════ */

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

function insertFallbackSVG(container) {
  const svg = `
  <svg viewBox="0 0 500 350" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;opacity:0.65">
    <defs>
      <radialGradient id="ng" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#00D9FF" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#0A1828" stop-opacity="0.4"/>
      </radialGradient>
      <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00D9FF" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#8767FF" stop-opacity="0.2"/>
      </linearGradient>
    </defs>
    <path d="M 80 160 Q 140 120 200 140 T 320 180" stroke="url(#sg)" stroke-width="1.2" fill="none"/>
    <path d="M 120 200 Q 220 240 340 210" stroke="url(#sg)" stroke-width="1" fill="none"/>
    <circle cx="80" cy="160" r="9" fill="url(#ng)"/>
    <circle cx="140" cy="120" r="7" fill="url(#ng)"/>
    <circle cx="200" cy="140" r="11" fill="url(#ng)"/>
    <circle cx="260" cy="190" r="8" fill="url(#ng)"/>
    <circle cx="340" cy="170" r="10" fill="url(#ng)"/>
    <circle cx="420" cy="150" r="8" fill="url(#ng)"/>
  </svg>`;
  container.innerHTML = svg;
}

/* ════════════════════════════════════════════════════════════════════════════
   VizInstance — Unified Neuromorphic 3D Scene
   ════════════════════════════════════════════════════════════════════════════ */

class VizInstance {
  /**
   * @param {HTMLElement} container DOM container
   * @param {'hero'|'sim'} mode 'hero' or 'sim'
   * @param {object} [initialTopology=null]
   */
  constructor(container, mode, initialTopology = null) {
    this.container = container;
    this.mode = mode;
    this._initialTopology = initialTopology;
    this.disposed = false;
    this.visible = true;
    this.paused = false;
    this.animationId = null;
    this.idleTimer = null;
    this.userInteracting = false;
    this.clock = new THREE.Clock();

    /** @type {'curated'|'full'|'active'} */
    this.connectivityMode = 'curated';
    /** @type {function(number):void|null} */
    this.onSelectNeuron = null;

    /** @type {THREE.Mesh[]} */
    this.neurons = [];
    /** @type {Array<object>} */
    this.connections = [];
    /** @type {Map<number, Array<object>>} */
    this._outgoingMap = new Map();
    /** @type {Map<number, Array<object>>} */
    this._incomingMap = new Map();
    /** @type {Array<object>} */
    this.particles = [];

    this._mouseX = 0;
    this._mouseY = 0;
    this._cameraBase = new THREE.Vector3();
    this._targetBase = new THREE.Vector3(0, 0, 0);
    this._particlePool = [];

    // Raycasting & Tooltip State
    this.raycaster = new THREE.Raycaster();
    this.mouseNDC = new THREE.Vector2(-999, -999);
    this._pointerScreenX = 0;
    this._pointerScreenY = 0;
    this.hoveredNeuron = null;
    this._tooltipEl = null;

    this._init();
  }

  /* ── Setup ─────────────────────────────────────────────────────────── */

  _init() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const dist = this.mode === 'hero' ? 17 : 14.5;
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    this.camera.position.set(0, 0.4, dist);
    this._cameraBase.copy(this.camera.position);

    // Studio Scientific Lighting
    // Ambient light: dual-component white and cool slate fill
    const ambientWhite = new THREE.AmbientLight(0xffffff, 0.35);
    const ambientBlue = new THREE.AmbientLight(0x102844, 0.7);

    // Directional Key Light from front-top-right
    const keyLight = new THREE.DirectionalLight(0xe8f4ff, 1.25);
    keyLight.position.set(12, 14, 16);

    // Dedicated Rim Light from behind: creates crisp cyan silhouettes against dark background
    const rimLight = new THREE.PointLight(COLORS.active, 2.2, 55);
    rimLight.position.set(0, 8, -14);

    // Soft Violet Fill from lower-left
    const fillViolet = new THREE.PointLight(COLORS.violet, 1.1, 45);
    fillViolet.position.set(-14, -8, 8);

    // Turquoise Side Accent from lower-right
    const fillTurquoise = new THREE.PointLight(COLORS.turquoise, 0.9, 45);
    fillTurquoise.position.set(14, -6, 8);

    this.scene.add(ambientWhite, ambientBlue, keyLight, rimLight, fillViolet, fillTurquoise);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 32;
    this.controls.autoRotate = !REDUCED_MOTION;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED * (180 / Math.PI) * 0.12;

    let isDragging = false;
    let downPos = { x: 0, y: 0 };

    const onInteractStart = (e) => {
      this.userInteracting = true;
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
      if (e) downPos = { x: e.clientX, y: e.clientY };
      isDragging = false;
    };

    const onInteractEnd = () => {
      this.userInteracting = false;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (!REDUCED_MOTION && !this.disposed && !this.paused) {
          this.controls.autoRotate = true;
        }
      }, IDLE_RESUME_DELAY);
    };

    this.renderer.domElement.addEventListener('pointerdown', onInteractStart);
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      onInteractEnd();
      if (!isDragging && this.mode === 'sim') {
        if (this.hoveredNeuron) {
          const id = this.hoveredNeuron.userData.id;
          if (typeof this.onSelectNeuron === 'function') {
            this.onSelectNeuron(id);
          }
          window.dispatchEvent(new CustomEvent('neurocore-select-neuron', { detail: { id } }));
        }
      }
    });

    this.renderer.domElement.addEventListener('wheel', () => {
      onInteractStart();
      onInteractEnd();
    }, { passive: true });

    // Pointer Tracking for Parallax & Raycaster Tooltip
    this._onPointerMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this._mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      this._mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

      this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._pointerScreenX = e.clientX - rect.left;
      this._pointerScreenY = e.clientY - rect.top;

      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) {
        isDragging = true;
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
      }
    };
    this.container.addEventListener('pointermove', this._onPointerMove, { passive: true });

    this._onPointerLeave = () => {
      this.mouseNDC.set(-999, -999);
      if (this.hoveredNeuron) {
        if (!this.hoveredNeuron.userData.active) {
          this.hoveredNeuron.scale.setScalar(this.hoveredNeuron.userData.baseScale || 1.0);
        }
        this.hoveredNeuron = null;
      }
      if (this._tooltipEl) this._tooltipEl.style.display = 'none';
    };
    this.container.addEventListener('pointerleave', this._onPointerLeave, { passive: true });

    // Responsive Resize & Frame Fitting
    this._onResize = () => {
      if (this.disposed) return;
      const rw = this.container.clientWidth;
      const rh = this.container.clientHeight;
      if (rw === 0 || rh === 0) return;
      this.camera.aspect = rw / rh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(rw, rh);
      if (this.mode === 'sim' && !this.userInteracting) {
        this.fitCameraToTopology(false);
      }
    };
    window.addEventListener('resize', this._onResize);

    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      this._resizeObserver.observe(this.container);
    }

    // IntersectionObserver (pause rendering when container scrolled out of view)
    this._observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible && !this.animationId && !this.disposed && !this.paused) {
        this._animate();
      }
    }, { threshold: 0.05 });
    this._observer.observe(this.container);

    // Initialize Tooltip DOM element
    this._initTooltip();

    // Build initial network
    this._buildOrganizedNetwork();

    // Start render loop
    this._animate();
  }

  /* ── Tooltip Element Initialization ─────────────────────────────────── */

  _initTooltip() {
    let tip = this.container.querySelector('.sim-3d-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'sim-3d-tooltip';
      this.container.appendChild(tip);
    }
    this._tooltipEl = tip;
  }

  /* ── Network Construction ───────────────────────────────────────────── */

  _buildOrganizedNetwork() {
    // Shared geometries
    this._neuronGeoLow = new THREE.IcosahedronGeometry(0.30, 1);
    this._neuronGeoMid = new THREE.IcosahedronGeometry(0.40, 2);
    this._neuronGeoHigh = new THREE.IcosahedronGeometry(0.52, 2);
    this._particleGeo = new THREE.SphereGeometry(0.08, 8, 8);

    if (this.mode === 'hero') {
      this._buildHeroClusteredTopology();
    } else {
      this._buildSimLabTopology(this._initialTopology);
    }
  }

  /**
   * Hero Section: 4 organized cortical functional clusters with intentional synaptic pathways.
   */
  _buildHeroClusteredTopology() {
    const clusters = [
      { id: 0, center: new THREE.Vector3(-4.5, 0.8, -1.0), count: 12, radius: 2.2 },
      { id: 1, center: new THREE.Vector3(-0.8, 1.8, 1.2),  count: 16, radius: 2.6 },
      { id: 2, center: new THREE.Vector3(0.5, -2.0, -0.5), count: 14, radius: 2.4 },
      { id: 3, center: new THREE.Vector3(4.2, 0.2, 0.8),   count: 14, radius: 2.2 },
    ];

    let globalIndex = 0;
    const clusterNodes = [[], [], [], []];

    clusters.forEach((cl, cIdx) => {
      for (let i = 0; i < cl.count; i++) {
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * cl.radius;

        const pos = new THREE.Vector3(
          cl.center.x + r * Math.sin(phi) * Math.cos(theta),
          cl.center.y + r * Math.sin(phi) * Math.sin(theta) * 0.85,
          cl.center.z + r * Math.cos(phi) * 0.9
        );

        const isHub = i === 0 || i === 1;
        const geo = isHub ? this._neuronGeoHigh : (i % 3 === 0 ? this._neuronGeoMid : this._neuronGeoLow);
        const baseRadius = isHub ? 0.52 : (i % 3 === 0 ? 0.40 : 0.30);

        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.inactive,
          emissive: COLORS.inactiveEmissive,
          emissiveIntensity: 0.28,
          roughness: 0.28,
          metalness: 0.25,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = {
          id: globalIndex,
          clusterId: cIdx,
          isHub,
          baseRadius,
          baseScale: 1.0,
          baseEmissive: 0.28,
          active: false,
          activationTimer: 0,
        };

        this.scene.add(mesh);
        this.neurons.push(mesh);
        clusterNodes[cIdx].push(mesh);
        globalIndex++;
      }
    });

    // Clean intra-cluster connections
    clusterNodes.forEach((nodes) => {
      nodes.forEach((nA) => {
        const neighbors = nodes
          .filter(nB => nB !== nA)
          .map(nB => ({ node: nB, dist: nA.position.distanceTo(nB.position) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2);

        neighbors.forEach(({ node: nB, dist }) => {
          if (nA.userData.id < nB.userData.id && dist < 3.2) {
            this._addSynapticConnection(nA, nB, false, 0.5);
          }
        });
      });
    });

    // Inter-cluster bridges
    const clusterPairs = [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3]];
    clusterPairs.forEach(([cA, cB]) => {
      const listA = clusterNodes[cA];
      const listB = clusterNodes[cB];
      const bridges = [];
      listA.forEach(nA => {
        listB.forEach(nB => {
          bridges.push({ nA, nB, dist: nA.position.distanceTo(nB.position) });
        });
      });
      bridges.sort((a, b) => a.dist - b.dist);
      bridges.slice(0, 2).forEach(({ nA, nB }) => {
        this._addSynapticConnection(nA, nB, true, 0.85);
      });
    });

    // Ambient spike particles
    this.connections.forEach((conn) => {
      if (Math.random() < 0.4) {
        this._addTravelingParticle(conn.from.position, conn.to.position, conn.highlight, conn.to);
      }
    });
  }

  /**
   * Rebuilds Simulation Lab topology dynamically with actual engine neuron count and connections.
   * @param {object} [topology=null]
   */
  setTopology(topology) {
    if (this.disposed || this.mode !== 'sim') return;
    this._initialTopology = topology;
    this._buildSimLabTopology(topology);
  }

  /**
   * Thorough resource cleanup before rebuilding scene objects.
   */
  _clearSceneObjects() {
    this.neurons.forEach(n => {
      this.scene.remove(n);
      n.geometry?.dispose();
      n.material?.dispose();
    });
    this.neurons = [];

    this.connections.forEach(c => {
      this.scene.remove(c.line);
      c.line.geometry?.dispose();
      c.mat?.dispose();
    });
    this.connections = [];

    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    });
    this.particles = [];

    this._outgoingMap.clear();
    this._incomingMap.clear();

    if (this.hoveredNeuron) this.hoveredNeuron = null;
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  /**
   * Simulation Lab Topology: Asymmetric volumetric 3D neural structure mapped directly
   * to the actual SNN simulation engine.
   * 
   * Spatial Layout:
   * - Sensory / Input Layer: Lower-left anterior crescent (X: -4.6, Y: -1.7, Z: 1.2)
   * - Associative Neuromorphic Core: Elevated, deep central cortical dome (X: 0.2, Y: 1.9, Z: -1.4)
   * - Spike Output Hub: Right mid-anterior descending hub (X: 4.6, Y: -1.0, Z: 1.2)
   * 
   * @param {object} [topology=null]
   */
  _buildSimLabTopology(topology = null) {
    this._clearSceneObjects();

    const count = topology?.neuronCount || 48;
    const connections = topology?.connections || [];

    // Scale factors tuned across 12 - 96 neurons to maintain visual breathing room
    const countScale = Math.max(0.78, Math.min(1.22, Math.pow(48 / count, 0.26)));
    const spatialSpread = Math.max(1.0, Math.min(1.36, Math.pow(count / 36, 0.24)));

    // Cluster distribution percentages
    const nSensory = Math.max(2, Math.floor(count * 0.28));
    const nOutput = Math.max(2, Math.floor(count * 0.24));
    const nCore = count - nSensory - nOutput;

    // Asymmetric Volumetric Cluster Anchors
    const clusterDef = [
      {
        name: 'Sensory Input Layer',
        shortName: 'SENSORY',
        center: new THREE.Vector3(-4.6 * spatialSpread, -1.7, 1.2 * spatialSpread),
        count: nSensory,
        radius: 2.1 * countScale,
        radiiScale: new THREE.Vector3(0.9, 1.15, 0.85),
      },
      {
        name: 'Associative Neuromorphic Core',
        shortName: 'CORE',
        center: new THREE.Vector3(0.2, 1.9 * spatialSpread, -1.4 * spatialSpread),
        count: nCore,
        radius: 2.8 * countScale,
        radiiScale: new THREE.Vector3(1.25, 0.95, 1.15),
      },
      {
        name: 'Spike Output Projection Hub',
        shortName: 'OUTPUT',
        center: new THREE.Vector3(4.6 * spatialSpread, -1.0, 1.2 * spatialSpread),
        count: nOutput,
        radius: 2.0 * countScale,
        radiiScale: new THREE.Vector3(0.95, 1.05, 0.9),
      },
    ];

    // Compute synaptic in/out degrees and weight sums from actual engine topology
    const inDegrees = new Array(count).fill(0);
    const outDegrees = new Array(count).fill(0);
    const weightSums = new Array(count).fill(0);
    connections.forEach(c => {
      if (c.sourceId < count && c.targetId < count) {
        outDegrees[c.sourceId]++;
        inDegrees[c.targetId]++;
        weightSums[c.sourceId] += c.weight;
      }
    });

    let globalIndex = 0;
    const clusterNodes = [[], [], []];

    clusterDef.forEach((cl, cIdx) => {
      for (let i = 0; i < cl.count; i++) {
        const id = globalIndex;
        // Deterministic spherical golden spiral for organic volume distribution
        const phi = Math.acos(1 - 2 * (i + 0.5) / cl.count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        // Multi-layered radial shell: inner core (0.38) to outer mantle (1.0)
        const rFrac = 0.38 + 0.62 * Math.cbrt((i + 1) / cl.count);
        const r = rFrac * cl.radius;

        const dx = r * Math.sin(phi) * Math.cos(theta) * cl.radiiScale.x;
        const dy = r * Math.sin(phi) * Math.sin(theta) * cl.radiiScale.y;
        const dz = r * Math.cos(phi) * cl.radiiScale.z;

        // Subtle biological arch curvature linking clusters
        const archBend = (cIdx === 0) ? (dx * 0.18) : (cIdx === 1 ? -Math.abs(dx) * 0.12 : -dx * 0.15);

        const pos = new THREE.Vector3(
          cl.center.x + dx,
          cl.center.y + dy + archBend,
          cl.center.z + dz
        );

        // Hierarchical neuron sizing
        const isHub = i === 0 || (outDegrees[id] >= 6 && i < 3);
        const isInterneuron = i % 2 !== 0 && !isHub;

        let nodeRadius;
        let geo;
        if (isHub) {
          nodeRadius = 0.52 * countScale;
          geo = this._neuronGeoHigh;
        } else if (isInterneuron) {
          nodeRadius = 0.30 * countScale;
          geo = this._neuronGeoLow;
        } else {
          nodeRadius = 0.40 * countScale;
          geo = this._neuronGeoMid;
        }

        // Visible deep slate-cyan body with phosphorescent inner glow & rim reflection
        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.inactive,
          emissive: COLORS.inactiveEmissive,
          emissiveIntensity: 0.28,
          roughness: 0.28,
          metalness: 0.25,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.scale.setScalar(countScale);

        mesh.userData = {
          id,
          clusterId: cIdx,
          clusterName: cl.name,
          clusterShort: cl.shortName,
          isHub,
          baseRadius: nodeRadius,
          baseScale: countScale,
          baseEmissive: 0.28,
          active: false,
          activationTimer: 0,
          inDegree: inDegrees[id],
          outDegree: outDegrees[id],
          avgWeight: outDegrees[id] > 0 ? (weightSums[id] / outDegrees[id]) : 0,
          spikeCount: 0,
          potential: 0.0,
        };

        this.scene.add(mesh);
        this.neurons.push(mesh);
        clusterNodes[cIdx].push(mesh);
        globalIndex++;
      }
    });

    // Build curated connectivity subset
    const outgoingByNeuron = new Map();
    connections.forEach(conn => {
      if (!outgoingByNeuron.has(conn.sourceId)) outgoingByNeuron.set(conn.sourceId, []);
      outgoingByNeuron.get(conn.sourceId).push(conn);
    });

    const curatedSet = new Set();
    outgoingByNeuron.forEach((conns, srcId) => {
      const sorted = conns.slice().sort((a, b) => b.weight - a.weight);
      const isHubNode = this.neurons[srcId]?.userData.isHub;
      const keepCount = isHubNode ? Math.min(3, sorted.length) : Math.min(2, sorted.length);
      for (let k = 0; k < keepCount; k++) {
        curatedSet.add(`${sorted[k].sourceId}->${sorted[k].targetId}`);
      }
      // Preserve important inter-cluster pathways (weight > 0.35)
      sorted.forEach(c => {
        const srcCl = this.neurons[c.sourceId]?.userData.clusterId;
        const tgtCl = this.neurons[c.targetId]?.userData.clusterId;
        if (srcCl !== tgtCl && c.weight > 0.35) {
          curatedSet.add(`${c.sourceId}->${c.targetId}`);
        }
      });
    });

    // Build actual directed synaptic connection lines
    if (connections.length > 0) {
      connections.forEach(conn => {
        const nA = this.neurons[conn.sourceId];
        const nB = this.neurons[conn.targetId];
        if (!nA || !nB) return;

        const connKey = `${conn.sourceId}->${conn.targetId}`;
        const isCurated = curatedSet.has(connKey);
        const isFeedback = conn.sourceId >= conn.targetId;
        const isInterCluster = nA.userData.clusterId !== nB.userData.clusterId;
        const dist = nA.position.distanceTo(nB.position);

        // Smooth Quadratic Bezier Curves for long-range / inter-cluster axons
        let geom;
        let curve = null;
        if (isInterCluster || dist > 3.2) {
          const mid = new THREE.Vector3().addVectors(nA.position, nB.position).multiplyScalar(0.5);
          const archNormal = isFeedback
            ? new THREE.Vector3(0, 1.2, -0.8)
            : new THREE.Vector3(0, 0.8, 0.6);
          const ctrl = mid.add(archNormal.multiplyScalar(Math.min(dist * 0.22, 1.6)));
          curve = new THREE.QuadraticBezierCurve3(nA.position, ctrl, nB.position);
          const points = curve.getPoints(14);
          geom = new THREE.BufferGeometry().setFromPoints(points);
        } else {
          geom = new THREE.BufferGeometry().setFromPoints([nA.position, nB.position]);
        }

        const highlight = conn.weight > 0.45 || isFeedback;
        const baseColor = isFeedback ? COLORS.connViolet : (highlight ? COLORS.connCurated : COLORS.connection);
        const baseOpacity = isFeedback ? 0.28 : (isCurated ? 0.18 : 0.08);

        const mat = new THREE.LineBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: baseOpacity,
          linewidth: 1,
        });

        const line = new THREE.Line(geom, mat);
        if (this.connectivityMode === 'curated') {
          line.visible = isCurated;
        } else if (this.connectivityMode === 'active') {
          line.visible = false;
        } else {
          line.visible = true;
        }

        this.scene.add(line);

        const connObj = {
          line,
          mat,
          curve,
          from: nA,
          to: nB,
          sourceId: conn.sourceId,
          targetId: conn.targetId,
          weight: conn.weight,
          delay: conn.delay,
          isCurated,
          isFeedback,
          highlight,
          baseColor,
          baseOpacity,
          activeTimer: 0,
        };

        this.connections.push(connObj);

        if (!this._outgoingMap.has(conn.sourceId)) this._outgoingMap.set(conn.sourceId, []);
        this._outgoingMap.get(conn.sourceId).push(connObj);

        if (!this._incomingMap.has(conn.targetId)) this._incomingMap.set(conn.targetId, []);
        this._incomingMap.get(conn.targetId).push(connObj);
      });
    }

    // Intelligently fit camera to new volumetric topology
    this.fitCameraToTopology(false);

    // Update HUD overlays
    this._updateHUDTags();
  }

  /**
   * Helper to create fallback connection line
   */
  _addSynapticConnection(nA, nB, highlight, weight = 0.5) {
    const mat = new THREE.LineBasicMaterial({
      color: highlight ? COLORS.connViolet : COLORS.connection,
      transparent: true,
      opacity: highlight ? 0.35 : 0.18,
      linewidth: 1,
    });

    const geometry = new THREE.BufferGeometry().setFromPoints([nA.position, nB.position]);
    const line = new THREE.Line(geometry, mat);
    this.scene.add(line);
    const connObj = {
      line,
      mat,
      curve: null,
      from: nA,
      to: nB,
      sourceId: nA.userData.id,
      targetId: nB.userData.id,
      highlight,
      weight,
      isCurated: true,
      isFeedback: false,
      baseColor: highlight ? COLORS.connViolet : COLORS.connection,
      baseOpacity: highlight ? 0.35 : 0.18,
      activeTimer: 0,
    };
    this.connections.push(connObj);

    if (!this._outgoingMap.has(nA.userData.id)) {
      this._outgoingMap.set(nA.userData.id, []);
    }
    this._outgoingMap.get(nA.userData.id).push(connObj);
  }

  /**
   * Adds an animated pulse particle along a synaptic pathway.
   * If a Bezier curve is supplied, the particle smoothly traverses the curved arc.
   */
  _addTravelingParticle(from, to, highlight, targetNeuron = null, curve = null) {
    let mesh;
    if (this._particlePool.length > 0) {
      mesh = this._particlePool.pop();
      mesh.visible = true;
      mesh.material.color.set(highlight ? COLORS.connViolet : COLORS.particle);
    } else {
      const mat = new THREE.MeshBasicMaterial({
        color: highlight ? COLORS.connViolet : COLORS.particle,
        transparent: true,
        opacity: 0.9,
      });
      mesh = new THREE.Mesh(this._particleGeo, mat);
    }

    mesh.position.copy(from);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      curve,
      t: 0,
      speed: 0.45 + Math.random() * 0.25,
      targetNeuron,
    });
  }

  /* ── Animation & Spike Propagation Loop ────────────────────────────── */

  _animate() {
    if (this.disposed || this.paused) return;
    if (!this.visible) {
      this.animationId = null;
      return;
    }

    this.animationId = requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // Orbit controls update
    this.controls.update();

    // Parallax when idle
    if (!this.userInteracting) {
      this.camera.position.x = this._cameraBase.x + this._mouseX * PARALLAX_STRENGTH * this._cameraBase.z;
      this.camera.position.y = this._cameraBase.y - this._mouseY * PARALLAX_STRENGTH * this._cameraBase.z;
    }

    // Active Connection Line Fading
    for (let i = 0; i < this.connections.length; i++) {
      const c = this.connections[i];
      if (c.activeTimer > 0) {
        c.activeTimer -= dt * 1.8;
        if (c.activeTimer <= 0) {
          c.activeTimer = 0;
          c.mat.color.set(c.baseColor);
          if (this.connectivityMode === 'curated') {
            c.line.visible = c.isCurated;
            c.mat.opacity = c.baseOpacity;
          } else if (this.connectivityMode === 'active') {
            c.line.visible = false;
            c.mat.opacity = 0;
          } else {
            c.mat.opacity = c.isCurated ? 0.18 : 0.08;
          }
        } else {
          c.mat.opacity = Math.max(c.baseOpacity, c.activeTimer * 0.85);
        }
      }
    }

    // Update Neuron States, Pulsation & Resting Phosphorescence
    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      const ud = n.userData;

      if (ud.activationTimer > 0) {
        ud.activationTimer -= dt * 2.0;
        const intensity = Math.max(0, ud.activationTimer);
        n.material.emissiveIntensity = 0.35 + intensity * 1.6;
        n.scale.setScalar((ud.baseScale || 1.0) * (1.0 + intensity * 0.26));
        if (ud.activationTimer <= 0) {
          ud.active = false;
          n.material.color.set(COLORS.inactive);
          n.material.emissive.set(COLORS.inactiveEmissive);
          n.material.emissiveIntensity = ud.baseEmissive;
          n.scale.setScalar(ud.baseScale || 1.0);
        }
      } else if (!ud.active) {
        // Very subtle resting phosphorescent breath
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.2 + ud.id * 0.5);
        n.material.emissiveIntensity = ud.baseEmissive + breath * 0.06;
      }
    }

    // Update Traveling Particles & Trigger Receiving Neuron Activation
    if (!REDUCED_MOTION) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t += p.speed * dt;

        if (p.t >= 1) {
          // Arrived at target neuron! Trigger turquoise depolarization pulse
          if (p.targetNeuron) {
            this._activateNeuron(p.targetNeuron, 0.55);
          }

          if (this.mode === 'hero') {
            p.t = 0;
          } else {
            p.mesh.visible = false;
            this.scene.remove(p.mesh);
            this._particlePool.push(p.mesh);
            this.particles.splice(i, 1);
            continue;
          }
        }

        if (p.curve) {
          p.curve.getPoint(p.t, p.mesh.position);
        } else {
          p.mesh.position.lerpVectors(p.from, p.to, p.t);
        }

        const arcOpacity = Math.sin(p.t * Math.PI);
        p.mesh.material.opacity = 0.35 + 0.65 * arcOpacity;
        p.mesh.scale.setScalar(1.0 + 0.35 * arcOpacity);
      }
    }

    // Raycast Neuron Hover Inspection
    if (this.mode === 'sim' && !this.userInteracting && this.neurons.length > 0) {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      const intersects = this.raycaster.intersectObjects(this.neurons);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (this.hoveredNeuron !== hit) {
          if (this.hoveredNeuron && !this.hoveredNeuron.userData.active) {
            this.hoveredNeuron.scale.setScalar(this.hoveredNeuron.userData.baseScale || 1.0);
          }
          this.hoveredNeuron = hit;
          hit.scale.setScalar((hit.userData.baseScale || 1.0) * 1.25);
        }
        this._showTooltip(hit, this._pointerScreenX, this._pointerScreenY);
      } else {
        if (this.hoveredNeuron) {
          if (!this.hoveredNeuron.userData.active) {
            this.hoveredNeuron.scale.setScalar(this.hoveredNeuron.userData.baseScale || 1.0);
          }
          this.hoveredNeuron = null;
        }
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
      }
    }

    // Hero Mode spontaneous sparse activity
    if (this.mode === 'hero' && !REDUCED_MOTION) {
      if (Math.random() < 0.015) {
        const sourceIdx = Math.floor(Math.random() * this.neurons.length);
        const srcNeuron = this.neurons[sourceIdx];
        this._activateNeuron(srcNeuron, 1.0);

        const outgoing = this.connections.filter(c => c.from === srcNeuron || c.to === srcNeuron);
        if (outgoing.length > 0) {
          const chosen = outgoing[Math.floor(Math.random() * outgoing.length)];
          const fromPos = chosen.from.position;
          const toPos = chosen.to.position;
          const targetNode = chosen.from === srcNeuron ? chosen.to : chosen.from;
          this._addTravelingParticle(fromPos, toPos, chosen.highlight, targetNode, chosen.curve);
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Illuminates a neuron with graceful fade
   */
  _activateNeuron(neuron, duration = 1.0) {
    if (!neuron || this.disposed) return;
    neuron.userData.active = true;
    neuron.userData.activationTimer = duration;
    neuron.material.color.set(COLORS.active);
    neuron.material.emissive.set(COLORS.activeGlow);
    neuron.material.emissiveIntensity = 1.8;
    neuron.scale.setScalar((neuron.userData.baseScale || 1.0) * 1.28);
  }

  /**
   * Displays the glassmorphic inspection tooltip for a hovered neuron
   */
  _showTooltip(neuron, sx, sy) {
    if (!this._tooltipEl) return;
    const ud = neuron.userData;
    const v = ud.potential || 0.0;
    const isSpiking = ud.active && ud.activationTimer > 0.4;
    const isDepol = ud.active && !isSpiking;
    const stateLabel = isSpiking ? 'SPIKING' : (isDepol ? 'DEPOLARIZING' : 'RESTING');
    const stateColor = isSpiking ? '#00D9FF' : (isDepol ? '#00E0B8' : '#7A92A8');

    this._tooltipEl.innerHTML = `
      <div class="tt-header">
        <span class="tt-id">NEURON #${String(ud.id).padStart(2, '0')}</span>
        <span class="tt-cluster">${ud.clusterShort || 'CORE'}</span>
      </div>
      <div class="tt-grid">
        <div class="tt-row"><span>Membrane V:</span><strong style="color:${stateColor}">${v.toFixed(3)}</strong></div>
        <div class="tt-row"><span>State:</span><strong style="color:${stateColor}">${stateLabel}</strong></div>
        <div class="tt-row"><span>Spikes:</span><strong>${ud.spikeCount || 0}</strong></div>
        <div class="tt-row"><span>Synapses:</span><strong>In: ${ud.inDegree} · Out: ${ud.outDegree}</strong></div>
        <div class="tt-row"><span>Mean Weight:</span><strong>${ud.avgWeight.toFixed(2)}</strong></div>
      </div>
      <div class="tt-hint">Click node to inspect dynamics ↗</div>
    `;

    const tipW = 190;
    const tipH = 135;
    const containerW = this.container.clientWidth;
    const containerH = this.container.clientHeight;

    let posX = sx + 14;
    let posY = sy + 14;
    if (posX + tipW > containerW - 10) posX = sx - tipW - 14;
    if (posY + tipH > containerH - 10) posY = sy - tipH - 14;

    this._tooltipEl.style.left = `${Math.max(10, posX)}px`;
    this._tooltipEl.style.top = `${Math.max(10, posY)}px`;
    this._tooltipEl.style.display = 'block';
  }

  /* ── Public API: Update Sim Neurons From Simulation Engine ────────── */

  /**
   * Synchronizes neuron mesh with live SNN engine step data
   * @param {{ potentials: number[], spiked: number[], active: number[], step?: number, spikeCounts?: number[] }} states
   */
  updateNeurons(states) {
    if (this.disposed || this.mode !== 'sim') return;
    const { potentials = [], spiked = [], active = [], spikeCounts = [] } = states;
    const spikedSet = new Set(spiked);
    const activeSet = new Set(active);

    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      const ud = n.userData;

      // Update tracked data for inspection
      if (spikeCounts[i] !== undefined) {
        ud.spikeCount = spikeCounts[i];
      } else if (spikedSet.has(i)) {
        ud.spikeCount = (ud.spikeCount || 0) + 1;
      }

      if (spikedSet.has(i)) {
        // Neuron Spiked: Bright electric cyan illumination + pulse
        this._activateNeuron(n, 1.4);

        // Spawn spike pulses strictly along actual directed outgoing synapses
        const outgoing = this._outgoingMap.get(i);
        if (outgoing && outgoing.length > 0) {
          // Select outgoing synapses to illuminate: top 3 by weight
          const selected = outgoing.length <= 4
            ? outgoing
            : outgoing.slice().sort((a, b) => b.weight - a.weight).slice(0, 4);

          for (const c of selected) {
            // Illuminate connection line
            c.activeTimer = 1.0;
            c.line.visible = true;
            c.mat.color.set(c.isFeedback ? COLORS.connViolet : COLORS.connActive);
            c.mat.opacity = 0.85;

            // Spawn particle along curved or straight axon
            if (this.particles.length < 90) {
              this._addTravelingParticle(n.position, c.to.position, c.highlight, c.to, c.curve);
            }
          }
        }
      } else if (activeSet.has(i)) {
        // High membrane potential: turquoise depolarization glow
        ud.active = true;
        n.material.color.set(COLORS.turquoise);
        n.material.emissive.set(COLORS.turquoise);
        n.material.emissiveIntensity = 0.55;
        n.scale.setScalar((ud.baseScale || 1.0) * 1.08);
      } else {
        // Resting / decaying state
        if (ud.activationTimer <= 0) {
          ud.active = false;
          n.material.color.set(COLORS.inactive);
          n.material.emissive.set(COLORS.inactiveEmissive);
          n.material.emissiveIntensity = ud.baseEmissive;
          n.scale.setScalar(ud.baseScale || 1.0);
        }
      }

      // Continuous membrane potential modulation
      if (potentials[i] !== undefined && !spikedSet.has(i)) {
        const v = Math.max(0, Math.min(1.2, potentials[i]));
        ud.potential = v;
        if (v > 0.2) {
          const ratio = (v - 0.2) / 0.8;
          n.material.emissiveIntensity = 0.28 + ratio * 0.45;
          n.material.color.set(COLORS.inactive).lerp(new THREE.Color(COLORS.turquoise), ratio * 0.6);
        }
      }
    }
  }

  /* ── Connectivity Modes ────────────────────────────────────────────── */

  /**
   * Set visualization connectivity mode:
   * - 'curated': display clean representative subset of strongest & inter-cluster synapses
   * - 'full': display complete actual synaptic graph (100% of connections)
   * - 'active': display dynamic active spike pathways only
   * 
   * @param {'curated'|'full'|'active'} mode
   */
  setConnectivityMode(mode) {
    if (!['curated', 'full', 'active'].includes(mode)) return;
    this.connectivityMode = mode;
    this._applyConnectivityMode();
    this._updateHUDTags();
  }

  getConnectivityMode() {
    return this.connectivityMode;
  }

  _applyConnectivityMode() {
    this.connections.forEach(c => {
      if (this.connectivityMode === 'curated') {
        c.line.visible = c.isCurated || c.activeTimer > 0;
        c.mat.opacity = c.activeTimer > 0 ? 0.85 : c.baseOpacity;
      } else if (this.connectivityMode === 'full') {
        c.line.visible = true;
        c.mat.opacity = c.activeTimer > 0 ? 0.85 : (c.isCurated ? 0.18 : 0.08);
      } else if (this.connectivityMode === 'active') {
        c.line.visible = c.activeTimer > 0;
        c.mat.opacity = c.activeTimer > 0 ? 0.85 : 0;
      }
    });
  }

  _updateHUDTags() {
    if (this.mode !== 'sim') return;
    const modeTag = document.getElementById('sim3dModeTag');
    const detailTag = document.getElementById('sim3dDetailTag');

    const modeLabels = {
      curated: 'CURATED',
      full: 'FULL GRAPH',
      active: 'ACTIVE ONLY',
    };

    if (modeTag) {
      modeTag.textContent = `3D VOLUMETRIC MESH // ${modeLabels[this.connectivityMode] || 'CURATED'}`;
    }

    if (detailTag) {
      const curatedCount = this.connections.filter(c => c.isCurated).length;
      const totalCount = this.connections.length;
      if (this.connectivityMode === 'curated') {
        detailTag.textContent = `${this.neurons.length} NODES · ${curatedCount}/${totalCount} SYNAPSES`;
      } else if (this.connectivityMode === 'full') {
        detailTag.textContent = `${this.neurons.length} NODES · ${totalCount} SYNAPSES (100%)`;
      } else {
        detailTag.textContent = `${this.neurons.length} NODES · DYNAMIC ACTIVE PATHWAYS`;
      }
    }
  }

  /* ── Interactive View & Camera Framing ─────────────────────────────── */

  /**
   * Intelligently calculates the network bounding box and adjusts camera framing
   * so the neural network occupies approximately 75% of the visible viewport area.
   * 
   * @param {boolean} [animate=false]
   */
  fitCameraToTopology(animate = false) {
    if (this.neurons.length === 0 || !this.camera || !this.controls) return;

    const box = new THREE.Box3();
    this.neurons.forEach(n => box.expandByPoint(n.position));

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const fov = this.camera.fov * (Math.PI / 180);
    const aspect = this.camera.aspect || 1.6;

    // Target ~75% coverage of viewport
    const coverage = 0.74;
    const halfH = (size.y * 0.5) / coverage;
    const halfW = (size.x * 0.5) / coverage;

    const distV = halfH / Math.tan(fov * 0.5);
    const distH = halfW / (aspect * Math.tan(fov * 0.5));
    const dist = Math.max(distV, distH) + size.z * 0.45;

    const targetPos = new THREE.Vector3(
      center.x,
      center.y + 0.25,
      center.z + Math.max(dist, 10.5)
    );

    this._cameraBase.copy(targetPos);
    this._targetBase.copy(center);

    if (animate) {
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      let t = 0;
      const stepTween = () => {
        if (this.disposed) return;
        t += 0.05;
        const ease = t * t * (3 - 2 * t);
        this.camera.position.lerpVectors(startPos, targetPos, Math.min(1, ease));
        this.controls.target.lerpVectors(startTarget, center, Math.min(1, ease));
        this.controls.update();
        if (t < 1) requestAnimationFrame(stepTween);
      };
      stepTween();
    } else {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  toggleAutoRotate(enable) {
    if (this.controls) {
      this.controls.autoRotate = enable !== undefined ? enable : !this.controls.autoRotate;
      return this.controls.autoRotate;
    }
    return false;
  }

  zoom(factor) {
    if (!this.camera || !this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.multiplyScalar(factor);
    if (offset.length() > 5 && offset.length() < 36) {
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
    }
  }

  togglePause(paused) {
    this.paused = paused !== undefined ? paused : !this.paused;
    if (!this.paused && !this.animationId) {
      this._animate();
    }
    return this.paused;
  }

  resetCamera() {
    if (this.disposed || !this.camera || !this.controls) return;
    const target = this._cameraBase.clone();
    const center = this._targetBase.clone();
    const start = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let t = 0;

    const step = () => {
      if (this.disposed) return;
      t += 0.04;
      const ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(start, target, Math.min(1, ease));
      this.controls.target.lerpVectors(startTarget, center, Math.min(1, ease));
      this.controls.update();
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    step();
  }

  /* ── Cleanup ───────────────────────────────────────────────────────── */

  dispose() {
    this.disposed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    clearTimeout(this.idleTimer);
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.container.removeEventListener('pointermove', this._onPointerMove);
    this.container.removeEventListener('pointerleave', this._onPointerLeave);
    if (this._observer) this._observer.disconnect();

    this._clearSceneObjects();

    this._neuronGeoLow?.dispose();
    this._neuronGeoMid?.dispose();
    this._neuronGeoHigh?.dispose();
    this._particleGeo?.dispose();

    this._particlePool.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
    });

    if (this._tooltipEl && this._tooltipEl.parentNode) {
      this._tooltipEl.parentNode.removeChild(this._tooltipEl);
      this._tooltipEl = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   Singleton Instances & Public API
   ════════════════════════════════════════════════════════════════════════════ */

let heroViz = null;
let simViz = null;
let pendingSimTopology = null;

function initHeroViz(container) {
  if (!container) return null;
  if (!hasWebGL()) {
    insertFallbackSVG(container);
    return null;
  }
  if (heroViz) heroViz.dispose();
  heroViz = new VizInstance(container, 'hero');
  return heroViz;
}

function initSimViz(container, initialTopology = null) {
  if (!container) return null;
  if (!hasWebGL()) {
    insertFallbackSVG(container);
    return null;
  }
  const topo = initialTopology || pendingSimTopology;
  if (simViz) simViz.dispose();
  simViz = new VizInstance(container, 'sim', topo);
  return simViz;
}

function setSimTopology(topology) {
  pendingSimTopology = topology;
  if (simViz) {
    simViz.setTopology(topology);
  }
}

function updateSimViz(neuronStates) {
  if (!simViz) return;
  simViz.updateNeurons(neuronStates);
}

function resetCamera() {
  heroViz?.resetCamera();
  simViz?.resetCamera();
}

function toggleAutoRotate(enable) {
  return simViz?.toggleAutoRotate(enable);
}

function zoom3D(factor) {
  simViz?.zoom(factor);
}

function togglePause3D(paused) {
  return simViz?.togglePause(paused);
}

function setConnectivityMode(mode) {
  simViz?.setConnectivityMode(mode);
}

function getConnectivityMode() {
  return simViz ? simViz.getConnectivityMode() : 'curated';
}

function onSelectNeuron(callback) {
  if (simViz) {
    simViz.onSelectNeuron = callback;
  }
}

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

/* ── Attach to window for platform usage ────────────────────────────── */

window.NeuroViz = {
  initHeroViz,
  initSimViz,
  setSimTopology,
  updateSimViz,
  resetCamera,
  toggleAutoRotate,
  zoom3D,
  togglePause3D,
  setConnectivityMode,
  getConnectivityMode,
  onSelectNeuron,
  disposeViz,
};

try {
  window.dispatchEvent(new CustomEvent('neuroviz-ready'));
} catch (e) {
  // Non-browser fallback
}

export {
  initHeroViz,
  initSimViz,
  setSimTopology,
  updateSimViz,
  resetCamera,
  toggleAutoRotate,
  zoom3D,
  togglePause3D,
  setConnectivityMode,
  getConnectivityMode,
  onSelectNeuron,
  disposeViz,
};
