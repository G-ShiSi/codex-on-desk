import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = join(__filename, "..", "..");
const svgDir = join(root, "src/electron/assets/svg");

mkdirSync(svgDir, { recursive: true });

const colors = {
  shell: "#5f78db",
  shellSoft: "#f6d7ff",
  shellMid: "#8ea9ff",
  screen: "#ffffff",
  screenAlt: "#d7e5ff",
  accent: "#79c6ff",
  accentSoft: "#dff1ff",
  code: "#6cd2ff",
  success: "#7af0d7",
  warn: "#ffd973",
  error: "#ff8fa8",
  shadow: "rgba(11, 15, 34, 0.28)",
  white: "#ffffff",
  dark: "#243057",
  outline: "rgba(255, 255, 255, 0.5)",
  cheek: "#ffb6ff",
  paw: "#b6cbff"
};

function wrap({ css = "", body = "", defs = "" }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
  <defs>
    <linearGradient id="shellGrad" x1="0.12" y1="0.08" x2="0.88" y2="0.92">
      <stop offset="0%" stop-color="${colors.shellSoft}"/>
      <stop offset="34%" stop-color="${colors.shellMid}"/>
      <stop offset="100%" stop-color="${colors.shell}"/>
    </linearGradient>
    <radialGradient id="screenGrad" cx="0.35" cy="0.28" r="0.95">
      <stop offset="0%" stop-color="${colors.screen}"/>
      <stop offset="100%" stop-color="${colors.screenAlt}"/>
    </radialGradient>
    <radialGradient id="faceGlow" cx="0.3" cy="0.25" r="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <linearGradient id="edgeShine" x1="0.05" y1="0.12" x2="0.95" y2="0.88">
      <stop offset="0%" stop-color="rgba(255,255,255,0.82)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.12)"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.7" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="shellGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feDropShadow dx="0" dy="0.3" stdDeviation="0.55" flood-color="rgba(255,255,255,0.5)"/>
      <feDropShadow dx="0" dy="1.1" stdDeviation="1.2" flood-color="rgba(103,151,255,0.28)"/>
    </filter>
    <filter id="shadowBlur" x="-80%" y="-200%" width="260%" height="400%">
      <feGaussianBlur stdDeviation="1.2"/>
    </filter>
    <filter id="eyeGlow" x="-200%" y="-200%" width="500%" height="500%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.8" flood-color="rgba(255,255,255,0.95)"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="rgba(162,210,255,0.55)"/>
    </filter>
    ${defs}
  </defs>
  <style>
    .shadow { fill: ${colors.shadow}; transform-origin: center; }
    .bob { animation: bob 3.2s ease-in-out infinite; transform-origin: center 12px; }
    .blink { animation: blink 4.8s infinite; transform-origin: center; }
    .floaty { animation: floaty 2s ease-in-out infinite alternate; }
    .tilt { animation: tilt 2.1s ease-in-out infinite alternate; transform-origin: center 12px; }
    .pulse { animation: pulse 1.9s ease-in-out infinite; }
    .sparkle { animation: sparkle 1.3s ease-in-out infinite alternate; transform-origin: center; }
    .swing-left { animation: swingLeft 0.55s ease-in-out infinite alternate; transform-origin: 2px 9px; }
    .swing-right { animation: swingRight 0.55s ease-in-out infinite alternate; transform-origin: 13px 9px; }
    .orbit-a { animation: orbitA 1.4s linear infinite; transform-origin: 7.5px 7.6px; }
    .orbit-b { animation: orbitB 1.4s linear infinite; transform-origin: 7.5px 7.6px; }
    .alert { animation: alert 0.6s ease-in-out infinite alternate; transform-origin: center 8px; }
    .wobble { animation: wobble 0.3s ease-in-out infinite alternate; transform-origin: center 10px; }
    .zzz { animation: zzz 2.2s ease-out infinite; }
    .cursor { animation: cursor 0.9s steps(1) infinite; }
    @keyframes bob { 0%,100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-1.2px) scale(1.012); } }
    @keyframes blink { 0%, 44%, 48%, 100% { transform: scaleY(1); } 46% { transform: scaleY(0.15); } }
    @keyframes floaty { from { transform: translateY(-0.4px) scale(0.996); } to { transform: translateY(1px) scale(1.01); } }
    @keyframes tilt { from { transform: rotate(-1.6deg) translateY(-0.2px); } to { transform: rotate(1.6deg) translateY(0.4px); } }
    @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
    @keyframes sparkle { from { opacity: 0.4; transform: scale(0.8); } to { opacity: 1; transform: scale(1.1); } }
    @keyframes swingLeft { from { transform: rotate(-18deg); } to { transform: rotate(8deg); } }
    @keyframes swingRight { from { transform: rotate(18deg); } to { transform: rotate(-8deg); } }
    @keyframes orbitA { from { transform: rotate(0deg) translateX(5px) rotate(0deg); } to { transform: rotate(360deg) translateX(5px) rotate(-360deg); } }
    @keyframes orbitB { from { transform: rotate(180deg) translateX(5px) rotate(-180deg); } to { transform: rotate(540deg) translateX(5px) rotate(-540deg); } }
    @keyframes alert { from { transform: translateY(-0.6px) scale(1); } to { transform: translateY(0.6px) scale(1.02); } }
    @keyframes wobble { from { transform: rotate(-2deg) translateX(-0.6px); } to { transform: rotate(2deg) translateX(0.6px); } }
    @keyframes zzz { 0% { opacity: 0; transform: translate(0,0) scale(0.8); } 25% { opacity: 1; } 100% { opacity: 0; transform: translate(3px,-6px) scale(1.15); } }
    @keyframes cursor { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
    ${css}
  </style>
  ${body}
</svg>`;
}

function botBase({
  eyesMarkup,
  mouthMarkup,
  overlay = "",
  extraClasses = "bob",
  accent = colors.accent,
  shellStroke = colors.outline
}) {
  return `
  <ellipse id="shadow-js" class="shadow" cx="7.5" cy="18.4" rx="9.8" ry="1.7" filter="url(#shadowBlur)"/>
  <g id="body-track-js">
  <g id="body-js" class="${extraClasses}">
    <g filter="url(#shellGlow)">
      <path d="M0.2 12.8C0.2 10.2 1.7 8 4 7.3 4.45 4 6.85 1.8 9.75 1.8c2.7 0 5.1 1.55 6.15 4 2.55 0.3 4.45 2.3 4.45 4.9 0 3-2.4 5.4-5.4 5.4H5.6c-3.1 0-5.4-1.9-5.4-4.8Z" fill="url(#shellGrad)" stroke="${shellStroke}" stroke-width="0.95" stroke-linejoin="round"/>
      <path d="M1.8 12.35C1.8 10.45 3 8.85 4.75 8.25 5.15 5.8 7.15 4.1 9.55 4.1c2.15 0 4 1.2 4.9 3.15 1.9 0.25 3.35 1.7 3.35 3.55 0 2.1-1.75 3.8-4.05 3.8H5.8c-2.3 0-4-1.1-4-2.25Z" fill="url(#faceGlow)" opacity="0.56"/>
      <ellipse cx="4.8" cy="6.35" rx="2.8" ry="1.85" fill="rgba(255,255,255,0.18)"/>
    </g>
    <ellipse cx="3.5" cy="11.7" rx="1.9" ry="2.9" fill="${colors.cheek}" opacity="0.16"/>
    <ellipse cx="11.8" cy="11.1" rx="5.1" ry="4.5" fill="${colors.paw}" opacity="0.12"/>
    <ellipse cx="4.2" cy="10.2" rx="1.5" ry="0.95" fill="${colors.cheek}" opacity="0.38"/>
    <ellipse cx="10.8" cy="10.2" rx="1.5" ry="0.95" fill="${colors.cheek}" opacity="0.22"/>
    <ellipse cx="7.5" cy="16.25" rx="6.6" ry="0.72" fill="${colors.accentSoft}" opacity="0.5"/>
    <rect x="5.25" y="13.18" width="4.55" height="1.55" rx="0.78" fill="rgba(18,28,64,0.28)"/>
    <rect x="6.08" y="13.72" width="1.42" height="0.3" rx="0.15" fill="${accent}" opacity="0.86"/>
    <rect class="cursor" x="7.9" y="13.55" width="0.34" height="0.68" rx="0.17" fill="${colors.white}" opacity="0.88"/>
    ${eyesMarkup}
    ${mouthMarkup}
    ${overlay}
  </g>
  </g>`;
}

function eyes({ dx = 0, dy = 0, className = "blink", pupils = "round" } = {}) {
  if (pupils === "line") {
    return `<g id="eyes-track-js" transform="translate(${dx} ${dy})">
      <g id="eyes-js" class="${className}">
        <path d="M4.3 8.75c0.55-0.38 1.15-0.38 1.7 0" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="0.72" stroke-linecap="round" filter="url(#eyeGlow)"/>
        <path d="M8.95 8.75c0.55-0.38 1.15-0.38 1.7 0" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="0.72" stroke-linecap="round" filter="url(#eyeGlow)"/>
      </g>
    </g>`;
  }

  return `<g id="eyes-track-js" transform="translate(${dx} ${dy})">
    <g id="eyes-js" class="${className}">
      <circle cx="5.15" cy="8.25" r="1.14" fill="${colors.white}" filter="url(#eyeGlow)"/>
      <circle cx="9.85" cy="8.25" r="1.14" fill="${colors.white}" filter="url(#eyeGlow)"/>
      <circle cx="4.82" cy="7.9" r="0.26" fill="${colors.white}" opacity="0.96"/>
      <circle cx="9.52" cy="7.9" r="0.26" fill="${colors.white}" opacity="0.96"/>
    </g>
  </g>`;
}

function mouth(type = "smile") {
  if (type === "flat") {
    return `<rect x="6.25" y="11.65" width="2.5" height="0.4" rx="0.2" fill="rgba(255,255,255,0.52)"/>`;
  }
  if (type === "o") {
    return `<circle cx="7.5" cy="11.9" r="0.8" fill="rgba(255,255,255,0.75)"/>`;
  }
  if (type === "grin") {
    return `<path d="M6.05 11.25c0.35 0.85 0.85 1.2 1.45 1.2 0.62 0 1.1-0.35 1.45-1.2" fill="none" stroke="rgba(255,255,255,0.82)" stroke-width="0.72" stroke-linecap="round"/><path d="M7.05 10.75h0.9" stroke="rgba(255,255,255,0.6)" stroke-width="0.5" stroke-linecap="round"/>`;
  }
  return `<path d="M6.25 11.4c0.28 0.52 0.7 0.9 1.25 1.24 0.55-0.34 0.97-0.72 1.25-1.24" fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="0.72" stroke-linecap="round"/><circle cx="7.5" cy="10.98" r="0.24" fill="rgba(255,255,255,0.72)"/>`;
}

function bubble({ text = "<>", x = 12.8, y = -2.5, color = colors.code }) {
  return `
    <g class="floaty" filter="url(#glow)">
      <rect x="${x}" y="${y}" width="8.4" height="4.9" rx="2.1" fill="${color}" opacity="0.9"/>
      <path d="M14.6 2.3l-1.2 1.8 2.2-0.8z" fill="${color}" opacity="0.9"/>
      <text x="${x + 4.2}" y="${y + 3.35}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="2.7" font-weight="700" fill="${colors.white}">${text}</text>
    </g>`;
}

function codeBadge({ text = "{}", x = 11.3, y = -1.5, bg = colors.code }) {
  return `
    <g class="pulse" filter="url(#glow)">
      <rect x="${x}" y="${y}" width="9.8" height="5.3" rx="2.4" fill="${bg}" opacity="0.95"/>
      <text x="${x + 4.9}" y="${y + 3.45}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="2.9" font-weight="800" fill="${colors.white}">${text}</text>
    </g>`;
}

function sparkles() {
  return `
    <g class="sparkle" fill="${colors.success}">
      <path d="M-3 4.5l0.9 1.9 1.9 0.9-1.9 0.9-0.9 1.9-0.9-1.9-1.9-0.9 1.9-0.9z"/>
      <path d="M17.5 3.7l0.7 1.4 1.4 0.7-1.4 0.7-0.7 1.4-0.7-1.4-1.4-0.7 1.4-0.7z"/>
    </g>`;
}

function orbitTokens() {
  return `
    <g filter="url(#glow)">
      <g class="orbit-a">
        <circle cx="7.5" cy="7.5" r="1.5" fill="${colors.code}"/>
        <text x="7.5" y="8.3" text-anchor="middle" font-family="ui-monospace, monospace" font-size="1.9" font-weight="800" fill="${colors.white}">&lt;</text>
      </g>
      <g class="orbit-b">
        <circle cx="7.5" cy="7.5" r="1.5" fill="${colors.accent}"/>
        <text x="7.5" y="8.25" text-anchor="middle" font-family="ui-monospace, monospace" font-size="1.9" font-weight="800" fill="${colors.white}">/</text>
      </g>
    </g>`;
}

function miniBase({ eyesMarkup, mouthMarkup, overlay = "", extraClasses = "bob" }) {
  return `
  <ellipse id="shadow-js" class="shadow" cx="6.8" cy="17.1" rx="8.6" ry="1.45" filter="url(#shadowBlur)"/>
  <g id="body-track-js">
  <g id="body-js" class="${extraClasses}">
    <g filter="url(#shellGlow)">
      <path d="M1 12.5C1 10.5 2.3 8.7 4.1 8c0.35-2.8 2.4-4.8 5-4.8 2.4 0 4.4 1.5 5.1 3.7 1.9 0.4 3.3 2 3.3 4.1 0 2.4-1.9 4.3-4.3 4.3H5.2C2.9 15.3 1 14 1 12.5Z" fill="url(#shellGrad)" stroke="${colors.outline}" stroke-width="0.9" stroke-linejoin="round"/>
      <path d="M2.6 12.1C2.6 10.5 3.6 9.1 5.1 8.6 5.5 6.5 7 5.1 9 5.1c1.9 0 3.5 1.1 4.1 2.8 1.5 0.2 2.6 1.3 2.6 2.8 0 1.7-1.4 3.1-3.1 3.1H5.9c-1.9 0-3.3-0.9-3.3-1.7Z" fill="url(#faceGlow)" opacity="0.48"/>
    </g>
    <ellipse cx="3.4" cy="10.25" rx="1.25" ry="0.78" fill="${colors.cheek}" opacity="0.34"/>
    <ellipse cx="9.7" cy="10.25" rx="1.25" ry="0.78" fill="${colors.cheek}" opacity="0.2"/>
    <rect x="4.85" y="12.1" width="3.85" height="1.45" rx="0.72" fill="rgba(18,28,64,0.36)"/>
    <rect x="5.52" y="12.62" width="1.28" height="0.3" rx="0.15" fill="${colors.accent}" opacity="0.9"/>
    <rect class="cursor" x="7.1" y="12.43" width="0.34" height="0.68" rx="0.17" fill="${colors.white}" opacity="0.92"/>
    ${eyesMarkup}
    ${mouthMarkup}
    ${overlay}
  </g>
  </g>`;
}

const files = {
  "clawd-disconnected.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("flat"),
      overlay: `
        <g filter="url(#glow)">
          <path d="M18 -1l3 3m0-3l-3 3" stroke="${colors.error}" stroke-width="1.2" stroke-linecap="round"/>
          <path d="M2 5l11 6" stroke="${colors.error}" stroke-width="1.3" stroke-linecap="round"/>
        </g>`,
      extraClasses: "pulse",
      accent: "#64748b",
      shellStroke: "#475569"
    })
  }),
  "clawd-idle-follow.svg": wrap({
    body: botBase({
      eyesMarkup: eyes(),
      mouthMarkup: mouth("smile"),
      overlay: `
        <rect x="6.4" y="12.3" width="2.2" height="0.45" rx="0.2" fill="${colors.white}" opacity="0.8"/>`,
      extraClasses: "bob"
    })
  }),
  "clawd-idle-look.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ dx: -0.9 }),
      mouthMarkup: mouth("flat"),
      overlay: bubble({ text: "?" }),
      extraClasses: "tilt"
    })
  }),
  "clawd-idle-living.svg": wrap({
    css: `.arm-wave { animation: swingRight 0.8s ease-in-out infinite alternate; transform-origin: 13px 9px; }`,
    body: botBase({
      eyesMarkup: eyes(),
      mouthMarkup: mouth("smile"),
      overlay: `
        <g class="arm-wave">
          <rect x="13.2" y="7.3" width="1.5" height="4.4" rx="0.75" fill="${colors.accent}"/>
        </g>`,
      extraClasses: "bob"
    })
  }),
  "clawd-idle-yawn.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ pupils: "line", className: "" }),
      mouthMarkup: mouth("o"),
      overlay: `<text class="zzz" x="15.3" y="1.5" font-family="ui-monospace, monospace" font-size="3.2" font-weight="800" fill="${colors.warn}">z</text>`,
      extraClasses: "floaty"
    })
  }),
  "clawd-idle-doze.svg": wrap({
    body: botBase({
      eyesMarkup: `<g id="eyes-doze"><rect x="4.6" y="7.35" width="2.3" height="0.5" rx="0.25" fill="${colors.dark}"/><rect x="8.1" y="7.35" width="2.3" height="0.5" rx="0.25" fill="${colors.dark}"/></g>`,
      mouthMarkup: mouth("flat"),
      overlay: `<text class="zzz" x="16" y="1.2" font-family="ui-monospace, monospace" font-size="3.3" font-weight="800" fill="${colors.code}">z</text>`,
      extraClasses: "floaty"
    })
  }),
  "clawd-collapse-sleep.svg": wrap({
    body: `
      <ellipse id="shadow-js" class="shadow" cx="7.5" cy="17.3" rx="9.4" ry="1.7" filter="url(#shadowBlur)"/>
      <g id="body-js" class="floaty">
        <path d="M0.3 12.9c0-1.9 1.4-3.6 3.2-4.1 0.7-2.2 2.8-3.8 5.2-3.8 2.1 0 3.9 1.1 4.9 2.8 2.5 0.1 4.5 1.8 4.5 4 0 2.3-2 4.2-4.4 4.2H4.5c-2.3 0-4.2-1.4-4.2-3.1Z" fill="url(#shellGrad)" stroke="${colors.outline}" stroke-width="0.9"/>
        <path d="M2.3 12.4c0-1.3 0.9-2.5 2.2-2.9 0.5-1.4 1.9-2.4 3.6-2.4 1.5 0 2.8 0.8 3.4 2 1.8 0.1 3.2 1.1 3.2 2.4 0 1.5-1.4 2.7-3.1 2.7H5.3c-1.7 0-3-0.8-3-1.8Z" fill="url(#faceGlow)" opacity="0.46"/>
        <g id="eyes-doze"><rect x="4.2" y="10.35" width="1.9" height="0.42" rx="0.21" fill="rgba(255,255,255,0.7)"/><rect x="7.25" y="10.35" width="1.9" height="0.42" rx="0.21" fill="rgba(255,255,255,0.7)"/></g>
        <text class="zzz" x="14.4" y="7.4" font-family="ui-monospace, monospace" font-size="3.3" font-weight="800" fill="${colors.code}">z</text>
      </g>`
  }),
  "clawd-sleeping.svg": wrap({
    body: `
      <ellipse id="shadow-js" class="shadow" cx="7.5" cy="17.3" rx="9.6" ry="1.8" filter="url(#shadowBlur)"/>
      <g id="body-js" class="floaty">
        <path d="M0.1 12.8c0-2 1.4-3.7 3.3-4.3 0.7-2.3 2.9-3.9 5.4-3.9 2.3 0 4.3 1.2 5.2 3.1 2.6 0.1 4.7 1.9 4.7 4.2 0 2.4-2 4.4-4.5 4.4H4.3c-2.4 0-4.2-1.5-4.2-3.5Z" fill="url(#shellGrad)" stroke="${colors.outline}" stroke-width="0.9"/>
        <path d="M2.1 12.2c0-1.4 1-2.6 2.3-3.1 0.5-1.5 2-2.5 3.8-2.5 1.6 0 3 0.8 3.7 2.1 1.8 0.1 3.4 1.2 3.4 2.6 0 1.6-1.5 2.9-3.3 2.9H5.2c-1.8 0-3.1-0.8-3.1-2Z" fill="url(#faceGlow)" opacity="0.46"/>
        <g id="eyes-doze"><rect x="4.35" y="10.45" width="2.05" height="0.42" rx="0.21" fill="rgba(255,255,255,0.74)"/><rect x="7.55" y="10.45" width="2.05" height="0.42" rx="0.21" fill="rgba(255,255,255,0.74)"/></g>
        <rect x="11.3" y="12.8" width="2.5" height="0.75" rx="0.38" fill="${colors.accent}" opacity="0.88"/>
        <text class="zzz" x="15.3" y="6.8" font-family="ui-monospace, monospace" font-size="3.4" font-weight="800" fill="${colors.code}">z</text>
      </g>`
  }),
  "clawd-wake.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "pulse" }),
      mouthMarkup: mouth("o"),
      overlay: `
        <path d="M7.5 0.5l1.2 2.5m3.8-0.9l-0.7 2.6m-8.1-2.4l0.9 2.3" stroke="${colors.warn}" stroke-width="1.1" stroke-linecap="round"/>
      `,
      extraClasses: "alert"
    })
  }),
  "clawd-working-thinking.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ dx: -0.3 }),
      mouthMarkup: mouth("flat"),
      overlay: bubble({ text: "<>" }),
      extraClasses: "tilt"
    })
  }),
  "clawd-working-ultrathink.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ dx: -0.2 }),
      mouthMarkup: mouth("flat"),
      overlay: `${codeBadge({ text: "{}" })}${sparkles()}`,
      extraClasses: "tilt"
    })
  }),
  "clawd-working-typing.svg": wrap({
    css: `.keys { animation: pulse 0.7s ease-in-out infinite; }`,
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("flat"),
      overlay: `
        <g class="keys">
          <rect x="3.5" y="18.2" width="8.3" height="2.2" rx="0.9" fill="${colors.dark}" opacity="0.95"/>
          <rect x="4.3" y="18.9" width="1.2" height="0.6" rx="0.3" fill="${colors.code}"/>
          <rect x="6" y="18.9" width="2.4" height="0.6" rx="0.3" fill="${colors.code}"/>
          <rect x="8.8" y="18.9" width="1.4" height="0.6" rx="0.3" fill="${colors.code}"/>
          <rect class="cursor" x="10.7" y="18.7" width="0.6" height="0.95" rx="0.2" fill="${colors.white}"/>
        </g>`,
      extraClasses: "bob"
    })
  }),
  "clawd-working-building.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("flat"),
      overlay: `
        <rect x="-3.2" y="9.4" width="3.1" height="3.1" rx="0.7" fill="${colors.code}" filter="url(#glow)"/>
        <rect x="15" y="5.8" width="3.1" height="3.1" rx="0.7" fill="${colors.accent}" filter="url(#glow)"/>
        <rect x="16.4" y="11.1" width="2.4" height="2.4" rx="0.6" fill="${colors.success}" filter="url(#glow)"/>
      `,
      extraClasses: "pulse"
    })
  }),
  "clawd-working-carrying.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("flat"),
      overlay: `
        <rect x="-2.4" y="10.4" width="5.1" height="4.3" rx="0.8" fill="${colors.accent}" stroke="${colors.white}" stroke-width="0.45"/>
        <path d="M-1.2 9.8h2l0.8 0.8h2.3" fill="none" stroke="${colors.white}" stroke-width="0.55" stroke-linecap="round"/>
      `,
      extraClasses: "bob"
    })
  }),
  "clawd-working-juggling.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("grin"),
      overlay: orbitTokens(),
      extraClasses: "pulse"
    })
  }),
  "clawd-working-conducting.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("grin"),
      overlay: `
        <g filter="url(#glow)">
          <circle class="orbit-a" cx="12.7" cy="4.7" r="1.3" fill="${colors.code}"/>
          <circle class="orbit-b" cx="2.3" cy="4.2" r="1.3" fill="${colors.accent}"/>
          <circle class="orbit-a" cx="15.6" cy="10.4" r="1.1" fill="${colors.success}"/>
        </g>
      `,
      extraClasses: "pulse"
    })
  }),
  "clawd-notification.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("o"),
      overlay: `
        <g class="alert" filter="url(#glow)">
          <circle cx="16.5" cy="2.8" r="3.1" fill="${colors.warn}"/>
          <rect x="15.9" y="1.1" width="1.2" height="3" rx="0.6" fill="${colors.white}"/>
          <circle cx="16.5" cy="4.9" r="0.7" fill="${colors.white}"/>
        </g>`,
      extraClasses: "alert"
    })
  }),
  "clawd-happy.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ pupils: "line", className: "blink" }),
      mouthMarkup: mouth("grin"),
      overlay: sparkles(),
      extraClasses: "pulse"
    })
  }),
  "clawd-error.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("flat"),
      overlay: `
        <g class="wobble" filter="url(#glow)">
          <path d="M16.7 2.2l3 5.2h-6z" fill="${colors.error}"/>
          <rect x="16.2" y="4" width="0.9" height="1.7" rx="0.45" fill="${colors.white}"/>
          <circle cx="16.65" cy="6.3" r="0.45" fill="${colors.white}"/>
        </g>`,
      extraClasses: "wobble",
      accent: colors.error
    })
  }),
  "clawd-react-left.svg": wrap({
    css: `.arm-up { animation: swingLeft 0.45s ease-in-out infinite alternate; transform-origin: 0.8px 8px; }`,
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("smile"),
      overlay: `<g class="arm-up"><rect x="0.1" y="5.6" width="1.5" height="5.3" rx="0.75" fill="${colors.accent}"/></g>`,
      extraClasses: "bob"
    })
  }),
  "clawd-react-right.svg": wrap({
    css: `.arm-up { animation: swingRight 0.45s ease-in-out infinite alternate; transform-origin: 14.5px 8px; }`,
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("smile"),
      overlay: `<g class="arm-up"><rect x="13.4" y="5.6" width="1.5" height="5.3" rx="0.75" fill="${colors.accent}"/></g>`,
      extraClasses: "bob"
    })
  }),
  "clawd-react-double.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("o"),
      overlay: `${sparkles()}<path d="M2 5.3l-1.6-2.1m12.7 0.1l1.6-2.1" stroke="${colors.code}" stroke-width="1.1" stroke-linecap="round"/>`,
      extraClasses: "wobble"
    })
  }),
  "clawd-react-drag.svg": wrap({
    body: botBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("o"),
      overlay: `
        <g class="swing-left"><rect x="0" y="4.8" width="1.5" height="5.8" rx="0.75" fill="${colors.accent}"/></g>
        <g class="swing-right"><rect x="13.5" y="4.8" width="1.5" height="5.8" rx="0.75" fill="${colors.accent}"/></g>`,
      extraClasses: "alert"
    })
  }),
  "clawd-mini-idle.svg": wrap({
    body: miniBase({
      eyesMarkup: eyes(),
      mouthMarkup: mouth("smile")
    })
  }),
  "clawd-mini-peek.svg": wrap({
    body: miniBase({
      eyesMarkup: eyes({ dx: 0.5 }),
      mouthMarkup: mouth("smile"),
      overlay: `<path d="M14.3 6.3l1.8-1.3" stroke="${colors.code}" stroke-width="0.9" stroke-linecap="round"/>`,
      extraClasses: "tilt"
    })
  }),
  "clawd-mini-alert.svg": wrap({
    body: miniBase({
      eyesMarkup: eyes({ className: "" }),
      mouthMarkup: mouth("o"),
      overlay: `<circle cx="14.4" cy="2.7" r="2.3" fill="${colors.warn}"/><rect x="13.95" y="1.3" width="0.9" height="2.1" rx="0.45" fill="${colors.white}"/><circle cx="14.4" cy="4.15" r="0.42" fill="${colors.white}"/>`,
      extraClasses: "alert"
    })
  }),
  "clawd-mini-happy.svg": wrap({
    body: miniBase({
      eyesMarkup: eyes({ pupils: "line", className: "blink" }),
      mouthMarkup: mouth("grin"),
      overlay: sparkles(),
      extraClasses: "pulse"
    })
  }),
  "clawd-mini-sleep.svg": wrap({
    body: miniBase({
      eyesMarkup: `<g id="eyes-doze"><rect x="4.5" y="7.3" width="2.1" height="0.45" rx="0.22" fill="${colors.dark}"/><rect x="7.9" y="7.3" width="2.1" height="0.45" rx="0.22" fill="${colors.dark}"/></g>`,
      mouthMarkup: mouth("flat"),
      overlay: `<text class="zzz" x="14.2" y="2.2" font-family="ui-monospace, monospace" font-size="2.9" font-weight="800" fill="${colors.code}">z</text>`,
      extraClasses: "floaty"
    })
  })
};

for (const [fileName, contents] of Object.entries(files)) {
  writeFileSync(join(svgDir, fileName), contents, "utf8");
}

console.log(`Generated ${Object.keys(files).length} Codex-style pet SVGs in ${svgDir}`);
