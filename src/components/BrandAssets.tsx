import React from 'react';

/**
 * Stacked Colgate + Duraphat® logo matching the top-left of the reference key visual:
 * Slanted red Colgate® trapezoid badge on top, bold serif Duraphat® directly underneath.
 */
export const ColgateDuraphatLockup: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false,
}) => {
  return (
    <div className={`inline-flex flex-col items-start select-none ${className}`}>
      {/* Red slanted Colgate trapezoid badge */}
      <svg
        viewBox="0 0 210 62"
        className={compact ? 'h-9 sm:h-12 w-auto' : 'h-12 sm:h-14 w-auto'}
        aria-label="Colgate Duraphat"
      >
        <polygon points="4,4 206,4 188,58 4,58" fill="#DC1625" />
        <text
          x="96"
          y="42"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="800"
          fontStyle="italic"
          fontSize="35"
          letterSpacing="-0.6"
        >
          Colgate
        </text>
        <text
          x="164"
          y="24"
          fill="#FFFFFF"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="700"
          fontSize="11"
        >
          ®
        </text>
      </svg>

      {/* Bold red serif Duraphat® wordmark directly below */}
      <div className="flex items-start -mt-0.5 pl-0.5">
        <span
          className={`${
            compact ? 'text-2xl sm:text-[34px]' : 'text-3xl sm:text-[38px]'
          } font-bold tracking-tight text-[#C81422] leading-none`}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          Duraphat
        </span>
        <span className="text-xs sm:text-sm font-bold text-[#C81422] leading-none ml-0.5 mt-0.5">
          ®
        </span>
      </div>
    </div>
  );
};

/**
 * Ethereal pastel lavender/white backdrop with delicate flowing sinusoidal Guilloché wave lines
 * sweeping across the left and right sides just like the reference key visual.
 */
export const GuillocheWaveBackdrop: React.FC = () => {
  const waveLines = Array.from({ length: 15 }, (_, i) => i);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
      style={{
        background:
          'radial-gradient(circle at 50% 46%, #FFFFFF 0%, #FBF9FF 36%, #F2ECFA 72%, #E8DDF6 100%)',
      }}
    >
      <svg
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        {/* Left-to-Bottom Flowing Guilloché Ribbon */}
        <g stroke="#B39DDB" strokeWidth="1.15">
          {waveLines.map((i) => {
            const dy = i * 9.5;
            const dx = i * 5.0;
            return (
              <path
                key={`left-${i}`}
                d={`M -80,${300 + dy} C ${140 + dx},${230 + dy * 0.5} ${280 - dx},${510 + dy * 0.8} ${120 + dx},${680 + dy * 0.6} C ${10 + dx},${800 + dy * 0.4} ${210 - dx},${880 + dy * 0.3} ${440 + dx},960`}
                strokeOpacity={0.22 + (i / waveLines.length) * 0.28}
              />
            );
          })}
        </g>

        {/* Right Flowing Guilloché Ribbon */}
        <g stroke="#B39DDB" strokeWidth="1.15">
          {waveLines.map((i) => {
            const dy = i * 9.0;
            const dx = i * 6.0;
            return (
              <path
                key={`right-${i}`}
                d={`M ${980 - dx},${520 + dy * 0.5} C ${1140},${470 - dy * 0.4} ${1270 + dx * 0.5},${280 + dy} ${1520},${240 + dy * 0.8}`}
                strokeOpacity={0.2 + (i / waveLines.length) * 0.28}
              />
            );
          })}
        </g>

        <g stroke="#C4B5FD" strokeWidth="1.0">
          {waveLines.slice(0, 10).map((i) => {
            const dy = i * 10.5;
            return (
              <path
                key={`right-low-${i}`}
                d={`M ${1060},${540 + dy * 0.4} C ${1210},${490 + dy * 0.7} ${1340},${590 - dy * 0.4} ${1520},${670 - dy * 0.6}`}
                strokeOpacity={0.22 + (i / 10) * 0.25}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};

/**
 * 3D Perspective Colgate Duraphat 22600 ppm F Carton Box + 10mL Tube in front (bottom-right corner)
 * matching the reference key visual composition.
 */
export const DuraphatProductPack: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`select-none pointer-events-none ${className}`}>
      <svg
        viewBox="0 0 380 155"
        className="w-44 sm:w-56 md:w-64 h-auto drop-shadow-[0_14px_22px_rgba(76,29,149,0.16)]"
        role="img"
        aria-label="Empaque Colgate Duraphat 22600 ppm F"
      >
        <defs>
          <linearGradient id="cartonFrontGrad" x1="0%" y1="0%" x2="100%" y2="20%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="64%" stopColor="#F8F5FF" />
            <stop offset="85%" stopColor="#D8CEF0" />
            <stop offset="100%" stopColor="#8E74C8" />
          </linearGradient>
          <linearGradient id="cartonPurpleStrip" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="45%" stopColor="#7C4DFF" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#4A148C" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="tubeBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="68%" stopColor="#F5F2FC" />
            <stop offset="88%" stopColor="#C9B8E8" />
            <stop offset="100%" stopColor="#7E57C2" />
          </linearGradient>
        </defs>

        {/* 1. Rear 3D Perspective Carton Box */}
        <g transform="translate(10, 18)">
          {/* Top flap */}
          <polygon
            points="0,18 24,6 286,0 264,12"
            fill="#EDE7F6"
            stroke="#D1C4E9"
            strokeWidth="1"
          />
          {/* Left end-flap */}
          <polygon
            points="0,18 24,12 24,94 0,84"
            fill="#E2D9F3"
            stroke="#C5B4E3"
            strokeWidth="1"
          />
          {/* Main front face of carton */}
          <polygon
            points="24,12 286,4 286,84 24,94"
            fill="url(#cartonFrontGrad)"
            stroke="#D1C4E9"
            strokeWidth="1"
          />
          {/* Bottom purple accent wave on carton */}
          <polygon
            points="110,82 286,66 286,84 24,94"
            fill="url(#cartonPurpleStrip)"
          />

          {/* Red Colgate trapezoid on carton */}
          <polygon points="34,20 132,17 122,42 34,45" fill="#DC1625" />
          <text
            x="80"
            y="36"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontStyle="italic"
            fontSize="16"
          >
            Colgate®
          </text>

          {/* Duraphat 22600 ppm F on carton */}
          <text
            x="34"
            y="64"
            fill="#C81422"
            fontFamily="Georgia, serif"
            fontWeight="700"
            fontSize="20"
          >
            Duraphat®
          </text>
          <text
            x="132"
            y="63"
            fill="#1A237E"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontSize="13.5"
          >
            22600 ppm F
          </text>

          {/* Shield emblem on right of carton */}
          <g transform="translate(244, 24)">
            <path
              d="M14,2 L26,6 V15 C26,23 20.5,29 14,31 C7.5,29 2,23 2,15 V6 L14,2 Z"
              fill="#B39DDB"
              fillOpacity="0.45"
              stroke="#5E35B1"
              strokeWidth="1.5"
            />
            <path
              d="M14,4 L24,7.5 V15 C24,21.5 19.5,26.5 14,28.5 Z"
              fill="#5E35B1"
              fillOpacity="0.55"
            />
          </g>
        </g>

        {/* 2. Foreground 10mL Tube with White Screw Cap on Left */}
        <g transform="translate(88, 76)">
          {/* White ribbed screw cap on left */}
          <polygon
            points="0,28 28,24 28,50 0,46"
            fill="#F1F5F9"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          <line x1="6" y1="27" x2="6" y2="46" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="12" y1="26" x2="12" y2="47" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="18" y1="25" x2="18" y2="48" stroke="#CBD5E1" strokeWidth="1.2" />
          {/* Tube neck shoulder */}
          <polygon
            points="28,24 44,16 44,58 28,50"
            fill="#E2E8F0"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          {/* Main tube body */}
          <polygon
            points="44,16 258,4 264,58 44,58"
            fill="url(#tubeBodyGrad)"
            stroke="#D1C4E9"
            strokeWidth="1"
          />
          {/* Right crimp seal */}
          <polygon
            points="258,4 268,4 274,58 264,58"
            fill="#E2D9F3"
            stroke="#C5B4E3"
            strokeWidth="1"
          />
          {/* Purple lower stripe on tube */}
          <polygon points="80,52 264,44 264,58 44,58" fill="url(#cartonPurpleStrip)" />

          {/* Red Colgate badge on tube */}
          <polygon points="54,20 124,17 117,33 54,36" fill="#DC1625" />
          <text
            x="87"
            y="30"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontStyle="italic"
            fontSize="11.5"
          >
            Colgate®
          </text>

          {/* Duraphat 22600 ppm F on tube */}
          <text
            x="54"
            y="49"
            fill="#C81422"
            fontFamily="Georgia, serif"
            fontWeight="700"
            fontSize="13.5"
          >
            Duraphat®
          </text>
          <text
            x="124"
            y="48"
            fill="#1A237E"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontSize="9.5"
          >
            22600 ppm F
          </text>

          {/* Small shield emblem on right of tube */}
          <g transform="translate(222, 16) scale(0.78)">
            <path
              d="M14,2 L26,6 V15 C26,23 20.5,29 14,31 C7.5,29 2,23 2,15 V6 L14,2 Z"
              fill="#B39DDB"
              fillOpacity="0.45"
              stroke="#5E35B1"
              strokeWidth="1.6"
            />
            <path
              d="M14,4 L24,7.5 V15 C24,21.5 19.5,26.5 14,28.5 Z"
              fill="#5E35B1"
              fillOpacity="0.6"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};
