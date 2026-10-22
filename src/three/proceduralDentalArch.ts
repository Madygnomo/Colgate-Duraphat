import * as THREE from 'three';
import {
  CLINICAL_FDI_CATALOG,
  type BrushDirection,
  type DentalSector,
  type ToothArchetype,
  type ToothMetadata,
  type ToothRuntimeState,
  classifySectorByBoundingBoxCenter,
  getSectorForFdiNumber,
  parseFdiNumberFromMeshName,
} from '../game/dentalRules';

export interface ToothVisualNode {
  fdiId: string;
  fdiNumber: number;
  sector: DentalSector;
  isUpper: boolean;
  group: THREE.Group;
  crownMesh: THREE.Mesh;
  plaqueMesh: THREE.Mesh;
  shieldMesh: THREE.Mesh;
  arrowMesh: THREE.Mesh;
  surfaceCenterWorld: THREE.Vector3;
  surfaceNormalWorld: THREE.Vector3;
}

export interface BuiltDentalArch {
  archGroup: THREE.Group;
  toothNodes: Map<string, ToothVisualNode>;
  interactableMeshes: THREE.Mesh[];
  dispose: () => void;
}

const ARCH_DIMENSIONS: Record<
  ToothArchetype,
  { width: number; height: number; thickness: number; archAngleAbs: number }
> = {
  incisor: { width: 0.44, height: 0.58, thickness: 0.34, archAngleAbs: 0.12 },
  canine: { width: 0.44, height: 0.64, thickness: 0.38, archAngleAbs: 0.54 },
  premolar: { width: 0.46, height: 0.54, thickness: 0.44, archAngleAbs: 0.84 },
  molar: { width: 0.54, height: 0.52, thickness: 0.52, archAngleAbs: 1.18 },
};

const POSITION_ANGLE_RAD: Record<number, number> = {
  1: 0.09,
  2: 0.28,
  3: 0.48,
  4: 0.69,
  5: 0.9,
  6: 1.12,
  7: 1.34,
};

const UPPER_FDI_LEFT_TO_RIGHT = [
  17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27,
];
const LOWER_FDI_LEFT_TO_RIGHT = [
  47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37,
];

const ENAMEL_BASE_COLOR = new THREE.Color('#faf6ef');
const ENAMEL_PLAQUE_TINT = new THREE.Color('#f3ebd9');

function smoothProfile1D(arr: Float32Array, passes = 3): void {
  const n = arr.length;
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      const prev = arr[Math.max(0, i - 1)];
      const curr = arr[i];
      const next = arr[Math.min(n - 1, i + 1)];
      tmp[i] = 0.25 * prev + 0.5 * curr + 0.25 * next;
    }
    arr.set(tmp);
  }
}

function sampleProfile1D(arr: Float32Array, t01: number): number {
  const n = arr.length;
  const clamped = Math.max(0, Math.min(1, t01));
  const f = clamped * (n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(n - 1, i0 + 1);
  const frac = f - i0;
  return arr[i0] * (1 - frac) + arr[i1] * frac;
}

/**
 * Computes anatomical crown coordinates `aToothCoord = vec3(nx, ny, labialDot)` where:
 * - `nx` in [-1, 1] follows the exact left-to-right interproximal contour of the visible clinical crown,
 * - `ny` in [-1, 1] spans strictly from the biting edge (-1) to the EXACT visible cervical gumline (+1)
 *   where the pink gingiva (`gumPositions`) steps in front of the tooth crown (clipping 100% of buried roots!),
 * - `color` stores subtle pearly-ivory to warm-cervical vertex shading.
 */
function attachToothSurfaceCoordinates(
  geo: THREE.BufferGeometry,
  outwardNormalWorld: THREE.Vector3,
  isUpper: boolean,
  gumPositions?: Float32Array | null,
): { crownCenter: THREE.Vector3; halfW: number; halfH: number; halfD: number } {
  geo.computeBoundingBox();
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }

  const box = geo.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);

  const outward = outwardNormalWorld.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, outward).normalize();

  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const rel = new THREE.Vector3();

  let minR = Infinity;
  let maxR = -Infinity;
  let minSignedU = Infinity;
  let maxSignedU = -Infinity;
  let minO = Infinity;
  let maxO = -Infinity;

  const rVals = new Float32Array(pos.count);
  const suVals = new Float32Array(pos.count);
  const oVals = new Float32Array(pos.count);
  const labVals = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(norm, i).normalize();
    rel.subVectors(v, center);

    const r = rel.dot(right);
    const u = rel.dot(up);
    const signedU = isUpper ? u : -u;
    const o = rel.dot(outward);
    const lab = n.dot(outward);

    rVals[i] = r;
    suVals[i] = signedU;
    oVals[i] = o;
    labVals[i] = lab;

    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (signedU < minSignedU) minSignedU = signedU;
    if (signedU > maxSignedU) maxSignedU = signedU;
    if (o < minO) minO = o;
    if (o > maxO) maxO = o;
  }

  const spanR = Math.max(0.06, maxR - minR);
  const spanSU = Math.max(0.06, maxSignedU - minSignedU);

  const BINS = 16;
  const UBINS = 24;
  const colMinSU = new Float32Array(BINS).fill(maxSignedU);
  const colMaxSU = new Float32Array(BINS).fill(minSignedU + spanSU * 0.68);

  const toothGridMaxO = new Float32Array(BINS * UBINS).fill(-Infinity);
  const gumGridMaxO = new Float32Array(BINS * UBINS).fill(-Infinity);

  for (let i = 0; i < pos.count; i++) {
    if (labVals[i] < -0.05) continue;
    const r = rVals[i];
    const su = suVals[i];
    const o = oVals[i];

    const cBin = Math.min(BINS - 1, Math.max(0, Math.floor(((r - minR) / spanR) * BINS)));
    if (su < colMinSU[cBin]) colMinSU[cBin] = su;

    const uBin = Math.min(UBINS - 1, Math.max(0, Math.floor(((su - minSignedU) / spanSU) * UBINS)));
    const idx = cBin * UBINS + uBin;
    if (o > toothGridMaxO[idx]) toothGridMaxO[idx] = o;
  }

  if (gumPositions && gumPositions.length >= 3) {
    for (let i = 0; i < gumPositions.length; i += 3) {
      const gx = gumPositions[i];
      const gy = gumPositions[i + 1];
      const gz = gumPositions[i + 2];
      if (
        Math.abs(gx - center.x) > 0.75 ||
        Math.abs(gy - center.y) > 0.95 ||
        Math.abs(gz - center.z) > 0.75
      ) {
        continue;
      }
      rel.set(gx - center.x, gy - center.y, gz - center.z);
      const r = rel.dot(right);
      if (r < minR || r > maxR) continue;
      const u = rel.dot(up);
      const su = isUpper ? u : -u;
      if (su < minSignedU || su > maxSignedU) continue;
      const o = rel.dot(outward);
      if (o < -0.05) continue;

      const cBin = Math.min(BINS - 1, Math.max(0, Math.floor(((r - minR) / spanR) * BINS)));
      const uBin = Math.min(UBINS - 1, Math.max(0, Math.floor(((su - minSignedU) / spanSU) * UBINS)));
      const idx = cBin * UBINS + uBin;
      if (o > gumGridMaxO[idx]) gumGridMaxO[idx] = o;
    }

    // Walk upward from the biting edge in each column and stop at the FIRST uBin where
    // the labial gum collar steps in front of the tooth surface!
    let validCols = 0;
    let sumGumSU = 0;
    const rawDetected = new Float32Array(BINS).fill(-999);

    for (let cBin = 0; cBin < BINS; cBin++) {
      if (colMinSU[cBin] > maxSignedU - 0.01) {
        colMinSU[cBin] = minSignedU;
      }
      const minStartUBin = Math.max(
        3,
        Math.floor(((colMinSU[cBin] - minSignedU) / spanSU) * UBINS) + 3,
      );
      let foundSU = -999;
      for (let uBin = minStartUBin; uBin < UBINS; uBin++) {
        const idx = cBin * UBINS + uBin;
        const tO = toothGridMaxO[idx];
        const gO = gumGridMaxO[idx];
        if (tO > -900 && gO > -900 && gO >= tO - 0.008) {
          foundSU = minSignedU + ((uBin + 0.15) / UBINS) * spanSU;
          break;
        }
      }
      if (foundSU > -900) {
        rawDetected[cBin] = Math.max(
          colMinSU[cBin] + spanSU * 0.34,
          Math.min(minSignedU + spanSU * 0.85, foundSU),
        );
        sumGumSU += rawDetected[cBin];
        validCols++;
      }
    }

    const fallbackGumSU =
      validCols > 0 ? sumGumSU / validCols : minSignedU + spanSU * 0.65;
    for (let cBin = 0; cBin < BINS; cBin++) {
      colMaxSU[cBin] = rawDetected[cBin] > -900 ? rawDetected[cBin] : fallbackGumSU;
    }
  } else {
    for (let cBin = 0; cBin < BINS; cBin++) {
      if (colMinSU[cBin] > maxSignedU - 0.01) colMinSU[cBin] = minSignedU;
      colMaxSU[cBin] = maxSignedU * 0.94;
    }
  }

  smoothProfile1D(colMinSU, 3);
  smoothProfile1D(colMaxSU, 4);

  // Measure horizontal width envelope [rowMinR, rowMaxR] strictly within the visible clinical crown!
  const globalVisibleMinSU = Math.min(...colMinSU);
  const globalVisibleMaxSU = Math.max(...colMaxSU);
  const visibleSpanSU = Math.max(0.05, globalVisibleMaxSU - globalVisibleMinSU);

  const rowMinR = new Float32Array(BINS).fill(maxR);
  const rowMaxR = new Float32Array(BINS).fill(minR);

  for (let i = 0; i < pos.count; i++) {
    if (labVals[i] < 0.0) continue;
    const r = rVals[i];
    const su = suVals[i];
    if (su < globalVisibleMinSU || su > globalVisibleMaxSU) continue;
    const rBin = Math.min(
      BINS - 1,
      Math.max(0, Math.floor(((su - globalVisibleMinSU) / visibleSpanSU) * BINS)),
    );
    if (r < rowMinR[rBin]) rowMinR[rBin] = r;
    if (r > rowMaxR[rBin]) rowMaxR[rBin] = r;
  }

  for (let b = 0; b < BINS; b++) {
    if (rowMinR[b] > rowMaxR[b]) {
      rowMinR[b] = minR;
      rowMaxR[b] = maxR;
    }
  }
  smoothProfile1D(rowMinR, 3);
  smoothProfile1D(rowMaxR, 3);

  const halfW = spanR * 0.5;
  const halfH = visibleSpanSU * 0.5;
  const halfD = Math.max(0.04, (maxO - minO) * 0.5);

  const coordArray = new Float32Array(pos.count * 3);
  const colorArray = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const r = rVals[i];
    const su = suVals[i];
    const labialDot = labVals[i];

    const tR = (r - minR) / spanR;
    const envMinSU = sampleProfile1D(colMinSU, tR);
    const envMaxSU = sampleProfile1D(colMaxSU, tR);
    const localMidSU = (envMinSU + envMaxSU) * 0.5;
    const localHalfH = Math.max(visibleSpanSU * 0.28, (envMaxSU - envMinSU) * 0.5);

    const ny = (su - localMidSU) / localHalfH;

    const tVisSU = Math.max(0, Math.min(1, (ny + 1.0) * 0.5));
    const envMinR = sampleProfile1D(rowMinR, tVisSU) * 0.72 + minR * 0.28;
    const envMaxR = sampleProfile1D(rowMaxR, tVisSU) * 0.72 + maxR * 0.28;
    const localMidR = (envMinR + envMaxR) * 0.5;
    const localHalfW = Math.max(spanR * 0.30, (envMaxR - envMinR) * 0.5);

    const nx = (r - localMidR) / localHalfW;

    coordArray[i * 3] = nx;
    coordArray[i * 3 + 1] = ny;
    coordArray[i * 3 + 2] = labialDot;

    // Bright pearly-ivory crown center with delicate warm cervical & interproximal enamel gradation
    const clampedNy = Math.max(-1, Math.min(1, ny));
    const cervicalWarmth = Math.max(0, Math.min(1, (clampedNy + 0.55) * 0.6));
    const edgeWarmth = Math.min(1, Math.abs(nx) * 0.38);
    const warmFactor = Math.min(1, cervicalWarmth * 0.65 + edgeWarmth * 0.35);

    colorArray[i * 3] = 1.0 - warmFactor * 0.045;
    colorArray[i * 3 + 1] = 0.995 - warmFactor * 0.085;
    colorArray[i * 3 + 2] = 0.975 - warmFactor * 0.145;
  }

  geo.setAttribute('aToothCoord', new THREE.BufferAttribute(coordArray, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

  const midVisU = ((globalVisibleMinSU + globalVisibleMaxSU) * 0.5) * (isUpper ? 1 : -1);
  const crownCenter = center.clone().addScaledVector(up, midVisU);
  return { crownCenter, halfW, halfH, halfD };
}

/**
 * Creates a cloned BufferGeometry displaced outward along both the vertex normal and labial direction
 * so the fluoride U-contour sits cleanly in front of the tooth-gumline junction without Z-occlusion.
 */
function createDisplacedShellGeometry(
  sourceGeo: THREE.BufferGeometry,
  normalOffset: number,
  outwardDir: THREE.Vector3,
  outwardOffset: number,
): THREE.BufferGeometry {
  const clone = sourceGeo.clone();
  const pos = clone.attributes.position;
  const norm = clone.attributes.normal;
  if (pos && norm) {
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(norm, i);
      v.addScaledVector(n, normalOffset);
      v.addScaledVector(outwardDir, outwardOffset);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return clone;
}

/**
 * Custom ShaderMaterial for organic amber-yellow plaque patches centered on the visible clinical crown.
 */
function createToothPlaqueShaderMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.0 },
      uSeed: { value: seed },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aToothCoord;
      varying vec3 vToothCoord;
      void main() {
        vToothCoord = aToothCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uSeed;
      varying vec3 vToothCoord;

      void main() {
        if (uOpacity <= 0.01) discard;

        float nx = vToothCoord.x;
        float ny = vToothCoord.y; // -1 at biting edge, 0 at clinical crown center, +1 at visible gumline
        float labial = vToothCoord.z;

        if (ny > 0.85 || ny < -0.88) discard;
        float labialMask = smoothstep(0.22, 0.58, labial);
        if (labialMask <= 0.01) discard;

        float wobbleX = sin(ny * 4.0 + uSeed) * 0.10 + cos(nx * 5.2 - uSeed) * 0.06;
        float wobbleY = cos(nx * 3.6 + uSeed * 1.3) * 0.09;
        vec2 p = vec2((nx + wobbleX) * 1.24, (ny + 0.02 + wobbleY) * 1.18);
        float dist = length(p);

        float outerStain = smoothstep(0.92, 0.22, dist);
        float innerCore = smoothstep(0.58, 0.12, dist);
        float alpha = outerStain * labialMask * uOpacity * 0.78;
        if (alpha <= 0.01) discard;

        vec3 edgeColor = vec3(0.94, 0.84, 0.48);
        vec3 coreColor = vec3(0.88, 0.71, 0.28);
        vec3 finalColor = mix(edgeColor, coreColor, innerCore);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

/**
 * Custom ShaderMaterial for the signature Neon-Violet & White U-shaped Fluoride Shield Contour
 * ("Película Fluorada") matching the reference render (`concept_front_view_ui_1792199306798.jpg`):
 * Because `ny = +1.0` already traces the exact scalloped cervical gumline where the tooth meets the pink gum,
 * we use a smooth super-ellipse (`p = 3.0`) that hugs `ny = 0.88` at the gumline and `abs(nx) = 0.86` at the sides,
 * while strictly discarding `ny > 1.02` so buried roots inside the gingiva are 100% invisible!
 */
function createFluorideContourShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: 0.0 },
      uBrushBoost: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aToothCoord;
      varying vec3 vToothCoord;

      void main() {
        vToothCoord = aToothCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uBrushBoost;
      varying vec3 vToothCoord;

      void main() {
        if (uIntensity <= 0.01) discard;

        float nx = vToothCoord.x;
        float ny = vToothCoord.y; // -1 at biting edge, +1 at exact visible cervical gumline
        float labial = vToothCoord.z;

        // Strictly clip buried roots above the gumline (ny > 1.02) and below biting edge
        if (ny > 1.02 || ny < -1.04) discard;
        float frontMask = smoothstep(0.08, 0.44, labial);
        if (frontMask <= 0.01) discard;

        // Smooth rounded U-contour hugging the left/right edges (abs(nx) = 0.85)
        // and the scalloped cervical gumline (ny = 0.88)
        float xNorm = abs(nx) / 0.85;
        float yCervical = max(0.0, ny - 0.24) / 0.64;
        float yIncisal = max(0.0, -ny - 0.24) / 0.64;

        float yCombined = mix(yCervical, max(yCervical, yIncisal), uBrushBoost);
        float contourNorm = pow(
          pow(max(0.0001, xNorm), 3.0) + pow(max(0.0001, yCombined), 3.0),
          1.0 / 3.0
        );

        float distFromLine = abs(contourNorm - 1.0);

        float outerPurpleHalo = smoothstep(0.28, 0.02, distFromLine) * frontMask;
        float midVioletGlow = smoothstep(0.15, 0.01, distFromLine) * frontMask;
        float innerWhiteCore = smoothstep(0.07, 0.0, distFromLine) * frontMask;

        // Cleanly clip right at the gumline (ny = 1.0) and fade near biting edge on unbrushed teeth
        float verticalClip = (1.0 - smoothstep(0.92, 1.02, ny)) *
          mix(smoothstep(-0.94, -0.52, ny), 1.0 - smoothstep(0.92, 1.03, -ny), uBrushBoost);

        outerPurpleHalo *= verticalClip;
        midVioletGlow *= verticalClip;
        innerWhiteCore *= verticalClip;

        // Luminous violet-white brush contact bloom on the upper-center labial face when actively brushed
        float brushContact = exp(-((nx * nx) * 2.2 + (ny - 0.28) * (ny - 0.28) * 2.8)) * uBrushBoost * frontMask;
        float brushCore = exp(-((nx * nx) * 4.5 + (ny - 0.34) * (ny - 0.34) * 5.2)) * uBrushBoost * frontMask;

        vec3 deepElectricViolet = vec3(0.55, 0.24, 0.96);
        vec3 brightLavender = vec3(0.80, 0.62, 1.0);
        vec3 pureWhite = vec3(1.0, 0.995, 1.0);

        vec3 color = mix(deepElectricViolet, brightLavender, midVioletGlow);
        color = mix(
          color,
          pureWhite,
          clamp(innerWhiteCore * 1.15 + brushCore * 0.9 + brushContact * 0.45, 0.0, 1.0)
        );

        float alpha = clamp(
          (outerPurpleHalo * 0.74 + midVioletGlow * 0.36 + innerWhiteCore * 0.96 + brushContact * 0.78) * uIntensity,
          0.0,
          1.0
        );
        if (alpha <= 0.01) discard;

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -8,
  });
}

const DIRECTION_ANGLE_RAD: Record<BrushDirection, number> = {
  UP: 0,
  DOWN: Math.PI,
  LEFT: Math.PI * 0.5,
  RIGHT: -Math.PI * 0.5,
};

const DIRECTION_VEC2: Record<BrushDirection, [number, number]> = {
  UP: [0, 1],
  DOWN: [0, -1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

export interface EnamelShieldUniforms {
  uShieldProgress: { value: number };
  uStrokeDir: { value: THREE.Vector2 };
  uToothUpSign: { value: number };
  uTime: { value: number };
  uSeed: { value: number };
  uIsBrushed: { value: number };
  uBrushWorldPos: { value: THREE.Vector3 };
  uBrushGlowStrength: { value: number };
}

/**
 * Creates a physical dental enamel material enhanced with a custom GLSL "Bio-Luminous Fluoride Shield"
 * shader via `onBeforeCompile`. Uses true 3D surface normals (`N · V` Fresnel silhouette) + gum-clipped
 * crown coordinates (`aToothCoord`) + real-time 3D brush proximity (`uBrushWorldPos`) + directional
 * 2-stroke liquid varnish wave (`uShieldProgress`, `uStrokeDir`).
 */
function createBioLuminousEnamelMaterial(
  fdiNumber: number,
  isUpper: boolean,
  baseColorMap: THREE.Texture | null = null,
): { material: THREE.MeshPhysicalMaterial; uniforms: EnamelShieldUniforms } {
  const uniforms: EnamelShieldUniforms = {
    uShieldProgress: { value: 0.0 },
    uStrokeDir: { value: new THREE.Vector2(0, 1) },
    uToothUpSign: { value: isUpper ? 1.0 : -1.0 },
    uTime: { value: 0.0 },
    uSeed: { value: fdiNumber * 1.37 },
    uIsBrushed: { value: 0.0 },
    uBrushWorldPos: { value: new THREE.Vector3(0, 0, 10) },
    uBrushGlowStrength: { value: 0.0 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: ENAMEL_BASE_COLOR.clone(),
    map: baseColorMap,
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    reflectivity: 0.96,
    emissive: new THREE.Color('#3b2854'),
    emissiveIntensity: 0.05,
  });

  material.customProgramCacheKey = () => `duraphat-bio-shield-v2-${baseColorMap ? 'tex' : 'notex'}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uShieldProgress = uniforms.uShieldProgress;
    shader.uniforms.uStrokeDir = uniforms.uStrokeDir;
    shader.uniforms.uToothUpSign = uniforms.uToothUpSign;
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uSeed = uniforms.uSeed;
    shader.uniforms.uIsBrushed = uniforms.uIsBrushed;
    shader.uniforms.uBrushWorldPos = uniforms.uBrushWorldPos;
    shader.uniforms.uBrushGlowStrength = uniforms.uBrushGlowStrength;

    shader.vertexShader =
      /* glsl */ `
      attribute vec3 aToothCoord;
      varying vec3 vToothCoord;
      varying vec3 vCustomWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vCustomViewDir;
      ` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
        #include <project_vertex>
        vToothCoord = aToothCoord;
        vec4 customWp = modelMatrix * vec4(transformed, 1.0);
        vCustomWorldPos = customWp.xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vCustomViewDir = normalize(cameraPosition - customWp.xyz);
        `,
      );

    shader.fragmentShader =
      /* glsl */ `
      uniform float uShieldProgress;
      uniform vec2 uStrokeDir;
      uniform float uToothUpSign;
      uniform float uTime;
      uniform float uSeed;
      uniform float uIsBrushed;
      uniform vec3 uBrushWorldPos;
      uniform float uBrushGlowStrength;
      varying vec3 vToothCoord;
      varying vec3 vCustomWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vCustomViewDir;
      ` +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          #include <map_fragment>
          // Lift the mid-grey band in Dentadura_Limpia into luminous clinical pearl-white enamel
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.996, 1.0), 0.74);
          `,
        )
        .replace(
          '#include <dithering_fragment>',
        /* glsl */ `
        float nx = vToothCoord.x;
        float ny = vToothCoord.y; // -1 at biting edge, +1 at visible cervical gumline
        float labial = vToothCoord.z;

        // Because crownMesh is depth-tested against the 3D gingiva mesh, the hardware Z-buffer
        // clips the root at the exact 3D gumline intersection with zero gap!
        float labialMask = smoothstep(-0.18, 0.25, labial);

        // 1. Directional 2-Stroke Liquid Varnish Fill along the required arrow direction
        vec2 screenToothXY = vec2(clamp(nx, -1.0, 1.0), clamp(ny * uToothUpSign, -1.0, 1.0));
        float strokeProj01 = clamp(dot(screenToothXY, uStrokeDir) * 0.45 + 0.5, 0.0, 1.0);

        float sweepMask = 0.0;
        float waveGlow = 0.0;
        if (uShieldProgress >= 0.99) {
          sweepMask = 1.0;
        } else if (uShieldProgress > 0.01) {
          // Soft liquid varnish transition (no hard line)
          sweepMask = 1.0 - smoothstep(uShieldProgress - 0.22, uShieldProgress + 0.22, strokeProj01);
          waveGlow = exp(-pow((strokeProj01 - uShieldProgress) / 0.18, 2.0)) * labialMask;
        }

        // 2. Smooth Continuous 3D Fresnel Subsurface Glaze & Liquid-Glass Specular Sheen (Zero artificial contour lines)
        vec3 N = normalize(vCustomWorldNormal);
        vec3 V = normalize(vCustomViewDir);
        float ndotv = clamp(dot(N, V), 0.0, 1.0);

        // Monotonic 3D grazing-angle Fresnel: 0 at crown center, smoothly glowing around the 3D tooth curvature
        float fresnelRim = pow(1.0 - ndotv, 1.95);
        float deepFresnel = pow(1.0 - ndotv, 3.2);

        // Anisotropic studio specular highlight & slow pearlescent light caustics across the varnished enamel
        vec3 R = reflect(-V, N);
        vec3 studioKeyDir = normalize(vec3(0.28, 0.52, 0.81));
        vec3 studioRimDir = normalize(vec3(-0.42, 0.38, 0.82));
        float wetSpecular = pow(max(0.0, dot(R, studioKeyDir)), 20.0) + 0.55 * pow(max(0.0, dot(R, studioRimDir)), 14.0);
        float pearlShimmer = 0.5 + 0.5 * sin(vCustomWorldPos.x * 4.2 + vCustomWorldPos.y * 3.1 - uTime * 2.4 + uSeed);

        float activeShield = sweepMask * labialMask;

        // 3. Real-Time 3D Brush Bristle Contact Illumination on the Enamel Surface
        float brushDist = distance(vCustomWorldPos, uBrushWorldPos);
        float brushHalo = exp(-(brushDist * brushDist) / 0.055) * uBrushGlowStrength * labialMask;
        float brushCore = exp(-(brushDist * brushDist) / 0.015) * uBrushGlowStrength * labialMask;

        vec3 electricViolet = vec3(0.58, 0.28, 0.98);
        vec3 pearlyLavender = vec3(0.88, 0.78, 1.0);
        vec3 diamondWhite = vec3(1.0, 0.995, 1.0);

        // Blend continuous pearlescent fluoride glaze into physical enamel
        vec3 glazeColor = mix(pearlyLavender, electricViolet, 0.38 + 0.42 * fresnelRim);
        float glazeFactor = clamp((0.18 + 0.56 * fresnelRim + 0.10 * pearlShimmer) * activeShield, 0.0, 0.82);

        gl_FragColor.rgb = mix(gl_FragColor.rgb, glazeColor, glazeFactor);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, electricViolet, clamp(brushHalo * 0.52 + waveGlow * 0.38, 0.0, 0.75));
        gl_FragColor.rgb += diamondWhite * (
          wetSpecular * 0.48 * activeShield +
          deepFresnel * 0.38 * activeShield +
          waveGlow * 0.42 +
          brushCore * 0.68
        );
        gl_FragColor.rgb += pearlyLavender * (uIsBrushed * 0.14 * labialMask);

        #include <dithering_fragment>
        `,
      );
  };

  material.userData.shieldUniforms = uniforms;
  return { material, uniforms };
}

/**
 * Custom ShaderMaterial for the Directional Brush Stroke Arrow Indicator on each stained tooth.
 * Renders a crisp, animated medical-grade vector arrow + chevron sliding in the required stroke direction
 * (`UP`, `DOWN`, `LEFT`, `RIGHT`) with a 2-step radial coverage progress ring.
 */
function createDirectionalArrowShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.0 },
      uDirectionAngle: { value: 0.0 },
      uTime: { value: 0.0 },
      uCoverage: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uDirectionAngle;
      uniform float uTime;
      uniform float uCoverage;
      varying vec2 vUv;

      float sdSegment(in vec2 p, in vec2 a, in vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      void main() {
        if (uOpacity <= 0.01) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 0.92) discard;

        // Rotate into canonical arrow space where +Y is the required brush stroke direction
        float c = cos(-uDirectionAngle);
        float s = sin(-uDirectionAngle);
        vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

        // Smooth animated sliding pulse along +Y (the direction the user must move the brush)
        float cycle = fract(uTime * 1.25);
        float slideY = (cycle - 0.5) * 0.26;
        vec2 qa = vec2(q.x, q.y - slideY);

        // Primary Arrow Shaft + Chevron Head pointing toward +Y
        float dShaft = sdSegment(qa, vec2(0.0, -0.34), vec2(0.0, 0.28));
        float dHeadL = sdSegment(qa, vec2(0.0, 0.34), vec2(-0.28, 0.04));
        float dHeadR = sdSegment(qa, vec2(0.0, 0.34), vec2(0.28, 0.04));
        float dArrow = min(dShaft, min(dHeadL, dHeadR));

        // Secondary trailing chevron for clear directional flow
        float dTrailL = sdSegment(qa, vec2(0.0, -0.06), vec2(-0.22, -0.28));
        float dTrailR = sdSegment(qa, vec2(0.0, -0.06), vec2(0.22, -0.28));
        float dTrail = min(dTrailL, dTrailR);

        // Translucent frosted badge backdrop & 2-half coverage progress ring (1st move = 50%, 2nd move = 100%)
        float badgeMask = smoothstep(0.82, 0.72, r);
        float ringDist = abs(r - 0.78);
        float ringMask = smoothstep(0.072, 0.016, ringDist);

        float angle01 = fract((atan(p.x, p.y) / 6.2831853) + 1.0);
        float covArc = step(angle01, clamp(uCoverage, 0.04, 1.0));

        float arrowCore = smoothstep(0.098, 0.032, dArrow);
        float arrowGlow = smoothstep(0.22, 0.04, dArrow);
        float trailCore = smoothstep(0.078, 0.025, dTrail) * (1.0 - cycle * 0.5);

        vec3 badgeBg = mix(vec3(0.26, 0.10, 0.52), vec3(0.48, 0.20, 0.92), uCoverage);
        vec3 ringColor = mix(vec3(0.82, 0.70, 1.0), vec3(0.32, 0.98, 0.74), covArc);
        vec3 strokeColor = vec3(1.0, 1.0, 1.0);
        vec3 glowColor = vec3(0.76, 0.45, 1.0);

        vec3 col = badgeBg;
        col = mix(col, glowColor, arrowGlow * 0.65);
        col = mix(col, ringColor, ringMask * (0.55 + 0.45 * covArc));
        col = mix(col, strokeColor, clamp(arrowCore + trailCore * 0.78, 0.0, 1.0));

        float alpha = clamp(
          (badgeMask * 0.40 + ringMask * 0.92 + arrowGlow * 0.52 + arrowCore * 0.98 + trailCore * 0.76) * uOpacity,
          0.0,
          1.0
        );
        if (alpha <= 0.01) discard;

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}

/**
 * Splits a merged multi-tooth BufferGeometry into individual connected-component tooth BufferGeometries.
 */
function splitBufferGeometryIntoToothIslands(
  sourceGeo: THREE.BufferGeometry,
  minVerts = 250,
): THREE.BufferGeometry[] {
  const posAttr = sourceGeo.attributes.position;
  if (!posAttr) return [];

  const vCount = posAttr.count;
  const indexAttr = sourceGeo.index;
  if (!indexAttr) return [sourceGeo.clone()];

  const indices = indexAttr.array;
  const parent = new Int32Array(vCount).fill(-1);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] >= 0) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (parent[ra] < parent[rb]) {
        parent[ra] += parent[rb];
        parent[rb] = ra;
      } else {
        parent[rb] += parent[ra];
        parent[ra] = rb;
      }
    }
  };

  for (let i = 0; i < indices.length; i += 3) {
    union(indices[i], indices[i + 1]);
    union(indices[i + 1], indices[i + 2]);
  }

  const islandTris = new Map<number, number[]>();
  const islandVertCount = new Map<number, number>();
  for (let v = 0; v < vCount; v++) {
    const r = find(v);
    islandVertCount.set(r, (islandVertCount.get(r) ?? 0) + 1);
  }

  for (let i = 0; i < indices.length; i += 3) {
    const r = find(indices[i]);
    if ((islandVertCount.get(r) ?? 0) < minVerts) continue;
    let list = islandTris.get(r);
    if (!list) {
      list = [];
      islandTris.set(r, list);
    }
    list.push(indices[i], indices[i + 1], indices[i + 2]);
  }

  if (islandTris.size <= 1) {
    return [sourceGeo.clone()];
  }

  const normAttr = sourceGeo.attributes.normal;
  const uvAttr = sourceGeo.attributes.uv;
  const resultGeometries: THREE.BufferGeometry[] = [];

  for (const tris of islandTris.values()) {
    const oldToNew = new Map<number, number>();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndices = new Uint32Array(tris.length);

    let nextIdx = 0;
    for (let i = 0; i < tris.length; i++) {
      const oldV = tris[i];
      let mapped = oldToNew.get(oldV);
      if (mapped === undefined) {
        mapped = nextIdx++;
        oldToNew.set(oldV, mapped);
        newPositions.push(posAttr.getX(oldV), posAttr.getY(oldV), posAttr.getZ(oldV));
        if (normAttr) {
          newNormals.push(normAttr.getX(oldV), normAttr.getY(oldV), normAttr.getZ(oldV));
        }
        if (uvAttr) {
          newUvs.push(uvAttr.getX(oldV), uvAttr.getY(oldV));
        }
      }
      newIndices[i] = mapped;
    }

    const islandGeo = new THREE.BufferGeometry();
    islandGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      islandGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    if (newUvs.length > 0) {
      islandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    islandGeo.setIndex(new THREE.BufferAttribute(newIndices, 1));
    if (!normAttr) {
      islandGeo.computeVertexNormals();
    }
    resultGeometries.push(islandGeo);
  }

  return resultGeometries;
}

function buildToothNodeFromGeometry(
  toothGeo: THREE.BufferGeometry,
  fdiNumber: number,
  sector: DentalSector,
  isUpper: boolean,
  parentGroup: THREE.Group,
  disposableGeometries: THREE.BufferGeometry[],
  disposableMaterials: THREE.Material[],
  gumPositions?: Float32Array | null,
  baseColorMap: THREE.Texture | null = null,
): ToothVisualNode {
  const fdiId = `tooth_${fdiNumber}`;
  toothGeo.computeBoundingBox();
  const box = toothGeo.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);

  const outwardNormal = new THREE.Vector3(center.x, 0, center.z + 1.15).normalize();
  const { crownCenter, halfD } = attachToothSurfaceCoordinates(
    toothGeo,
    outwardNormal,
    isUpper,
    gumPositions,
  );

  // 1. Bright Pearly Wet Ceramic Enamel Crown with Custom GLSL Bio-Luminous Fluoride Shield Shader
  const { material: crownMat } = createBioLuminousEnamelMaterial(
    fdiNumber,
    isUpper,
    baseColorMap,
  );
  disposableMaterials.push(crownMat);

  const crownMesh = new THREE.Mesh(toothGeo, crownMat);
  crownMesh.name = fdiId;
  crownMesh.castShadow = true;
  crownMesh.receiveShadow = true;
  crownMesh.layers.enable(1);
  crownMesh.userData.fdiId = fdiId;
  crownMesh.userData.fdiNumber = fdiNumber;
  crownMesh.userData.sector = sector;
  parentGroup.add(crownMesh);

  // 2. Anatomical Labial Plaque Stain Shell
  const plaqueGeo = createDisplacedShellGeometry(toothGeo, 0.0025, outwardNormal, 0.0035);
  disposableGeometries.push(plaqueGeo);
  const plaqueMat = createToothPlaqueShaderMaterial(fdiNumber * 1.37);
  disposableMaterials.push(plaqueMat);

  const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueMesh.visible = false;
  plaqueMesh.renderOrder = 2;
  parentGroup.add(plaqueMesh);

  // 3. Legacy displaced contour shell remains hidden (shield is rendered natively on crownMesh via GLSL)
  const shieldGeo = new THREE.BufferGeometry();
  disposableGeometries.push(shieldGeo);
  const shieldMat = createFluorideContourShaderMaterial();
  disposableMaterials.push(shieldMat);

  const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
  shieldMesh.visible = false;
  parentGroup.add(shieldMesh);

  const surfaceCenterWorld = crownCenter
    .clone()
    .addScaledVector(outwardNormal, Math.min(0.18, halfD * 0.82));

  // 4. Directional Brush Stroke Arrow Indicator floating cleanly on the labial/buccal crown surface
  const arrowGeo = new THREE.PlaneGeometry(0.22, 0.22);
  disposableGeometries.push(arrowGeo);
  const arrowMat = createDirectionalArrowShaderMaterial();
  disposableMaterials.push(arrowMat);

  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.position.copy(crownCenter).addScaledVector(outwardNormal, halfD + 0.044);
  arrowMesh.lookAt(
    arrowMesh.position.x + outwardNormal.x,
    arrowMesh.position.y + outwardNormal.y,
    arrowMesh.position.z + outwardNormal.z,
  );
  arrowMesh.visible = false;
  arrowMesh.renderOrder = 8;
  parentGroup.add(arrowMesh);

  return {
    fdiId,
    fdiNumber,
    sector,
    isUpper,
    group: parentGroup,
    crownMesh,
    plaqueMesh,
    shieldMesh,
    arrowMesh,
    surfaceCenterWorld,
    surfaceNormalWorld: outwardNormal,
  };
}

/**
 * Translates upper and lower gum components rigidly across the empty inter-jaw gap (`y > 0.08` in normalized space)
 * so zero triangles are ever stretched or inverted.
 */
function closeGumOcclusionGap(gumGeo: THREE.BufferGeometry, jawOffsetY: number): void {
  if (Math.abs(jawOffsetY) < 1e-5) return;
  const pos = gumGeo.attributes.position;
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y >= 0.08) {
      pos.setY(i, y - jawOffsetY);
    } else {
      pos.setY(i, y + jawOffsetY);
    }
  }
}

export function bindExternalGlbDentalArch(gltfScene: THREE.Group): BuiltDentalArch {
  const archGroup = new THREE.Group();
  archGroup.name = 'ExternalGlbDentalArchRoot';

  const toothNodes = new Map<string, ToothVisualNode>();
  const interactables: THREE.Mesh[] = [];
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];

  gltfScene.updateMatrixWorld(true);

  const rawMeshes: THREE.Mesh[] = [];
  gltfScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      rawMeshes.push(child as THREE.Mesh);
    }
  });

  const rawBox = new THREE.Box3();
  let frontIncisorMesh: THREE.Mesh | null = null;
  let gumMeshCount = 0;

  for (const m of rawMeshes) {
    rawBox.expandByObject(m);
    const mName = (m.name || '').toLowerCase();
    if (mName.includes('gum') || mName.includes('gingiv') || mName.includes('encia')) {
      gumMeshCount++;
    }
    const fdi = parseFdiNumberFromMeshName(m.name);
    if (fdi === 11 || fdi === 21) {
      frontIncisorMesh = m;
    }
  }
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);

  // Determine if the model needs a -90 deg Y rotation:
  // If explicit front incisors (Tooth_11 / Tooth_21) exist and already sit at +Z, do NOT rotate!
  let rotateYMinus90 = rawSize.z > rawSize.x * 1.08;
  if (frontIncisorMesh) {
    const incBox = new THREE.Box3().setFromObject(frontIncisorMesh);
    const incCenter = new THREE.Vector3();
    incBox.getCenter(incCenter);
    rotateYMinus90 = Math.abs(incCenter.x) > Math.abs(incCenter.z);
  }

  const rotMatrix = new THREE.Matrix4();
  if (rotateYMinus90) {
    rotMatrix.makeRotationY(-Math.PI / 2);
  }

  const rotBox = new THREE.Box3();
  const tempV = new THREE.Vector3();
  for (const m of rawMeshes) {
    const pos = m.geometry.attributes.position;
    if (!pos) continue;
    const step = Math.max(1, Math.floor(pos.count / 200));
    for (let i = 0; i < pos.count; i += step) {
      tempV.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(rotMatrix);
      rotBox.expandByPoint(tempV);
    }
  }

  const rotCenter = new THREE.Vector3();
  const rotSize = new THREE.Vector3();
  rotBox.getCenter(rotCenter);
  rotBox.getSize(rotSize);

  const widthDim = rotSize.x > 0.1 ? rotSize.x : Math.max(rotSize.x, rotSize.y, rotSize.z) || 1;
  const scaleFactor = 3.32 / widthDim;

  const normMatrix = new THREE.Matrix4()
    .makeScale(scaleFactor, scaleFactor, scaleFactor)
    .multiply(new THREE.Matrix4().makeTranslation(-rotCenter.x, -rotCenter.y, -rotCenter.z))
    .multiply(rotMatrix);

  // In mouth_model_optimized.glb (gumMeshCount >= 2), upper and lower incisors are already in closed occlusion at y=0
  const JAW_OCCLUSION_OFFSET_Y = gumMeshCount >= 2 ? 0.0 : 0.048;

  const extractedUpperIslands: {
    geo: THREE.BufferGeometry;
    cx: number;
    cy: number;
    cz: number;
    explicitFdi: number | null;
    baseMap: THREE.Texture | null;
  }[] = [];
  const extractedLowerIslands: {
    geo: THREE.BufferGeometry;
    cx: number;
    cy: number;
    cz: number;
    explicitFdi: number | null;
    baseMap: THREE.Texture | null;
  }[] = [];

  const gumPositionChunks: Float32Array[] = [];

  // Pass 1: Process all Gingiva (Gum) meshes first so combinedGumPositions includes both Upper & Lower gums
  for (const mesh of rawMeshes) {
    const meshName = (mesh.name || '').toLowerCase();
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matName = (mat?.name || '').toLowerCase();

    const isGum =
      meshName.includes('gum') ||
      matName.includes('gum') ||
      meshName.includes('gingiv') ||
      matName.includes('gingiv') ||
      meshName.includes('encia');

    if (!isGum) continue;

    const worldToNorm = normMatrix.clone().multiply(mesh.matrixWorld);
    const gumGeo = mesh.geometry.clone();
    gumGeo.applyMatrix4(worldToNorm);
    closeGumOcclusionGap(gumGeo, JAW_OCCLUSION_OFFSET_Y);
    disposableGeometries.push(gumGeo);

    if (gumGeo.attributes.position) {
      gumPositionChunks.push(gumGeo.attributes.position.array as Float32Array);
    }

    const stdMat = mat as THREE.MeshStandardMaterial | undefined;
    if (stdMat?.map) {
      stdMat.map.colorSpace = THREE.SRGBColorSpace;
    }
    const gumMat = new THREE.MeshPhysicalMaterial({
      map: stdMat?.map ?? null,
      bumpMap: stdMat?.normalMap ?? null,
      bumpScale: 0.005,
      color: stdMat?.map ? new THREE.Color('#ffffff') : new THREE.Color('#e8758c'),
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.32,
      emissive: new THREE.Color('#4a1020'),
      emissiveIntensity: 0.08,
    });
    disposableMaterials.push(gumMat);

    const gumMesh = new THREE.Mesh(gumGeo, gumMat);
    gumMesh.name = mesh.name || 'DuraphatSculptedGingiva';
    gumMesh.castShadow = true;
    gumMesh.receiveShadow = true;
    archGroup.add(gumMesh);
  }

  let combinedGumPositions: Float32Array | null = null;
  if (gumPositionChunks.length === 1) {
    combinedGumPositions = gumPositionChunks[0];
  } else if (gumPositionChunks.length > 1) {
    const totalLen = gumPositionChunks.reduce((acc, arr) => acc + arr.length, 0);
    combinedGumPositions = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of gumPositionChunks) {
      combinedGumPositions.set(chunk, offset);
      offset += chunk.length;
    }
  }

  // Pass 2: Process all Tooth meshes
  for (const mesh of rawMeshes) {
    const meshName = (mesh.name || '').toLowerCase();
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matName = (mat?.name || '').toLowerCase();

    const isGum =
      meshName.includes('gum') ||
      matName.includes('gum') ||
      meshName.includes('gingiv') ||
      matName.includes('gingiv') ||
      meshName.includes('encia');

    if (isGum) continue;

    const stdMat = mat as THREE.MeshStandardMaterial | undefined;
    if (stdMat?.map) {
      stdMat.map.colorSpace = THREE.SRGBColorSpace;
    }

    const worldToNorm = normMatrix.clone().multiply(mesh.matrixWorld);
    const explicitFdi = parseFdiNumberFromMeshName(mesh.name);
    const islands = explicitFdi
      ? [mesh.geometry.clone()]
      : splitBufferGeometryIntoToothIslands(mesh.geometry, 250);

    for (const islGeo of islands) {
      islGeo.applyMatrix4(worldToNorm);
      islGeo.computeBoundingBox();

      const cBefore = new THREE.Vector3();
      islGeo.boundingBox!.getCenter(cBefore);
      const isUpperIsland = explicitFdi ? explicitFdi < 30 : cBefore.y >= 0;

      if (Math.abs(JAW_OCCLUSION_OFFSET_Y) > 1e-5) {
        islGeo.translate(0, isUpperIsland ? -JAW_OCCLUSION_OFFSET_Y : JAW_OCCLUSION_OFFSET_Y, 0);
        islGeo.computeBoundingBox();
      }
      disposableGeometries.push(islGeo);

      const c = new THREE.Vector3();
      islGeo.boundingBox!.getCenter(c);

      const item = {
        geo: islGeo,
        cx: c.x,
        cy: c.y,
        cz: c.z,
        explicitFdi: islands.length === 1 ? explicitFdi : null,
        baseMap: stdMat?.map ?? null,
      };

      if (isUpperIsland) {
        extractedUpperIslands.push(item);
      } else {
        extractedLowerIslands.push(item);
      }
    }
  }

  const sortByArchAngle = (
    a: { cx: number; cz: number },
    b: { cx: number; cz: number },
  ) => Math.atan2(a.cx, a.cz + 1.2) - Math.atan2(b.cx, b.cz + 1.2);

  extractedUpperIslands.sort(sortByArchAngle);
  extractedLowerIslands.sort(sortByArchAngle);

  extractedUpperIslands.forEach((item, idx) => {
    const fdiNumber =
      item.explicitFdi ??
      UPPER_FDI_LEFT_TO_RIGHT[Math.min(idx, UPPER_FDI_LEFT_TO_RIGHT.length - 1)];
    const sector =
      getSectorForFdiNumber(fdiNumber) ??
      classifySectorByBoundingBoxCenter(item.cx, item.cz);

    const node = buildToothNodeFromGeometry(
      item.geo,
      fdiNumber,
      sector,
      true,
      archGroup,
      disposableGeometries,
      disposableMaterials,
      combinedGumPositions,
      item.baseMap,
    );
    toothNodes.set(node.fdiId, node);
    interactables.push(node.crownMesh);
  });

  extractedLowerIslands.forEach((item, idx) => {
    const fdiNumber =
      item.explicitFdi ??
      LOWER_FDI_LEFT_TO_RIGHT[Math.min(idx, LOWER_FDI_LEFT_TO_RIGHT.length - 1)];
    const sector =
      getSectorForFdiNumber(fdiNumber) ??
      classifySectorByBoundingBoxCenter(item.cx, item.cz);

    const node = buildToothNodeFromGeometry(
      item.geo,
      fdiNumber,
      sector,
      false,
      archGroup,
      disposableGeometries,
      disposableMaterials,
      combinedGumPositions,
      item.baseMap,
    );
    toothNodes.set(node.fdiId, node);
    interactables.push(node.crownMesh);
  });

  // Only add an internal oral cavity backdrop when the GLB does not already have separate sculpted upper/lower gums
  if (gumMeshCount < 2) {
    const oralCavityGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.68, 32, 1, false);
    const oralCavityMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7a223c'),
      roughness: 0.85,
      metalness: 0.0,
      emissive: new THREE.Color('#380c1a'),
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    });
    const oralCavityMesh = new THREE.Mesh(oralCavityGeo, oralCavityMat);
    oralCavityMesh.position.set(0, 0, -0.45);
    oralCavityMesh.scale.set(0.95, 1, 0.75);
    archGroup.add(oralCavityMesh);
    disposableGeometries.push(oralCavityGeo);
    disposableMaterials.push(oralCavityMat);
  }

  const dispose = () => {
    for (const g of disposableGeometries) g.dispose();
    for (const m of disposableMaterials) m.dispose();
  };

  return {
    archGroup,
    toothNodes,
    interactableMeshes: interactables,
    dispose,
  };
}

function createAnatomicalCrownGeometry(
  archetype: ToothArchetype,
  width: number,
  height: number,
  thickness: number,
  isUpper: boolean,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, thickness, 16, 16, 12);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const halfT = thickness * 0.5;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    const nx = Math.max(-1, Math.min(1, v.x / halfW));
    const ny = Math.max(-1, Math.min(1, v.y / halfH));
    const nz = Math.max(-1, Math.min(1, v.z / halfT));

    const sphereFactor = 0.44;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const sx = nx / Math.pow(len, sphereFactor);
    const sy = ny / Math.pow(len, sphereFactor);
    const sz = nz / Math.pow(len, sphereFactor);

    const rawRootT = isUpper ? (ny + 1) * 0.5 : (1 - ny) * 0.5;
    const rootT = Math.max(0, Math.min(1, rawRootT));
    const cervicalTaper = 1.0 - 0.18 * Math.pow(rootT, 1.7);
    const incisalSoften = 1.0 - 0.08 * Math.pow(1.0 - rootT, 3.0);

    let x = sx * halfW * cervicalTaper * incisalSoften;
    let y = sy * halfH;
    let z = sz * halfT * (0.92 + 0.08 * Math.cos(nx * Math.PI * 0.5));

    if (nz > 0) {
      z += Math.cos(nx * Math.PI * 0.46) * Math.sin(rootT * Math.PI) * 0.12 * thickness;
    }

    const occlusalProximity = Math.max(0, 1 - rootT * 2.4);
    if (archetype === 'incisor') {
      z *= 1 - occlusalProximity * 0.22;
    } else if (archetype === 'canine') {
      const cuspPeak = Math.max(0, 1 - Math.abs(nx) * 1.35) * occlusalProximity * 0.1 * height;
      y += isUpper ? -cuspPeak : cuspPeak;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

function getDimensionsForTooth(meta: ToothMetadata) {
  const base = ARCH_DIMENSIONS[meta.archetype];
  const isUpper = meta.arch === 'upper';
  const sign = meta.quadrant === 2 || meta.quadrant === 3 ? 1 : -1;
  const angleAbs = POSITION_ANGLE_RAD[meta.positionIndex] ?? base.archAngleAbs;
  let width = base.width;
  if (meta.positionIndex === 1) width = isUpper ? 0.48 : 0.36;
  else if (meta.positionIndex === 2) width = isUpper ? 0.4 : 0.38;
  const height = isUpper ? base.height : base.height * 0.94;
  return { width, height, thickness: base.thickness, archAngleRad: sign * angleAbs };
}

export function buildProceduralDentalArch(): BuiltDentalArch {
  const archGroup = new THREE.Group();
  archGroup.name = 'DuraphatDentalArchRoot';

  const toothNodes = new Map<string, ToothVisualNode>();
  const interactableMeshes: THREE.Mesh[] = [];
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];

  const gumMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f2748b'),
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    emissive: new THREE.Color('#5c1225'),
    emissiveIntensity: 0.16,
  });
  disposableMaterials.push(gumMaterial);

  for (const isUpper of [true, false]) {
    const points: THREE.Vector3[] = [];
    const steps = 36;
    const maxTheta = 1.42;
    for (let i = 0; i <= steps; i++) {
      const t = -maxTheta + (2 * maxTheta * i) / steps;
      points.push(
        new THREE.Vector3(
          Math.sin(t) * 2.66,
          (isUpper ? 0.88 : -0.88) + (isUpper ? 1 : -1) * Math.abs(t) * 0.05,
          Math.cos(t) * 2.48 - 1.16,
        ),
      );
    }
    const tubeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.46, 24, false);
    disposableGeometries.push(tubeGeo);
    archGroup.add(new THREE.Mesh(tubeGeo, gumMaterial));
  }

  for (const meta of CLINICAL_FDI_CATALOG) {
    const isUpper = meta.arch === 'upper';
    const dims = getDimensionsForTooth(meta);
    const rx = isUpper ? 2.66 : 2.58;
    const rz = isUpper ? 2.5 : 2.42;
    const x = Math.sin(dims.archAngleRad) * rx;
    const z = Math.cos(dims.archAngleRad) * rz - 1.15;
    const y = isUpper ? 0.31 : -0.31;

    const crownGeo = createAnatomicalCrownGeometry(
      meta.archetype,
      dims.width,
      dims.height,
      dims.thickness,
      isUpper,
    );
    const dummy = new THREE.Object3D();
    dummy.position.set(x, y, z);
    dummy.lookAt(x + Math.sin(dims.archAngleRad) * 2, y, z + Math.cos(dims.archAngleRad) * 2);
    dummy.updateMatrix();
    crownGeo.applyMatrix4(dummy.matrix);
    crownGeo.computeVertexNormals();
    disposableGeometries.push(crownGeo);

    const node = buildToothNodeFromGeometry(
      crownGeo,
      meta.fdiNumber,
      meta.sector,
      isUpper,
      archGroup,
      disposableGeometries,
      disposableMaterials,
    );
    toothNodes.set(meta.fdiId, node);
    interactableMeshes.push(node.crownMesh);
  }

  const dispose = () => {
    for (const g of disposableGeometries) g.dispose();
    for (const m of disposableMaterials) m.dispose();
  };

  return { archGroup, toothNodes, interactableMeshes, dispose };
}

export function syncTeethVisualState(
  toothNodes: Map<string, ToothVisualNode>,
  teethState: Record<string, ToothRuntimeState>,
  activeSector: DentalSector,
  elapsedSeconds: number,
  activeBrushedFdiId?: string | null,
  cameraQuaternion?: THREE.Quaternion,
  isPlaying = false,
  brushWorldPos?: THREE.Vector3,
): void {
  for (const [fdiId, node] of toothNodes.entries()) {
    const fallbackId =
      fdiId === 'tooth_18'
        ? 'tooth_17'
        : fdiId === 'tooth_28'
          ? 'tooth_27'
          : fdiId === 'tooth_38'
            ? 'tooth_37'
            : fdiId === 'tooth_48'
              ? 'tooth_47'
              : fdiId;

    const isWisdomMirror = fdiId !== fallbackId;
    const tState = teethState[fdiId] ?? teethState[fallbackId];
    const crownMat = node.crownMesh.material as THREE.MeshPhysicalMaterial;
    const shieldUniforms = crownMat.userData.shieldUniforms as EnamelShieldUniforms | undefined;
    const plaqueMat = node.plaqueMesh.material as THREE.ShaderMaterial;
    const shieldMat = node.shieldMesh.material as THREE.ShaderMaterial;
    const arrowMat = node.arrowMesh.material as THREE.ShaderMaterial;

    if (!tState) continue;

    const cov = tState.coverage;
    const inActiveSector = node.sector === activeSector;
    const isActivelyBrushed = activeBrushedFdiId === fdiId;

    // 1. Organic Labial Plaque Stain on unshielded target teeth in the active sector
    if (!isWisdomMirror && tState.needsVarnish && !tState.shielded && inActiveSector) {
      node.plaqueMesh.visible = true;
      const fadeOut = Math.pow(Math.max(0, 1.0 - cov), 1.25);
      plaqueMat.uniforms.uOpacity.value = fadeOut;
      crownMat.color.lerpColors(ENAMEL_PLAQUE_TINT, ENAMEL_BASE_COLOR, cov);
    } else {
      node.plaqueMesh.visible = false;
      plaqueMat.uniforms.uOpacity.value = 0.0;
      crownMat.color.copy(ENAMEL_BASE_COLOR);
    }

    // 2. Directional Arrow Guide on active stained teeth during gameplay
    if (!isWisdomMirror && isPlaying && tState.needsVarnish && !tState.shielded && inActiveSector) {
      node.arrowMesh.visible = true;
      if (cameraQuaternion) {
        node.arrowMesh.quaternion.copy(cameraQuaternion);
      }
      arrowMat.uniforms.uOpacity.value = 0.96;
      arrowMat.uniforms.uDirectionAngle.value =
        DIRECTION_ANGLE_RAD[tState.requiredDirection] ?? 0;
      arrowMat.uniforms.uTime.value = elapsedSeconds;
      arrowMat.uniforms.uCoverage.value = cov;
    } else {
      node.arrowMesh.visible = false;
      arrowMat.uniforms.uOpacity.value = 0.0;
    }

    // 3. Custom GLSL Bio-Luminous Fluoride Shield Shader + PBR Enamel Glaze
    node.shieldMesh.visible = false;
    shieldMat.uniforms.uIntensity.value = 0.0;

    const dirVec = DIRECTION_VEC2[tState.requiredDirection] ?? [0, 1];
    const shieldProgress = tState.shielded
      ? 1.0
      : !isWisdomMirror && tState.needsVarnish && inActiveSector
        ? cov
        : 0.0;

    if (shieldUniforms) {
      shieldUniforms.uShieldProgress.value = shieldProgress;
      shieldUniforms.uStrokeDir.value.set(dirVec[0], dirVec[1]);
      shieldUniforms.uTime.value = elapsedSeconds;
      shieldUniforms.uIsBrushed.value = isActivelyBrushed ? 1.0 : 0.0;
      if (brushWorldPos) {
        shieldUniforms.uBrushWorldPos.value.copy(brushWorldPos);
        shieldUniforms.uBrushGlowStrength.value = isPlaying ? 1.0 : 0.0;
      } else {
        shieldUniforms.uBrushGlowStrength.value = 0.0;
      }
    }

    const shimmerPulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 3.4 + node.fdiNumber * 0.65);

    if (tState.shielded) {
      // 100% Protected Tooth: Bio-Luminous Fluoride Glaze + 3D Fresnel Rim Shield
      crownMat.roughness = 0.035;
      crownMat.metalness = 0.18;
      crownMat.clearcoat = 1.0;
      crownMat.clearcoatRoughness = 0.02;
      crownMat.reflectivity = 1.0;
      crownMat.iridescence = 0.65;
      crownMat.iridescenceIOR = 1.45;
      crownMat.emissive.set('#6d3fd6');
      crownMat.emissiveIntensity = 0.14 + shimmerPulse * 0.06;
    } else if (!isWisdomMirror && tState.needsVarnish && inActiveSector) {
      // Stained Target Tooth: Transitions from chalky plaque to high-gloss fluoride shield in 2 movements
      crownMat.roughness = THREE.MathUtils.lerp(0.46, 0.04, cov);
      crownMat.metalness = THREE.MathUtils.lerp(0.0, 0.18, cov);
      crownMat.clearcoat = THREE.MathUtils.lerp(0.22, 1.0, cov);
      crownMat.clearcoatRoughness = THREE.MathUtils.lerp(0.32, 0.02, cov);
      crownMat.reflectivity = THREE.MathUtils.lerp(0.62, 1.0, cov);
      crownMat.iridescence = THREE.MathUtils.lerp(0.0, 0.65, cov);
      crownMat.iridescenceIOR = 1.45;
      crownMat.emissive.set('#7c3aed');
      crownMat.emissiveIntensity = isActivelyBrushed ? 0.22 : cov * 0.14;
    } else {
      // Clean Natural Enamel
      crownMat.roughness = 0.16;
      crownMat.metalness = 0.02;
      crownMat.clearcoat = 0.90;
      crownMat.clearcoatRoughness = 0.08;
      crownMat.reflectivity = 0.92;
      crownMat.iridescence = 0.0;
      crownMat.emissive.set('#3b2854');
      crownMat.emissiveIntensity = 0.04;
    }
  }
}

/**
 * Binds the uploaded `brush_applicator_optimized.glb` model into the existing 3D brush group,
 * normalizing its bristle tip to local (0, 0, 0) and handle along +Z, plumping the teardrop bristle
 * tuft, and placing the white-to-Colgate-Red transition strictly at the neck ferrule (`z = 0.43..0.46`).
 */
export function bindExternalGlbBrush(
  gltfScene: THREE.Group,
  targetBrushGroup: THREE.Group,
): { bristleTipMesh: THREE.Mesh; dispose: () => void } | null {
  gltfScene.updateMatrixWorld(true);
  let sourceMesh: THREE.Mesh | null = null;
  gltfScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !sourceMesh) {
      sourceMesh = child as THREE.Mesh;
    }
  });
  if (!sourceMesh) return null;

  const foundMesh = sourceMesh as THREE.Mesh;
  const rawMat = Array.isArray(foundMesh.material) ? foundMesh.material[0] : foundMesh.material;
  const stdMat = rawMat as THREE.MeshStandardMaterial | undefined;
  if (stdMat?.map) {
    stdMat.map.colorSpace = THREE.SRGBColorSpace;
  }

  const geo = foundMesh.geometry.clone();
  geo.applyMatrix4(foundMesh.matrixWorld);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const midX = (box.min.x + box.max.x) * 0.5;
  const midZ = (box.min.z + box.max.z) * 0.5;
  const tipY = box.max.y;

  // Move bristle tip (max.y) to origin (0,0,0) and rotate -90deg around X so handle extends along +Z
  geo.translate(-midX, -tipY, -midZ);
  geo.rotateX(-Math.PI * 0.5);
  geo.scale(1.85, 1.85, 1.85);
  geo.computeBoundingBox();
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    map: stdMat?.map ?? null,
    roughness: 0.24,
    metalness: 0.02,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
  });

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `
      #include <map_fragment>
      // Detect red handle pixels vs neutral bristle fiber pixels in tx_brush.webp (in linear color space)
      float redDominance = clamp((diffuseColor.r - max(diffuseColor.g, diffuseColor.b) - 0.12) * 3.0, 0.0, 1.0);
      vec3 bristlePearly = mix(diffuseColor.rgb, vec3(0.99, 0.985, 1.0), 0.55);
      vec3 colgateCrimson = vec3(0.54, 0.004, 0.012);
      diffuseColor.rgb = mix(bristlePearly, colgateCrimson, redDominance);
      `,
    );
  };

  // Remove procedural mesh children from targetBrushGroup while keeping the contact glow Sprite
  const toRemove: THREE.Object3D[] = [];
  for (const child of targetBrushGroup.children) {
    if ((child as THREE.Mesh).isMesh) {
      toRemove.push(child);
    }
  }
  for (const child of toRemove) {
    targetBrushGroup.remove(child);
  }

  const glbBrushMesh = new THREE.Mesh(geo, mat);
  glbBrushMesh.name = 'LoadedGlbColgateBrush';
  glbBrushMesh.castShadow = true;
  targetBrushGroup.add(glbBrushMesh);

  return {
    bristleTipMesh: glbBrushMesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

function createBrushGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
    grad.addColorStop(0.32, 'rgba(221, 200, 255, 0.68)');
    grad.addColorStop(0.68, 'rgba(147, 51, 234, 0.34)');
    grad.addColorStop(1.0, 'rgba(147, 51, 234, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createColgateRedBrush3D(): {
  brushGroup: THREE.Group;
  bristleTipMesh: THREE.Mesh;
  dispose: () => void;
} {
  const brushGroup = new THREE.Group();
  brushGroup.name = 'ColgateRedApplicatorBrush';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const redHandleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dc1422'),
    roughness: 0.16,
    metalness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    emissive: new THREE.Color('#520612'),
    emissiveIntensity: 0.18,
  });
  materials.push(redHandleMat);

  const bristleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f7f3ff'),
    roughness: 0.24,
    metalness: 0.0,
    emissive: new THREE.Color('#c4a1ff'),
    emissiveIntensity: 0.52,
  });
  materials.push(bristleMat);

  // Sleek tapered dental varnish brush tuft (narrower at the ferrule, softly rounded at the tip)
  const tuftPoints: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at contact tip, 1 at red ferrule collar
    const z = t * 0.42;
    let r = 0.068;
    if (t < 0.28) {
      // Rounded dome at contact tip
      const u = t / 0.28;
      r = 0.072 * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
    } else {
      // Taper gently toward the slim red ferrule neck
      const u = (t - 0.28) / 0.72;
      r = 0.072 * (1 - u * 0.36);
    }
    tuftPoints.push(new THREE.Vector2(r, z));
  }
  const tipGeo = new THREE.LatheGeometry(tuftPoints, 28);
  tipGeo.rotateX(Math.PI * 0.5);
  geometries.push(tipGeo);
  const bristleTipMesh = new THREE.Mesh(tipGeo, bristleMat);
  bristleTipMesh.castShadow = true;
  brushGroup.add(bristleTipMesh);

  // Luminous violet-white contact halo right at the brush tip
  const glowTex = createBrushGlowTexture();
  const spriteMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xe9d5ff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  materials.push(spriteMat);
  const glowSprite = new THREE.Sprite(spriteMat);
  glowSprite.scale.set(0.66, 0.66, 1.0);
  glowSprite.position.set(0, 0, 0.05);
  brushGroup.add(glowSprite);

  // Sculpted slim red ferrule neck & collar ring matching reference image
  const collarGeo = new THREE.CylinderGeometry(0.058, 0.045, 0.28, 24);
  collarGeo.rotateX(Math.PI * 0.5);
  collarGeo.translate(0, 0, 0.54);
  geometries.push(collarGeo);
  brushGroup.add(new THREE.Mesh(collarGeo, redHandleMat));

  const ringGeo = new THREE.TorusGeometry(0.058, 0.011, 12, 24);
  ringGeo.translate(0, 0, 0.67);
  geometries.push(ringGeo);
  brushGroup.add(new THREE.Mesh(ringGeo, redHandleMat));

  // Sleek tapered red applicator handle extending toward upper-right
  const handleGeo = new THREE.CylinderGeometry(0.048, 0.068, 4.6, 24);
  handleGeo.rotateX(Math.PI * 0.5);
  handleGeo.translate(0, 0, 2.95);
  geometries.push(handleGeo);
  const handleMesh = new THREE.Mesh(handleGeo, redHandleMat);
  handleMesh.castShadow = true;
  brushGroup.add(handleMesh);

  const dispose = () => {
    glowTex.dispose();
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  };

  return { brushGroup, bristleTipMesh, dispose };
}
