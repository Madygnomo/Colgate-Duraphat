/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  COVERAGE_PER_MOVEMENT,
  DEFAULT_GAME_DURATION_SEC,
  SECTOR_ORDER,
  type GameSessionState,
  applyBrushScrubToTooth,
  createInitialGameSession,
  formatLedCountdown,
  getSectorProgress,
  switchActiveSector,
  tickGameTimer,
} from './game/dentalRules';
import { soundEngine } from './audio/soundEngine';
import {
  ColgateDuraphatLockup,
  DuraphatProductPack,
  GuillocheWaveBackdrop,
} from './components/BrandAssets';
import { DentalViewport3D } from './components/DentalViewport3D';

export default function App() {
  const [session, setSession] = useState<GameSessionState>(() => {
    const initial = createInitialGameSession(0, Math.random, DEFAULT_GAME_DURATION_SEC);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return { ...initial, status: 'playing' };
      }
    }
    return initial;
  });

  // Sync game state machine to document.body.dataset.state ('title' | 'playing' | 'paused' | 'gameover')
  useEffect(() => {
    document.body.dataset.state = session.status;
  }, [session.status]);

  // Trigger celebratory confetti and Web Audio fanfare on Victory / Timeout
  useEffect(() => {
    if (session.status === 'gameover') {
      if (session.outcome === 'victory') {
        soundEngine.playVictoryFanfare();
        try {
          confetti({
            particleCount: 70,
            spread: 68,
            origin: { y: 0.58 },
            colors: ['#8B5CF6', '#C084FC', '#E31837', '#FFFFFF'],
          });
        } catch {
          // Ignore confetti errors in headless mode
        }
      } else if (session.outcome === 'timeout') {
        soundEngine.playTimeoutCue();
      }
    }
  }, [session.status, session.outcome]);

  // Countdown timer loop (ticks at 10Hz while in 'playing')
  useEffect(() => {
    if (session.status !== 'playing') return;

    let lastTick = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - lastTick) / 1000;
      lastTick = now;
      setSession((prev) => tickGameTimer(prev, deltaSec));
    }, 100);

    return () => window.clearInterval(interval);
  }, [session.status]);

  // Start / Restart Game Handler
  const handleStartGame = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.currentTarget.blur();
    setSession((prev) => ({
      ...createInitialGameSession(prev.bestScore, Math.random, DEFAULT_GAME_DURATION_SEC),
      status: 'playing',
      modelSource: prev.modelSource,
      customModelName: prev.customModelName,
    }));
  }, []);

  // Multi-stroke varnish brush scrub callback from 3D Raycaster or accessible controls
  const handleScrubTooth = useCallback((fdiId: string, coverageDelta: number) => {
    setSession((prev) => {
      const result = applyBrushScrubToTooth(prev, fdiId, coverageDelta);
      if (!result.coverageChanged) return prev;

      const updatedTooth = result.session.teeth[fdiId];
      if (result.toothJustShielded) {
        soundEngine.playToothShieldedChime(result.session.strokeCombo);
      } else if (updatedTooth) {
        soundEngine.playBrushScrubSound(updatedTooth.coverage);
      }

      if (result.sectorJustCompleted && !result.allSectorsCompleted) {
        const nextIdx = SECTOR_ORDER.indexOf(result.session.activeSector);
        soundEngine.playSectorCompleteFanfare(nextIdx);
      }

      return result.session;
    });
  }, []);

  // Accessible / Keyboard / Quick-Brush helper for the next unshielded tooth in the active sector (2 movements = 100%)
  const handleBrushNextActiveTarget = useCallback((coverageAmount = COVERAGE_PER_MOVEMENT) => {
    setSession((prev) => {
      if (prev.status !== 'playing') return prev;
      const nextTarget = Object.values(prev.teeth).find(
        (t) => t.sector === prev.activeSector && t.needsVarnish && !t.shielded,
      );
      if (!nextTarget) return prev;

      const result = applyBrushScrubToTooth(prev, nextTarget.fdiId, coverageAmount);
      if (result.toothJustShielded) {
        soundEngine.playToothShieldedChime(result.session.strokeCombo);
      } else {
        soundEngine.playBrushScrubSound(
          result.session.teeth[nextTarget.fdiId]?.coverage ?? 0.5,
        );
      }

      if (result.sectorJustCompleted && !result.allSectorsCompleted) {
        const nextIdx = SECTOR_ORDER.indexOf(result.session.activeSector);
        soundEngine.playSectorCompleteFanfare(nextIdx);
      }

      return result.session;
    });
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (session.status === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleStartGame();
        return;
      }

      if (session.status === 'playing' && (e.key === ' ' || e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        handleBrushNextActiveTarget(e.key === ' ' ? 1.0 : COVERAGE_PER_MOVEMENT);
        return;
      }

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        setSession((prev) => {
          if (prev.status === 'playing') return { ...prev, status: 'paused' };
          if (prev.status === 'paused') return { ...prev, status: 'playing' };
          return prev;
        });
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (
          session.status === 'playing' ||
          session.status === 'paused' ||
          session.status === 'gameover'
        ) {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        soundEngine.setMuted(!soundEngine.isMuted());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session.status, handleStartGame, handleBrushNextActiveTarget]);

  // Compute continuous overall progress percentage across all teeth
  const continuousShieldSum = Object.values(session.teeth).reduce(
    (acc, t) => acc + (t.shielded ? 1 : t.needsVarnish ? t.coverage : 0),
    0,
  );
  const rawPct = Math.round(
    (continuousShieldSum / Math.max(1, session.totalTargets)) * 100,
  );
  const displayProgressPct =
    session.status === 'title' && rawPct === 0 ? 9 : rawPct;

  const isUrgentTime = session.status === 'playing' && session.timeRemainingSec <= 8;

  // SVG Circular Progress Ring geometry
  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset =
    ringCircumference * (1 - Math.min(100, Math.max(9, displayProgressPct)) / 100);

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      {/* 1. Ethereal Pastel Lavender & Guilloché Wave Backdrop */}
      <GuillocheWaveBackdrop />

      {/* 2. Full-Viewport Three.js Studio 3D Dental Arch & Applicator Brush */}
      <DentalViewport3D
        session={session}
        onScrubTooth={handleScrubTooth}
      />

      {/* 3. Ultra-Minimalist Key Visual UI Layer (Matching Reference Render 1:1) */}
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5 sm:p-8 md:p-10">
        {/* TOP ROW: Stacked Colgate Duraphat Logo (Left) + Frosted White Timer Pill & Radial Shield Ring (Right) */}
        <div className="flex items-start justify-between w-full">
          {/* Top-Left: Clean Stacked Colgate + Duraphat® Lockup */}
          <div className="pointer-events-auto">
            <ColgateDuraphatLockup compact />
          </div>

          {/* Top-Right: Frosted White Timer Pill (`00:45`) + Circular Purple Shield Ring (`9%`) */}
          <div className="pointer-events-auto flex items-center gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                if (session.status === 'playing') {
                  setSession((prev) => ({ ...prev, status: 'paused' }));
                } else if (session.status === 'paused') {
                  setSession((prev) => ({ ...prev, status: 'playing' }));
                }
              }}
              className={`px-5 py-2 sm:px-6 sm:py-2.5 rounded-2xl bg-white/92 shadow-[0_10px_28px_rgba(109,40,217,0.08)] border ${
                isUrgentTime ? 'border-red-300' : 'border-white'
              } flex items-center justify-center cursor-pointer transition-transform active:scale-95`}
              data-testid="hud-countdown-timer"
              aria-label="Tiempo restante"
            >
              <span
                className={`font-sans text-2xl sm:text-4xl font-semibold tracking-tight leading-none ${
                  isUrgentTime ? 'text-[#DC1625]' : 'text-[#1E1B3A]'
                }`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatLedCountdown(session.timeRemainingSec)}
              </span>
            </button>

            {/* Circular Purple Radial Progress Ring with Half-Shaded Tooth Shield Icon & Percentage */}
            <div
              className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center"
              data-testid="hud-shield-counter"
              title={`Protección Duraphat: ${displayProgressPct}%`}
            >
              <svg viewBox="0 0 60 60" className="w-full h-full">
                <circle
                  cx="30"
                  cy="30"
                  r={ringRadius}
                  fill="none"
                  stroke="#D8CEF0"
                  strokeWidth="4.2"
                  strokeDasharray="128 24"
                  strokeDashoffset="-8"
                  strokeLinecap="round"
                />
                <circle
                  cx="30"
                  cy="30"
                  r={ringRadius}
                  fill="none"
                  stroke="#8E6CEF"
                  strokeWidth="4.5"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringDashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 30 30)"
                />
                <g transform="translate(18, 16)">
                  <path
                    d="M12,2 L21,5.5 V13.5 C21,20 17,24.8 12,26.8 C7,24.8 3,20 3,13.5 V5.5 L12,2 Z"
                    fill="none"
                    stroke="#6E48C6"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12,3.5 L19.5,6.5 V13.5 C19.5,19 16,23.2 12,25 Z"
                    fill="#6E48C6"
                    fillOpacity="0.65"
                  />
                </g>
              </svg>
              <span
                className="absolute -bottom-0.5 right-0 text-[11px] sm:text-xs font-bold text-[#1E1B3A] leading-none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {displayProgressPct}%
              </span>
              <span className="sr-only">
                Armaduras {session.shieldedCount}/{session.totalTargets} ({displayProgressPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* CENTER OVERLAY: Centered Start Button on Title Screen, or Pause / Victory / Timeout Modals */}
        <div className="flex-1 flex items-center justify-center my-auto">
          {session.status === 'title' && (
            <div className="pointer-events-auto flex flex-col items-center justify-center text-center">
              <button
                type="button"
                data-start="true"
                data-testid="start-mission-btn"
                onClick={handleStartGame}
                className="px-11 py-4 rounded-2xl bg-white hover:bg-[#FAF8FF] text-[#1E1B3A] font-sans font-bold text-lg sm:text-xl shadow-[0_14px_36px_rgba(109,40,217,0.16)] border border-white flex items-center gap-3 transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#6E48C6]" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Empezar</span>
              </button>
            </div>
          )}

          {session.status === 'paused' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-modal-title"
              className="pointer-events-auto max-w-sm w-full bg-white/96 p-7 rounded-3xl shadow-[0_20px_50px_rgba(30,27,58,0.14)] border border-white text-center"
            >
              <h2
                id="pause-modal-title"
                className="font-sans text-2xl font-bold text-[#1E1B3A] mb-6"
              >
                Pausa
              </h2>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSession((prev) => ({ ...prev, status: 'playing' }))}
                  className="flex-1 py-3 px-5 rounded-2xl bg-[#1E1B3A] hover:bg-[#2E2956] text-white font-semibold text-sm cursor-pointer whitespace-nowrap transition-colors"
                >
                  Continuar
                </button>
                <button
                  type="button"
                  onClick={handleStartGame}
                  className="flex-1 py-3 px-5 rounded-2xl bg-[#F4F0FC] hover:bg-[#EAE2FA] text-[#1E1B3A] font-semibold text-sm cursor-pointer whitespace-nowrap transition-colors"
                >
                  Reiniciar
                </button>
              </div>
            </div>
          )}

          {session.status === 'gameover' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="gameover-modal-title"
              className="pointer-events-auto max-w-sm w-full bg-white/96 p-7 rounded-3xl shadow-[0_20px_50px_rgba(30,27,58,0.14)] border border-white text-center"
            >
              <h2
                id="gameover-modal-title"
                className="font-sans text-2xl font-bold text-[#1E1B3A] mb-2"
              >
                {session.outcome === 'victory'
                  ? '¡Protección 100% Completa!'
                  : 'Tiempo Finalizado'}
              </h2>
              <p className="text-sm text-[#645A84] mb-6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {displayProgressPct}% protegido · {Math.round(session.totalDurationSec - session.timeRemainingSec)}s
              </p>

              <button
                type="button"
                data-start="true"
                onClick={handleStartGame}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#1E1B3A] hover:bg-[#2E2956] text-white font-sans font-semibold text-sm shadow-[0_10px_24px_rgba(30,27,58,0.18)] transition-transform active:scale-98 cursor-pointer whitespace-nowrap"
              >
                Jugar de Nuevo
              </button>
            </div>
          )}
        </div>

        {/* BOTTOM ROW: Stage Selector (Center during gameplay) + Product Pack (Right) */}
        <div className="relative flex items-end justify-center w-full min-h-[56px]">
          <div className="pointer-events-auto">
            {session.status === 'playing' ? (
              <div className="bg-white/90 px-2 py-1.5 rounded-2xl shadow-[0_8px_24px_rgba(109,40,217,0.08)] border border-white flex items-center gap-1">
                {SECTOR_ORDER.map((sector) => {
                  const stats = getSectorProgress(session.teeth, sector);
                  const isCurrent = session.activeSector === sector;
                  const label =
                    sector === 'FRONT'
                      ? 'Frontal'
                      : sector === 'LEFT'
                        ? 'Izquierdo'
                        : 'Derecho';
                  return (
                    <button
                      key={sector}
                      type="button"
                      data-testid={`sector-indicator-${sector.toLowerCase()}`}
                      onClick={() => {
                        setSession((prev) => switchActiveSector(prev, sector));
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        isCurrent
                          ? 'bg-[#1E1B3A] text-white'
                          : stats.isComplete
                            ? 'text-[#6E48C6] bg-[#F3EEFC]'
                            : 'text-[#645A84] hover:text-[#1E1B3A]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Bottom-Right: Official Duraphat 22,600 ppm F Carton Box & Tube */}
          <div className="hidden sm:block absolute right-0 bottom-0">
            <DuraphatProductPack />
          </div>
        </div>
      </div>
    </main>
  );
}

