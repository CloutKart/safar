import type { ReactNode } from "react";
import type { Vibe } from "@/lib/trip/vibe";

// Dependency-free hero scenes: layered SVG gradients + silhouettes, one per
// trip vibe, with light motion (drifting clouds, gliding birds, flickering
// diyas / lanterns / neon, mist). All geometry is deterministic (no Math.random
// at render) so server and client markup match; motion lives in globals.css
// (.vibe-*) and is disabled under prefers-reduced-motion.

// Deterministic pseudo-random in [0,1) from (seed, index, salt) — pure.
function rand(seed: number, index: number, salt: number): number {
  const x = Math.sin((seed + 1) * 99.1 + index * 37.3 + salt * 1.7) * 43758.5453;
  return x - Math.floor(x);
}

function Stars({ seed, count = 16 }: { seed: number; count?: number }) {
  const stars: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = Math.round(rand(seed, i, 1) * 480);
    const y = Math.round(rand(seed, i, 2) * 120);
    const r = Number((rand(seed, i, 3) * 0.9 + 0.4).toFixed(2));
    const opacity = Number((0.4 + rand(seed, i, 4) * 0.5).toFixed(2));
    stars.push(<circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={opacity} />);
  }
  return (
    <g className="vibe-stars" style={{ animationDelay: `${seed * 0.3}s` }}>
      {stars}
    </g>
  );
}

function Clouds({ y = 44, opacity = 0.5, tint = "#ffffff" }: { y?: number; opacity?: number; tint?: string }) {
  return (
    <g fill={tint} opacity={opacity}>
      <ellipse className="vibe-cloud cloud-a" cx="110" cy={y} rx="48" ry="13" />
      <ellipse className="vibe-cloud cloud-b" cx="320" cy={y - 16} rx="62" ry="15" />
      <ellipse className="vibe-cloud cloud-c" cx="240" cy={y + 20} rx="38" ry="11" />
    </g>
  );
}

function Birds({ tint = "rgba(20,24,22,.55)" }: { tint?: string }) {
  return (
    <g className="vibe-birds" stroke={tint} strokeWidth="1.6" fill="none" strokeLinecap="round">
      <path d="M40 40 q6 -5 12 0 q6 -5 12 0" />
      <path d="M80 52 q5 -4 10 0 q5 -4 10 0" />
      <path d="M120 34 q5 -4 10 0 q5 -4 10 0" />
    </g>
  );
}

function Mist({ tint = "#cfe0d8" }: { tint?: string }) {
  return (
    <g className="vibe-mist" fill={tint}>
      <rect className="mist-a" x="-80" y="150" width="640" height="16" opacity="0.1" />
      <rect className="mist-b" x="-80" y="188" width="640" height="12" opacity="0.08" />
      <rect className="mist-a" x="-80" y="212" width="640" height="14" opacity="0.07" />
    </g>
  );
}

// A swag of warm string lights / fairy lights, flickering on a stagger.
function Lights({ y, count, color = "#ffd27a", sag = 14 }: { y: number; count: number; color?: string; sag?: number }) {
  const dots: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const x = 16 + t * 448;
    const dip = Math.sin(t * Math.PI) * sag;
    dots.push(
      <circle
        key={i}
        cx={x}
        cy={y + dip}
        r="3"
        fill={color}
        className="vibe-glimmer"
        style={{ animationDelay: `${(i % 5) * 0.35}s` }}
      />,
    );
  }
  return (
    <g>
      <path
        d={`M16 ${y} Q240 ${y + sag * 1.4} 464 ${y}`}
        fill="none"
        stroke={color}
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      {dots}
    </g>
  );
}

// Floating diyas (oil lamps) with a flickering flame, used on river ghats.
function Diyas({ y }: { y: number }) {
  const xs = [120, 188, 252, 312, 372];
  return (
    <g>
      {xs.map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="7" ry="2.4" fill="#caa15a" />
          <path
            className="vibe-flame"
            style={{ animationDelay: `${(i % 3) * 0.3}s` }}
            d={`M${x} ${y - 11} q3 5 0 8 q-3 -3 0 -8 Z`}
            fill="#ffd98a"
          />
        </g>
      ))}
    </g>
  );
}

const COMMON = {
  viewBox: "0 0 480 240",
  preserveAspectRatio: "xMidYMid slice",
  className: "vibe-scene",
} as const;

const SCENES: Record<Vibe, ReactNode> = {
  mountains: (
    <svg {...COMMON} role="img" aria-label="Mountain scene">
      <defs>
        <linearGradient id="v-mtn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16204a" />
          <stop offset="0.55" stopColor="#3a2c5e" />
          <stop offset="1" stopColor="#6b4a6b" />
        </linearGradient>
        <radialGradient id="v-mtn-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fdf3d8" />
          <stop offset="1" stopColor="#fdf3d8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-mtn-sky)" />
      <Stars seed={3} />
      <circle cx="392" cy="58" r="46" fill="url(#v-mtn-moon)" className="vibe-sun" />
      <circle cx="392" cy="58" r="17" fill="#fdf3d8" />
      <Clouds y={70} opacity={0.18} />
      <Birds tint="rgba(255,255,255,.55)" />
      <path d="M0 200 L92 116 L168 182 L208 150 L300 210 L260 240 L0 240 Z" fill="#2b3566" />
      <path d="M150 210 L262 120 L322 176 L380 138 L480 214 L480 240 L150 240 Z" fill="#222a52" />
      <path d="M262 120 L292 158 L232 158 Z" fill="#e9ecff" opacity="0.85" />
      <path d="M380 138 L404 168 L356 168 Z" fill="#e9ecff" opacity="0.7" />
      <path d="M0 226 L120 168 L210 214 L330 162 L480 224 L480 240 L0 240 Z" fill="#151a38" />
    </svg>
  ),
  trek: (
    <svg {...COMMON} role="img" aria-label="Trek scene">
      <defs>
        <linearGradient id="v-trek-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#123038" />
          <stop offset="0.6" stopColor="#1f5040" />
          <stop offset="1" stopColor="#c79a52" />
        </linearGradient>
        <radialGradient id="v-trek-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe7ad" />
          <stop offset="1" stopColor="#ffe7ad" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-trek-sky)" />
      <circle cx="240" cy="150" r="70" fill="url(#v-trek-sun)" className="vibe-sun" />
      <circle cx="240" cy="150" r="26" fill="#ffe9b8" opacity="0.95" />
      <Birds tint="rgba(20,40,30,.5)" />
      <path d="M0 168 L120 96 L210 156 L300 104 L420 168 L480 140 L480 240 L0 240 Z" fill="#1c4438" />
      <path d="M0 240 Q150 196 240 214 Q330 232 480 200 L480 240 Z" fill="#14302a" />
      <g fill="#0e231f">
        <path d="M70 240 L92 168 L114 240 Z" />
        <path d="M110 240 L128 184 L146 240 Z" />
        <path d="M340 240 L360 176 L380 240 Z" />
        <path d="M378 240 L394 190 L410 240 Z" />
      </g>
      <path d="M236 214 Q210 226 252 234 Q300 240 244 240 L210 240 Q230 226 236 214 Z" fill="#caa86a" opacity="0.7" />
    </svg>
  ),
  beach: (
    <svg {...COMMON} role="img" aria-label="Beach scene">
      <defs>
        <linearGradient id="v-beach-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f3550" />
          <stop offset="0.5" stopColor="#7a4a5e" />
          <stop offset="1" stopColor="#e8a06b" />
        </linearGradient>
        <radialGradient id="v-beach-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd9a0" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="v-beach-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23586a" />
          <stop offset="1" stopColor="#10303a" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-beach-sky)" />
      <circle cx="186" cy="100" r="70" fill="url(#v-beach-sun)" className="vibe-sun" />
      <circle cx="186" cy="102" r="30" fill="#ffcf8f" />
      <Clouds y={46} opacity={0.26} tint="#ffe6cf" />
      <Birds tint="rgba(40,24,30,.5)" />
      <rect y="124" width="480" height="116" fill="url(#v-beach-sea)" />
      <g className="vibe-water" stroke="#9fd2da" strokeWidth="2" opacity="0.5" fill="none">
        <path d="M150 140 q20 -6 40 0 t40 0" />
        <path d="M120 152 q24 -7 48 0 t48 0" />
        <path d="M180 164 q22 -6 44 0 t44 0" />
      </g>
      <g fill="#10231f">
        <rect x="402" y="120" width="6" height="120" rx="3" transform="rotate(7 405 170)" />
        <path d="M405 120 q-34 -10 -52 4 q34 -2 52 6 q22 -16 54 -10 q-30 2 -54 0 q26 -14 56 -6 q-30 0 -56 6 Z" />
      </g>
    </svg>
  ),
  city: (
    <svg {...COMMON} role="img" aria-label="City skyline scene">
      <defs>
        <linearGradient id="v-city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1330" />
          <stop offset="0.6" stopColor="#1c2452" />
          <stop offset="1" stopColor="#36306a" />
        </linearGradient>
        <radialGradient id="v-city-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#eaf0ff" />
          <stop offset="1" stopColor="#eaf0ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-city-sky)" />
      <Stars seed={9} count={20} />
      <circle cx="96" cy="60" r="38" fill="url(#v-city-moon)" className="vibe-sun" />
      <circle cx="96" cy="60" r="15" fill="#eef2ff" />
      <Clouds y={92} opacity={0.12} />
      <g fill="#0e1733">
        <rect x="20" y="150" width="40" height="90" />
        <rect x="66" y="120" width="34" height="120" />
        <rect x="106" y="168" width="30" height="72" />
        <rect x="146" y="104" width="40" height="136" />
        <rect x="196" y="142" width="32" height="98" />
        <rect x="236" y="88" width="44" height="152" />
        <rect x="290" y="160" width="30" height="80" />
        <rect x="326" y="124" width="38" height="116" />
        <rect x="372" y="150" width="34" height="90" />
        <rect x="414" y="110" width="44" height="130" />
      </g>
      <g fill="#ffd27a">
        {[
          [74, 134], [84, 134], [74, 150], [84, 150], [74, 166], [84, 166],
          [154, 120], [168, 120], [154, 140], [168, 140], [154, 160],
          [246, 104], [260, 104], [246, 124], [260, 124], [246, 144], [260, 144], [246, 164],
          [336, 140], [350, 140], [336, 160], [350, 160],
          [424, 126], [440, 126], [424, 148], [440, 148], [424, 170],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width="6"
            height="9"
            rx="1"
            className={i % 3 === 0 ? "vibe-glimmer" : undefined}
            style={i % 3 === 0 ? { animationDelay: `${(i % 6) * 0.5}s` } : undefined}
            opacity={0.55 + (i % 4) * 0.12}
          />
        ))}
      </g>
    </svg>
  ),
  heritage: (
    <svg {...COMMON} role="img" aria-label="Heritage fort scene">
      <defs>
        <linearGradient id="v-her-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2030" />
          <stop offset="0.5" stopColor="#7a3b2e" />
          <stop offset="1" stopColor="#edae5a" />
        </linearGradient>
        <radialGradient id="v-her-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe1a6" />
          <stop offset="1" stopColor="#ffe1a6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-her-sky)" />
      <circle cx="300" cy="120" r="78" fill="url(#v-her-sun)" className="vibe-sun" />
      <circle cx="300" cy="124" r="30" fill="#ffd98f" />
      <Clouds y={56} opacity={0.2} tint="#ffe2bd" />
      <Birds tint="rgba(40,18,24,.45)" />
      <g fill="#2a1622">
        <path d="M0 240 L0 176 L18 176 L18 166 L30 166 L30 176 L48 176 L48 160 Q70 132 92 160 L92 176 L110 176 L110 166 L122 166 L122 176 L140 176 L140 240 Z" />
        <path d="M150 240 L150 150 Q176 110 202 150 L202 176 L220 176 L220 164 L232 164 L232 176 L252 176 L252 150 Q278 110 304 150 L304 240 Z" />
        <path d="M320 240 L320 172 L338 172 L338 162 L350 162 L350 172 L368 172 L368 156 Q392 128 416 156 L416 172 L434 172 L434 162 L446 162 L446 172 L466 172 L466 240 Z" />
      </g>
      <g fill="#e9b76a" opacity="0.5">
        <rect x="172" y="186" width="10" height="54" rx="5" />
        <rect x="270" y="186" width="10" height="54" rx="5" />
      </g>
    </svg>
  ),
  lake: (
    <svg {...COMMON} role="img" aria-label="Lakeside scene">
      <defs>
        <linearGradient id="v-lake-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#19273f" />
          <stop offset="0.55" stopColor="#34304f" />
          <stop offset="1" stopColor="#8a6a72" />
        </linearGradient>
        <radialGradient id="v-lake-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd7c2" />
          <stop offset="1" stopColor="#ffd7c2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="v-lake-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3a52" />
          <stop offset="1" stopColor="#141f33" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-lake-sky)" />
      <Stars seed={5} count={10} />
      <Birds tint="rgba(255,255,255,.4)" />
      <circle cx="248" cy="94" r="52" fill="url(#v-lake-sun)" className="vibe-sun" />
      <circle cx="248" cy="96" r="20" fill="#ffcdb6" />
      <path d="M0 122 L96 82 L176 118 L270 78 L360 122 L480 92 L480 122 Z" fill="#222a3e" />
      <rect y="122" width="480" height="118" fill="url(#v-lake-water)" />
      <g className="vibe-water" opacity="0.5">
        <rect x="238" y="124" width="20" height="48" fill="#ffcdb6" opacity="0.25" />
        <path d="M0 130 L96 164 L176 134 L270 168 L360 134 L480 162 L480 122 L0 122 Z" fill="#2c3850" opacity="0.6" />
      </g>
    </svg>
  ),
  forest: (
    <svg {...COMMON} role="img" aria-label="Forest scene">
      <defs>
        <linearGradient id="v-for-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2620" />
          <stop offset="1" stopColor="#1f4634" />
        </linearGradient>
        <radialGradient id="v-for-glow" cx="0.5" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#bfe6a8" stopOpacity="0.6" />
          <stop offset="1" stopColor="#bfe6a8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-for-sky)" />
      <rect width="480" height="240" fill="url(#v-for-glow)" className="vibe-sun" />
      <path d="M0 120 q60 -34 120 0 t120 0 t120 0 t120 0 L480 240 L0 240 Z" fill="#1c4030" />
      <path d="M0 158 q60 -30 120 0 t120 0 t120 0 t120 0 L480 240 L0 240 Z" fill="#163528" />
      <path d="M0 196 q60 -28 120 0 t120 0 t120 0 t120 0 L480 240 L0 240 Z" fill="#0f261d" />
      <g fill="#dffbe6">
        {[[70, 150], [150, 178], [250, 158], [330, 188], [410, 166], [190, 200]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.6" className="vibe-glimmer" style={{ animationDelay: `${(i % 4) * 0.5}s` }} />
        ))}
      </g>
      <Mist />
    </svg>
  ),
  desert: (
    <svg {...COMMON} role="img" aria-label="Desert dunes scene">
      <defs>
        <linearGradient id="v-des-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1c2e" />
          <stop offset="0.5" stopColor="#6e3b32" />
          <stop offset="1" stopColor="#d98a4a" />
        </linearGradient>
        <radialGradient id="v-des-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffdf9e" />
          <stop offset="1" stopColor="#ffdf9e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-des-sky)" />
      <circle cx="250" cy="92" r="68" fill="url(#v-des-sun)" className="vibe-sun" />
      <circle cx="250" cy="94" r="28" fill="#ffe0a0" />
      <Clouds y={40} opacity={0.16} tint="#ffd9ad" />
      <Birds tint="rgba(50,24,16,.5)" />
      <path d="M0 132 Q120 104 240 132 T480 126 L480 240 L0 240 Z" fill="#9a5e34" />
      <path d="M0 158 Q140 130 280 160 T480 152 L480 240 L0 240 Z" fill="#6e3f22" />
      <g fill="#2e1a10">
        <path d="M300 132 q4 -16 12 -16 q2 -7 7 -2 q5 -4 6 3 l2 15 Z" />
        <rect x="302" y="132" width="2.4" height="16" />
        <rect x="316" y="134" width="2.4" height="14" />
        <path d="M298 126 l10 -3 l4 6 Z" />
      </g>
      <path d="M0 182 Q160 160 320 184 T480 176 L480 240 L0 240 Z" fill="#3e2415" />
    </svg>
  ),
  backwaters: (
    <svg {...COMMON} role="img" aria-label="Kerala backwaters scene">
      <defs>
        <linearGradient id="v-bw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#132f33" />
          <stop offset="0.55" stopColor="#1f5a4a" />
          <stop offset="1" stopColor="#d8c178" />
        </linearGradient>
        <radialGradient id="v-bw-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe7a8" />
          <stop offset="1" stopColor="#ffe7a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="v-bw-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c6357" />
          <stop offset="1" stopColor="#123029" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-bw-sky)" />
      <circle cx="312" cy="96" r="50" fill="url(#v-bw-sun)" className="vibe-sun" />
      <circle cx="312" cy="98" r="18" fill="#ffe6a0" />
      <Birds tint="rgba(20,40,32,.5)" />
      <path d="M0 118 q120 -16 240 -2 t240 -6 L480 118 Z" fill="#143b30" />
      <g fill="#0f2c22">
        <rect x="40" y="64" width="5" height="58" rx="2" transform="rotate(-6 42 94)" />
        <path d="M42 64 q-26 -8 -40 4 q26 -2 40 4 q18 -14 44 -8 q-24 2 -44 0 Z" />
        <rect x="440" y="70" width="5" height="52" rx="2" transform="rotate(6 442 96)" />
        <path d="M442 70 q24 -8 40 4 q-24 -2 -40 4 q-18 -12 -42 -6 q22 2 42 -2 Z" />
      </g>
      <rect y="118" width="480" height="122" fill="url(#v-bw-water)" />
      <g fill="#1c4a3c">
        <path d="M150 124 q40 -22 110 0 l-8 14 q-46 -14 -94 0 Z" />
        <rect x="176" y="104" width="58" height="14" rx="7" fill="#2a5e4c" />
        <rect x="150" y="116" width="110" height="9" rx="3" fill="#143b30" />
      </g>
      <g className="vibe-water" stroke="#9ad8c2" strokeWidth="1.6" opacity="0.4" fill="none">
        <path d="M40 146 q30 -6 60 0 t60 0" />
        <path d="M260 158 q34 -6 68 0 t68 0" />
      </g>
    </svg>
  ),
  spiritual: (
    <svg {...COMMON} role="img" aria-label="Riverside ghats scene">
      <defs>
        <linearGradient id="v-sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1c3c" />
          <stop offset="0.5" stopColor="#6a3550" />
          <stop offset="1" stopColor="#e0a050" />
        </linearGradient>
        <radialGradient id="v-sp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-sp-sky)" />
      <circle cx="240" cy="86" r="54" fill="url(#v-sp-sun)" className="vibe-sun" />
      <circle cx="240" cy="90" r="20" fill="#ffe1a0" />
      <Birds tint="rgba(40,20,30,.5)" />
      <g fill="#241127">
        <path d="M64 126 l12 0 l0 -16 l7 -14 l7 14 l0 16 l12 0 l0 18 l-38 0 Z" />
        <path d="M360 130 l12 0 l0 -14 l7 -12 l7 12 l0 14 l12 0 l0 14 l-38 0 Z" />
        <rect x="79" y="96" width="14" height="5" rx="2" />
        <rect x="372" y="104" width="12" height="4" rx="2" />
      </g>
      <path d="M0 144 L480 140 L480 160 L0 164 Z" fill="#2c1630" />
      <g fill="#3a1f3e">
        <rect x="0" y="148" width="480" height="5" />
        <rect x="0" y="154" width="480" height="5" opacity="0.7" />
      </g>
      <rect y="160" width="480" height="80" fill="#15212e" />
      <Diyas y={148} />
      <g className="vibe-water" opacity="0.4" fill="#ffcf86">
        <rect x="120" y="162" width="6" height="18" />
        <rect x="252" y="162" width="6" height="18" />
        <rect x="372" y="162" width="6" height="18" />
      </g>
    </svg>
  ),
  haunted: (
    <svg {...COMMON} role="img" aria-label="Haunted ruins scene">
      <defs>
        <linearGradient id="v-ht-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a161a" />
          <stop offset="0.6" stopColor="#153032" />
          <stop offset="1" stopColor="#1d3a3a" />
        </linearGradient>
        <radialGradient id="v-ht-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#cfe9e2" />
          <stop offset="0.5" stopColor="#cfe9e2" stopOpacity="0.5" />
          <stop offset="1" stopColor="#cfe9e2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="#0c1a1e" />
      <rect width="480" height="240" fill="url(#v-ht-sky)" />
      <Stars seed={11} count={14} />
      <circle cx="330" cy="74" r="58" fill="url(#v-ht-moon)" className="vibe-sun" />
      <circle cx="330" cy="74" r="26" fill="#dff1ea" />
      <circle cx="322" cy="68" r="26" fill="#0c1a1e" opacity="0.35" />
      <g className="vibe-birds" stroke="#0a1416" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M150 60 q4 -4 8 0 q4 -4 8 0" />
        <path d="M180 50 q3 -3 6 0 q3 -3 6 0" />
        <path d="M120 70 q3 -3 6 0 q3 -3 6 0" />
      </g>
      <g fill="#0c1f20">
        <path d="M40 240 L40 150 L52 150 L52 138 L60 150 L74 150 L74 132 L84 150 L96 150 L96 144 L96 240 Z" />
        <path d="M120 240 L120 120 L134 120 L134 104 L146 120 L146 96 L160 120 L160 110 L174 120 L174 132 L186 120 L186 240 Z" />
        <path d="M210 240 L210 150 L300 150 L300 134 L312 150 L326 150 L326 124 L340 150 L356 150 L356 240 Z" />
        <path d="M380 240 L380 160 L392 160 L392 146 L404 160 L420 160 L420 150 L434 160 L434 240 Z" />
      </g>
      <Mist tint="#9fc3bb" />
    </svg>
  ),
  nightlife: (
    <svg {...COMMON} role="img" aria-label="Nightlife neon scene">
      <defs>
        <linearGradient id="v-nl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0e22" />
          <stop offset="0.55" stopColor="#1c1340" />
          <stop offset="1" stopColor="#2e1648" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-nl-sky)" />
      <Stars seed={7} count={12} />
      <g fill="#10112e">
        <rect x="0" y="150" width="80" height="90" />
        <rect x="86" y="120" width="70" height="120" />
        <rect x="162" y="160" width="64" height="80" />
        <rect x="232" y="100" width="78" height="140" />
        <rect x="316" y="148" width="66" height="92" />
        <rect x="388" y="124" width="92" height="116" />
      </g>
      <g className="vibe-neon">
        <rect x="100" y="140" width="44" height="9" rx="4" fill="#ff5db1" style={{ animationDelay: "0s" }} />
        <rect x="250" y="124" width="46" height="8" rx="4" fill="#36e0d4" style={{ animationDelay: ".7s" }} />
        <rect x="330" y="166" width="38" height="8" rx="4" fill="#ffcf5d" style={{ animationDelay: "1.3s" }} />
        <rect x="404" y="146" width="50" height="9" rx="4" fill="#7b5dff" style={{ animationDelay: ".4s" }} />
        <rect x="180" y="178" width="30" height="7" rx="3" fill="#ff5db1" style={{ animationDelay: "1s" }} />
      </g>
      <g fill="#ffd27a">
        {[[112, 158], [124, 158], [256, 142], [268, 142], [340, 182], [414, 162], [430, 162]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="5" height="8" rx="1" opacity="0.7" />
        ))}
      </g>
      <rect y="200" width="480" height="40" fill="#0b0f24" opacity="0.6" />
      <g className="vibe-water" opacity="0.5">
        <rect x="100" y="200" width="44" height="34" fill="#ff5db1" opacity="0.16" />
        <rect x="250" y="200" width="46" height="34" fill="#36e0d4" opacity="0.16" />
        <rect x="404" y="200" width="50" height="34" fill="#7b5dff" opacity="0.16" />
      </g>
    </svg>
  ),
  bazaar: (
    <svg {...COMMON} role="img" aria-label="Street food bazaar scene">
      <defs>
        <linearGradient id="v-bz-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#251428" />
          <stop offset="0.55" stopColor="#5a2f2e" />
          <stop offset="1" stopColor="#b9602f" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-bz-sky)" />
      <Stars seed={4} count={9} />
      <g fill="#1c0f1c" opacity="0.9">
        <rect x="0" y="150" width="120" height="90" />
        <rect x="150" y="140" width="120" height="100" />
        <rect x="300" y="150" width="120" height="90" />
      </g>
      <g className="vibe-mist" fill="#d9c4b0">
        <path className="mist-b" d="M120 200 q10 -30 0 -50 q14 18 8 40 q-2 12 -8 10 Z" opacity="0.12" />
        <path className="mist-a" d="M330 200 q12 -34 -2 -54 q16 20 10 44 q-2 12 -8 10 Z" opacity="0.1" />
      </g>
      <Lights y={70} count={16} color="#ffd27a" sag={16} />
      <Lights y={120} count={12} color="#ff9a6a" sag={12} />
      <g fill="#0f0712">
        <rect x="40" y="186" width="90" height="54" />
        <path d="M34 186 l52 -16 l52 16 Z" fill="#7a2f2a" />
        <rect x="210" y="180" width="84" height="60" />
        <path d="M204 180 l48 -16 l48 16 Z" fill="#86512a" />
        <rect x="356" y="188" width="86" height="52" />
        <path d="M350 188 l50 -15 l50 15 Z" fill="#7a2f2a" />
      </g>
      <g fill="#ffce7a">
        <rect x="60" y="196" width="50" height="6" rx="2" opacity="0.85" />
        <rect x="232" y="190" width="44" height="6" rx="2" opacity="0.85" />
        <rect x="378" y="198" width="46" height="6" rx="2" opacity="0.85" />
      </g>
    </svg>
  ),
  river: (
    <svg {...COMMON} role="img" aria-label="River rafting scene">
      <defs>
        <linearGradient id="v-rv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13303a" />
          <stop offset="0.55" stopColor="#21564c" />
          <stop offset="1" stopColor="#bcae6a" />
        </linearGradient>
        <linearGradient id="v-rv-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7e8a" />
          <stop offset="1" stopColor="#14424a" />
        </linearGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-rv-sky)" />
      <circle cx="300" cy="84" r="20" fill="#ffe9b0" className="vibe-sun" />
      <Birds tint="rgba(20,40,40,.45)" />
      <path d="M0 102 L120 72 L210 108 L300 78 L420 108 L480 92 L480 240 L0 240 Z" fill="#173b36" />
      <g fill="#0f2c28">
        <path d="M0 240 L0 114 Q70 114 110 162 Q140 204 150 240 Z" />
        <path d="M480 240 L480 114 Q410 114 370 162 Q340 204 330 240 Z" />
      </g>
      <rect y="116" width="480" height="124" fill="url(#v-rv-water)" />
      <g className="vibe-water" stroke="#dff3f2" strokeWidth="2.4" fill="none" opacity="0.7" strokeLinecap="round">
        <path d="M30 130 q14 -8 28 0 t28 0 t28 0" />
        <path d="M150 148 q14 -8 28 0 t28 0 t28 0" />
        <path d="M300 136 q14 -8 28 0 t28 0 t28 0" />
      </g>
      <g>
        <path d="M210 140 q30 14 60 0 l-6 14 q-24 8 -48 0 Z" fill="#d8633a" />
        <rect x="232" y="132" width="16" height="6" rx="3" fill="#1c2b2b" />
        <rect x="252" y="124" width="3" height="20" rx="1.5" fill="#caa15a" transform="rotate(20 253 134)" />
      </g>
    </svg>
  ),
  default: (
    <svg {...COMMON} role="img" aria-label="Trip planning scene">
      <defs>
        <linearGradient id="v-def-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#132033" />
          <stop offset="0.6" stopColor="#243a52" />
          <stop offset="1" stopColor="#3c6072" />
        </linearGradient>
        <radialGradient id="v-def-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#d6efe2" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d6efe2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="240" fill="url(#v-def-sky)" />
      <Stars seed={2} count={12} />
      <Clouds y={50} opacity={0.2} />
      <circle cx="240" cy="120" r="66" fill="url(#v-def-sun)" className="vibe-sun" />
      <circle cx="240" cy="122" r="22" fill="#d6efe2" opacity="0.85" />
      <path d="M0 152 L130 120 L240 150 L360 118 L480 150 L480 152 Z" fill="#1d3146" opacity="0.8" />
      <path d="M210 240 L232 158 L248 158 L270 240 Z" fill="#16263a" />
      <g className="vibe-water" stroke="#cfe6dd" strokeWidth="3" strokeDasharray="10 14" opacity="0.55">
        <line x1="240" y1="238" x2="240" y2="166" />
      </g>
    </svg>
  ),
};

export function VibeScene({ vibe }: { vibe: Vibe }) {
  return <div className="vibe-art">{SCENES[vibe]}</div>;
}

// When a trip blends several vibes, stack their scenes and crossfade between
// them (CSS, by layer count). One vibe renders static. Under reduced motion the
// CSS falls back to showing only the first (primary) layer.
export function VibeStage({ vibes }: { vibes: Vibe[] }) {
  const list = (vibes.length ? vibes : (["default"] as Vibe[])).slice(0, 3);
  return (
    <div className="vibe-stage" data-count={list.length}>
      {list.map((vibe, index) => (
        <div className="vibe-layer" key={`${vibe}-${index}`}>
          {SCENES[vibe]}
        </div>
      ))}
    </div>
  );
}
