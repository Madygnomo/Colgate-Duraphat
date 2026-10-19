export type DentalSector = 'FRONT' | 'LEFT' | 'RIGHT';

export type GameStatus = 'title' | 'playing' | 'paused' | 'gameover';

export type GameOutcome = 'none' | 'victory' | 'timeout';

export type ToothArchetype = 'incisor' | 'canine' | 'premolar' | 'molar';

export type BrushDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export const BRUSH_DIRECTIONS: readonly BrushDirection[] = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
] as const;

export interface ToothMetadata {
  fdiId: string;
  fdiNumber: number;
  arch: 'upper' | 'lower';
  quadrant: 1 | 2 | 3 | 4;
  positionIndex: number;
  sector: DentalSector;
  archetype: ToothArchetype;
  labelEs: string;
}

export interface ToothRuntimeState {
  fdiId: string;
  sector: DentalSector;
  needsVarnish: boolean;
  coverage: number;
  shielded: boolean;
  requiredDirection: BrushDirection;
}

export interface CameraRigPreset {
  sector: DentalSector;
  labelEs: string;
  subtitleEs: string;
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

export interface GameSessionState {
  status: GameStatus;
  outcome: GameOutcome;
  activeSector: DentalSector;
  completedSectors: DentalSector[];
  timeRemainingSec: number;
  totalDurationSec: number;
  teeth: Record<string, ToothRuntimeState>;
  totalTargets: number;
  shieldedCount: number;
  score: number;
  bestScore: number;
  strokeCombo: number;
  modelSource: 'PROCEDURAL' | 'GLB';
  customModelName: string | null;
}

export const SECTOR_ORDER: readonly DentalSector[] = ['FRONT', 'LEFT', 'RIGHT'] as const;

export const DEFAULT_GAME_DURATION_SEC = 45;

export const TARGETS_PER_SECTOR = 4;

export const CAMERA_PRESETS: Record<DentalSector | 'ATTRACT' | 'VICTORY', CameraRigPreset> = {
  ATTRACT: {
    sector: 'FRONT',
    labelEs: 'Vista Frontal',
    subtitleEs: 'Arcada Dental Completa',
    position: [0, 0.05, 9.6],
    lookAt: [0, -0.02, 0.25],
    fov: 30,
  },
  FRONT: {
    sector: 'FRONT',
    labelEs: 'Sector Frontal',
    subtitleEs: 'Incisivos y Caninos Anteriores',
    position: [0, 0.05, 9.45],
    lookAt: [0, -0.02, 0.3],
    fov: 30,
  },
  LEFT: {
    sector: 'LEFT',
    labelEs: 'Sector Lateral Izquierdo',
    subtitleEs: 'Premolares y Molares (Cuadrantes 2 y 3)',
    position: [7.35, 0.18, 5.95],
    lookAt: [0.85, -0.02, 0.05],
    fov: 30,
  },
  RIGHT: {
    sector: 'RIGHT',
    labelEs: 'Sector Lateral Derecho',
    subtitleEs: 'Premolares y Molares (Cuadrantes 1 y 4)',
    position: [-7.35, 0.18, 5.95],
    lookAt: [-0.85, -0.02, 0.05],
    fov: 30,
  },
  VICTORY: {
    sector: 'FRONT',
    labelEs: 'Protección Duraphat 100%',
    subtitleEs: 'Armadura Fluorada Completa (22,600 ppm F)',
    position: [0, 0.25, 9.8],
    lookAt: [0, -0.02, 0.25],
    fov: 31,
  },
};

const ARCHETYPE_BY_INDEX: Record<number, { archetype: ToothArchetype; nameEs: string }> = {
  1: { archetype: 'incisor', nameEs: 'Incisivo Central' },
  2: { archetype: 'incisor', nameEs: 'Incisivo Lateral' },
  3: { archetype: 'canine', nameEs: 'Canino' },
  4: { archetype: 'premolar', nameEs: 'Primer Premolar' },
  5: { archetype: 'premolar', nameEs: 'Segundo Premolar' },
  6: { archetype: 'molar', nameEs: 'Primer Molar' },
  7: { archetype: 'molar', nameEs: 'Segundo Molar' },
  8: { archetype: 'molar', nameEs: 'Tercer Molar' },
};

export function getSectorForFdiNumber(fdiNumber: number): DentalSector | null {
  const quadrant = Math.floor(fdiNumber / 10);
  const posIndex = fdiNumber % 10;

  if (quadrant < 1 || quadrant > 4 || posIndex < 1 || posIndex > 8) {
    return null;
  }

  if (posIndex <= 3) {
    return 'FRONT';
  }

  if (quadrant === 2 || quadrant === 3) {
    return 'LEFT';
  }

  return 'RIGHT';
}

export function parseFdiNumberFromMeshName(meshName: string): number | null {
  if (!meshName) return null;
  const normalized = meshName.trim();

  const explicitMatch = normalized.match(/(?:tooth|diente|fdi)[_\-\s]*([1-4][1-8])(?![0-9])/i);
  if (explicitMatch) {
    return Number.parseInt(explicitMatch[1], 10);
  }

  const standaloneMatch = normalized.match(/(?:^|[^0-9])([1-4][1-8])(?:$|[^0-9])/);
  if (standaloneMatch) {
    return Number.parseInt(standaloneMatch[1], 10);
  }

  return null;
}

export function classifySectorByBoundingBoxCenter(
  centerX: number,
  centerZ: number,
  archHalfWidth = 2.2,
  anteriorZThreshold = 0.55,
): DentalSector {
  const normalizedX = archHalfWidth > 0 ? centerX / archHalfWidth : centerX;
  if (centerZ >= anteriorZThreshold && Math.abs(normalizedX) <= 0.58) {
    return 'FRONT';
  }
  return centerX >= 0 ? 'LEFT' : 'RIGHT';
}

export function buildClinicalFdiCatalog(): ToothMetadata[] {
  const catalog: ToothMetadata[] = [];
  const quadrants: readonly (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

  for (const quadrant of quadrants) {
    const arch = quadrant <= 2 ? 'upper' : 'lower';
    for (let posIndex = 1; posIndex <= 7; posIndex++) {
      const fdiNumber = quadrant * 10 + posIndex;
      const fdiId = `tooth_${fdiNumber}`;
      const sector = getSectorForFdiNumber(fdiNumber) ?? 'FRONT';
      const archetypeInfo = ARCHETYPE_BY_INDEX[posIndex];
      catalog.push({
        fdiId,
        fdiNumber,
        arch,
        quadrant,
        positionIndex: posIndex,
        sector,
        archetype: archetypeInfo.archetype,
        labelEs: `${archetypeInfo.nameEs} (#${fdiNumber})`,
      });
    }
  }

  return catalog;
}

export const CLINICAL_FDI_CATALOG: readonly ToothMetadata[] = buildClinicalFdiCatalog();

export const SPOTS_PER_BATCH = 4;

/**
 * Evaluates whether a screen-space pointer/finger drag vector (dxScreen, dyScreen)
 * aligns with the tooth's required directional arrow ('UP' | 'DOWN' | 'LEFT' | 'RIGHT').
 * Note: In browser screen coordinates, +X is RIGHT and -Y is UP.
 */
export function evaluateDirectionalBrushStroke(
  requiredDirection: BrushDirection,
  dxScreen: number,
  dyScreen: number,
): { isAligned: boolean; alignmentFactor: number } {
  const dist = Math.hypot(dxScreen, dyScreen);
  if (dist < 1.2) {
    return { isAligned: false, alignmentFactor: 0 };
  }

  const ux = dxScreen / dist;
  const uy = dyScreen / dist;

  let tx = 0;
  let ty = 0;
  switch (requiredDirection) {
    case 'UP':
      tx = 0;
      ty = -1;
      break;
    case 'DOWN':
      tx = 0;
      ty = 1;
      break;
    case 'LEFT':
      tx = -1;
      ty = 0;
      break;
    case 'RIGHT':
      tx = 1;
      ty = 0;
      break;
  }

  const dot = ux * tx + uy * ty;
  // Accept strokes within ~68 degrees (cos(68°) ≈ 0.37) of the arrow direction
  if (dot >= 0.36) {
    return {
      isAligned: true,
      alignmentFactor: Math.min(1.35, 0.72 + dot * 0.63),
    };
  }

  return { isAligned: false, alignmentFactor: 0 };
}

export function activateNextSectorBatch(
  teeth: Record<string, ToothRuntimeState>,
  sector: DentalSector,
  batchSize = SPOTS_PER_BATCH,
  rng: () => number = Math.random,
): Record<string, ToothRuntimeState> {
  const nextTeeth = { ...teeth };
  const unshieldedInSector = Object.values(nextTeeth).filter(
    (t) => t.sector === sector && !t.shielded && !t.needsVarnish,
  );
  if (unshieldedInSector.length === 0) return nextTeeth;

  const shuffled = [...unshieldedInSector];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  const chosen = shuffled.slice(0, Math.min(batchSize, shuffled.length));

  // Assign a varied permutation of the 4 directional arrows across the 4 spots in the batch
  const dirPool: BrushDirection[] = [...BRUSH_DIRECTIONS];
  for (let i = dirPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = dirPool[i];
    dirPool[i] = dirPool[j];
    dirPool[j] = tmp;
  }

  chosen.forEach((t, idx) => {
    nextTeeth[t.fdiId] = {
      ...t,
      needsVarnish: true,
      coverage: 0,
      shielded: false,
      requiredDirection: dirPool[idx % dirPool.length],
    };
  });

  return nextTeeth;
}

export function switchActiveSector(
  session: GameSessionState,
  newSector: DentalSector,
  rng: () => number = Math.random,
): GameSessionState {
  if (session.status !== 'playing' || session.activeSector === newSector) {
    return session;
  }
  let nextTeeth = { ...session.teeth };
  const unshieldedInNewSector = Object.values(nextTeeth).filter(
    (t) => t.sector === newSector && !t.shielded,
  );
  const activeInNewSector = unshieldedInNewSector.filter((t) => t.needsVarnish);
  if (activeInNewSector.length === 0 && unshieldedInNewSector.length > 0) {
    nextTeeth = activateNextSectorBatch(nextTeeth, newSector, SPOTS_PER_BATCH, rng);
  }
  return {
    ...session,
    activeSector: newSector,
    teeth: nextTeeth,
  };
}

export function createInitialTeethState(
  targetsPerSector = SPOTS_PER_BATCH,
  rng: () => number = Math.random,
  availableTeeth: readonly { fdiId: string; sector: DentalSector }[] = CLINICAL_FDI_CATALOG,
): Record<string, ToothRuntimeState> {
  const state: Record<string, ToothRuntimeState> = {};

  for (const item of availableTeeth) {
    state[item.fdiId] = {
      fdiId: item.fdiId,
      sector: item.sector,
      needsVarnish: false,
      coverage: 0,
      shielded: false,
      requiredDirection: 'UP',
    };
  }

  return activateNextSectorBatch(state, 'FRONT', targetsPerSector, rng);
}

export function createInitialGameSession(
  bestScore = 0,
  rng: () => number = Math.random,
  durationSec = DEFAULT_GAME_DURATION_SEC,
): GameSessionState {
  const teeth = createInitialTeethState(SPOTS_PER_BATCH, rng);
  const totalTargets = Object.keys(teeth).length;

  return {
    status: 'title',
    outcome: 'none',
    activeSector: 'FRONT',
    completedSectors: [],
    timeRemainingSec: durationSec,
    totalDurationSec: durationSec,
    teeth,
    totalTargets,
    shieldedCount: 0,
    score: 0,
    bestScore,
    strokeCombo: 0,
    modelSource: 'PROCEDURAL',
    customModelName: null,
  };
}

export function getSectorProgress(
  teeth: Record<string, ToothRuntimeState>,
  sector: DentalSector,
): { total: number; shielded: number; ratio: number; isComplete: boolean } {
  const sectorTeeth = Object.values(teeth).filter((t) => t.sector === sector);
  const total = sectorTeeth.length;
  if (total === 0) {
    return { total: 0, shielded: 0, ratio: 1, isComplete: true };
  }
  const shielded = sectorTeeth.filter((t) => t.shielded).length;
  const continuousSum = sectorTeeth.reduce(
    (acc, t) => acc + (t.shielded ? 1 : t.coverage),
    0,
  );
  return {
    total,
    shielded,
    ratio: Math.min(1, continuousSum / total),
    isComplete: shielded === total,
  };
}

export interface ScrubStepResult {
  session: GameSessionState;
  coverageChanged: boolean;
  toothJustShielded: boolean;
  sectorJustCompleted: DentalSector | null;
  allSectorsCompleted: boolean;
}

export function applyBrushScrubToTooth(
  session: GameSessionState,
  fdiId: string,
  coverageDelta: number,
  rng: () => number = Math.random,
): ScrubStepResult {
  if (session.status !== 'playing' || coverageDelta <= 0) {
    return {
      session,
      coverageChanged: false,
      toothJustShielded: false,
      sectorJustCompleted: null,
      allSectorsCompleted: false,
    };
  }

  const target = session.teeth[fdiId];
  if (!target || !target.needsVarnish || target.shielded) {
    return {
      session,
      coverageChanged: false,
      toothJustShielded: false,
      sectorJustCompleted: null,
      allSectorsCompleted: false,
    };
  }

  if (target.sector !== session.activeSector) {
    return {
      session,
      coverageChanged: false,
      toothJustShielded: false,
      sectorJustCompleted: null,
      allSectorsCompleted: false,
    };
  }

  const nextCoverage = Math.min(1, target.coverage + coverageDelta);
  const toothJustShielded = nextCoverage >= 0.999 && !target.shielded;
  const updatedTooth: ToothRuntimeState = {
    ...target,
    coverage: toothJustShielded ? 1 : nextCoverage,
    shielded: toothJustShielded,
    needsVarnish: toothJustShielded ? false : target.needsVarnish,
  };

  let nextTeeth: Record<string, ToothRuntimeState> = {
    ...session.teeth,
    [fdiId]: updatedTooth,
  };

  let shieldedCount = session.shieldedCount;
  let strokeCombo = session.strokeCombo;
  let score = session.score;

  if (toothJustShielded) {
    shieldedCount += 1;
    strokeCombo += 1;
    score += 250 + strokeCombo * 50;

    // Check if current batch of spots in this sector is finished
    const remainingActiveInSector = Object.values(nextTeeth).filter(
      (t) => t.sector === session.activeSector && t.needsVarnish && !t.shielded,
    );

    if (remainingActiveInSector.length === 0) {
      // Spawn next batch of 4 unshielded teeth in this same sector if any remain
      const unshieldedRemaining = Object.values(nextTeeth).filter(
        (t) => t.sector === session.activeSector && !t.shielded,
      );
      if (unshieldedRemaining.length > 0) {
        nextTeeth = activateNextSectorBatch(
          nextTeeth,
          session.activeSector,
          SPOTS_PER_BATCH,
          rng,
        );
      }
    }
  } else {
    score += Math.round(coverageDelta * 100);
  }

  const sectorStats = getSectorProgress(nextTeeth, session.activeSector);
  let activeSector = session.activeSector;
  let completedSectors = session.completedSectors;
  let sectorJustCompleted: DentalSector | null = null;
  let status: GameStatus = session.status;
  let outcome: GameOutcome = session.outcome;

  if (sectorStats.isComplete && !completedSectors.includes(session.activeSector)) {
    sectorJustCompleted = session.activeSector;
    completedSectors = [...completedSectors, session.activeSector];

    const currentIdx = SECTOR_ORDER.indexOf(session.activeSector);
    const nextSector = SECTOR_ORDER[currentIdx + 1];
    if (nextSector) {
      activeSector = nextSector;
      // Immediately activate the first batch of 4 spots in the new sector
      nextTeeth = activateNextSectorBatch(
        nextTeeth,
        nextSector,
        SPOTS_PER_BATCH,
        rng,
      );
    } else {
      const timeBonus = Math.round(session.timeRemainingSec * 40);
      score += timeBonus;
      status = 'gameover';
      outcome = 'victory';
    }
  }

  const bestScore = Math.max(session.bestScore, score);

  return {
    session: {
      ...session,
      status,
      outcome,
      activeSector,
      completedSectors,
      teeth: nextTeeth,
      shieldedCount,
      score,
      bestScore,
      strokeCombo,
    },
    coverageChanged: true,
    toothJustShielded,
    sectorJustCompleted,
    allSectorsCompleted: outcome === 'victory',
  };
}

export function tickGameTimer(session: GameSessionState, deltaSec: number): GameSessionState {
  if (session.status !== 'playing' || deltaSec <= 0) {
    return session;
  }

  const nextTime = Math.max(0, session.timeRemainingSec - deltaSec);
  if (nextTime <= 0) {
    return {
      ...session,
      timeRemainingSec: 0,
      status: 'gameover',
      outcome: 'timeout',
      bestScore: Math.max(session.bestScore, session.score),
    };
  }

  return {
    ...session,
    timeRemainingSec: nextTime,
  };
}

export function formatLedCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
