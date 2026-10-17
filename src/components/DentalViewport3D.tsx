import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CAMERA_PRESETS,
  type DentalSector,
  type GameSessionState,
} from '../game/dentalRules';
import {
  type BuiltDentalArch,
  bindExternalGlbDentalArch,
  buildProceduralDentalArch,
  createColgateRedBrush3D,
  syncTeethVisualState,
} from '../three/proceduralDentalArch';

const DEFAULT_MOUTH_GLB_URL = new URL('../assets/mouth_test.glb', import.meta.url).href;

export interface DentalViewport3DProps {
  session: GameSessionState;
  onScrubTooth: (fdiId: string, coverageDelta: number) => void;
  customGlbBuffer: ArrayBuffer | null;
  onModelLoaded?: (source: 'PROCEDURAL' | 'GLB', meshCount: number, name?: string) => void;
}

const _ndcPointer = new THREE.Vector2();
const _targetCamPos = new THREE.Vector3();
const _currentCamLookAt = new THREE.Vector3(0, -0.04, 0.4);
const _targetCamLookAt = new THREE.Vector3(0, -0.04, 0.4);
const _brushTargetPos = new THREE.Vector3(0.22, 0.25, 2.0);
const _brushCurrentPos = new THREE.Vector3(0.22, 0.25, 2.0);
const _brushLookAtTarget = new THREE.Vector3(2.2, 0.9, 2.8);
const _hitNormalWorld = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _particleDummy = new THREE.Object3D();
const _particleColor = new THREE.Color();

const MAX_PARTICLES = 96;

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  scale: number;
  isViolet: boolean;
}

export const DentalViewport3D: React.FC<DentalViewport3DProps> = ({
  session,
  onScrubTooth,
  customGlbBuffer,
  onModelLoaded,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<GameSessionState>(session);
  const onScrubToothRef = useRef(onScrubTooth);
  const onModelLoadedRef = useRef(onModelLoaded);

  sessionRef.current = session;
  onScrubToothRef.current = onScrubTooth;
  onModelLoadedRef.current = onModelLoaded;

  const swapGlbHandlerRef = useRef<((buffer: ArrayBuffer) => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isDisposed = false;
    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Hardware-Antialiased Transparent WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('data-testid', 'dental-3d-canvas');
    renderer.domElement.style.touchAction = 'none';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene & Studio Environment Reflection (`RoomEnvironment`)
    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture: THREE.Texture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.72;
    pmremGenerator.dispose();

    // 3. Camera Setup
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 45);
    camera.position.set(0, 0.06, 7.84);
    camera.lookAt(_currentCamLookAt);

    // 4. Balanced Clinical Studio Lighting Rig (Bright Pearly Enamel + Soft Lavender Fill)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xf3e8ff, 1.25);
    hemiLight.position.set(0, 6, 3);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffdf9, 1.75);
    keyLight.position.set(1.8, 2.8, 6.5);
    keyLight.castShadow = !isHeadless;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 15.0;
    const d = 3.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf5edff, 0.95);
    fillLight.position.set(-3.8, 0.8, 5.2);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xa855f7, 1.6, 12);
    rimLight.position.set(0, 1.8, -3.2);
    scene.add(rimLight);

    // Soft radial shadow beneath the lower gingiva
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
      grad.addColorStop(0, 'rgba(109, 40, 217, 0.16)');
      grad.addColorStop(0.55, 'rgba(139, 92, 246, 0.06)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowGeo = new THREE.PlaneGeometry(5.2, 3.8);
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadowMesh.position.set(0, -1.42, 0.2);
    scene.add(contactShadowMesh);

    // 5. Build Initial Arch & Automatically Load `src/assets/mouth_test.glb`
    let currentArch: BuiltDentalArch = buildProceduralDentalArch();
    scene.add(currentArch.archGroup);
    document.body.dataset.modelLoaded = 'procedural';

    const gltfLoader = new GLTFLoader();

    // Load default bundled `mouth_test.glb` automatically
    gltfLoader.load(
      DEFAULT_MOUTH_GLB_URL,
      (gltf) => {
        if (isDisposed) return;
        scene.remove(currentArch.archGroup);
        currentArch.dispose();
        currentArch = bindExternalGlbDentalArch(gltf.scene);
        scene.add(currentArch.archGroup);
        document.body.dataset.modelLoaded = 'glb';
        onModelLoadedRef.current?.('GLB', currentArch.toothNodes.size, 'mouth_test.glb');
      },
      undefined,
      () => {
        // Fallback remains procedural if asset load fails
      },
    );

    swapGlbHandlerRef.current = (buffer: ArrayBuffer) => {
      gltfLoader.parse(
        buffer,
        '',
        (gltf) => {
          if (isDisposed) return;
          scene.remove(currentArch.archGroup);
          currentArch.dispose();
          currentArch = bindExternalGlbDentalArch(gltf.scene);
          scene.add(currentArch.archGroup);
          onModelLoadedRef.current?.('GLB', currentArch.toothNodes.size);
        },
        () => {},
      );
    };

    // 6. Build Articulated 3D Colgate Red Brush (`PINCEL`)
    const { brushGroup, bristleTipMesh, dispose: disposeBrush } = createColgateRedBrush3D();
    brushGroup.position.copy(_brushCurrentPos);
    scene.add(brushGroup);

    // 7. Fine Micro-Sparkle Particle Ring Buffer (`THREE.InstancedMesh`)
    const particleGeo = new THREE.OctahedronGeometry(0.024, 1);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    const particles: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      maxAge: 0.55,
      scale: 0,
      isViolet: false,
    }));
    let particleCursor = 0;

    const spawnParticles = (origin: THREE.Vector3, count: number, burstPower = 1.0) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % MAX_PARTICLES;
        p.active = true;
        p.x = origin.x + (Math.random() - 0.5) * 0.24;
        p.y = origin.y + (Math.random() - 0.3) * 0.24;
        p.z = origin.z + 0.05 + Math.random() * 0.12;
        p.vx = (Math.random() - 0.45) * 0.85 * burstPower;
        p.vy = (0.15 + Math.random() * 0.95) * burstPower;
        p.vz = (0.15 + Math.random() * 0.65) * burstPower;
        p.age = 0;
        p.maxAge = 0.42 + Math.random() * 0.45;
        p.scale = (0.45 + Math.random() * 0.75) * burstPower;
        p.isViolet = i % 3 === 0;
      }
    };

    for (let i = 0; i < MAX_PARTICLES; i++) {
      _particleDummy.scale.setScalar(0);
      _particleDummy.updateMatrix();
      particleMesh.setMatrixAt(i, _particleDummy.matrix);
      particleMesh.setColorAt(i, _particleColor.setHex(0xffffff));
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

    // 8. Touch & Pointer Raycasting Discipline (Layer 1)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    let isPointerDown = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lastRaycastTime = 0;
    let brushActiveUntil = 0;
    let hoveredFdiId: string | null = null;
    let cameraTrauma = 0;
    let prevShieldedCount = sessionRef.current.shieldedCount;
    let ambientSparkleTimer = 0;

    const handleSurfaceRaycast = (clientX: number, clientY: number, isDragging: boolean) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      _ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndcPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_ndcPointer, camera);
      const hits = raycaster.intersectObjects(currentArch.interactableMeshes, false);

      if (hits.length > 0) {
        const hit = hits[0];
        const hitMesh = hit.object as THREE.Mesh;
        const fdiId = hitMesh.userData.fdiId as string | undefined;
        hoveredFdiId = fdiId ?? null;

        if (hit.face) {
          _normalMatrix.getNormalMatrix(hitMesh.matrixWorld);
          _hitNormalWorld.copy(hit.face.normal).applyMatrix3(_normalMatrix).normalize();
        } else {
          _hitNormalWorld.set(0, 0, 1);
        }

        _brushTargetPos.copy(hit.point).addScaledVector(_hitNormalWorld, 0.03);
        // Angle brush wand toward upper-right like the reference concept render
        _brushLookAtTarget
          .copy(_brushTargetPos)
          .addScaledVector(_hitNormalWorld, 0.9)
          .add(new THREE.Vector3(1.85, 0.62, 0.55));
        brushActiveUntil = performance.now() + 400;

        if (fdiId && sessionRef.current.status === 'playing' && isDragging) {
          const toothState = sessionRef.current.teeth[fdiId];
          if (
            toothState &&
            toothState.needsVarnish &&
            !toothState.shielded &&
            toothState.sector === sessionRef.current.activeSector
          ) {
            const dx = clientX - lastPointerX;
            const dy = clientY - lastPointerY;
            const moveDist = Math.hypot(dx, dy);
            const scrubDelta = Math.min(0.38, 0.14 + moveDist * 0.0085);
            onScrubToothRef.current(fdiId, scrubDelta);
            spawnParticles(hit.point, 5, 0.95);
          }
        }
      }

      lastPointerX = clientX;
      lastPointerY = clientY;
    };

    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      handleSurfaceRaycast(e.clientX, e.clientY, true);
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastTime < 16) return;
      lastRaycastTime = now;
      const isActivelyBrushing = isPointerDown || e.pointerType === 'touch' || e.buttons > 0;
      handleSurfaceRaycast(e.clientX, e.clientY, isActivelyBrushing);
    };

    const onPointerUp = () => {
      isPointerDown = false;
    };

    const clearInputs = () => {
      isPointerDown = false;
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('blur', clearInputs);

    // 9. Responsive ResizeObserver
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // 10. Main 60 FPS Animation & Exponential Camera Damping Loop
    const startPerfMs = performance.now();
    let prevFrameMs = startPerfMs;
    let animFrameId = 0;
    let lastHeadlessRenderAt = 0;

    const animate = (nowMs: number) => {
      animFrameId = requestAnimationFrame(animate);

      if (isHeadless && lastHeadlessRenderAt > 0 && nowMs - lastHeadlessRenderAt < 90) {
        return;
      }
      lastHeadlessRenderAt = nowMs;

      const rawDt = Math.max(0.001, (nowMs - prevFrameMs) / 1000);
      prevFrameMs = nowMs;
      const dt = Math.min(rawDt, 0.05);
      const elapsed = (nowMs - startPerfMs) / 1000;
      const curSession = sessionRef.current;

      if (curSession.shieldedCount > prevShieldedCount) {
        prevShieldedCount = curSession.shieldedCount;
        cameraTrauma = Math.min(1.0, cameraTrauma + 0.25);
        spawnParticles(_brushCurrentPos, 22, 1.35);
      } else if (curSession.shieldedCount < prevShieldedCount) {
        prevShieldedCount = curSession.shieldedCount;
      }

      let preset = CAMERA_PRESETS[curSession.activeSector as DentalSector] ?? CAMERA_PRESETS.FRONT;
      if (curSession.status === 'title') {
        preset = CAMERA_PRESETS.ATTRACT;
      } else if (curSession.status === 'gameover' && curSession.outcome === 'victory') {
        preset = CAMERA_PRESETS.VICTORY;
      }

      const portraitDistScale =
        camera.aspect < 1.15
          ? Math.min(1.85, Math.pow(1.15 / Math.max(0.35, camera.aspect), 0.72))
          : 1.0;

      _targetCamPos.set(
        preset.position[0] * portraitDistScale,
        preset.position[1],
        preset.position[2] * portraitDistScale,
      );
      _targetCamLookAt.set(preset.lookAt[0], preset.lookAt[1], preset.lookAt[2]);

      if (curSession.status === 'title') {
        _targetCamPos.x += Math.sin(elapsed * 0.45) * 0.14;
        _targetCamPos.y += Math.cos(elapsed * 0.65) * 0.04;
      } else if (curSession.status === 'gameover' && curSession.outcome === 'victory') {
        _targetCamPos.x += Math.sin(elapsed * 0.8) * 1.1;
        _targetCamPos.y += Math.sin(elapsed * 1.2) * 0.12;
      }

      const camLambda = isHeadless ? 16.0 : 5.5;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, camLambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, camLambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, camLambda, dt);

      _currentCamLookAt.x = THREE.MathUtils.damp(_currentCamLookAt.x, _targetCamLookAt.x, camLambda, dt);
      _currentCamLookAt.y = THREE.MathUtils.damp(_currentCamLookAt.y, _targetCamLookAt.y, camLambda, dt);
      _currentCamLookAt.z = THREE.MathUtils.damp(_currentCamLookAt.z, _targetCamLookAt.z, camLambda, dt);

      if (cameraTrauma > 0.001) {
        const shake = cameraTrauma * cameraTrauma * 0.025;
        camera.position.x += Math.sin(elapsed * 45) * shake;
        camera.position.y += Math.cos(elapsed * 52) * shake;
        cameraTrauma = Math.max(0, cameraTrauma - dt * 2.8);
      }

      if (Math.abs(camera.fov - preset.fov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, preset.fov, 4.5, dt);
        camera.updateProjectionMatrix();
      }
      camera.lookAt(_currentCamLookAt);

      // Determine which tooth the Colgate Red Brush is currently resting on / scrubbing
      let activeBrushedFdiId: string | null = null;
      brushGroup.visible = curSession.status === 'playing' || curSession.status === 'title';

      if (nowMs < brushActiveUntil && hoveredFdiId) {
        activeBrushedFdiId = hoveredFdiId;
      } else if (curSession.status === 'title') {
        // In Title/Attract view, poise the Colgate Red Brush on `tooth_21` (upper right central incisor)
        // just like the reference key visual render!
        const heroNode =
          currentArch.toothNodes.get('tooth_21') ??
          currentArch.toothNodes.get('tooth_11') ??
          currentArch.toothNodes.values().next().value;
        if (heroNode) {
          activeBrushedFdiId = heroNode.fdiId;
          _brushTargetPos
            .copy(heroNode.surfaceCenterWorld)
            .addScaledVector(heroNode.surfaceNormalWorld, 0.04);
          _brushTargetPos.x += Math.sin(elapsed * 3.2) * 0.035;
          _brushTargetPos.y += 0.05 + Math.cos(elapsed * 4.0) * 0.025;
          _brushLookAtTarget
            .copy(_brushTargetPos)
            .addScaledVector(heroNode.surfaceNormalWorld, 0.85)
            .add(new THREE.Vector3(1.95, 0.68, 0.55));
        }
      } else if (curSession.status === 'playing') {
        // Guide the 3D Red Brush toward the current or next unshielded target tooth in the active sector
        const activeTarget =
          Object.values(curSession.teeth).find(
            (t) =>
              t.sector === curSession.activeSector &&
              t.needsVarnish &&
              !t.shielded &&
              t.coverage > 0,
          ) ??
          Object.values(curSession.teeth).find(
            (t) => t.sector === curSession.activeSector && t.needsVarnish && !t.shielded,
          );

        if (activeTarget) {
          activeBrushedFdiId = activeTarget.fdiId;
          const node = currentArch.toothNodes.get(activeTarget.fdiId);
          if (node) {
            const scrubOscX = Math.sin(elapsed * 7.5) * 0.045;
            const scrubOscY = Math.cos(elapsed * 9.0) * 0.035;
            _brushTargetPos
              .copy(node.surfaceCenterWorld)
              .addScaledVector(node.surfaceNormalWorld, 0.04);
            _brushTargetPos.x += scrubOscX;
            _brushTargetPos.y += scrubOscY;

            _brushLookAtTarget
              .copy(_brushTargetPos)
              .addScaledVector(node.surfaceNormalWorld, 0.85)
              .add(new THREE.Vector3(1.85, 0.64, 0.55));
          }
        }
      }

      const brushLambda = 18.0;
      _brushCurrentPos.x = THREE.MathUtils.damp(_brushCurrentPos.x, _brushTargetPos.x, brushLambda, dt);
      _brushCurrentPos.y = THREE.MathUtils.damp(_brushCurrentPos.y, _brushTargetPos.y, brushLambda, dt);
      _brushCurrentPos.z = THREE.MathUtils.damp(_brushCurrentPos.z, _brushTargetPos.z, brushLambda, dt);
      brushGroup.position.copy(_brushCurrentPos);
      brushGroup.lookAt(_brushLookAtTarget);

      // Continuous delicate micro-sparkles around the brush contact point (matching reference image)
      ambientSparkleTimer += dt;
      if (brushGroup.visible && ambientSparkleTimer >= 0.065) {
        ambientSparkleTimer = 0;
        spawnParticles(_brushCurrentPos, 2, 0.6);
      }

      const isScrubbingNow = nowMs < brushActiveUntil;
      const tipScale = isScrubbingNow ? 1.12 + Math.sin(elapsed * 28) * 0.1 : 1.0;
      bristleTipMesh.scale.set(tipScale, tipScale, tipScale * 1.15);

      syncTeethVisualState(
        currentArch.toothNodes,
        curSession.teeth,
        curSession.activeSector,
        elapsed,
        activeBrushedFdiId,
      );

      let anyParticleUpdated = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (!p.active) continue;
        anyParticleUpdated = true;
        p.age += dt;
        if (p.age >= p.maxAge) {
          p.active = false;
          _particleDummy.scale.setScalar(0);
          _particleDummy.updateMatrix();
          particleMesh.setMatrixAt(i, _particleDummy.matrix);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy += 0.25 * dt;

        const lifeRatio = 1 - p.age / p.maxAge;
        _particleDummy.position.set(p.x, p.y, p.z);
        _particleDummy.rotation.set(p.age * 4, p.age * 6, 0);
        _particleDummy.scale.setScalar(p.scale * lifeRatio);
        _particleDummy.updateMatrix();
        particleMesh.setMatrixAt(i, _particleDummy.matrix);
        particleMesh.setColorAt(
          i,
          _particleColor.setHex(p.isViolet ? 0xd8b4fe : 0xffffff),
        );
      }
      if (anyParticleUpdated) {
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('blur', clearInputs);

      currentArch.dispose();
      disposeBrush();
      particleGeo.dispose();
      particleMat.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      contactShadowTex.dispose();
      envTexture?.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (customGlbBuffer && swapGlbHandlerRef.current) {
      swapGlbHandlerRef.current(customGlbBuffer);
    }
  }, [customGlbBuffer]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-10 w-full h-full cursor-crosshair"
      aria-label="Lienzo Dental Interactivo 3D Colgate Duraphat"
    />
  );
};
