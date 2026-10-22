import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLINICAL_FDI_CATALOG,
  type GameSessionState,
  applyBrushScrubToTooth,
  classifySectorByBoundingBoxCenter,
  createInitialGameSession,
  evaluateDirectionalBrushStroke,
  formatLedCountdown,
  getSectorForFdiNumber,
  getSectorProgress,
  parseFdiNumberFromMeshName,
  tickGameTimer,
} from './dentalRules.ts';

test('FDI tooth numbering maps correctly to FRONT, LEFT, and RIGHT sectors', () => {
  assert.equal(getSectorForFdiNumber(11), 'FRONT');
  assert.equal(getSectorForFdiNumber(23), 'FRONT');
  assert.equal(getSectorForFdiNumber(32), 'FRONT');
  assert.equal(getSectorForFdiNumber(43), 'FRONT');

  assert.equal(getSectorForFdiNumber(24), 'LEFT');
  assert.equal(getSectorForFdiNumber(27), 'LEFT');
  assert.equal(getSectorForFdiNumber(36), 'LEFT');

  assert.equal(getSectorForFdiNumber(14), 'RIGHT');
  assert.equal(getSectorForFdiNumber(17), 'RIGHT');
  assert.equal(getSectorForFdiNumber(46), 'RIGHT');

  assert.equal(getSectorForFdiNumber(99), null);
  assert.equal(CLINICAL_FDI_CATALOG.length, 28);
});

test('Mesh name parser and bounding-box fallback classify external GLB teeth reliably', () => {
  assert.equal(parseFdiNumberFromMeshName('tooth_11'), 11);
  assert.equal(parseFdiNumberFromMeshName('Tooth_26_Crown'), 26);
  assert.equal(parseFdiNumberFromMeshName('Tooth_38_Lower_L_Molar3'), 38);
  assert.equal(parseFdiNumberFromMeshName('diente-44'), 44);
  assert.equal(parseFdiNumberFromMeshName('Gum_Upper'), null);

  assert.equal(classifySectorByBoundingBoxCenter(0.1, 1.2), 'FRONT');
  assert.equal(classifySectorByBoundingBoxCenter(1.6, -0.2), 'LEFT');
  assert.equal(classifySectorByBoundingBoxCenter(-1.6, -0.2), 'RIGHT');
});

test('Initial game session spawns batch of 4 spots in starting sector with 4 distinct directional arrows', () => {
  let seed = 0.42;
  const deterministicRng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const session = createInitialGameSession(0, deterministicRng, 30);
  assert.equal(session.totalTargets, 28);
  assert.equal(session.activeSector, 'FRONT');

  const frontProgress = getSectorProgress(session.teeth, 'FRONT');
  const leftProgress = getSectorProgress(session.teeth, 'LEFT');
  const rightProgress = getSectorProgress(session.teeth, 'RIGHT');

  assert.equal(frontProgress.total, 12);
  assert.equal(leftProgress.total, 8);
  assert.equal(rightProgress.total, 8);
  assert.equal(frontProgress.shielded, 0);

  // Active spots in FRONT initially is exactly 4 with all 4 directions represented
  const activeFrontSpots = Object.values(session.teeth).filter(
    (t) => t.sector === 'FRONT' && t.needsVarnish && !t.shielded,
  );
  assert.equal(activeFrontSpots.length, 4);
  const dirs = new Set(activeFrontSpots.map((t) => t.requiredDirection));
  assert.equal(dirs.size, 4);
});

test('evaluateDirectionalBrushStroke validates UP, DOWN, LEFT, and RIGHT finger movements accurately', () => {
  // UP requires negative dy in screen coordinates
  assert.equal(evaluateDirectionalBrushStroke('UP', 0, -18).isAligned, true);
  assert.equal(evaluateDirectionalBrushStroke('UP', 4, -15).isAligned, true);
  assert.equal(evaluateDirectionalBrushStroke('UP', 0, 18).isAligned, false);
  assert.equal(evaluateDirectionalBrushStroke('UP', 18, 0).isAligned, false);

  // DOWN requires positive dy
  assert.equal(evaluateDirectionalBrushStroke('DOWN', 0, 18).isAligned, true);
  assert.equal(evaluateDirectionalBrushStroke('DOWN', 0, -18).isAligned, false);

  // LEFT requires negative dx
  assert.equal(evaluateDirectionalBrushStroke('LEFT', -20, 2).isAligned, true);
  assert.equal(evaluateDirectionalBrushStroke('LEFT', 20, 0).isAligned, false);

  // RIGHT requires positive dx
  assert.equal(evaluateDirectionalBrushStroke('RIGHT', 20, -2).isAligned, true);
  assert.equal(evaluateDirectionalBrushStroke('RIGHT', -20, 0).isAligned, false);
});

test('Multi-stroke scrub cleans batches of 4 and auto-advances FRONT -> LEFT -> RIGHT -> VICTORY across all 28 teeth', () => {
  let session = createInitialGameSession(0, () => 0.25, 30);
  session = { ...session, status: 'playing' };

  // Cannot clean other sectors while FRONT is active
  const anyNonFront = Object.values(session.teeth).find((t) => t.sector !== 'FRONT')!;
  const ignoredAttempt = applyBrushScrubToTooth(session, anyNonFront.fdiId, 0.5);
  assert.equal(ignoredAttempt.coverageChanged, false);
  assert.equal(ignoredAttempt.session.activeSector, 'FRONT');

  // Clean all 12 teeth in FRONT (3 batches of 4)
  for (let i = 0; i < 12; i++) {
    const active = Object.values(session.teeth).find(
      (t) => t.sector === 'FRONT' && t.needsVarnish && !t.shielded,
    );
    assert.ok(active, `Should have active target in FRONT at iteration ${i}`);
    session = applyBrushScrubToTooth(session, active.fdiId, 1.0).session;
  }

  assert.equal(session.activeSector, 'LEFT');
  assert.deepEqual(session.completedSectors, ['FRONT']);
  assert.equal(session.shieldedCount, 12);

  // Clean all 8 teeth in LEFT (2 batches of 4)
  for (let i = 0; i < 8; i++) {
    const active = Object.values(session.teeth).find(
      (t) => t.sector === 'LEFT' && t.needsVarnish && !t.shielded,
    );
    assert.ok(active, `Should have active target in LEFT at iteration ${i}`);
    session = applyBrushScrubToTooth(session, active.fdiId, 1.0).session;
  }

  assert.equal(session.activeSector, 'RIGHT');
  assert.deepEqual(session.completedSectors, ['FRONT', 'LEFT']);
  assert.equal(session.shieldedCount, 20);

  // Clean all 8 teeth in RIGHT (2 batches of 4)
  for (let i = 0; i < 8; i++) {
    const active = Object.values(session.teeth).find(
      (t) => t.sector === 'RIGHT' && t.needsVarnish && !t.shielded,
    );
    assert.ok(active, `Should have active target in RIGHT at iteration ${i}`);
    session = applyBrushScrubToTooth(session, active.fdiId, 1.0).session;
  }

  assert.equal(session.status, 'title');
  assert.equal(session.outcome, 'victory');
  assert.equal(session.shieldedCount, 0);
  assert.ok(session.score > 5000);
});

test('Countdown timer formats as 01:00 / 00:45 / 00:30 and returns to Start Menu (title) when reaching 0', () => {
  assert.equal(formatLedCountdown(60), '01:00');
  assert.equal(formatLedCountdown(45), '00:45');
  assert.equal(formatLedCountdown(30), '00:30');
  assert.equal(formatLedCountdown(9.2), '00:10');
  assert.equal(formatLedCountdown(0), '00:00');

  let session: GameSessionState = {
    ...createInitialGameSession(0, Math.random, 60),
    status: 'playing',
  };
  session = tickGameTimer(session, 12.5);
  assert.equal(session.timeRemainingSec, 47.5);
  assert.equal(session.status, 'playing');

  session = tickGameTimer(session, 50);
  assert.equal(session.timeRemainingSec, 60);
  assert.equal(session.status, 'title');
  assert.equal(session.outcome, 'timeout');
});
