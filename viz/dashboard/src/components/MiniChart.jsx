import { C, mono } from "../theme";

export const MiniChart = ({ data, yKey, width = 300, height = 120, color, label, annotations, areaFill, secondData, secondColor, secondKey }) => {
  if (!data || data.length < 2) return null;
  const pad = { t: 20, r: 8, b: 22, l: 42 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const allVals = [...data.map(d => d[yKey]), ...(secondData ? secondData.map(d => d[secondKey || yKey]) : [])];
  const yMin = Math.min(...allVals) * (Math.min(...allVals) < 0 ? 1.1 : 0.9);
  const yMax = Math.max(...allVals) * 1.1;
  const yRange = yMax - yMin || 1;

  const toX = (i) => pad.l + (i / (data.length - 1)) * w;
  const toY = (v) => pad.t + (1 - (v - yMin) / yRange) * h;

  const points = data.map((d, i) => `${toX(i)},${toY(d[yKey])}`).join(" ");
  const areaPoints = areaFill ? `${toX(0)},${toY(yMin)} ${points} ${toX(data.length - 1)},${toY(yMin)}` : "";

  const secondPoints = secondData ? secondData.map((d, i) => `${toX(i)},${toY(d[secondKey || yKey])}`).join(" ") : "";

  // Y-axis ticks
  const yTicks = [yMin, yMin + yRange * 0.5, yMax].map(v => ({ v, y: toY(v) }));
  // X-axis: show every 4th label
  const xTicks = data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 5)) === 0 || i === data.length - 1).map((d, idx, arr) => {
    const origIdx = data.indexOf(d);
    return { label: d.time || d.label || "", x: toX(origIdx) };
  });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {/* Grid lines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} y1={t.y} x2={width - pad.r} y2={t.y} stroke={C.border} strokeWidth="0.5" />
          <text x={pad.l - 4} y={t.y + 3} textAnchor="end" fill={C.td} fontSize="9" fontFamily={mono}>{typeof t.v === "number" ? (Math.abs(t.v) > 999 ? `${(t.v / 1000).toFixed(0)}k` : t.v.toFixed(t.v > 100 ? 0 : 1)) : t.v}</text>
        </g>
      ))}
      {/* Zero line if applicable */}
      {yMin < 0 && <line x1={pad.l} y1={toY(0)} x2={width - pad.r} y2={toY(0)} stroke={C.td} strokeWidth="0.5" strokeDasharray="3,3" />}
      {/* Area fill */}
      {areaFill && <polygon points={areaPoints} fill={areaFill} opacity="0.15" />}
      {/* Second data line */}
      {secondPoints && <polyline points={secondPoints} fill="none" stroke={secondColor} strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />}
      {/* Main line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Latest point pulse */}
      <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1][yKey])} r="3" fill={color} opacity="0.9">
        <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Annotations */}
      {(annotations || []).map((a, i) => {
        const ax = toX(a.index);
        const ay = toY(a.value);
        return (
          <g key={i}>
            <line x1={ax} y1={pad.t} x2={ax} y2={height - pad.b} stroke={a.color || C.amber} strokeWidth="0.5" strokeDasharray="2,2" />
            <rect x={ax - a.label.length * 3.2} y={pad.t - 2} width={a.label.length * 6.5} height={14} rx="2" fill="#0D1220" stroke={a.color || C.amber} strokeWidth="0.5" />
            <text x={ax} y={pad.t + 9} textAnchor="middle" fill={a.color || C.amber} fontSize="8" fontFamily={mono} fontWeight="600">{a.label}</text>
          </g>
        );
      })}
      {/* X-axis labels */}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={height - 4} textAnchor="middle" fill={C.td} fontSize="8" fontFamily={mono}>{t.label}</text>
      ))}
      {/* Label */}
      {label && <text x={pad.l} y={12} fill={C.td} fontSize="9" fontFamily={mono} letterSpacing="1">{label}</text>}
    </svg>
  );
};
