/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as CANNON from 'cannon-es';
import { RotateCcw, AlertTriangle, Play, HelpCircle, Volume2, VolumeX, Shield } from 'lucide-react';
import { AudioEngine } from './AudioEngine';
import { GameState, Difficulty, CosmicEvent } from '../types';

// -----------------------------------------------------------------------------
// Configuration & Small Utilities (Centralized for maintainability)
// -----------------------------------------------------------------------------
export const CONFIG = {
  initial: {
    targetTiltDeg: 23.44,
    initSpinRadPerSec: 0.17, // ~1.62 RPM
  },
  controls: {
    tiltTorque: 7.0,
    spinTorque: 9.0,
    impulseForce: 4.5,
  },
  gameplay: {
    idealRPM: { min: 1.0, max: 2.5 },
    alignmentToleranceDeg: 60.0, // more forgiving
    particleCount: 200,
  },
  hazards: {
    spawnRate: {
      hard: 0.010,
      medium: 0.006,
      easy: 0.002,
    },
  },
};

/** Clamp value between min and max */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Linear interpolate from a to b by t */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// -----------------------------------------------------------------------------


interface GameCanvasProps {
  gameState: GameState;
  difficulty: Difficulty;
  isMuted: boolean;
  score: number;
  onUpdateScore: (score: number, alignment: number, speed: number) => void;
  onGameOver: (finalScore: number, maxAlignment: number, survivalSec: number) => void;
  onLaunchEvent: (event: CosmicEvent) => void;
  onClearEvent: (id: string) => void;
  onToggleMute: () => void;
  activeEvents: CosmicEvent[];
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  difficulty,
  isMuted,
  score,
  onUpdateScore,
  onGameOver,
  onLaunchEvent,
  onClearEvent,
  onToggleMute,
  activeEvents,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Loop States & Stats refs to share with React UI
  const statsRef = useRef({
    score: 0,
    startTime: 0,
    elapsedTime: 0,
    maxAlignment: 0,
    currentAlignment: 100,
    currentRPM: 1.0,
    balanceIntegrity: 100, // 0 - 100%
  });

  // Track key actions to show active controls
  const [controlsPressed, setControlsPressed] = useState({
    w: false, // Pitch Down
    s: false, // Pitch Up
    a: false, // Spin CCW / Faster
    d: false, // Spin CW / Slower
  });

  const [localStats, setLocalStats] = useState({
    alignment: 100,
    rpm: 1.0,
    integrity: 100,
    targetTilt: CONFIG.initial.targetTiltDeg,
    currentTilt: CONFIG.initial.targetTiltDeg,
  });

  // When Earth receives linear impulses it can drift out of view; auto-recenter and briefly show a hint
  const [isRecentering, setIsRecentering] = useState(false);

  // Native refs for clean Three / Cannon clean up
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  
  // Dynamic Objects
  const earthBodyRef = useRef<CANNON.Body | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudMeshRef = useRef<THREE.Mesh | null>(null);
  const thrustersGroupRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunMeshRef = useRef<THREE.Mesh | null>(null);

  // Visual hazard effect caches
  const solarFlareEffectsRef = useRef<Record<string, { cone: THREE.Object3D; light: THREE.PointLight; particles?: THREE.Points }>>({});
  const gravityTideEffectsRef = useRef<Record<string, { ring: THREE.Mesh }>>({});
  
  // Thruster mesh references
  const thrusterMeshes = useRef<{
    NorthLeft: THREE.Mesh;
    NorthRight: THREE.Mesh;
    SouthLeft: THREE.Mesh;
    SouthRight: THREE.Mesh;
  } | null>(null);

  // Meteors container
  const meteorsRef = useRef<Array<{
    mesh: THREE.Object3D;
    body: CANNON.Body;
    trailPoints: THREE.Points;
    lifetime: number;
    forceDir: THREE.Vector3;
    light?: THREE.PointLight;
  }>>([]);

  // Model cache for GLTF assets
  const modelCacheRef = useRef<Record<string, THREE.Group | null>>({
    meteor: null,
    flare: null,
  });

  // Sparks/Impact Particles container
  const particlesRef = useRef<THREE.Points | null>(null);
  const particleGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const particlesCount = CONFIG.gameplay.particleCount; // centralized particle count
  const particlePositions = useRef<Float32Array | null>(null);
  const particleVelocities = useRef<Float32Array | null>(null);
  const particleLifes = useRef<Float32Array | null>(null);

  // Keyboard controls key state
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  // -----------------------------------------------------
  // 1. Procedural High-Fidelity Textures Generator
  // -----------------------------------------------------

  const generateEarthTextures = (): { dayTexture: THREE.Texture; nightTexture: THREE.Texture } => {
    // Large canvasses for high-detail layout
    const width = 1024;
    const height = 512;

    // Day Texture Canvas
    const dayCanvas = document.createElement('canvas');
    dayCanvas.width = width;
    dayCanvas.height = height;
    const dayCtx = dayCanvas.getContext('2d')!;

    // Night Texture (City lights) Canvas
    const nightCanvas = document.createElement('canvas');
    nightCanvas.width = width;
    nightCanvas.height = height;
    const nightCtx = nightCanvas.getContext('2d')!;

    // Fill Day with deep rich oceans
    const oceanGrad = dayCtx.createRadialGradient(width/2, height/2, 50, width/2, height/2, width/2);
    oceanGrad.addColorStop(0, '#102d6b');
    oceanGrad.addColorStop(1, '#081738');
    dayCtx.fillStyle = oceanGrad;
    dayCtx.fillRect(0, 0, width, height);

    // Fill Night with global deep dark darkness
    nightCtx.fillStyle = '#02030f';
    nightCtx.fillRect(0, 0, width, height);

    // Draw realistic stylized continents procedurally
    const drawLandmass = (cx: number, cy: number, rx: number, ry: number, baseColor: string, detailFactor: number) => {
      dayCtx.beginPath();
      nightCtx.beginPath();
      
      const points = 36;
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        // Deterministic noise for stable texture re-renders
        const noiseX = Math.sin(angle * 4.3 + cx) * 25 * detailFactor;
        const noiseY = Math.cos(angle * 3.1 + cy) * 15 * detailFactor;
        
        const x = cx + Math.cos(angle) * rx + noiseX;
        const y = cy + Math.sin(angle) * ry + noiseY;
        
        if (i === 0) {
          dayCtx.moveTo(x, y);
          nightCtx.moveTo(x, y);
        } else {
          dayCtx.lineTo(x, y);
          nightCtx.lineTo(x, y);
        }
      }
      dayCtx.closePath();
      nightCtx.closePath();

      // Style Day texturing
      dayCtx.fillStyle = baseColor;
      dayCtx.fill();

      // Add green foresting highlights
      dayCtx.lineWidth = 12;
      dayCtx.strokeStyle = '#1e3f20';
      dayCtx.stroke();

      // Draw beautiful gold/amber glowing night city points on land
      nightCtx.lineWidth = 2;
      nightCtx.strokeStyle = '#e2971255';
      nightCtx.stroke();
      
      // Scatter glowing cities
      for (let j = 0; j < 35; j++) {
        const randAngle = Math.random() * Math.PI * 2;
        const distRatio = Math.sqrt(Math.random()) * 0.85;
        const cityX = cx + Math.cos(randAngle) * rx * distRatio;
        const cityY = cy + Math.sin(randAngle) * ry * distRatio;
        
        // Ensure city is inside bounds
        if (dayCtx.isPointInPath(cityX, cityY)) {
          // Glow dots
          nightCtx.beginPath();
          const r = Math.random();
          const cityRad = r > 0.8 ? 3.5 : (r > 0.4 ? 2 : 1);
          nightCtx.arc(cityX, cityY, cityRad, 0, Math.PI * 2);
          nightCtx.fillStyle = r > 0.85 ? '#ffd470' : '#ffa41b';
          nightCtx.fill();
        }
      }
    };

    // North America
    drawLandmass(280, 180, 150, 90, '#2d5e30', 1.2);
    // South America
    drawLandmass(340, 360, 90, 120, '#214d24', 0.9);
    // Africa
    drawLandmass(520, 280, 100, 110, '#4e692a', 1.0);
    // Europe & Asia (Eurasia)
    drawLandmass(640, 160, 250, 100, '#316335', 1.5);
    // Australia
    drawLandmass(840, 380, 90, 60, '#666a33', 0.8);

    // North Polar Ice Cap on both textures
    dayCtx.fillStyle = '#fbfbfe';
    dayCtx.beginPath();
    dayCtx.arc(width / 2, 0, 75, 0, Math.PI);
    dayCtx.fill();

    nightCtx.fillStyle = '#9fb4d933'; // Soft moon lit ice capsule at night
    nightCtx.beginPath();
    nightCtx.arc(width / 2, 0, 75, 0, Math.PI);
    nightCtx.fill();

    // South Polar Ice Cap on both textures
    dayCtx.fillStyle = '#fbfbfe';
    dayCtx.beginPath();
    dayCtx.arc(width / 2, height, 75, 0, Math.PI, true);
    dayCtx.fill();

    nightCtx.fillStyle = '#9fb4d922';
    nightCtx.beginPath();
    nightCtx.arc(width / 2, height, 75, 0, Math.PI, true);
    nightCtx.fill();

    // Convert to ThreeJS textures
    const dayTexture = new THREE.CanvasTexture(dayCanvas);
    const nightTexture = new THREE.CanvasTexture(nightCanvas);
    
    // Smooth repeating parameters
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.colorSpace = THREE.SRGBColorSpace;

    return { dayTexture, nightTexture };
  };

  // Generate procedural cloud overlay texture
  const generateCloudTexture = (): THREE.Texture => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0,0, size, size/2);
    
    // Draw fluffy cloud belts
    for (let i = 0; i < 4; i++) {
      const beltY = 100 + i * 80;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + Math.random() * 0.18})`;
      
      const steps = 18;
      for (let j = 0; j <= steps; j++) {
        const x = (j / steps) * size;
        const wave = Math.sin((j / steps) * Math.PI * 6 + i) * 20;
        const rad = 25 + Math.sin(j * 1.5) * 15;
        ctx.arc(x, beltY + wave, rad, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  };

  // -----------------------------------------------------
  // 2. Main Setup and Lifecycle Hookes
  // -----------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Audio Init ---
    // Will run safely via viewport interactions
    AudioEngine.init();
    if (isMuted) {
      AudioEngine.setVolume(0);
    } else {
      AudioEngine.setVolume(0.35);
    }

    // --- Create THREE Scene ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Ambient space stars skybox background setup
    scene.background = new THREE.Color('#010206');
    
    // --- Create Camera ---
    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, 0, 4.3 / Math.min(1, aspect)); // Zoomed elegantly to center Earth perfectly and fits portrait play spaces
    cameraRef.current = camera;

    // --- Create WebGL Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    
    // Explicitly style the canvas element to prevent space-bar/flexbox collapsing or black margins
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.outline = 'none';
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Stars Background (Particle System) ---
    const starsGeom = new THREE.BufferGeometry();
    const starsCount = 800;
    const starPos = new Float32Array(starsCount * 3);
    const starSizes = new Float32Array(starsCount);
    
    for (let i = 0; i < starsCount * 3; i += 3) {
      // Spawn on a large sphere radius around Earth
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const radius = 15 + Math.random() * 20;

      starPos[i] = radius * Math.sin(phi) * Math.cos(theta);
      starPos[i+1] = radius * Math.sin(phi) * Math.sin(theta);
      starPos[i+2] = radius * Math.cos(phi);

      starSizes[i/3] = Math.random() * 0.05 + 0.01;
    }
    starsGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      transparent: true,
      sizeAttenuation: true,
      opacity: 0.85,
    });
    const starField = new THREE.Points(starsGeom, starMat);
    scene.add(starField);

    // --- Atmospheric Space Cloud / Nebula glow backdrop ---
    const dustGeom = new THREE.BufferGeometry();
    const dustCount = 8;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 8;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      dustPos[i * 3 + 2] = -5 - Math.random() * 10;
    }
    dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustField = new THREE.Points(dustGeom, new THREE.PointsMaterial({
      color: 0x3d79f2,
      size: 15,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(dustField);

    // --- Lighting Setup (Sun is located at positive X: solar source) ---
    const sunLight = new THREE.DirectionalLight(0xfff7e6, 2.5); // Golden rich bright keylight
    sunLight.position.set(12, 0, 0); // Directly coming from the right X axis
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const sunVisualNode = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        toneMapped: false,
      })
    );
    sunVisualNode.position.set(13, 0, -2);
    scene.add(sunVisualNode);
    sunMeshRef.current = sunVisualNode; // expose for hazard visuals

    // Solar Corona aura decoration (glowing rings)
    const coronaAura = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
      })
    );
    coronaAura.position.copy(sunVisualNode.position);
    coronaAura.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(coronaAura);

    // Dim ambient fill just to prevent 100% pitch dark pixels
    const spaceFillLight = new THREE.AmbientLight(0x0a1020, 0.25);
    scene.add(spaceFillLight);

    // --- Cannon.js Physics Engine Init ---
    const world = new CANNON.World();
    world.gravity.set(0, 0, 0); // Orbital flight zero gravity
    
    // Tweak solver variables for speed
    (world.solver as any).iterations = 7;
    world.defaultContactMaterial.contactEquationRelaxation = 3;
    world.defaultContactMaterial.friction = 0.1;
    physicsWorldRef.current = world;

    // --- Cannon Earth Rigid Body ---

    // Load optional GLTF models (meteor, flare) in background
    const loader = new GLTFLoader();
    const loadRemoteModel = async (key: string, url: string) => {
      try {
        const gltf = await loader.loadAsync(url);
        modelCacheRef.current[key] = gltf.scene;
        // Hide original from scene until cloned on spawn
        gltf.scene.visible = false;
        scene.add(gltf.scene);
      } catch (e) {
        // Ignore load errors; fallback to procedural geometry will be used
        console.warn('Failed to load model', url, e);
      }
    };

    // Khronos sample model URLs (CC0/Permissive) — used as optional visual upgrades
    loadRemoteModel('meteor', 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Suzanne/glTF/Suzanne.gltf');
    loadRemoteModel('flare', 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Lantern/glTF/Lantern.gltf');


    const earthRadius = 1.0;
    const earthShape = new CANNON.Sphere(earthRadius);
    
    // Inertial mass representing planetary density
    const earthMass = 20.0;
    const earthBody = new CANNON.Body({
      mass: earthMass,
      shape: earthShape,
      linearDamping: 0.08, // Drag in gas cloud
      angularDamping: 0.05, // Spin drag
    });

    // Preset alignment to ideal June Solstice axis: 23.44 degrees (0.4091 rad) tilted towards solar source (positive X)
    const tiltRads = 23.44 * (Math.PI / 180);
    // Align axis: rotate around Z axis to tilt North Pole of Earth towards Sun vector +X
    earthBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -tiltRads);
    
    // Add default initial spin angular velocity (around local Y pole axis: stable rotation)
    // Cannon uses global coords, to apply spin on the local pole we set rotation on the body poles
    const initLocalSpin = new CANNON.Vec3(0, -CONFIG.initial.initSpinRadPerSec, 0); // initial spin (rad/s) from CONFIG
    const globalSpin = earthBody.quaternion.vmult(initLocalSpin);
    earthBody.angularVelocity.copy(globalSpin);

    world.addBody(earthBody);
    earthBodyRef.current = earthBody;

    // --- Procedural Earth Custom Shader Material ---
    const textures = generateEarthTextures();
    
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D uDayTexture;
      uniform sampler2D uNightTexture;
      uniform vec3 uSunDirection;
      uniform vec3 uCameraPos;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
        vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

        // Illumination dot factor against the Sun
        vec3 normNormal = normalize(vNormal);
        vec3 worldSunDir = normalize(uSunDirection);
        
        // Simple direct light vector dot normal
        // Since Earth spins, the geometry local coordinates rotate!
        // We use view space normal for lighting standard math
        float illumination = dot(normNormal, vec3(1.0, 0.0, 0.0)); // The Sun is static at +X relative to camera space centered grid

        // Terminator transition: blend day/night gracefully
        float blendFactor = smoothstep(-0.25, 0.25, illumination);
        vec3 mixedColor = mix(nightColor*1.7, dayColor, blendFactor); // Amplify glowing city nights on shadow

        // Add soft sky scatter atmosphere halo on the planet edge (Fresnel)
        // Camera position is always facing looking at 0,0,0
        vec3 viewDir = normalize(vec3(0.0, 0.0, 4.3) - vWorldPos);
        float edgeValue = dot(viewDir, normNormal);
        float fresnel = pow(clamp(1.0 - edgeValue, 0.0, 1.0), 3.0);
        vec3 atmosphericGlow = vec3(0.35, 0.65, 1.0) * fresnel * 0.65;

        gl_FragColor = vec4(mixedColor + atmosphericGlow, 1.0);
      }
    `;

    const earthShaderMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uDayTexture: { value: textures.dayTexture },
        uNightTexture: { value: textures.nightTexture },
        uSunDirection: { value: new THREE.Vector3(12, 0, 0).normalize() },
        uCameraPos: { value: new THREE.Vector3(0, 0, 4.3) },
      },
    });

    // --- Mesh Generation in Three ---
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius, 64, 64),
      earthShaderMat
    );
    earthMesh.castShadow = true;
    earthMesh.receiveShadow = true;
    scene.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // --- Cloudy Atmosphere Overlay Layer ---
    const cloudTexture = generateCloudTexture();
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.35,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    // Create slightly larger shell
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(earthRadius * 1.02, 32, 32),
      cloudMat
    );
    scene.add(cloudMesh);
    cloudMeshRef.current = cloudMesh;

    // --- Kinetic Corrective Thrusters Plumes ---
    const thrustersGroup = new THREE.Group();
    scene.add(thrustersGroup);
    thrustersGroupRef.current = thrustersGroup;

    // Create custom glowing plasma cone shapes to represent active thrust emitters
    const createThrusterCone = (posX: number, posY: number, posZ: number, rotZ: number): THREE.Mesh => {
      const coneGeom = new THREE.ConeGeometry(0.08, 0.35, 8);
      // Offset geometry origin so it rotates from the nozzle base
      coneGeom.translate(0, 0.175, 0);
      
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x00dfff,
        transparent: true,
        opacity: 0.0, // starts invisible until trigger keys
        blending: THREE.AdditiveBlending,
      });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.set(posX, posY, posZ);
      cone.rotation.z = rotZ;
      thrustersGroup.add(cone);
      return cone;
    };

    // Four high-intensity corrector boosters
    thrusterMeshes.current = {
      NorthLeft: createThrusterCone(-0.85, 0.55, 0, -Math.PI / 4),  // Sinks top, rolls counter clockwise
      NorthRight: createThrusterCone(0.85, 0.55, 0, Math.PI / 4),   // Sinks top, rolls clockwise
      SouthLeft: createThrusterCone(-0.85, -0.55, 0, Math.PI / 4),  // Lifts bottom
      SouthRight: createThrusterCone(0.85, -0.55, 0, -Math.PI / 4), // Lifts bottom
    };

    // --- Collision Impact Exploding Particles Engine Setup ---
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particlesCount * 3);
    const velocities = new Float32Array(particlesCount * 3);
    const lifes = new Float32Array(particlesCount); // 0 means dead

    for (let i = 0; i < particlesCount; i++) {
      positions[i * 3] = 9999; // Far away initially
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
      lifes[i] = 0.0;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlePositions.current = positions;
    particleVelocities.current = velocities;
    particleLifes.current = lifes;
    particleGeometryRef.current = particleGeometry;

    const particleMaterial = new THREE.PointsMaterial({
      color: 0xff4b1f,
      size: 0.08,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparks = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(sparks);
    particlesRef.current = sparks;

    // --- Event Listener setup ---
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      
      // Mirror state for CSS indicator
      setControlsPressed(prev => ({
        ...prev,
        w: !!keysPressed.current['w'] || !!keysPressed.current['arrowup'],
        s: !!keysPressed.current['s'] || !!keysPressed.current['arrowdown'],
        a: !!keysPressed.current['a'] || !!keysPressed.current['arrowleft'],
        d: !!keysPressed.current['d'] || !!keysPressed.current['arrowright'],
      }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
      
      setControlsPressed(prev => ({
        ...prev,
        w: !!keysPressed.current['w'] || !!keysPressed.current['arrowup'],
        s: !!keysPressed.current['s'] || !!keysPressed.current['arrowdown'],
        a: !!keysPressed.current['a'] || !!keysPressed.current['arrowleft'],
        d: !!keysPressed.current['d'] || !!keysPressed.current['arrowright'],
      }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // --- Dynamic Resize using ResizeObserver ---
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = containerRef.current.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      
      const aspect = w / h;
      cameraRef.current.aspect = aspect;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(w, h);
      
      // Keep Earth scaled in narrow or portrait viewports
      const baseDistance = 4.3;
      cameraRef.current.position.z = baseDistance / Math.min(1, aspect);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // --- Start Loop ---
    statsRef.current.startTime = Date.now();
    let lastTime = performance.now();
    let animationFrameId: number;

    const gameLoop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (gameState === GameState.PLAYING) {
        statsRef.current.elapsedTime += dt;
        
        // Process Active Inputs & Physics simulation
        processControls(dt);
        resolveHazardsAndMeteors(dt);
        animateParticles(dt);
        // Update hazard visuals (solar flares, gravity tides)
        updateHazardVisuals(dt);
        updatePhysicsAndTelemetry(dt);
      }

      // Continuous visual rotation for background elements even during pauses
      if (cloudMeshRef.current) {
        cloudMeshRef.current.rotation.y += 0.003 * dt;
      }
      starField.rotation.y += 0.001 * dt;

      // Render Step
      // Keep camera focused on Earth so it never drifts out of view
      if (cameraRef.current && earthMeshRef.current) {
        cameraRef.current.lookAt((earthMeshRef.current.position as any));
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    // --- Unmount Clean Up ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      resizeObserver.disconnect();
      AudioEngine.setWarningActive(false);
      AudioEngine.setThrusterActive(false);

      if (containerRef.current && renderer.domElement) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        containerRef.current.removeChild(renderer.domElement);
      }
      
      // Dispose materials/buffers to prevent WebGL memory leaks (defensive checks)
      try { if (textures && textures.dayTexture && typeof textures.dayTexture.dispose === 'function') textures.dayTexture.dispose(); } catch (e) {}
      try { if (textures && textures.nightTexture && typeof textures.nightTexture.dispose === 'function') textures.nightTexture.dispose(); } catch (e) {}
      try { if (cloudTexture && typeof cloudTexture.dispose === 'function') cloudTexture.dispose(); } catch (e) {}
      try { if (starMat && typeof starMat.dispose === 'function') starMat.dispose(); } catch (e) {}
      try { if (starsGeom && typeof starsGeom.dispose === 'function') starsGeom.dispose(); } catch (e) {}
      try { if (dustField && dustField.geometry && typeof dustField.geometry.dispose === 'function') dustField.geometry.dispose(); } catch (e) {}
      try { const dfm = (dustField && (dustField.material as any)); if (dfm && typeof dfm.dispose === 'function') dfm.dispose(); } catch (e) {}
      try { if (earthShaderMat && typeof earthShaderMat.dispose === 'function') earthShaderMat.dispose(); } catch (e) {}
      try { if (earthMesh && (earthMesh.geometry) && typeof (earthMesh.geometry as any).dispose === 'function') (earthMesh.geometry as any).dispose(); } catch (e) {}
      try { if (cloudMat && typeof cloudMat.dispose === 'function') cloudMat.dispose(); } catch (e) {}
      try { if (cloudMesh && (cloudMesh.geometry) && typeof (cloudMesh.geometry as any).dispose === 'function') (cloudMesh.geometry as any).dispose(); } catch (e) {}
      try { if (coronaAura && (coronaAura.geometry) && typeof (coronaAura.geometry as any).dispose === 'function') (coronaAura.geometry as any).dispose(); } catch (e) {}
      try { const caMat = (coronaAura && (coronaAura.material as any)); if (caMat && typeof caMat.dispose === 'function') caMat.dispose(); } catch (e) {}
      try { if (sunVisualNode && (sunVisualNode.geometry) && typeof (sunVisualNode.geometry as any).dispose === 'function') (sunVisualNode.geometry as any).dispose(); } catch (e) {}
      try { const svnMat = (sunVisualNode && (sunVisualNode.material as any)); if (svnMat && typeof svnMat.dispose === 'function') svnMat.dispose(); } catch (e) {}
      
      // Clean up hazards
      // eslint-disable-next-line react-hooks/exhaustive-deps
      meteorsRef.current.forEach(m => {
        try {
          if (m && m.mesh) {
            // Remove from scene if present
            if (scene && typeof scene.remove === 'function') scene.remove(m.mesh);

            // Safe dispose geometry if exists
            const geom = (m.mesh as any).geometry;
            if (geom && typeof geom.dispose === 'function') {
              try { geom.dispose(); } catch (e) { /* swallow dispose errors */ }
            }

            // Safe dispose material(s)
            const mat = (m.mesh as any).material;
            if (mat) {
              if (Array.isArray(mat)) {
                mat.forEach((mm: any) => { if (mm && typeof mm.dispose === 'function') { try { mm.dispose(); } catch (e) {} } });
              } else if (typeof mat.dispose === 'function') {
                try { mat.dispose(); } catch (e) { /* ignore */ }
              }
            }
          }

          if (m && m.body && world && typeof world.removeBody === 'function') {
            try { world.removeBody(m.body); } catch (e) { /* ignore */ }
          }
        } catch (err) {
          // Defensive: guard against unexpected structures during hot reloads or partial cleanup
          // eslint-disable-next-line no-console
          console.warn('Error during meteor cleanup:', err);
        }
      });
      
      if (world && typeof world.clearForces === 'function') {
        try { world.clearForces(); } catch (e) { /* ignore */ }
      }
    };
  }, [gameState]); // Restart only when structural state transitions

  // Sync mute values on state perubahan
  useEffect(() => {
    if (isMuted) {
      AudioEngine.setVolume(0);
    } else {
      AudioEngine.setVolume(0.35);
    }
  }, [isMuted]);

  // -----------------------------------------------------
  // 3. Game Controllers & Corrective Thrusters
  // -----------------------------------------------------

  const processControls = (dt: number) => {
    const body = earthBodyRef.current;
    if (!body) return;

    // Base control impulse intensities
    // Scaled around Earth size/mass parameters
    // Reduced torque intensities for finer, less twitchy controls
    const tiltTorqueIntensity = CONFIG.controls.tiltTorque;
    const spinTorqueIntensity = CONFIG.controls.spinTorque;

    let isThrusterActive = false;
    let thrustIntensity = 1.0;

    // Reset indicator glows
    if (thrusterMeshes.current) {
      thrusterMeshes.current.NorthLeft.material.opacity = 0.0;
      thrusterMeshes.current.NorthRight.material.opacity = 0.0;
      thrusterMeshes.current.SouthLeft.material.opacity = 0.0;
      thrusterMeshes.current.SouthRight.material.opacity = 0.0;
    }

    // --- PITCH CONTROLS (Tilt Balance alignment) ---
    // Change Earth's obliquity tilt by applying torque along local X/Z axis
    if (keysPressed.current['w'] || keysPressed.current['arrowup']) {
      // Rotate North Pole forward (facing closer to sun)
      body.applyTorque(new CANNON.Vec3(0, 0, -tiltTorqueIntensity));
      if (thrusterMeshes.current) {
        thrusterMeshes.current.NorthLeft.material.opacity = 0.95;
        thrusterMeshes.current.SouthRight.material.opacity = 0.95;
      }
      isThrusterActive = true;
    }
    if (keysPressed.current['s'] || keysPressed.current['arrowdown']) {
      // Rotate North Pole backward (tilt away from sun)
      body.applyTorque(new CANNON.Vec3(0, 0, tiltTorqueIntensity));
      if (thrusterMeshes.current) {
        thrusterMeshes.current.NorthRight.material.opacity = 0.95;
        thrusterMeshes.current.SouthLeft.material.opacity = 0.95;
      }
      isThrusterActive = true;
    }

    // --- SPIN CONTROLS (Day-Night speed alignment) ---
    // Apply torque along the Earth's local polar spin axis (Y component)
    // To maintain physics integrity, we extract current local Y axis vector in world coords
    const localY = new CANNON.Vec3(0, 1, 0);
    const globalYAxis = body.quaternion.vmult(localY);

    if (keysPressed.current['a'] || keysPressed.current['arrowleft']) {
      // Counter-Clockwise SPIN accelerate
      const torque = globalYAxis.scale(spinTorqueIntensity);
      body.applyTorque(torque);
      if (thrusterMeshes.current) {
        thrusterMeshes.current.NorthLeft.material.opacity = 0.95;
        thrusterMeshes.current.SouthLeft.material.opacity = 0.95;
      }
      isThrusterActive = true;
    }
    if (keysPressed.current['d'] || keysPressed.current['arrowright']) {
      // Clockwise SPIN decelerate
      const torque = globalYAxis.scale(-spinTorqueIntensity);
      body.applyTorque(torque);
      if (thrusterMeshes.current) {
        thrusterMeshes.current.NorthRight.material.opacity = 0.95;
        thrusterMeshes.current.SouthRight.material.opacity = 0.95;
      }
      isThrusterActive = true;
    }

    // Sync ambient sound synthesizer thruster rumbling
    AudioEngine.setThrusterActive(isThrusterActive, thrustIntensity);
  };

  // On-screen control pads trigger
  const applyCorrectiveImpulse = (type: 'PITCH_UP' | 'PITCH_DOWN' | 'SPIN_CCW' | 'SPIN_CW') => {
    if (gameState !== GameState.PLAYING || !earthBodyRef.current) return;
    const body = earthBodyRef.current;
    
    const impulseForce = 4.5;
    const localY = new CANNON.Vec3(0, 1, 0);
    const globalYAxis = body.quaternion.vmult(localY);

    switch (type) {
      case 'PITCH_UP':
        body.applyTorque(new CANNON.Vec3(0, 0, impulseForce * 1.5));
        AudioEngine.playDynamicImpact(1.2);
        break;
      case 'PITCH_DOWN':
        body.applyTorque(new CANNON.Vec3(0, 0, -impulseForce * 1.5));
        AudioEngine.playDynamicImpact(1.2);
        break;
      case 'SPIN_CCW':
        body.applyTorque(globalYAxis.scale(impulseForce * 1.8));
        AudioEngine.playDynamicImpact(1.0);
        break;
      case 'SPIN_CW':
        body.applyTorque(globalYAxis.scale(-impulseForce * 1.8));
        AudioEngine.playDynamicImpact(1.0);
        break;
    }
  };

  // -----------------------------------------------------
  // 4. Cosmic Events & Danger Solicitations (Meteors & Winds)
  // -----------------------------------------------------

  // Spawn active 3D flaming meteors heading towards Earth to perturb axial tilt
  const spawnMeteorIncident = () => {
    const scene = sceneRef.current;
    const world = physicsWorldRef.current;
    if (!scene || !world) return;

    // Pick random launcher edge
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const launchDist = 5.2; // Spawn outer range

    const startX = launchDist * Math.sin(phi) * Math.cos(theta);
    const startY = launchDist * Math.sin(phi) * Math.sin(theta);
    const startZ = launchDist * Math.cos(phi);

    // Target slightly off center of Earth (0,0,0) to transfer angular torque on impact!
    const targetOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.4
    );

    const speed = 1.8 + Math.random() * 1.6;
    const velocityVec = new THREE.Vector3(0, 0, 0)
      .copy(targetOffset)
      .sub(new THREE.Vector3(startX, startY, startZ))
      .normalize()
      .multiplyScalar(speed);

    // Create Meteor THREE Mesh — prefer loaded model if available
    const meteorSize = 0.08 + Math.random() * 0.18; // allow bigger variance (used for physics)

    let meteorMesh: THREE.Object3D;
    const meteorModel = modelCacheRef.current.meteor;
    if (meteorModel) {
      // Clone the loaded model for this instance
      const cloned = meteorModel.clone(true) as THREE.Group;
      cloned.position.set(startX, startY, startZ);
      cloned.scale.setScalar(0.5 + Math.random() * 1.2);
      cloned.traverse((n) => {
        if ((n as THREE.Mesh).isMesh) {
          const m = n as THREE.Mesh;
          if (m.material) m.material = (m.material as THREE.Material).clone();
        }
      });
      cloned.castShadow = true;
      scene.add(cloned);
      meteorMesh = cloned;
    } else {
      // fallback procedural meteor
      const meteorGeom = new THREE.DodecahedronGeometry(meteorSize, 0);
      const meteorMat = new THREE.MeshStandardMaterial({
        color: 0x2b2b2b,
        roughness: 0.6,
        metalness: 0.2,
        emissive: 0xff4b1f,
        emissiveIntensity: 0.6,
      });
      const procedural = new THREE.Mesh(meteorGeom, meteorMat);
      procedural.position.set(startX, startY, startZ);
      procedural.castShadow = true;
      scene.add(procedural);
      meteorMesh = procedural;
    }

    // Small dynamic heat light that moves with meteor
    const meteorLight = new THREE.PointLight(0xffa76b, 0.8, 3, 2);
    meteorLight.position.copy((meteorMesh as any).position);
    scene.add(meteorLight);

    // Dynamic Trail particles (glowing plasma + smog)
    const trailGeom = new THREE.BufferGeometry();
    const pathPointsCount = 36;
    const trailPositions = new Float32Array(pathPointsCount * 3);
    for (let j = 0; j < pathPointsCount; j++) {
      trailPositions[j * 3] = startX;
      trailPositions[j * 3 + 1] = startY;
      trailPositions[j * 3 + 2] = startZ;
    }
    trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailPoints = new THREE.Points(trailGeom, new THREE.PointsMaterial({
      color: 0xffb86b,
      size: 0.06 + Math.random() * 0.06,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    scene.add(trailPoints);

    // Create Cannon Rigid Body for direct physical collision mapping
    const mShape = new CANNON.Sphere(meteorSize);
    const mBody = new CANNON.Body({
      mass: 0.85, // Lightweight but can transfer substantial torque relative to Earth
      shape: mShape,
    });
    mBody.position.set(startX, startY, startZ);
    mBody.velocity.set(velocityVec.x, velocityVec.y, velocityVec.z);
    mBody.linearDamping = 0.0;
    mBody.angularDamping = 0.0;
    world.addBody(mBody);

    // Store in track ref
    meteorsRef.current.push({
      mesh: meteorMesh,
      body: mBody,
      trailPoints,
      lifetime: 0.0,
      forceDir: new THREE.Vector3(velocityVec.x, velocityVec.y, velocityVec.z),
      light: meteorLight,
    });

    // Fire sound
    AudioEngine.playSolarFlareAlert();
  };

  // Handle active hazards lifecycle
  const resolveHazardsAndMeteors = (dt: number) => {
    const scene = sceneRef.current;
    const world = physicsWorldRef.current;
    if (!scene || !world) return;

    // --- Spanning meteor tracking ---
    const activeMeteors = meteorsRef.current;
    const survivingMeteors: typeof activeMeteors = [];

    for (let i = 0; i < activeMeteors.length; i++) {
      const item = activeMeteors[i];
      item.lifetime += dt;

      // Sync visual mesh with physics rigid body
      item.mesh.position.copy(item.body.position as any);
      item.mesh.quaternion.copy(item.body.quaternion as any);

      // If meteor has a light attached, update it as well
      (item as any).light && ((item as any).light.position.copy(item.body.position as any));

      // Rotate meteor mesh for rocky spin
      item.mesh.rotation.x += 1.5 * dt;

      // Update trail points based on trailing velocity
      const posAttr = item.trailPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      const positionsArray = posAttr.array as Float32Array;
      
      // Shift indices back, append current positions
      for (let j = posAttr.count - 1; j > 0; j--) {
        positionsArray[j * 3] = positionsArray[(j - 1) * 3];
        positionsArray[j * 3 + 1] = positionsArray[(j - 1) * 3 + 1];
        positionsArray[j * 3 + 2] = positionsArray[(j - 1) * 3 + 2];
      }
      positionsArray[0] = item.mesh.position.x;
      positionsArray[1] = item.mesh.position.y;
      positionsArray[2] = item.mesh.position.z;
      posAttr.needsUpdate = true;

      // Test collision with Earth (distance based)
      const dist = item.mesh.position.length();
      const didHitEarth = dist <= 1.05; // Earth radius + safety boundary
      const isOutOfSystem = dist > 8.0;

      if (didHitEarth) {
        // --- Planetary collision impact! ---
        // Transfer physical impulse torque to Earth
        const collisionImpulse = item.body.velocity.scale(earthBodyRef.current ? 4.5 : 1.0);
        earthBodyRef.current?.applyImpulse(collisionImpulse, item.body.position);

        // Spawn beautiful flash sparks at point of contact
        triggerVisualExplosion(item.mesh.position);

        // Explode sound
        AudioEngine.playDynamicImpact(6.0);

        // Clean up debris
        // Dispose safe for Group or Mesh
        const obj = item.mesh;
        scene.remove(obj);
        scene.remove(item.trailPoints);
        if ((item as any).light) scene.remove((item as any).light);
        world.removeBody(item.body);
        // Dispose geometry/materials recursively
        const disposeObject = (o: THREE.Object3D) => {
          o.traverse((n) => {
            const mesh = n as THREE.Mesh;
            if (mesh.isMesh) {
              if (mesh.geometry) mesh.geometry.dispose();
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => (m as THREE.Material).dispose());
              } else if (mesh.material) {
                (mesh.material as THREE.Material).dispose();
              }
            }
          });
        };
        try { disposeObject(obj); } catch (e) {}
        try { item.trailPoints.geometry.dispose(); (item.trailPoints.material as THREE.Material).dispose(); } catch (e) {}
      } else if (isOutOfSystem || item.lifetime > 6.0) {
        // Out of play container boundary
        const obj = item.mesh;
        scene.remove(obj);
        scene.remove(item.trailPoints);
        if ((item as any).light) scene.remove((item as any).light);
        world.removeBody(item.body);
        const disposeObject = (o: THREE.Object3D) => {
          o.traverse((n) => {
            const mesh = n as THREE.Mesh;
            if (mesh.isMesh) {
              if (mesh.geometry) mesh.geometry.dispose();
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => (m as THREE.Material).dispose());
              } else if (mesh.material) {
                (mesh.material as THREE.Material).dispose();
              }
            }
          });
        };
        try { disposeObject(obj); } catch (e) {}
        try { item.trailPoints.geometry.dispose(); (item.trailPoints.material as THREE.Material).dispose(); } catch (e) {}
      } else {
        survivingMeteors.push(item);
      }
    }
    meteorsRef.current = survivingMeteors;

    // --- Gravity winds & Solar Storms forces ---
    // Apply continuous drift torque if cosmic events are underway
    if (activeEvents.length > 0 && earthBodyRef.current) {
      const eBody = earthBodyRef.current;
      activeEvents.forEach((ev) => {
        if (ev.type === 'SOLAR_FLARE') {
          // Push axial spin (severe clockwise drift)
          const localY = new CANNON.Vec3(0, 1, 0);
          const globalY = eBody.quaternion.vmult(localY);
          eBody.applyTorque(globalY.scale(-3.5 * ev.intensity * dt));
        } else if (ev.type === 'GRAVITY_TIDE') {
          // Destabilize vertical coordinate poles (shifts polar axis tilt)
          eBody.applyTorque(new CANNON.Vec3(2.5 * ev.intensity * dt, 0, 1.8 * ev.intensity * dt));
        }
      });
    }

    // Spawn hazards periodically at higher difficulties
    // Reduce spawn rates for fairer gameplay, especially on hard difficulty
    const spawnRate = difficulty === Difficulty.HARD ? CONFIG.hazards.spawnRate.hard : (difficulty === Difficulty.MEDIUM ? CONFIG.hazards.spawnRate.medium : CONFIG.hazards.spawnRate.easy);
    if (Math.random() < spawnRate && gameState === GameState.PLAYING) {
      spawnMeteorIncident();
    }
  };

  // --- Hazard Visuals: create, update and cleanup more realistic effects ---
  const createSolarFlareVisual = (ev: any) => {
    const scene = sceneRef.current;
    if (!scene || !sunMeshRef.current) return;

    const flareModel = modelCacheRef.current.flare;
    if (flareModel) {
      const cloned = flareModel.clone(true) as THREE.Group;
      cloned.position.copy(sunMeshRef.current.position as any);
      cloned.lookAt(new THREE.Vector3(0, 0, 0));
      cloned.scale.setScalar(0.8 + ev.intensity * 0.4);
      cloned.traverse((n) => {
        if ((n as THREE.Mesh).isMesh) {
          const m = n as THREE.Mesh;
          if (m.material) m.material = (m.material as THREE.Material).clone();
          // boost emissive if available
          if ((m.material as any).emissive) (m.material as any).emissiveIntensity = 2.0 * ev.intensity;
        }
      });
      scene.add(cloned);

      const flareLight = new THREE.PointLight(0xffd6b3, 1.0 * ev.intensity, 14, 2);
      flareLight.position.copy(sunMeshRef.current.position as any);
      scene.add(flareLight);

      solarFlareEffectsRef.current[ev.id] = { cone: cloned as any, light: flareLight, particles: undefined };
      return;
    }

    // Fallback: Cone of charged particles from Sun towards Earth
    const length = 6 + ev.intensity * 3;
    const baseRadius = 1.8 + ev.intensity * 1.2;
    const coneGeom = new THREE.ConeGeometry(baseRadius, length, 32, 1, true);
    coneGeom.translate(0, -length / 2, 0); // point toward -Y local

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xff9a33,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.copy(sunMeshRef.current.position as any);
    cone.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(cone);

    // Warm flare light to briefly illuminate Earth's lit side
    const flareLight = new THREE.PointLight(0xffcfa0, 0.8 * ev.intensity, 12, 2);
    flareLight.position.copy(sunMeshRef.current.position as any);
    scene.add(flareLight);

    // Particle spray inside the cone for visual richness
    const particleCount = Math.min(120, Math.floor(40 * ev.intensity));
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // random point inside cone volume
      const r = Math.random() * baseRadius * (1 - Math.random() * 0.6);
      const y = -Math.random() * length;
      const theta = Math.random() * Math.PI * 2;
      positions[i * 3] = r * Math.cos(theta);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = r * Math.sin(theta);
    }
    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({ color: 0xffb86b, size: 0.08 + ev.intensity * 0.04, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(pGeom, pMat);
    // Attach to cone so it follows orientation
    cone.add(points);

    solarFlareEffectsRef.current[ev.id] = { cone, light: flareLight, particles: points };
  };

  const createGravityTideVisual = (ev: any) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Torus around equator to indicate tidal shear and bulge
    const major = 1.02;
    const tube = 0.06 + 0.03 * ev.intensity;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(major, tube, 16, 64),
      new THREE.MeshBasicMaterial({ color: 0x9b7cff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    torus.rotation.x = Math.PI / 2; // align around equator
    scene.add(torus);

    // Slight translucent polar bulge shells (north/south) to show stretching
    const bulgeGeom = new THREE.SphereGeometry(1.02, 32, 16);
    const bulgeMat = new THREE.MeshBasicMaterial({ color: 0x7bd1ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false });
    const bulge = new THREE.Mesh(bulgeGeom, bulgeMat);
    bulge.scale.set(1, 1 + 0.08 * ev.intensity, 1);
    scene.add(bulge);

    gravityTideEffectsRef.current[ev.id] = { ring: torus };
  };

  const updateHazardVisuals = (dt: number) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Create visuals for newly added events
    activeEvents.forEach((ev) => {
      if (ev.type === 'SOLAR_FLARE' && !solarFlareEffectsRef.current[ev.id]) {
        createSolarFlareVisual(ev);
      }
      if (ev.type === 'GRAVITY_TIDE' && !gravityTideEffectsRef.current[ev.id]) {
        createGravityTideVisual(ev);
      }
    });

    // Update solar flare visuals
    Object.keys(solarFlareEffectsRef.current).forEach((id) => {
      const fx = solarFlareEffectsRef.current[id];
      const ev = activeEvents.find(e => e.id === id);
      if (!ev) {
        // cleanup
        try {
          scene.remove(fx.cone);
          scene.remove(fx.light);
          if (fx.particles && (fx.cone as any).remove) (fx.cone as any).remove(fx.particles);
          // dispose geometry/materials recursively
          (fx.cone as THREE.Object3D).traverse((n) => {
            const m = n as THREE.Mesh;
            if (m.isMesh) {
              try { if (m.geometry) m.geometry.dispose(); } catch (e) {}
              try {
                if (Array.isArray(m.material)) m.material.forEach(mm => (mm as THREE.Material).dispose());
                else if (m.material) (m.material as THREE.Material).dispose();
              } catch (e) {}
            }
          });
          if (fx.particles) try { fx.particles.geometry.dispose(); } catch (e) {}
        } catch (e) {}
        delete solarFlareEffectsRef.current[id];
        return;
      }

      const t = Math.max(0.0001, ev.remaining / (ev.duration || 1));
      // flare intensity fades as it expires
      const targetOpacity = Math.max(0.05, 0.6 * t * Math.min(1.0, ev.intensity));
      (fx.cone.material as THREE.MeshBasicMaterial).opacity += (targetOpacity - (fx.cone.material as THREE.MeshBasicMaterial).opacity) * Math.min(0.2, dt * 4);
      fx.light.intensity = 1.2 * ev.intensity * t;

      // Keep positioning relative to Sun and pointing at Earth
      if (sunMeshRef.current) {
        fx.cone.position.copy(sunMeshRef.current.position as any);
        fx.cone.lookAt(new THREE.Vector3(0,0,0));
      }

      // Slight swirl of particles to imply charged plasma
      if (fx.particles) {
        const posAttr = fx.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const idx = i * 3;
          posAttr.array[idx] *= 0.995 + Math.random() * 0.002;
          posAttr.array[idx+2] *= 0.995 + Math.random() * 0.002;
        }
        posAttr.needsUpdate = true;
      }
    });

    // Update gravity tide visuals
    Object.keys(gravityTideEffectsRef.current).forEach((id) => {
      const fx = gravityTideEffectsRef.current[id];
      const ev = activeEvents.find(e => e.id === id);
      if (!ev) {
        try {
          scene.remove(fx.ring);
          (fx.ring.geometry as THREE.BufferGeometry).dispose();
          (fx.ring.material as THREE.Material).dispose();
        } catch (e) {}
        delete gravityTideEffectsRef.current[id];
        return;
      }

      const t = Math.max(0.0001, ev.remaining / (ev.duration || 1));
      // pulse stronger as event peaks
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.12 + (1 - t) * 0.6 * ev.intensity;
      const scale = 1 + (1 - t) * 0.22 * ev.intensity;
      fx.ring.scale.set(scale, scale, scale);
      fx.ring.rotation.y += dt * 0.6 * ev.intensity;
    });
  };

  // Spark debris particle calculations
  const triggerVisualExplosion = (pos: THREE.Vector3) => {
    const positions = particlePositions.current;
    const velocities = particleVelocities.current;
    const lifes = particleLifes.current;
    if (!positions || !velocities || !lifes) return;

    // Find dead particles to populate
    let loaded = 0;
    for (let i = 0; i < particlesCount; i++) {
      if (lifes[i] <= 0.0) {
        // Activate spark
        lifes[i] = 1.2; // seconds lifetime
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        // Spherical explosion distribution velocity
        const speed = 0.8 + Math.random() * 2.2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);

        velocities[i * 3] = speed * Math.sin(phi) * Math.cos(theta);
        velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
        velocities[i * 3 + 2] = speed * Math.cos(phi);

        loaded++;
        if (loaded >= 45) break; // Limit of sparks per collision
      }
    }

    if (particleGeometryRef.current) {
      particleGeometryRef.current.getAttribute('position').needsUpdate = true;
    }
  };

  const animateParticles = (dt: number) => {
    const list = particleLifes.current;
    const pos = particlePositions.current;
    const vel = particleVelocities.current;
    if (!list || !pos || !vel) return;

    let needsRefUpdate = false;

    for (let i = 0; i < particlesCount; i++) {
      if (list[i] > 0.0) {
        list[i] -= dt;

        // Move particle positions by velocity vector
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

        // Slow down drift velocity
        vel[i * 3] *= 0.95;
        vel[i * 3 + 1] *= 0.95;
        vel[i * 3 + 2] *= 0.95;

        if (list[i] <= 0) {
          // Off screen hiding
          pos[i * 3] = 9999;
        }
        needsRefUpdate = true;
      }
    }

    if (needsRefUpdate && particleGeometryRef.current) {
      particleGeometryRef.current.getAttribute('position').needsUpdate = true;
    }
  };

  // -----------------------------------------------------
  // 5. Physics Telemetry Sync & Scoring Logic
  // -----------------------------------------------------

  const updatePhysicsAndTelemetry = (dt: number) => {
    const world = physicsWorldRef.current;
    const body = earthBodyRef.current;
    const mesh = earthMeshRef.current;
    const clouds = cloudMeshRef.current;
    const thrusters = thrustersGroupRef.current;
    if (!world || !body || !mesh) return;

    // Advance Physics World
    world.fixedStep();

    // Prevent accidental linear drift (meteors/impulses may nudge Earth's position)
    // Keep Earth fixed at origin for camera consistency while allowing rotation
    try {
      if (body.position.length() > 1e-4) {
        // Only trigger the recentering HUD when a visible drift occurred
        if (!isRecentering) {
          setIsRecentering(true);
          // Hide the hint after a short time
          setTimeout(() => setIsRecentering(false), 1200);
        }
        body.position.set(0, 0, 0);
        body.velocity.set(0, 0, 0);
      }
    } catch (e) {
      // Defensive: if CANNON Vec3 API differs, silently continue
    }

    // Map Cannon's rigid body orientation transforms directly back to Three coordinate space
    mesh.position.copy(body.position as any);
    mesh.quaternion.copy(body.quaternion as any);

    if (clouds) {
      // Rotate clouds slightly out of sync of Earth for 3D depth parallax
      clouds.position.copy(body.position as any);
      clouds.quaternion.copy(body.quaternion as any);
    }

    if (thrusters) {
      // Sync booster positions aligned with the rotating sphere
      thrusters.position.copy(body.position as any);
      thrusters.quaternion.copy(body.quaternion as any);
    }

    // --- Calculate Axial Tilt Telemetry ---
    // Spin axis is local Y vector of the Earth (rotating under active physics)
    const localPole = new THREE.Vector3(0, 1, 0);
    localPole.applyQuaternion(mesh.quaternion);

    // Compute the tilt angle relative to global vertical (0, 1, 0)
    // Vertical reference is the orbit normal. Obliquity is angle between pole axis and reference.
    const verticalNormal = new THREE.Vector3(0, 1, 0);
    const tiltRadsVal = localPole.angleTo(verticalNormal);
    const angleTiltDeg = tiltRadsVal * (180 / Math.PI);

    // Filter orientation relative to Sun (+X vector)
    // On June Solstice, Earth is tilted precisely 23.44° towards the Sun in the plane.
    const idealSolsticeTiltRef = 23.44;
    const tiltDiff = Math.abs(angleTiltDeg - idealSolsticeTiltRef);

    // Alignment Accuracy indicator (percentage)
    // Max tolerance of 40 degrees offset for gameplay balance
    // More forgiving alignment sensitivity (wider tolerance)
    const accuracy = Math.max(0, Math.min(100, Math.round(100 - (tiltDiff / CONFIG.gameplay.alignmentToleranceDeg) * 100)));

    // --- Calculate Spin Speed Telemetry (RPM) ---
    const localSpinSpeed = body.angularVelocity.length();
    const rpmVal = (localSpinSpeed * 60) / (2 * Math.PI);

    // Ideal spin speed range: 1.0 - 2.5 RPM
    let speedPenalizer = 0.0;
    if (rpmVal < 0.2) {
      // Static planet: side scorching heat!
      speedPenalizer = 4.0; 
    } else if (rpmVal > 4.5) {
      // Ultra spin: atmospheric depletion
      speedPenalizer = 3.5;
    } else if (rpmVal > 2.5) {
      // Mild speed drift warning
      speedPenalizer = 1.0;
    }

    // --- Day-Night Thermal Balance Integrity Calculations ---
    // If alignment is perfect and speed is ideal, integrity stays at 100% (Balanced!)
    // If it drifts, of course integrity starts dropping
    let drainFactor = 0.0;
    if (accuracy < 70) {
      drainFactor += (70 - accuracy) * 0.12; 
    }
    drainFactor += speedPenalizer;

    // Apply scaling per difficulty level
    // Lowered difficulty drain multipliers to make recovery more achievable
    const diffMultiplier = difficulty === Difficulty.HARD ? 1.2 : (difficulty === Difficulty.MEDIUM ? 0.7 : 0.25);
    
    // Core depletion calculation
    let currentIntegrity = statsRef.current.balanceIntegrity;
    if (drainFactor > 0) {
      currentIntegrity = Math.max(0, currentIntegrity - drainFactor * diffMultiplier * dt);
      AudioEngine.setWarningActive(currentIntegrity < 42); // Trigger Web Audio danger alert hums!
    } else {
      // Regain structural integrity slowly if stabilized
      currentIntegrity = Math.min(100, currentIntegrity + 4.5 * dt);
      AudioEngine.setWarningActive(false);
    }
    
    // Accumulate scores if parameters are healthy
    let addedScore = 0;
    if (accuracy >= 80 && rpmVal >= 0.8 && rpmVal <= 2.8) {
      // Stable balancing score bonus!
      addedScore = Math.floor(10 * diffMultiplier);
      
      // Periodic success celebration twinkle sound
      if (Math.random() < 0.008) {
        AudioEngine.playAlignmentSuccess();
      }
    } else {
      // Minimum passive survival increment
      addedScore = 1;
    }

    // Update statistical structures for rendering in UI loop
    statsRef.current.balanceIntegrity = currentIntegrity;
    statsRef.current.currentAlignment = accuracy;
    statsRef.current.currentRPM = rpmVal;
    statsRef.current.score = score + addedScore;
    if (accuracy > statsRef.current.maxAlignment) {
      statsRef.current.maxAlignment = accuracy;
    }

    // Emit live scores back to React state hooks
    onUpdateScore(statsRef.current.score, accuracy, rpmVal);
    
    setLocalStats({
      alignment: accuracy,
      rpm: rpmVal,
      integrity: currentIntegrity,
      targetTilt: idealSolsticeTiltRef,
      currentTilt: angleTiltDeg,
    });

    // Test Ecosystem failure condition (Game Over!)
    if (currentIntegrity <= 0) {
      AudioEngine.playGameOver();
      onGameOver(
        statsRef.current.score,
        statsRef.current.maxAlignment,
        Math.floor(statsRef.current.elapsedTime)
      );
    }
  };

  // -----------------------------------------------------
  // 6. UI Render & On-Screen Control Anchors
  // -----------------------------------------------------

  return (
    <div className="absolute inset-0 flex flex-col justify-between overflow-hidden">
      {/* 3D WebGL Mounting Stage */}
      <div 
        id="canvas3d-container" 
        ref={containerRef} 
        className="absolute top-0 right-0 bottom-0 left-20 sm:left-64 z-0 select-none outline-none overflow-hidden touch-none"
      />

      {/* Modern HUD overlays overlaying WebGL Container (Visible only when playing in cockpit) */}
      {gameState === GameState.PLAYING && (
        <div className="relative z-10 p-4 pointer-events-none w-full flex flex-col justify-between h-full">
          
          {/* Top telemetry panel bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-6xl mx-auto">
            
            {/* Planetary Balance health meter */}
            <div className="p-3 sm:p-3.5 bg-[#040815]/70 border border-white/10 rounded-2xl backdrop-blur-md pointer-events-auto shadow-[0_0_20px_rgba(16,185,129,0.04)] w-full">
              <div className="flex justify-between items-center mb-1 text-xs">
                <span className="font-mono font-bold tracking-wider text-slate-300 uppercase flex items-center gap-1.5 text-[10px]">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Ecosystem Integrity
                </span>
                <span className={`font-mono font-black ${localStats.integrity < 40 ? 'text-rose-400 animate-pulse' : 'text-emerald-400 glow-emerald'}`}>
                  {Math.round(localStats.integrity)}%
                </span>
              </div>
              {/* Visual health bar */}
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                <div 
                  id="ecosystem-health-bar"
                  className={`h-full transition-all duration-150 rounded-full ${
                    localStats.integrity < 40 ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-gradient-to-r from-emerald-500 to-sky-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  }`}
                  style={{ width: `${localStats.integrity}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[8px] text-slate-400 font-mono tracking-wider uppercase">
                <span>Solstice Threshold</span>
                {localStats.integrity < 40 && (
                  <span className="text-rose-400 flex items-center gap-1 font-bold animate-ping">
                    <AlertTriangle className="w-2.5 h-2.5" /> CRITICAL
                  </span>
                )}
              </div>
            </div>

            {/* Alignment status */}
            <div className="p-3 sm:p-3.5 bg-[#040815]/70 border border-white/10 rounded-2xl backdrop-blur-md pointer-events-auto flex flex-col gap-0.5 shadow-[0_0_20px_rgba(56,189,248,0.04)] w-full">
              <div className="flex justify-between text-xs items-center">
                <span className="text-slate-400 uppercase tracking-widest font-mono text-[9px]">Axial Obliquity</span>
                <span className="text-slate-100 font-mono font-black glow-blue">{localStats.currentTilt.toFixed(2)}°</span>
              </div>
              <div className="flex justify-between text-xs items-center">
                <span className="text-slate-400 uppercase tracking-widest font-mono text-[9px]">Solstice Zenith</span>
                <span className="text-orange-400 font-mono font-bold">{localStats.targetTilt}° N</span>
              </div>
              
              <div className="mt-1 pt-1 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Calibration Acc.</span>
                <span className={`text-xs font-black font-mono tracking-wider ${localStats.alignment > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {localStats.alignment}%
                </span>
              </div>
            </div>

            {/* RPM stats */}
            <div className="p-3 sm:p-3.5 bg-[#040815]/70 border border-white/10 rounded-2xl backdrop-blur-md pointer-events-auto flex flex-col gap-0.5 shadow-[0_0_20px_rgba(56,189,248,0.04)] w-full">
              <div className="flex justify-between text-xs items-center font-mono">
                <span className="text-slate-400 uppercase tracking-widest text-[9px]">Rotational Velocity</span>
                <span className={`font-bold ${localStats.rpm > 3.5 || localStats.rpm < 0.3 ? 'text-rose-400 animate-pulse' : 'text-sky-400'}`}>
                  {localStats.rpm.toFixed(2)} RPM
                </span>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
                <span>Ideal Core Band</span>
                <span className="text-emerald-400">1.0 - 2.5 RPM</span>
              </div>
              {localStats.rpm < 0.3 && (
                <div className="text-[8px] tracking-wider uppercase font-mono text-rose-400 font-black bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded mt-1 text-center animate-pulse">
                  WARNING: Thermal Over-Exposure
                </div>
              )}
              {localStats.rpm > 3.5 && (
                <div className="text-[8px] tracking-wider uppercase font-mono text-rose-400 font-black bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded mt-1 text-center animate-pulse">
                  WARNING: Atmospheric Erosion
                </div>
              )}
            </div>

          </div>

          {/* Bottom controls panel (Touch Thruster Boosters) */}
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 w-full mt-auto">
            
            {/* Active alerts panel */}
            <div className="flex flex-col gap-2 max-w-sm w-full pointer-events-auto z-10">
              {activeEvents.map((ev) => (
                <div 
                  key={ev.id} 
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.6)] ${
                    ev.type === 'SOLAR_FLARE' ? 'bg-amber-500/[0.04] border-orange-500/35 text-amber-200 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-purple-500/[0.04] border-purple-500/35 text-purple-200'
                  }`}
                >
                  <div className="mt-0.5 p-1 bg-black/50 rounded-full border border-white/[0.05]">
                    <AlertTriangle className={`w-3.5 h-3.5 ${ev.type === 'SOLAR_FLARE' ? 'text-orange-400' : 'text-purple-400'}`} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-[10px] uppercase font-mono tracking-wider">{ev.name}</h4>
                    <p className="text-[10px] leading-relaxed text-slate-400 mt-1">{ev.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* On Screen Balancing Thrusters controller panel */}
            <div className="p-5 bg-[#040815]/90 border border-white/10 rounded-2xl backdrop-blur-xl flex flex-col items-center gap-4 w-full max-w-sm pointer-events-auto self-center md:self-end shadow-[0_0_40px_rgba(0,0,0,0.6)]">
              <span className="text-[9px] font-mono uppercase font-black tracking-[0.2em] text-orange-400 flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                Corrective Plasma Thrusters
              </span>
              
              <div className="grid grid-cols-2 gap-2.5 w-full">
                {/* Pitch Adjust controls */}
                <div className="flex flex-col gap-2">
                  <button
                    id="thruster-pitch-down"
                    onClick={() => applyCorrectiveImpulse('PITCH_DOWN')}
                    className="px-3.5 py-2 text-[9px] font-bold font-mono uppercase tracking-widest bg-white/[0.03] hover:bg-white/[0.09] hover:text-white border border-white/10 hover:border-orange-500/50 rounded-xl text-slate-300 flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Pitch foward (W)
                  </button>
                  <button
                    id="thruster-pitch-up"
                    onClick={() => applyCorrectiveImpulse('PITCH_UP')}
                    className="px-3.5 py-2 text-[9px] font-bold font-mono uppercase tracking-widest bg-white/[0.03] hover:bg-white/[0.09] hover:text-white border border-white/10 hover:border-orange-500/50 rounded-xl text-slate-300 flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Pitch backward (S)
                  </button>
                </div>

                {/* Spin Adjust controls */}
                <div className="flex flex-col gap-2">
                  <button
                    id="thruster-spin-ccw"
                    onClick={() => applyCorrectiveImpulse('SPIN_CCW')}
                    className="px-3.5 py-2 text-[9px] font-bold font-mono uppercase tracking-widest bg-white/[0.03] hover:bg-white/[0.09] hover:text-white border border-white/10 hover:border-orange-500/50 rounded-xl text-slate-400 hover:text-emerald-400 flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Spin Fast (A)
                  </button>
                  <button
                    id="thruster-spin-cw"
                    onClick={() => applyCorrectiveImpulse('SPIN_CW')}
                    className="px-3.5 py-2 text-[9px] font-bold font-mono uppercase tracking-widest bg-white/[0.03] hover:bg-white/[0.09] hover:text-white border border-white/10 hover:border-orange-500/50 rounded-xl text-slate-400 hover:text-teal-400 flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Spin Slow (D)
                  </button>
                </div>
              </div>

              {/* Micro instructions */}
              <div className="text-[9px] text-slate-500 text-center flex items-center gap-1.5 font-mono">
                <span>KEYBOARD MATRIX:</span>
                <kbd className="bg-slate-950 px-1.5 py-0.5 rounded text-orange-400 font-bold border border-white/5 shadow-inner">W</kbd>
                <kbd className="bg-slate-950 px-1.5 py-0.5 rounded text-orange-400 font-bold border border-white/5 shadow-inner">S</kbd>
                <kbd className="bg-slate-950 px-1.5 py-0.5 rounded text-orange-400 font-bold border border-white/5 shadow-inner">A</kbd>
                <kbd className="bg-slate-950 px-1.5 py-0.5 rounded text-orange-400 font-bold border border-white/5 shadow-inner">D</kbd>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
