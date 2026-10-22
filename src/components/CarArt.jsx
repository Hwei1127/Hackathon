import React, { useId } from "react";

/* Generic side-profile illustrations per body type (fallback when no photos / renders / 3D exist).
   The car faces right. Shapes are generic silhouettes, not any specific manufacturer's design. */

export const SHAPES = {
  sedan: {
    body: [[16, 112], [16, 90], [30, 80], [92, 74], [128, 48], [150, 42], [214, 42], [244, 50], [272, 74], [306, 80], [314, 92], [314, 112]],
    glass: [[102, 74], [132, 50], [150, 46], [212, 46], [238, 53], [261, 74]], pillars: [184], wheels: [84, 250], r: 23,
  },
  suv: {
    body: [[16, 112], [16, 76], [22, 52], [50, 38], [222, 33], [250, 41], [280, 66], [308, 73], [318, 88], [318, 112]],
    glass: [[30, 70], [33, 54], [56, 44], [220, 39], [244, 46], [268, 67]], pillars: [112, 186], wheels: [84, 254], r: 26, rails: [56, 210, 31],
  },
  hatch: {
    body: [[26, 112], [26, 76], [36, 52], [70, 40], [198, 38], [226, 44], [260, 70], [292, 78], [302, 92], [302, 112]],
    glass: [[40, 70], [46, 53], [76, 44], [196, 42], [220, 48], [248, 70]], pillars: [150], wheels: [80, 244], r: 23,
  },
  pickup: {
    body: [[10, 112], [10, 76], [132, 76], [134, 44], [146, 34], [214, 34], [236, 42], [264, 68], [304, 76], [316, 90], [316, 112]],
    glass: [[142, 70], [145, 47], [153, 40], [212, 39], [231, 46], [254, 70]], pillars: [196], wheels: [72, 256], r: 26, bed: true,
  },
  mpv: {
    body: [[16, 112], [16, 62], [24, 40], [50, 28], [238, 28], [264, 40], [292, 70], [310, 78], [316, 92], [316, 112]],
    glass: [[26, 62], [32, 43], [54, 33], [234, 33], [258, 43], [282, 66]], pillars: [100, 176], wheels: [80, 256], r: 24,
  },
  coupe: {
    body: [[18, 112], [18, 88], [40, 80], [100, 75], [150, 48], [200, 43], [236, 51], [270, 75], [308, 82], [316, 95], [316, 112]],
    glass: [[112, 75], [152, 51], [198, 47], [229, 55], [256, 75]], pillars: [], wheels: [86, 254], r: 23,
  },
};

/** polygon → path with rounded corners */
function rounded(points, r = 9) {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n], [x, y] = points[i], [nx, ny] = points[(i + 1) % n];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
    const k1 = Math.min(r, l1 / 2) / l1, k2 = Math.min(r, l2 / 2) / l2;
    const a = [x + (px - x) * k1, y + (py - y) * k1], b = [x + (nx - x) * k2, y + (ny - y) * k2];
    d += `${i ? "L" : "M"}${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${x} ${y} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d + "Z";
}

export const tint = (name = "") =>
  /red|merah|soul/i.test(name) ? "#c7343f" : /black|hitam|onyx|diamond black|attitude/i.test(name) ? "#3b4252" : /blue|biru/i.test(name) ? "#3366c4"
  : /green|hijau/i.test(name) ? "#2f7d5a" : /orange|yellow|gold/i.test(name) ? "#d98a2b" : /platinum|silver|grey|gray|titan/i.test(name) ? "#b8bec9"
  : /white|putih|pearl/i.test(name) ? "#e3e7ee" : "#9aa3b5";

export default function CarArt({ color, body = "sedan" }) {
  const id = useId().replace(/:/g, "");
  const S = SHAPES[body] || SHAPES.sedan;
  const c = tint(color);
  const xs = S.body.map((p) => p[0]), front = Math.max(...xs), rear = Math.min(...xs);
  const glassBottom = Math.max(...S.glass.map((p) => p[1]));
  return (
    <svg viewBox="0 0 330 142" aria-hidden="true">
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} /><stop offset=".55" stopColor={c} stopOpacity=".9" /><stop offset="1" stopColor="#151a26" /></linearGradient>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a9bde0" stopOpacity=".6" /><stop offset="1" stopColor="#0d1220" stopOpacity=".95" /></linearGradient>
        <radialGradient id={`w${id}`}><stop offset="0" stopColor="#d3d8e1" /><stop offset=".55" stopColor="#7d8596" /><stop offset="1" stopColor="#2a303d" /></radialGradient>
      </defs>
      <ellipse cx="165" cy="134" rx="152" ry="7" fill="#000" opacity=".55" />
      <path d={rounded(S.body, 10)} fill={`url(#b${id})`} />
      {S.rails && <path d={`M${S.rails[0]} ${S.rails[2] + 5}L${S.rails[1]} ${S.rails[2]}`} stroke="#11151f" strokeWidth="3" strokeLinecap="round" opacity=".8" />}
      <clipPath id={`c${id}`}><path d={rounded(S.glass, 6)} /></clipPath>
      <path d={rounded(S.glass, 6)} fill={`url(#g${id})`} />
      <g clipPath={`url(#c${id})`}>{S.pillars.map((x) => <rect key={x} x={x - 3} y="0" width="6" height="140" fill={c} />)}</g>
      {S.pillars.map((x) => <path key={`d${x}`} d={`M${x + 1} ${glassBottom}V108`} stroke="#0b0f18" strokeOpacity=".45" strokeWidth="1.4" />)}
      {S.bed && <path d="M14 82h116M130 77v31" stroke="#0b0f18" strokeOpacity=".5" strokeWidth="1.6" />}
      <path d={`M${rear + 12} ${glassBottom + 8}C120 ${glassBottom + 3} 220 ${glassBottom + 3} ${front - 10} ${glassBottom + 9}`} stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" fill="none" />
      {S.pillars.concat(S.pillars.length ? [] : [190]).map((x) => <rect key={`h${x}`} x={x - 22} y={glassBottom + 12} width="12" height="3" rx="1.5" fill="#0b0f18" opacity=".5" />)}
      <path d={`M${rear + 4} 100H${front - 4}V108Q${front - 4} 113 ${front - 9} 113H${rear + 9}Q${rear + 4} 113 ${rear + 4} 108Z`} fill="#11151f" opacity=".85" />
      <path d={`M${front - 14} 85l12 2.5v6h-13z`} fill="#e8f3ff" />
      <path d={`M${front - 13} 86.5l10 2`} stroke="#68a2ff" strokeWidth="2" />
      <rect x={rear + 1} y="86" width="7" height="8" rx="2" fill="#ff4d5a" />
      {S.wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy="110" r={S.r + 4} fill="#0b0f18" />
          <circle cx={x} cy="110" r={S.r - 2} fill="#1b202b" />
          <circle cx={x} cy="110" r={S.r * 0.55} fill={`url(#w${id})`} />
          <g stroke="#2a303d" strokeWidth="2.2">{[0, 72, 144, 216, 288].map((a) => <line key={a} x1={x} y1="110" x2={x + S.r * 0.52 * Math.cos((a * Math.PI) / 180)} y2={110 + S.r * 0.52 * Math.sin((a * Math.PI) / 180)} />)}</g>
          <circle cx={x} cy="110" r="3" fill="#11151f" />
        </g>
      ))}
    </svg>
  );
}
