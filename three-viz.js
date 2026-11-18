/**
 * NEUROCORE Three.js 3D Neural Network Visualization (v2.1.1)
 * 
 * Provides unified, organic 3D neuromorphic network visualizations for:
 * 1. Hero section: Organized cortical clusters with intentional synaptic pathways
 *    and sparse event-driven spike propagation.
 * 2. Simulation Lab: Real-time 3D SNN mesh synchronized with LIF neuron dynamics,
 *    synaptic delays, and membrane potential scaling.
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
  active:        0x00D9FF, // Electric cyan
  turquoise:     0x00E0B8, // Turquoise indicator
  blue:          0x328BFF, // Signal blue
  violet:        0x8767FF, // Secondary violet
  inactive:      0x182B40, // Resting state neuron
  inactiveEdge:  0x284360, // Wireframe edge
  connection:    0x10253A, // Rest synapse
  connActive:    0x00D9FF, // Active synapse
  connViolet:    0x8767FF, // Recurrent synapse
  particle:      0x00D9FF, // Spike particle
};

const AUTO_ROTATE_SPEED = 0.4;  // subtle, slow rotation
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
    <!-- Organic Cluster 1 -->
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

    /** @type {THREE.Mesh[]} */
    this.neurons = [];
    /** @type {{ line: THREE.Line, from: THREE.Mesh, to: THREE.Mesh, sourceId: number, targetId: number, highlight: boolean, weight: number }[]} */
    this.connections = [];
    /** @type {Map<number, Array<{ line: THREE.Line, from: THREE.Mesh, to: THREE.Mesh, sourceId: number, targetId: number, highlight: boolean, weight: number }>>} */
    this._outgoingMap = new Map();
    /** @type {{ mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, t: number, speed: number, targetNeuron: THREE.Mesh|null }[]} */
    this.particles = [];

    this._mouseX = 0;
    this._mouseY = 0;
    this._cameraBase = new THREE.Vector3();
    this._particlePool = [];

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
    const dist = this.mode === 'hero' ? 17 : 14;
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    this.camera.position.set(0, 1.2, dist);
    this._cameraBase.copy(this.camera.position);

    // Cinematic Atmospheric Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const keyLight = new THREE.PointLight(COLORS.active, 1.5, 60);
    keyLight.position.set(8, 10, 12);
    const fillLight = new THREE.PointLight(COLORS.violet, 0.8, 50);
    fillLight.position.set(-8, -6, 10);
    const rimLight = new THREE.PointLight(COLORS.turquoise, 0.5, 40);
    rimLight.position.set(0, 12, -8);
    this.scene.add(ambient, keyLight, fillLight, rimLight);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 28;
    this.controls.autoRotate = !REDUCED_MOTION;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED * (180 / Math.PI) * 0.12;

    const onInteractStart = () => {
      this.userInteracting = true;
      this.controls.autoRotate = false;
      clearTimeout(this.idleTimer);
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
    this.renderer.domElement.addEventListener('pointerup', onInteractEnd);
    this.renderer.domElement.addEventListener('wheel', () => {
      onInteractStart();
      onInteractEnd();
    }, { passive: true });

    // Subtle Parallax
    this._onMouseMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this._mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      this._mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    this.container.addEventListener('mousemove', this._onMouseMove, { passive: true });

    // Responsive Resize
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

    // Build the clean, clustered neuromorphic network
    this._buildOrganizedNetwork();

    // Start render loop
    this._animate();
  }

  /* ── Network Construction: Clean Clustered Topology ─────────────────── */

  _buildOrganizedNetwork() {
    // Shared geometries
    this._neuronGeoLow = new THREE.IcosahedronGeometry(0.3, 1);
    this._neuronGeoMid = new THREE.IcosahedronGeometry(0.42, 2);
    this._neuronGeoHigh = new THREE.IcosahedronGeometry(0.55, 2);
    this._particleGeo = new THREE.SphereGeometry(0.08, 8, 8);

    if (this.mode === 'hero') {
      this._buildHeroClusteredTopology();
    } else {
      this._buildSimLabTopology(this._initialTopology);
    }
  }

  /**
   * Hero Section: 4 organized cortical functional clusters with intentional synaptic pathways.
   * NO random crisscrossing or chaotic zigzags.
   */
  _buildHeroClusteredTopology() {
    // 4 Functional Clusters positioned with depth
    const clusters = [
      { id: 0, center: new THREE.Vector3(-4.5, 0.8, -1.0), count: 12, name: 'Sensory Input Cluster', radius: 2.2 },
      { id: 1, center: new THREE.Vector3(-0.8, 1.8, 1.2),  count: 16, name: 'Associative Neuromorphic Core', radius: 2.6 },
      { id: 2, center: new THREE.Vector3(0.5, -2.0, -0.5), count: 14, name: 'Adaptive Interneuron Pool', radius: 2.4 },
      { id: 3, center: new THREE.Vector3(4.2, 0.2, 0.8),   count: 14, name: 'Spike Output Projection Hub', radius: 2.2 },
    ];

    let globalIndex = 0;
    const clusterNodes = [[], [], [], []];

    // Create neurons organically within their functional clusters
    clusters.forEach((cl, cIdx) => {
      for (let i = 0; i < cl.count; i++) {
        // Spherical distribution around cluster center
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * cl.radius;

        const pos = new THREE.Vector3(
          cl.center.x + r * Math.sin(phi) * Math.cos(theta),
          cl.center.y + r * Math.sin(phi) * Math.sin(theta) * 0.85,
          cl.center.z + r * Math.cos(phi) * 0.9
        );

        // Vary neuron size: key hub neurons are larger, boundary neurons are smaller
        const isHub = i === 0 || i === 1;
        const geo = isHub ? this._neuronGeoHigh : (i % 3 === 0 ? this._neuronGeoMid : this._neuronGeoLow);
        const baseRadius = isHub ? 0.55 : (i % 3 === 0 ? 0.42 : 0.3);

        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.inactive,
          emissive: COLORS.inactive,
          emissiveIntensity: 0.12,
          roughness: 0.35,
          metalness: 0.45,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = {
          id: globalIndex,
          clusterId: cIdx,
          isHub,
          baseRadius,
          baseEmissive: 0.12,
          active: false,
          activationTimer: 0,
        };

        this.scene.add(mesh);
        this.neurons.push(mesh);
        clusterNodes[cIdx].push(mesh);
        globalIndex++;
      }
    });

    // 1. Clean Intra-Cluster Connections (only to 2-3 closest neighbors within the cluster)
    clusterNodes.forEach((nodes) => {
      nodes.forEach((nA) => {
        // Find 2 closest neighbors within the same cluster
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

    // 2. Clean Inter-Cluster Pathways (directional bridge connections between neighboring cluster hubs)
    const clusterPairs = [
      [0, 1], // Sensory -> Associative
      [0, 2], // Sensory -> Adaptive Pool
      [1, 2], // Associative <-> Adaptive Feedback
      [1, 3], // Associative -> Projection Hub
      [2, 3], // Adaptive Pool -> Projection Hub
    ];

    clusterPairs.forEach(([cA, cB]) => {
      const listA = clusterNodes[cA];
      const listB = clusterNodes[cB];

      // Connect 2-3 closest boundary nodes between the clusters
      const bridges = [];
      listA.forEach(nA => {
        listB.forEach(nB => {
          bridges.push({ nA, nB, dist: nA.position.distanceTo(nB.position) });
        });
      });

      bridges.sort((a, b) => a.dist - b.dist);
      const chosen = bridges.slice(0, 2);
      chosen.forEach(({ nA, nB }) => {
        this._addSynapticConnection(nA, nB, true, 0.85);
      });
    });

    // Initial ambient particles on intentional synaptic pathways
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
   * Simulation Lab Topology: 3 functional layers/clusters mapped directly to the actual SNN simulation engine.
   * Uses actual engine neuron count and actual directed synaptic connections.
   * @param {object} [topology=null]
   */
  _buildSimLabTopology(topology = null) {
    // Clean up previous elements
    this.neurons.forEach(n => {
      this.scene.remove(n);
      n.geometry?.dispose();
      n.material?.dispose();
    });
    this.neurons = [];

    this.connections.forEach(c => {
      this.scene.remove(c.line);
      c.line.geometry?.dispose();
      c.line.material?.dispose();
    });
    this.connections = [];

    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    });
    this.particles = [];
    this._outgoingMap.clear();

    const count = topology?.neuronCount || 48;
    const connections = topology?.connections || [];

    // Deterministic distribution across 3 functional cortical clusters:
    // Cluster 0: Sensory / Input layer (left, ~28%)
    // Cluster 1: Associative Neuromorphic Core (center, ~48%)
    // Cluster 2: Spike Output Hub (right, ~24%)
    const nSensory = Math.max(2, Math.floor(count * 0.28));
    const nOutput = Math.max(2, Math.floor(count * 0.24));
    const nCore = count - nSensory - nOutput;

    const clusterDef = [
      { center: new THREE.Vector3(-4.0, 0, -0.2), count: nSensory, radius: 2.0 },
      { center: new THREE.Vector3(0.0, 0.2, 0.3),  count: nCore,    radius: 2.7 },
      { center: new THREE.Vector3(4.0, 0, -0.2),  count: nOutput,  radius: 1.9 },
    ];

    let globalIndex = 0;
    const clusterNodes = [[], [], []];

    clusterDef.forEach((cl, cIdx) => {
      for (let i = 0; i < cl.count; i++) {
        // Spherical golden spiral for deterministic, uniform spatial distribution
        const phi = Math.acos(1 - 2 * (i + 0.5) / cl.count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        const rFrac = 0.35 + 0.65 * Math.sqrt((i + 1) / cl.count);
        const r = rFrac * cl.radius;

        const pos = new THREE.Vector3(
          cl.center.x + r * Math.sin(phi) * Math.cos(theta),
          cl.center.y + r * Math.sin(phi) * Math.sin(theta) * 0.85,
          cl.center.z + r * Math.cos(phi) * 0.85
        );

        const isHub = i === 0;
        const geo = isHub ? this._neuronGeoHigh : (i % 2 === 0 ? this._neuronGeoMid : this._neuronGeoLow);

        const mat = new THREE.MeshStandardMaterial({
          color: COLORS.inactive,
          emissive: COLORS.inactive,
          emissiveIntensity: 0.12,
          roughness: 0.35,
          metalness: 0.4,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.userData = {
          id: globalIndex,
          clusterId: cIdx,
          isHub,
          baseRadius: isHub ? 0.55 : (i % 2 === 0 ? 0.42 : 0.3),
          baseEmissive: 0.12,
          active: false,
          activationTimer: 0,
        };

        this.scene.add(mesh);
        this.neurons.push(mesh);
        clusterNodes[cIdx].push(mesh);
        globalIndex++;
      }
    });

    // Build actual directed synaptic connections from engine topology
    if (connections.length > 0) {
      connections.forEach(conn => {
        const nA = this.neurons[conn.sourceId];
        const nB = this.neurons[conn.targetId];
        if (!nA || !nB) return;

        const isFeedback = conn.sourceId >= conn.targetId;
        const highlight = conn.weight > 0.35 || isFeedback;

        const mat = new THREE.LineBasicMaterial({
          color: isFeedback ? COLORS.violet : (highlight ? COLORS.connActive : COLORS.connection),
          transparent: true,
          opacity: highlight ? 0.45 : 0.22,
          linewidth: 1,
        });

        const geometry = new THREE.BufferGeometry().setFromPoints([nA.position, nB.position]);
        const line = new THREE.Line(geometry, mat);
        this.scene.add(line);

        const connObj = {
          line,
          from: nA,
          to: nB,
          sourceId: conn.sourceId,
          targetId: conn.targetId,
          weight: conn.weight,
          delay: conn.delay,
          highlight,
        };
        this.connections.push(connObj);

        if (!this._outgoingMap.has(conn.sourceId)) {
          this._outgoingMap.set(conn.sourceId, []);
        }
        this._outgoingMap.get(conn.sourceId).push(connObj);
      });
    } else {
      // Clean nearest neighbor fallback if no connections array provided
      clusterNodes.forEach((nodes, cIdx) => {
        nodes.forEach(nA => {
          nodes.forEach(nB => {
            if (nA.userData.id < nB.userData.id && nA.position.distanceTo(nB.position) < 2.5) {
              this._addSynapticConnection(nA, nB, false, 0.4);
            }
          });
        });

        if (cIdx < 2) {
          const nextNodes = clusterNodes[cIdx + 1];
          nodes.slice(0, 3).forEach(nA => {
            const closest = nextNodes
              .map(nB => ({ nB, dist: nA.position.distanceTo(nB.position) }))
              .sort((a, b) => a.dist - b.dist)[0];
            if (closest) {
              this._addSynapticConnection(nA, closest.nB, true, 0.75);
            }
          });
        }
      });
    }
  }

  /**
   * Helper to create an elegant synaptic connection line
   */
  _addSynapticConnection(nA, nB, highlight, weight = 0.5) {
    const mat = new THREE.LineBasicMaterial({
      color: highlight ? COLORS.violet : COLORS.connection,
      transparent: true,
      opacity: highlight ? 0.55 : 0.35,
      linewidth: 1,
    });

    const geometry = new THREE.BufferGeometry().setFromPoints([nA.position, nB.position]);
    const line = new THREE.Line(geometry, mat);
    this.scene.add(line);
    const connObj = {
      line,
      from: nA,
      to: nB,
      sourceId: nA.userData.id,
      targetId: nB.userData.id,
      highlight,
      weight,
    };
    this.connections.push(connObj);

    if (!this._outgoingMap.has(nA.userData.id)) {
      this._outgoingMap.set(nA.userData.id, []);
    }
    this._outgoingMap.get(nA.userData.id).push(connObj);
  }

  /**
   * Adds an animated pulse particle along a synaptic pathway
   */
  _addTravelingParticle(from, to, highlight, targetNeuron = null) {
    let mesh;
    if (this._particlePool.length > 0) {
      mesh = this._particlePool.pop();
      mesh.visible = true;
    } else {
      const mat = new THREE.MeshBasicMaterial({
        color: highlight ? COLORS.violet : COLORS.particle,
        transparent: true,
        opacity: 0.85,
      });
      mesh = new THREE.Mesh(this._particleGeo, mat);
    }

    mesh.position.copy(from);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      speed: 0.35 + Math.random() * 0.3,
      targetNeuron,
    });
  }

  /* ── Animation & Spike Event Propagation Loop ──────────────────────── */

  _animate() {
    if (this.disposed || this.paused) return;
    if (!this.visible) {
      this.animationId = null;
      return;
    }

    this.animationId = requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // Orbit controls damping update
    this.controls.update();

    // Subtle gentle parallax when not dragging
    if (!this.userInteracting) {
      this.camera.position.x = this._cameraBase.x + this._mouseX * PARALLAX_STRENGTH * this._cameraBase.z;
      this.camera.position.y = this._cameraBase.y - this._mouseY * PARALLAX_STRENGTH * this._cameraBase.z;
    }

    // Update active neurons and pulsation
    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      const ud = n.userData;

      if (ud.activationTimer > 0) {
        ud.activationTimer -= dt * 2.2;
        const intensity = Math.max(0, ud.activationTimer);
        n.material.emissiveIntensity = 0.2 + intensity * 0.9;
        n.scale.setScalar(1.0 + intensity * 0.22);
        if (ud.activationTimer <= 0) {
          ud.active = false;
          n.material.color.set(COLORS.inactive);
          n.material.emissive.set(COLORS.inactive);
          n.material.emissiveIntensity = ud.baseEmissive;
          n.scale.setScalar(1.0);
        }
      } else if (!ud.active) {
        // Very subtle resting breathe
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.2 + ud.id * 0.5);
        n.material.emissiveIntensity = ud.baseEmissive + breath * 0.05;
      }
    }

    // Update Traveling Particles & Trigger Receiving Neuron Activation
    if (!REDUCED_MOTION) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t += p.speed * dt;

        if (p.t >= 1) {
          // Pulse arrived at receiving neuron! Trigger brief illumination
          if (p.targetNeuron) {
            this._activateNeuron(p.targetNeuron, 0.6);
          }

          if (this.mode === 'hero') {
            // Loop particle back with small pause
            p.t = 0;
          } else {
            // In sim mode: recycle particle
            p.mesh.visible = false;
            this.scene.remove(p.mesh);
            this._particlePool.push(p.mesh);
            this.particles.splice(i, 1);
            continue;
          }
        }

        p.mesh.position.lerpVectors(p.from, p.to, p.t);
        const arcOpacity = Math.sin(p.t * Math.PI);
        p.mesh.material.opacity = 0.2 + 0.75 * arcOpacity;
      }
    }

    // Hero Mode: Sparse, biologically inspired event-driven spontaneous firing
    if (this.mode === 'hero' && !REDUCED_MOTION) {
      // Very sparse trigger (~1 event every 1.5 seconds)
      if (Math.random() < 0.015) {
        const sourceIdx = Math.floor(Math.random() * this.neurons.length);
        const srcNeuron = this.neurons[sourceIdx];
        this._activateNeuron(srcNeuron, 1.0);

        // Find connected synapse to shoot a pulse
        const outgoing = this.connections.filter(c => c.from === srcNeuron || c.to === srcNeuron);
        if (outgoing.length > 0) {
          const chosen = outgoing[Math.floor(Math.random() * outgoing.length)];
          const fromPos = chosen.from.position;
          const toPos = chosen.to.position;
          const targetNode = chosen.from === srcNeuron ? chosen.to : chosen.from;
          this._addTravelingParticle(fromPos, toPos, chosen.highlight, targetNode);
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
    neuron.material.emissive.set(COLORS.active);
    neuron.material.emissiveIntensity = 1.0;
    neuron.scale.setScalar(1.22);
  }

  /* ── Public API: Update Sim Neurons From Simulation Engine ────────── */

  /**
   * Synchronizes neuron mesh with live SNN engine step data
   * @param {{ potentials: number[], spiked: number[], active: number[] }} states
   */
  updateNeurons(states) {
    if (this.disposed || this.mode !== 'sim') return;
    const { potentials = [], spiked = [], active = [] } = states;
    const spikedSet = new Set(spiked);
    const activeSet = new Set(active);

    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      if (spikedSet.has(i)) {
        // Neuron spiked: bright cyan illumination + pulse
        this._activateNeuron(n, 1.2);

        // Spawn a spike pulse strictly along actual directed outgoing synapses
        const outgoing = this._outgoingMap.get(i);
        if (outgoing && outgoing.length > 0) {
          const selected = outgoing.length <= 3
            ? outgoing
            : outgoing.slice().sort((a, b) => b.weight - a.weight).slice(0, 3);

          for (const c of selected) {
            if (this.particles.length < 80) {
              // Directional: From n (source) to c.to (target)
              this._addTravelingParticle(n.position, c.to.position, c.highlight, c.to);
            }
          }
        }
      } else if (activeSet.has(i)) {
        // High membrane potential: warm glow
        n.userData.active = true;
        n.material.color.set(COLORS.turquoise);
        n.material.emissive.set(COLORS.active);
        n.material.emissiveIntensity = 0.45;
      } else {
        // Resting / decaying state
        if (n.userData.activationTimer <= 0) {
          n.userData.active = false;
          n.material.color.set(COLORS.inactive);
          n.material.emissive.set(COLORS.inactive);
          n.material.emissiveIntensity = n.userData.baseEmissive;
        }
      }

      // Continuous membrane potential modulation
      if (potentials[i] !== undefined && !spikedSet.has(i)) {
        const v = Math.max(0, Math.min(1.2, potentials[i]));
        if (v > 0.2) {
          n.material.emissiveIntensity = 0.12 + v * 0.45;
          n.material.color.set(COLORS.inactive).lerp(new THREE.Color(COLORS.active), v * 0.5);
        }
      }
    }
  }

  /* ── Interactive View Controls ─────────────────────────────────────── */

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
    if (offset.length() > 5 && offset.length() < 30) {
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
    if (this.disposed) return;
    const target = this._cameraBase.clone();
    const start = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let t = 0;

    const step = () => {
      if (this.disposed) return;
      t += 0.04;
      if (t >= 1) {
        this.camera.position.copy(target);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        return;
      }
      const ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(start, target, ease);
      this.controls.target.lerpVectors(startTarget, new THREE.Vector3(0, 0, 0), ease);
      this.controls.update();
      requestAnimationFrame(step);
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
    this.container.removeEventListener('mousemove', this._onMouseMove);
    if (this._observer) this._observer.disconnect();

    // Dispose geometries & materials
    this.neurons.forEach(n => {
      n.geometry?.dispose();
      n.material?.dispose();
    });
    this.connections.forEach(c => {
      c.line.geometry?.dispose();
      c.line.material?.dispose();
    });
    this.particles.forEach(p => {
      p.mesh.geometry?.dispose();
      p.mesh.material?.dispose();
    });
    this._particlePool.forEach(m => {
      m.geometry?.dispose();
      m.material?.dispose();
    });

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
  disposeViz,
};
