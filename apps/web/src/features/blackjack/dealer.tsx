'use client';

import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useEffect, useState } from 'react';
import type { DealerGesture, DealerMood, DealerReaction } from './timeline';

const SKIN = '#e9b58f';
const SKIN_SHADE = '#d39b74';
const HAIR = '#3b2a20';
const SHIRT = '#f4f1ea';
const VEST = '#6b1a2a';
const VEST_DARK = '#4e1220';

const MOUTHS: Record<DealerMood, { d: string; fill: string }> = {
  neutral: { d: 'M109 121 Q120 125 131 121', fill: 'none' },
  focused: { d: 'M111 122 L129 122', fill: 'none' },
  happy: { d: 'M105 117 Q120 136 135 117 Q120 123 105 117 Z', fill: '#7a2e2e' },
  surprised: { d: 'M115 121 a5 6.5 0 1 0 10 0 a5 6.5 0 1 0 -10 0 Z', fill: '#5a1f1f' },
  sorry: { d: 'M109 125 Q120 117 131 125', fill: 'none' },
};

/** Eyebrow angles (degrees) per mood: [left, right]. */
const BROWS: Record<DealerMood, [number, number]> = {
  neutral: [0, 0],
  focused: [6, -6],
  happy: [-4, 4],
  surprised: [-10, 10],
  sorry: [-12, 12],
};

const part = (origin: string) => ({ transformBox: 'fill-box' as const, transformOrigin: origin });

/**
 * Marco, the dealer. Pure presentation: he reacts to events the server already decided.
 * `gestureKey` changes on every step so the same gesture (e.g. two deals in a row) replays.
 */
export function Dealer({
  reaction,
  gestureKey,
  speed,
}: {
  reaction: DealerReaction;
  gestureKey: number;
  speed: number;
}) {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const mood = reaction.mood;

  // Blinking at random intervals (purely cosmetic: Math.random is fine here).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const blink = () => {
      if (scope.current) {
        void animate('[data-part="eyes"]', { scaleY: [1, 0.1, 1] }, { duration: 0.16 });
      }
      timer = setTimeout(blink, 2200 + Math.random() * 3800);
    };
    timer = setTimeout(blink, 1500);
    return () => clearTimeout(timer);
  }, [animate, scope]);

  // Gestures, synchronised with the event being shown.
  useEffect(() => {
    if (!scope.current || speed === 0) return;
    const d = (s: number) => ({ duration: s * speed, ease: 'easeInOut' as const });
    const gestures: Record<DealerGesture, () => void> = {
      idle: () => undefined,
      deal: () => {
        void animate('[data-part="arm-right"]', { rotate: [0, -24, 0] }, d(0.4));
        void animate('[data-part="head"]', { rotate: [0, 4, 0] }, d(0.4));
      },
      peek: () => {
        void animate('[data-part="head"]', { rotate: [0, -3, -3, 0], y: [0, 4, 4, 0] }, d(0.8));
        void animate('[data-part="eyes"]', { scaleY: [1, 0.55, 0.55, 1] }, d(0.8));
      },
      reveal: () => {
        void animate('[data-part="arm-right"]', { rotate: [0, -34, -34, 0] }, d(0.6));
      },
      pay: () => {
        void animate('[data-part="arm-left"]', { rotate: [0, 18, 0] }, d(0.6));
        void animate('[data-part="arm-right"]', { rotate: [0, -18, 0] }, d(0.6));
      },
      collect: () => {
        void animate('[data-part="arm-left"]', { rotate: [0, -14, 0] }, d(0.6));
        void animate('[data-part="arm-right"]', { rotate: [0, 14, 0] }, d(0.6));
        void animate('[data-part="head"]', { rotate: [0, -5, 5, 0] }, d(0.7));
      },
    };
    gestures[reaction.gesture]();
  }, [gestureKey, reaction.gesture, animate, scope, speed]);

  const mouth = MOUTHS[mood];
  const [browL, browR] = BROWS[mood];

  return (
    <div
      className="relative mx-auto w-36 shrink-0 sm:w-44 lg:w-[clamp(6rem,17dvh,12rem)]"
      data-testid="dealer"
      data-mood={mood}
    >
      <SpeechBubble line={reaction.line} gestureKey={gestureKey} />
      <svg
        ref={scope}
        viewBox="0 0 240 230"
        className="w-full"
        role="img"
        aria-label="Marco, el crupier"
      >
        {/* torso (breathing) */}
        <motion.g
          style={part('50% 100%')}
          animate={{ scaleY: [1, 1.012, 1] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.g data-part="arm-left" style={part('80% 8%')}>
            <path
              d="M58 165 C40 170 26 196 28 230 L50 230 C50 205 56 188 64 178 Z"
              fill={SHIRT}
              stroke="#d8d2c4"
            />
            <rect
              x="30"
              y="196"
              width="22"
              height="6"
              rx="2"
              fill={VEST_DARK}
              transform="rotate(8 41 199)"
            />
          </motion.g>
          <motion.g data-part="arm-right" style={part('20% 8%')}>
            <path
              d="M182 165 C200 170 214 196 212 230 L190 230 C190 205 184 188 176 178 Z"
              fill={SHIRT}
              stroke="#d8d2c4"
            />
            <rect
              x="188"
              y="196"
              width="22"
              height="6"
              rx="2"
              fill={VEST_DARK}
              transform="rotate(-8 199 199)"
            />
          </motion.g>
          <path d="M34 230 C38 176 72 150 120 148 C168 150 202 176 206 230 Z" fill={SHIRT} />
          <path d="M72 230 L82 162 C96 157 108 161 114 172 L113 230 Z" fill={VEST} />
          <path d="M168 230 L158 162 C144 157 132 161 126 172 L127 230 Z" fill={VEST} />
          <circle cx="120" cy="190" r="2.2" fill="#b9b2a3" />
          <circle cx="120" cy="208" r="2.2" fill="#b9b2a3" />
          <circle cx="130" cy="196" r="2.6" fill="#d4af37" />
          <circle cx="130" cy="214" r="2.6" fill="#d4af37" />
          {/* name tag */}
          <rect x="84" y="186" width="26" height="9" rx="2" fill="#d4af37" />
          <text
            x="97"
            y="193"
            textAnchor="middle"
            fontSize="6.5"
            fontWeight="700"
            fill="#3b2412"
            fontFamily="var(--font-inter), sans-serif"
          >
            MARCO
          </text>
          {/* collar and bow tie */}
          <path d="M104 150 L120 169 L111 146 Z" fill={SHIRT} stroke="#cfc8b8" />
          <path d="M136 150 L120 169 L129 146 Z" fill={SHIRT} stroke="#cfc8b8" />
          <path d="M103 159 L118 165 L103 172 Z" fill="#111" />
          <path d="M137 159 L122 165 L137 172 Z" fill="#111" />
          <rect x="116" y="161" width="8" height="8" rx="2" fill="#222" />
        </motion.g>

        {/* neck */}
        <rect x="108" y="124" width="24" height="30" rx="6" fill={SKIN_SHADE} />

        {/* head */}
        <motion.g
          data-part="head"
          style={part('50% 100%')}
          animate={{ rotate: [-1.2, 1.2, -1.2] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ellipse cx="80" cy="98" rx="8" ry="12" fill={SKIN_SHADE} />
          <ellipse cx="160" cy="98" rx="8" ry="12" fill={SKIN_SHADE} />
          <ellipse cx="120" cy="92" rx="40" ry="46" fill={SKIN} />
          <path
            d="M78 90 C72 52 98 36 124 38 C152 40 170 58 162 94 C158 74 150 63 132 60 C116 58 100 64 90 72 C86 78 82 84 78 90 Z"
            fill={HAIR}
          />
          <path
            d="M96 64 C110 52 132 50 148 58"
            stroke="#5a4334"
            strokeWidth="2"
            fill="none"
            opacity="0.6"
          />

          {/* cheeks */}
          <motion.g
            animate={{ opacity: mood === 'happy' ? 0.45 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ellipse cx="99" cy="108" rx="7" ry="4" fill="#e07a6a" />
            <ellipse cx="141" cy="108" rx="7" ry="4" fill="#e07a6a" />
          </motion.g>

          {/* eyebrows */}
          <motion.path
            d="M97 79 L112 77"
            stroke={HAIR}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={part('50% 50%')}
            animate={{ rotate: browL }}
          />
          <motion.path
            d="M128 77 L143 79"
            stroke={HAIR}
            strokeWidth="3.5"
            strokeLinecap="round"
            style={part('50% 50%')}
            animate={{ rotate: browR }}
          />

          {/* eyes */}
          <g data-part="eyes" style={part('50% 50%')}>
            <ellipse cx="105" cy="91" rx="4.5" ry="5.5" fill="#1f1a17" />
            <ellipse cx="135" cy="91" rx="4.5" ry="5.5" fill="#1f1a17" />
            <circle cx="106.5" cy="89" r="1.4" fill="#fff" />
            <circle cx="136.5" cy="89" r="1.4" fill="#fff" />
          </g>

          {/* nose and moustache */}
          <path
            d="M120 93 C118 102 116 106 122 108"
            stroke={SKIN_SHADE}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M107 113 C113 108 118 109 120 111 C122 109 127 108 133 113 C127 115 123 114 120 114 C117 114 113 115 107 113 Z"
            fill={HAIR}
          />

          {/* mouth */}
          <motion.path
            key={mood}
            d={mouth.d}
            fill={mouth.fill}
            stroke="#6b2a2a"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          />
        </motion.g>
      </svg>
    </div>
  );
}

function SpeechBubble({ line, gestureKey }: { line: string | null; gestureKey: number }) {
  const [visible, setVisible] = useState<string | null>(line);

  useEffect(() => {
    setVisible(line);
    if (!line) return;
    const t = setTimeout(() => setVisible(null), 2600);
    return () => clearTimeout(t);
  }, [line, gestureKey]);

  return (
    <div
      className="pointer-events-none absolute right-[72%] top-0 z-10 w-36 sm:-top-2 sm:left-full sm:right-auto sm:ml-1 sm:w-48"
      aria-hidden
    >
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={`${gestureKey}-${visible}`}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="relative rounded-2xl rounded-br-sm bg-cream px-3 py-2 text-xs sm:rounded-bl-sm sm:rounded-br-2xl sm:text-sm font-medium text-slate-900 shadow-lg"
          >
            {visible}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
