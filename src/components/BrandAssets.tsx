import React from 'react';

const empaqueUrl = new URL(
  '../assets/images/Empaque Colgate Duraphat en perspectiva.png',
  import.meta.url,
).href;
const fondoEtereoUrl = new URL(
  '../assets/images/Fondo-pastel-ete\u0301reo-en-lavanda-y-rosa.png',
  import.meta.url,
).href;
const logoCobrandingUrl = new URL(
  '../assets/images/LOGO_COBRANDING.png',
  import.meta.url,
).href;
const logoDuraphatUrl = new URL('../assets/images/LOGO.png', import.meta.url).href;
const texturaUrl = new URL('../assets/images/TEXTURA.png', import.meta.url).href;

/**
 * Official Colgate® + Duraphat® Top-Edge Co-Branding Tab (`LOGO_COBRANDING.png`).
 * Designed with a flush top edge to hang cleanly from the top border of the viewport (`top-0`),
 * or render as the hero lockup.
 */
export const ColgateDuraphatLockup: React.FC<{
  className?: string;
  compact?: boolean;
  hero?: boolean;
}> = ({ className = '', compact = false, hero = false }) => {
  if (hero) {
    return (
      <div className={`inline-flex flex-col items-center justify-center select-none ${className}`}>
        <img
          src={logoDuraphatUrl}
          alt="Duraphat®"
          className="h-14 sm:h-20 md:h-24 w-auto object-contain drop-shadow-[0_6px_18px_rgba(227,24,36,0.08)]"
          draggable={false}
        />
      </div>
    );
  }

  const tabSize = compact
    ? 'h-16 sm:h-22 md:h-26 w-auto'
    : 'h-20 sm:h-26 md:h-30 w-auto';

  return (
    <div className={`inline-flex items-start justify-start select-none ${className}`}>
      <img
        src={logoCobrandingUrl}
        alt="Colgate® Duraphat®"
        className={`${tabSize} object-contain object-top drop-shadow-[0_10px_24px_rgba(30,27,58,0.08)]`}
        draggable={false}
      />
    </div>
  );
};

/**
 * Ethereal Pastel Lavender & Pink Background (`Fondo-pastel-etereo-en-lavanda-y-rosa.png`)
 * layered with the official Guilloché wave texture (`TEXTURA.png`).
 * Recycled across both the Start Menu and Gameplay screens.
 */
export const GuillocheWaveBackdrop: React.FC<{ emphasizeCenterRing?: boolean }> = ({
  emphasizeCenterRing = false,
}) => {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#FBF9FF]"
      aria-hidden="true"
    >
      {/* 1. Official Uploaded Ethereal Pastel Background in Lavender & Pink */}
      <img
        src={fondoEtereoUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* 2. Official Uploaded Lavender Guilloché Wave Texture (`TEXTURA.png`) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={texturaUrl}
          alt=""
          className={`w-full h-full object-contain transition-transform duration-700 ${
            emphasizeCenterRing
              ? 'scale-105 sm:scale-110 opacity-95'
              : 'scale-125 sm:scale-135 opacity-85'
          }`}
          draggable={false}
        />
      </div>
    </div>
  );
};

/**
 * Official 3D Perspective Colgate Duraphat 22,600 ppm F Carton Box + 10mL Tube
 * (`Empaque Colgate Duraphat en perspectiva.png`).
 */
export const DuraphatProductPack: React.FC<{
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ className = '', size = 'md' }) => {
  const sizeClasses =
    size === 'lg'
      ? 'w-56 sm:w-72 md:w-80'
      : size === 'sm'
        ? 'w-40 sm:w-52 md:w-60'
        : 'w-48 sm:w-60 md:w-72';

  return (
    <div className={`select-none pointer-events-none ${className}`}>
      <img
        src={empaqueUrl}
        alt="Empaque Colgate Duraphat 22600 ppm F"
        className={`${sizeClasses} h-auto object-contain drop-shadow-[0_14px_24px_rgba(76,29,149,0.16)]`}
        draggable={false}
      />
    </div>
  );
};
