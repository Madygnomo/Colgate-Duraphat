/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  CAMERA_PRESETS,
  DEFAULT_GAME_DURATION_SEC,
  SECTOR_ORDER,
  type GameSessionState,
  applyBrushScrubToTooth,
  createInitialGameSession,
  formatLedCountdown,
  getSectorProgress,
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

  const [isMuted, setIsMuted] = useState(false);
  const [customGlbBuffer, setCustomGlbBuffer] = useState<ArrayBuffer | null>(null);
  const [sectorTransitionBanner, setSectorTransitionBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    setSectorTransitionBanner(null);
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
        const nextPreset = CAMERA_PRESETS[result.session.activeSector];
        setSectorTransitionBanner(`¡Sector Protegido! Rotando a ${nextPreset.labelEs}...`);
        window.setTimeout(() => setSectorTransitionBanner(null), 1800);
      }

      return result.session;
    });
  }, []);

  // Accessible / Keyboard / Quick-Brush helper for the next unshielded tooth in the active sector
  const handleBrushNextActiveTarget = useCallback((coverageAmount = 0.36) => {
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
        const nextPreset = CAMERA_PRESETS[result.session.activeSector];
        setSectorTransitionBanner(`¡Sector Protegido! Rotando a ${nextPreset.labelEs}...`);
        window.setTimeout(() => setSectorTransitionBanner(null), 1800);
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
        handleBrushNextActiveTarget(e.key === ' ' ? 1.0 : 0.38);
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
        setIsMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session.status, handleStartGame, handleBrushNextActiveTarget]);

  const handleGlbFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        setCustomGlbBuffer(reader.result);
        setSession((prev) => ({
          ...prev,
          modelSource: 'GLB',
          customModelName: file.name,
        }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Compute continuous overall progress percentage (matching the 9% ring in the reference image on attract/start)
  const continuousShieldSum = Object.values(session.teeth)
    .filter((t) => t.needsVarnish)
    .reduce((acc, t) => acc + t.coverage, 0);
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

      {/* 2. Full-Viewport Three.js Studio 3D Dental Arch (`mouth_test.glb`) & Red Brush Canvas */}
      <DentalViewport3D
        session={session}
        onScrubTooth={handleScrubTooth}
        customGlbBuffer={customGlbBuffer}
      />

      {/* 3. Ultra-Minimalist Key Visual UI Layer (Matching Reference Concept Render 1:1) */}
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-7 md:p-9">
        {/* TOP ROW: Stacked Colgate Duraphat Logo (Left) + Frosted White Timer Pill & Radial Shield Ring (Right) */}
        <div className="flex items-start justify-between w-full">
          {/* Top-Left: Clean Stacked Colgate + Duraphat® Lockup */}
          <div className="pointer-events-auto">
            <ColgateDuraphatLockup compact />
          </div>

          {/* Top-Right: Frosted White Timer Pill (`00:45`) + Circular Purple Shield Ring (`9%`) */}
          <div className="pointer-events-auto flex items-center gap-3 sm:gap-4">
            {/* Soft Frosted White/Lavender Timer Pill (`00:45` in Dark Slate-Indigo) */}
            <div
              className={`px-4 py-2 sm:px-6 sm:py-2.5 rounded-2xl bg-white/85 backdrop-blur-md shadow-[0_10px_28px_rgba(109,40,217,0.10)] border ${
                isUrgentTime ? 'border-red-400' : 'border-white/90'
              } flex items-center justify-center`}
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
            </div>

            {/* Circular Purple Radial Progress Ring with Half-Shaded Tooth Shield Icon & Percentage */}
            <div
              className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center"
              data-testid="hud-shield-counter"
              title={`Armaduras Fluoradas: ${session.shieldedCount}/${session.totalTargets} (${displayProgressPct}%)`}
            >
              <svg viewBox="0 0 60 60" className="w-full h-full">
                {/* Soft Lavender Ring Track */}
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
                {/* Active Purple Progress Arc */}
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
                {/* Center Half-Shaded Purple Shield Icon */}
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
              {/* Percentage Readout tucked at bottom-right of ring */}
              <span className="absolute -bottom-0.5 right-0 text-[11px] sm:text-xs font-bold text-[#1E1B3A] leading-none">
                {displayProgressPct}%
              </span>
              {/* Screen-reader accessible count */}
              <span className="sr-only">
                Armaduras {session.shieldedCount}/{session.totalTargets} ({displayProgressPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* Transient Automated Sector Transition Banner (Non-blocking top-center toast) */}
        {sectorTransitionBanner && session.status === 'playing' && (
          <div className="self-center bg-[#3B1668]/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-lg text-xs sm:text-sm font-semibold tracking-tight">
            {sectorTransitionBanner}
          </div>
        )}

        {/* CENTER OVERLAY MODALS: Only Pause ('paused') or Victory/Timeout ('gameover') cover the center */}
        <div className="flex-1 flex items-center justify-center my-auto">
          {session.status === 'paused' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-modal-title"
              className="pointer-events-auto max-w-md w-full bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-[0_24px_60px_rgba(46,16,101,0.24)] border border-[#E2D4F8] text-center"
            >
              <h2
                id="pause-modal-title"
                className="font-display text-2xl font-extrabold text-[#241342] mb-1"
              >
                Reto en Pausa
              </h2>
              <p className="text-xs text-[#6E5694] mb-5">
                Barniz de Flúor Colgate Duraphat® 22,600 ppm F
              </p>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => setSession((prev) => ({ ...prev, status: 'playing' }))}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white font-semibold text-sm cursor-pointer whitespace-nowrap"
                >
                  Continuar Reto
                </button>
                <button
                  type="button"
                  onClick={handleStartGame}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#F3E8FF] hover:bg-[#E9D5FF] text-[#4C1D95] font-semibold text-sm cursor-pointer whitespace-nowrap"
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
              className="pointer-events-auto max-w-md w-full bg-white/95 backdrop-blur-md p-6 md:p-7 rounded-3xl shadow-[0_24px_60px_rgba(46,16,101,0.24)] border border-[#E2D4F8] text-center"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#F3E8FF] border border-[#D8B4FE] flex items-center justify-center text-[#6D28D9]">
                {session.outcome === 'victory' ? (
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
              </div>

              <h2
                id="gameover-modal-title"
                className="font-display text-2xl font-extrabold text-[#241342] mb-1"
              >
                {session.outcome === 'victory'
                  ? '¡Arcada 100% Protegida! Reclama tu Merch'
                  : '¡Tiempo Finalizado!'}
              </h2>
              <p className="text-xs sm:text-sm text-[#5E3A8E] mb-4">
                {session.outcome === 'victory'
                  ? 'Has sellado los 3 sectores dentales con la película protectora de Colgate Duraphat® 22,600 ppm F.'
                  : 'Aplicaste barniz fluorado antes del límite de tiempo. ¡Inténtalo de nuevo para proteger los 3 sectores!'}
              </p>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-[#F8F5FF] p-2.5 rounded-2xl border border-[#E9D5FF]">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-[#6E5694]">
                    Armaduras
                  </span>
                  <span className="font-mono-tabular text-base sm:text-lg font-extrabold text-[#3B1668]">
                    {session.shieldedCount}/{session.totalTargets}
                  </span>
                </div>
                <div className="bg-[#F8F5FF] p-2.5 rounded-2xl border border-[#E9D5FF]">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-[#6E5694]">
                    Tiempo
                  </span>
                  <span className="font-mono-tabular text-base sm:text-lg font-extrabold text-[#6D28D9]">
                    {Math.round(session.totalDurationSec - session.timeRemainingSec)}s
                  </span>
                </div>
                <div className="bg-[#F8F5FF] p-2.5 rounded-2xl border border-[#E9D5FF]">
                  <span className="block text-[9px] uppercase tracking-wider font-bold text-[#6E5694]">
                    Puntaje
                  </span>
                  <span className="font-mono-tabular text-base sm:text-lg font-extrabold text-[#E31837]">
                    {session.score}
                  </span>
                </div>
              </div>

              <button
                type="button"
                data-start="true"
                onClick={handleStartGame}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#DC1625] hover:bg-[#B8111E] text-white font-display font-bold text-base shadow-[0_10px_24px_rgba(220,22,37,0.32)] transition-transform active:scale-98 cursor-pointer whitespace-nowrap"
              >
                Jugar Nuevo Turno (45s)
              </button>
            </div>
          )}
        </div>

        {/* BOTTOM ROW: Minimal Floating Action / Sector Pill (Center) + 3D Duraphat Product Pack (Right) */}
        <div className="flex items-end justify-between w-full gap-3">
          {/* Bottom-Left: Discreet GLB Swap & Audio Utility Icons */}
          <div className="pointer-events-auto flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf"
              onChange={handleGlbFileUpload}
              className="hidden"
              aria-label="Cargar archivo .glb"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Cambiar modelo .GLB"
              className="px-2.5 py-1.5 rounded-xl bg-white/80 backdrop-blur-md text-[11px] font-semibold text-[#5E3A8E] border border-[#E4D7F8] shadow-sm cursor-pointer whitespace-nowrap"
            >
              .GLB
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMuted((prev) => {
                  const next = !prev;
                  soundEngine.setMuted(next);
                  return next;
                });
              }}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
              className="p-1.5 rounded-xl bg-white/80 backdrop-blur-md text-[#5E3A8E] border border-[#E4D7F8] shadow-sm cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {!isMuted && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              </svg>
            </button>
          </div>

          {/* Bottom-Center: Sleek Unobtrusive Action Pill (Never blocks the 3D dental arch!) */}
          <div className="pointer-events-auto mx-auto">
            {session.status === 'title' ? (
              <button
                type="button"
                data-start="true"
                data-testid="start-mission-btn"
                onClick={handleStartGame}
                className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-full bg-white/90 hover:bg-white backdrop-blur-md text-[#241342] font-display font-bold text-xs sm:text-sm shadow-[0_10px_28px_rgba(109,40,217,0.16)] border border-[#D8CEF0] flex items-center gap-2 sm:gap-2.5 transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#DC1625] animate-pulse shrink-0" />
                <span className="sm:hidden">Iniciar Reto Duraphat</span>
                <span className="hidden sm:inline">Iniciar Reto Duraphat · Desliza el Pincel Rojo</span>
              </button>
            ) : session.status === 'playing' ? (
              <div className="bg-white/85 backdrop-blur-md px-3 sm:px-3.5 py-1.5 rounded-full shadow-[0_8px_24px_rgba(109,40,217,0.12)] border border-[#E2D4F8] flex items-center gap-1.5 sm:gap-2">
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
                    <span
                      key={sector}
                      data-testid={`sector-indicator-${sector.toLowerCase()}`}
                      className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        stats.isComplete
                          ? 'bg-[#EDE9FE] text-[#5B21B6]'
                          : isCurrent
                            ? 'bg-[#6D28D9] text-white'
                            : 'text-[#7E699E]'
                      }`}
                    >
                      {label} {stats.shielded}/{stats.total}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Bottom-Right: Official Duraphat 22,600 ppm F Carton Box & Tube in Front */}
          <div className="hidden sm:block shrink-0">
            <DuraphatProductPack />
          </div>
        </div>
      </div>
    </main>
  );
}
