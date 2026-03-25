import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as d3 from "d3";

const C = {
  bg: "#0B1120", panel: "#0F1628", panelAlt: "#111827", border: "#1B2540", borderA: "#2A3A5C",
  amber: "#D4922A", green: "#2A9D5C", red: "#C43A3A", blue: "#4A8AC4",
  white: "#EDF0F5", tx: "#C8CDD6", tm: "#7A8494", td: "#4A5568", tf: "#2A3448",
};
const mono = "'IBM Plex Mono',Consolas,monospace";
const sans = "'IBM Plex Sans','Helvetica Neue',system-ui,sans-serif";
const TICK_MS = 4000;

/* ═══ TOPOJSON DECODER (zero deps) ═══ */
function topoFeature(topo, name) {
  const obj = topo.objects[name];
  return { type: "FeatureCollection", features: obj.geometries.map(g => topoGeom(topo, g)) };
}
function topoGeom(topo, g) {
  let coords;
  if (g.type === "Polygon") coords = g.arcs.map(ring => ring.reduce((pts, idx) => pts.concat(decodeArc(topo, idx).slice(pts.length ? 1 : 0)), []));
  else if (g.type === "MultiPolygon") coords = g.arcs.map(poly => poly.map(ring => ring.reduce((pts, idx) => pts.concat(decodeArc(topo, idx).slice(pts.length ? 1 : 0)), [])));
  else coords = null;
  return { type: "Feature", id: g.id, properties: g.properties || {}, geometry: coords ? { type: g.type, coordinates: coords } : g };
}
function decodeArc(topo, index) {
  const rev = index < 0, i = rev ? ~index : index, arc = topo.arcs[i];
  const tf = topo.transform;
  let pts;
  if (tf) {
    const [sx, sy] = tf.scale, [tx, ty] = tf.translate;
    let x = 0, y = 0;
    pts = arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  } else pts = arc.map(p => [...p]);
  return rev ? pts.reverse() : pts;
}

/* ═══ TEMPERATURE COLORS (pure JS) ═══ */
const CSTOPS = [
  { t: 0.00, r: 26, g: 42, b: 108 },
  { t: 0.15, r: 46, g: 95, b: 161 },
  { t: 0.30, r: 58, g: 140, b: 110 },
  { t: 0.42, r: 92, g: 166, b: 68 },
  { t: 0.55, r: 168, g: 184, b: 52 },
  { t: 0.65, r: 212, g: 160, b: 32 },
  { t: 0.78, r: 212, g: 112, b: 32 },
  { t: 0.90, r: 200, g: 60, b: 32 },
  { t: 1.00, r: 160, g: 24, b: 24 },
];

const lerpColor = (t) => {
  const tc = Math.max(0, Math.min(1, t));
  let lo = CSTOPS[0], hi = CSTOPS[CSTOPS.length - 1];
  for (let i = 0; i < CSTOPS.length - 1; i++) {
    if (tc >= CSTOPS[i].t && tc <= CSTOPS[i + 1].t) { lo = CSTOPS[i]; hi = CSTOPS[i + 1]; break; }
  }
  const f = lo.t === hi.t ? 0 : (tc - lo.t) / (hi.t - lo.t);
  return `rgb(${Math.round(lo.r + (hi.r - lo.r) * f)},${Math.round(lo.g + (hi.g - lo.g) * f)},${Math.round(lo.b + (hi.b - lo.b) * f)})`;
};
const latToTemp = (lat, id) => Math.max(10, Math.min(115, 110 - Math.abs(lat) * 1.6 + ((id || 0) * 7.3 % 13) - 6));
function centroidLat(f) { try { const c = d3.geoCentroid(f); return c ? c[1] : 0; } catch { return 0; } }

/* ═══ WORLD DATA HOOK — fetches real country boundaries ═══ */
function useWorldData() {
  const [countries, setCountries] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(topo => setCountries(topoFeature(topo, "countries").features))
      .catch(() => {
        fetch("https://unpkg.com/world-atlas@2/countries-110m.json")
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(topo => setCountries(topoFeature(topo, "countries").features))
          .catch(() => setError(true));
      });
  }, []);
  return { countries, error };
}

/* ═══ DATA ═══ */
const ERCOT_REGIMES = [
  { id: "solar", label: "SOLAR SURPLUS", rec: "BUY", rc: C.green, tag: "Accumulate at lowest cost basis", desc: "Mid-day solar flood — LMPs near zero or negative" },
  { id: "ramp", label: "EVENING RAMP", rec: "SELL", rc: C.amber, tag: "Solar cliff — deploy stored energy", desc: "4–8PM net load surge — prices spike 3–5x" },
  { id: "stress", label: "THERMAL STRESS", rec: "HOLD", rc: C.red, tag: "Extreme conditions — preserve SoC", desc: "Grid emergency — LMPs >$1000, conservation signals" },
];
const SIGS = [
  { id: "thermal", label: "Thermal Load", w: .35, tau: 72, c0: .92, fl: .25, color: C.red },
  { id: "solar", label: "Solar Avail", w: .25, tau: 24, c0: .95, fl: .15, color: C.amber },
  { id: "wind", label: "Wind Gen", w: .20, tau: 60, c0: .88, fl: .20, color: C.blue },
  { id: "extreme", label: "Extreme Event", w: .12, tau: 36, c0: .98, fl: .05, color: C.red },
  { id: "curtail", label: "Curtailment", w: .08, tau: 48, c0: .85, fl: .10, color: C.tm },
];
function calcScore(h) { const v = { thermal: .82, solar: -.35, wind: .55, extreme: 1.0, curtail: -.25 }; let ws = 0, wt = 0; const d = SIGS.map(s => { const c = Math.min(1, s.c0 * Math.exp(-h / s.tau) + s.fl); const val = v[s.id] + (Math.random() - .5) * .03; ws += s.w * val * c; wt += s.w * c; return { ...s, value: val, conf: c }; }); return { composite: wt > 0 ? ws / wt : 0, details: d }; }
const genSCED = (n, reg) => { const p = { solar: [22, 14], ramp: [195, 150], stress: [650, 500] }[reg] || [195, 150]; const now = Date.now(); return Array.from({ length: n }, (_, i) => { const t = new Date(now - (n - i) * 300000); return { time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`, lmp: +(Math.max(-30, p[0] + (Math.random() - 0.45) * p[1])).toFixed(2), soc: +(35 + Math.random() * 55).toFixed(0), as: +(Math.random() * 80).toFixed(0) }; }); };
const genWTI = () => { let p = 68; return Array.from({ length: 52 }, (_, i) => { p += (Math.random() - 0.45) * 3 + Math.sin(i * 0.12) * 0.8; p = Math.max(55, Math.min(95, p)); return { week: i, wti: +p.toFixed(2), cushing: +(32 - Math.sin(i * 0.15) * 8 + (i > 35 ? -4 : 0) + (Math.random() - 0.5) * 2).toFixed(1) }; }); };
const OG = { wti: 78.37, wtiChg: +1.24, brent: 82.15, brentChg: +0.89, hh: 4.12, hhChg: -0.08, crack321: 28.40, crackChg: +1.85, cushing: 27.52, cushingCap: 90, cushingChg: +1.564, pipelines: [{ name: "Permian → Cushing", flow: 2.8, cap: 3.2, status: "NOMINAL" }, { name: "Cushing → USGC", flow: 4.1, cap: 4.5, status: "NOMINAL" }, { name: "DAPL (Bakken → Patoka)", flow: 0.57, cap: 0.75, status: "NOMINAL" }, { name: "Capline (USGC → Patoka)", flow: 0.32, cap: 1.2, status: "LOW UTIL" }], refinery: [{ region: "USGC (PADD 3)", util: 92.4, runs: 9.1, unit: "M bpd" }, { region: "Midwest (PADD 2)", util: 88.7, runs: 3.8, unit: "M bpd" }, { region: "East Coast (PADD 1)", util: 84.2, runs: 1.2, unit: "M bpd" }] };

const PORTS = [
  { id: "houston", name: "Houston Ship Channel", country: "USA", lon: -95.27, lat: 29.76, throughput: "8.2M bpd", type: "REFINING HUB", signal: "ANCHOR", signalColor: C.amber, impact: "Home base — largest US refining complex.", intel: "PADD 3 utilization at 92.4%.", houstonLink: "Direct — this IS the Houston energy corridor.", tradeAction: "MONITOR", details: [{ step: "Throughput", detail: "8.2M bpd across Houston corridor." }, { step: "Status", detail: "92.4% util — above seasonal avg." }, { step: "Risk", detail: "Hurricane season Jun-Nov." }] },
  { id: "ras_tanura", name: "Ras Tanura", country: "Saudi Arabia", lon: 50.16, lat: 26.68, throughput: "6.5M bpd", type: "EXPORT TERMINAL", signal: "BULLISH", signalColor: C.green, impact: "World's largest oil export terminal.", intel: "OPEC+ cuts holding.", houstonLink: "Saudi cuts tighten sour supply → USGC premium.", tradeAction: "BUY WTI", details: [{ step: "Supply", detail: "~5.8M bpd due to cuts." }, { step: "Basis", detail: "Mars/WTI widening to $3.20." }] },
  { id: "fujairah", name: "Fujairah", country: "UAE", lon: 56.35, lat: 25.13, throughput: "2.8M bpd", type: "STORAGE HUB", signal: "NEUTRAL", signalColor: C.tx, impact: "Middle East's largest storage hub.", intel: "Storage at 65%.", houstonLink: "Fujairah draws = tightening supply.", tradeAction: "HOLD", details: [{ step: "Inventory", detail: "56M bbl, 65% full." }, { step: "Contango", detail: "$0.45 contango." }] },
  { id: "rotterdam", name: "Rotterdam", country: "Netherlands", lon: 4.48, lat: 51.92, throughput: "5.1M bpd", type: "REFINING/TRADING", signal: "BEARISH", signalColor: C.red, impact: "Europe's largest port.", intel: "Margins compressing. Diesel -4% YoY.", houstonLink: "Weak Rotterdam = wider Brent-WTI.", tradeAction: "SELL BRENT-WTI", details: [{ step: "Demand", detail: "European diesel -4% YoY." }, { step: "Arb", detail: "USGC→ARA: $4.20 — narrowing." }] },
  { id: "singapore", name: "Singapore", country: "Singapore", lon: 103.85, lat: 1.35, throughput: "4.8M bpd", type: "TRADING/STORAGE", signal: "BULLISH", signalColor: C.green, impact: "Asia's pricing hub.", intel: "Margins recovering.", houstonLink: "Strong Singapore = USGC + LNG support.", tradeAction: "BUY", details: [{ step: "Demand", detail: "Gasoil crack $16.50." }, { step: "LNG", detail: "Sabine→Asia: $8.20." }] },
  { id: "jamnagar", name: "Jamnagar", country: "India", lon: 70.07, lat: 22.47, throughput: "2.8M bpd", type: "MEGA REFINERY", signal: "BULLISH", signalColor: C.green, impact: "World's largest refinery.", intel: "Reliance 105%. India +6% YoY.", houstonLink: "India importing US crude 600K+ bpd.", tradeAction: "BUY", details: [{ step: "Demand", detail: "India +6% YoY." }, { step: "Signal", detail: "BULLISH long-term." }] },
  { id: "ningbo", name: "Ningbo-Zhoushan", country: "China", lon: 121.55, lat: 29.87, throughput: "8.0M bpd", type: "IMPORT HUB", signal: "NEUTRAL", signalColor: C.tx, impact: "World's busiest port.", intel: "Imports stable 11.2M bpd.", houstonLink: "China stability supports Houston.", tradeAction: "HOLD", details: [{ step: "Import", detail: "11.2M bpd stable." }, { step: "Risk", detail: "Teapots at 55%." }] },
  { id: "primorsk", name: "Primorsk", country: "Russia", lon: 29.22, lat: 60.36, throughput: "1.5M bpd", type: "EXPORT TERMINAL", signal: "BEARISH", signalColor: C.red, impact: "Russia's Baltic terminal.", intel: "Urals discount ~$12.", houstonLink: "Sanctions tighten Atlantic Basin.", tradeAction: "SELL URALS", details: [{ step: "Sanctions", detail: "Cap $60. Shadow fleet ~70%." }, { step: "Signal", detail: "BEARISH Urals." }] },
  { id: "santos", name: "Santos", country: "Brazil", lon: -46.33, lat: -23.95, throughput: "1.2M bpd", type: "EXPORT HUB", signal: "NEUTRAL", signalColor: C.tx, impact: "Brazil pre-salt rising.", intel: "Pre-salt 3.2M bpd.", houstonLink: "Brazilian sweet competes with WTI.", tradeAction: "HOLD", details: [{ step: "Production", detail: "Pre-salt 3.2M bpd." }, { step: "Competition", detail: "Tupi vs WTI Midland." }] },
  { id: "basrah", name: "Basrah", country: "Iraq", lon: 47.78, lat: 30.52, throughput: "3.5M bpd", type: "EXPORT TERMINAL", signal: "NEUTRAL", signalColor: C.tx, impact: "Iraq's primary terminal.", intel: "OPEC+ compliance issues.", houstonLink: "Overproduction widens Mars/WTI.", tradeAction: "HOLD", details: [{ step: "OPEC", detail: "Iraq ~300K above quota." }, { step: "Signal", detail: "NEUTRAL bearish tilt." }] },
];

/* ═══ DRAGGABLE GLOBE ═══ */
const DragGlobe = ({ children, rot, setRot, sz = 440 }) => {
  const ref = useRef(null);
  const dr = useRef(null);
  const down = useCallback((e) => {
    e.preventDefault();
    const rc = ref.current.getBoundingClientRect();
    dr.current = { x: e.clientX, y: e.clientY, r: [...rot] };
    const mv = (e2) => {
      if (!dr.current) return;
      const dx = (e2.clientX - dr.current.x) / (rc.width / 360) * 0.6;
      const dy = (e2.clientY - dr.current.y) / (rc.height / 180) * 0.6;
      setRot([dr.current.r[0] - dx, Math.max(-60, Math.min(60, dr.current.r[1] + dy)), 0]);
    };
    const up = () => { dr.current = null; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  }, [rot, setRot]);
  return (
    <svg ref={ref} viewBox={`0 0 ${sz} ${sz}`} style={{ width: "100%", maxWidth: sz, cursor: "grab", userSelect: "none" }} onMouseDown={down}>
      {children}
    </svg>
  );
};

/* ═══ PORTS GLOBE ═══ */
const PortsGlobe = ({ countries, ports, activePort, hPort, setHP, sPort, setSP, rot, setRot }) => {
  const sz = 440;
  const pj = useMemo(() => d3.geoOrthographic().scale(200).translate([sz / 2, sz / 2]).rotate(rot).clipAngle(90), [rot]);
  const pa = useMemo(() => d3.geoPath().projection(pj), [pj]);
  const gr = useMemo(() => d3.geoGraticule().step([20, 20])(), []);
  const pc = useMemo(() => ports.map(p => {
    const c = pj([p.lon, p.lat]);
    const v = d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]) < Math.PI / 2;
    return { ...p, sx: c ? c[0] : 0, sy: c ? c[1] : 0, visible: v };
  }), [ports, rot]);
  const hou = pc.find(p => p.id === "houston");

  return (
    <DragGlobe rot={rot} setRot={setRot} sz={sz}>
      <defs>
        <radialGradient id="gG" cx="35%" cy="30%" r="65%"><stop offset="0%" stopColor="#182440" /><stop offset="50%" stopColor="#101c32" /><stop offset="100%" stopColor="#080c14" /></radialGradient>
        <filter id="pg"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 20} fill="url(#gG)" />
      <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 16} fill="none" stroke={C.blue} strokeWidth="0.5" opacity="0.12" />
      <path d={pa(gr)} fill="none" stroke={C.border} strokeWidth="0.3" opacity="0.25" />

      {countries && countries.map((f, i) => { const d = pa(f); return d ? <path key={i} d={d} fill={`${C.borderA}55`} stroke={`${C.td}40`} strokeWidth="0.3" /> : null; })}

      {hou && hou.visible && pc.filter(p => p.id !== "houston" && p.visible).map(p => {
        const isA = activePort?.id === p.id;
        const interp = d3.geoInterpolate([hou.lon, hou.lat], [p.lon, p.lat]);
        const pts = Array.from({ length: 30 }, (_, i) => pj(interp(i / 29))).filter(Boolean);
        return pts.length >= 2 ? <path key={`a-${p.id}`} d={`M${pts.map(pt => `${pt[0]},${pt[1]}`).join("L")}`} fill="none" stroke={isA ? p.signalColor : C.border} strokeWidth={isA ? "1.2" : "0.4"} strokeDasharray={isA ? "6,3" : "2,4"} opacity={isA ? 0.8 : 0.1} style={{ transition: "all 0.3s" }} /> : null;
      })}

      {pc.filter(p => p.visible).map(p => {
        const isH = p.id === "houston", isA = activePort?.id === p.id;
        return (
          <g key={p.id} transform={`translate(${p.sx},${p.sy})`} onMouseEnter={() => setHP(p)} onMouseLeave={() => setHP(null)} onClick={() => setSP(sPort?.id === p.id ? null : p)} style={{ cursor: "pointer" }}>
            {isH && <circle r="18" fill="none" stroke={C.amber} strokeWidth="0.6" opacity="0"><animate attributeName="r" values="6;24" dur="2.5s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.6;0" dur="2.5s" repeatCount="indefinite" /></circle>}
            {isA && !isH && <circle r="12" fill="none" stroke={p.signalColor} strokeWidth="0.6" opacity="0"><animate attributeName="r" values="5;16" dur="1.8s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" /></circle>}
            <circle r={isA || isH ? 5.5 : 3.5} fill={isH ? C.amber : isA ? p.signalColor : C.blue} opacity={isA || isH ? 1 : 0.7} filter={isA || isH ? "url(#pg)" : ""} />
            <circle r={isH ? 2 : 1.2} fill={C.bg} />
            {(isA || isH) && <text x={9} y={-6} fill={isH ? C.amber : C.white} fontSize={isH ? 9 : 8} fontFamily={mono} fontWeight={isH ? 700 : 500} style={{ textShadow: `0 0 6px ${C.bg}, 0 0 10px ${C.bg}` }}>{p.name.toUpperCase()}</text>}
            {isA && !isH && <text x={9} y={5} fill={p.signalColor} fontSize={6.5} fontFamily={mono} fontWeight={600} style={{ textShadow: `0 0 4px ${C.bg}` }}>{p.signal}</text>}
          </g>
        );
      })}
    </DragGlobe>
  );
};

/* ═══ SOLAR GLOBE ═══ */
const SolarGlobe = ({ countries, rot, setRot }) => {
  const sz = 440;
  const pj = useMemo(() => d3.geoOrthographic().scale(200).translate([sz / 2, sz / 2]).rotate(rot).clipAngle(90), [rot]);
  const pa = useMemo(() => d3.geoPath().projection(pj), [pj]);
  const gr = useMemo(() => d3.geoGraticule().step([20, 20])(), []);
  const hc = pj([-95.27, 29.76]);
  const hv = d3.geoDistance([-95.27, 29.76], [-rot[0], -rot[1]]) < Math.PI / 2;

  return (
    <DragGlobe rot={rot} setRot={setRot} sz={sz}>
      <defs>
        <radialGradient id="sG" cx="35%" cy="30%" r="65%"><stop offset="0%" stopColor="#182440" /><stop offset="50%" stopColor="#101c32" /><stop offset="100%" stopColor="#080c14" /></radialGradient>
        <filter id="sg"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 20} fill="url(#sG)" />
      <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 16} fill="none" stroke={C.amber} strokeWidth="0.4" opacity="0.1" />
      <path d={pa(gr)} fill="none" stroke={C.border} strokeWidth="0.3" opacity="0.2" />

      {countries && countries.map((f, i) => {
        const d = pa(f);
        if (!d) return null;
        const lat = centroidLat(f);
        const temp = latToTemp(lat, f.id || i);
        const t01 = Math.max(0, Math.min(1, (temp - 20) / 90));
        return <path key={i} d={d} fill={lerpColor(t01)} stroke={`${C.td}60`} strokeWidth="0.3" />;
      })}

      {hv && hc && (
        <g transform={`translate(${hc[0]},${hc[1]})`}>
          <circle r="16" fill="none" stroke={C.amber} strokeWidth="0.8" opacity="0">
            <animate attributeName="r" values="5;22" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="5" fill={C.amber} filter="url(#sg)" />
          <circle r="2" fill={C.bg} />
          <text x="10" y="-5" fill={C.amber} fontSize="9" fontFamily={mono} fontWeight="700" style={{ textShadow: `0 0 6px ${C.bg}, 0 0 10px ${C.bg}` }}>HOUSTON</text>
        </g>
      )}
    </DragGlobe>
  );
};

/* ═══ SHARED COMPONENTS ═══ */
const Panel = ({ title, rightLabel, children }) => (
  <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
    <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 10, fontFamily: mono, letterSpacing: 2, color: C.td }}>{title}</span>
      {rightLabel && <span style={{ fontSize: 10, fontFamily: mono, color: C.tf }}>{rightLabel}</span>}
    </div>
    {children}
  </div>
);

const LiveChart = ({ data, dataKey, color, height = 120, unit, yDomain }) => {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  if (!data || data.length < 2) return null;
  const vals = data.map(d => typeof dataKey === "function" ? dataKey(d) : d[dataKey]);
  const minV = yDomain ? yDomain[0] : Math.min(...vals), maxV = yDomain ? yDomain[1] : Math.max(...vals);
  const rng = maxV - minV || 1;
  const vw = 400, vh = height, pd = { t: 20, b: 28, l: 48, r: 16 }, cW = vw - pd.l - pd.r, cH = vh - pd.t - pd.b;
  const pts = vals.map((v, i) => ({ x: pd.l + (i / (vals.length - 1)) * cW, y: pd.t + (1 - (v - minV) / rng) * cH, val: v, time: data[i].time }));
  const lP = `M${pts.map(p => `${p.x},${p.y}`).join("L")}`;
  const fP = `${lP}L${pts[pts.length - 1].x},${pd.t + cH}L${pts[0].x},${pd.t + cH}Z`;
  const yT = Array.from({ length: 5 }, (_, i) => { const v = minV + (i / 4) * rng; return { v, y: pd.t + (1 - (v - minV) / rng) * cH }; });
  const xL = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1);
  const fm = v => unit === "$" ? `$${v.toFixed(0)}` : unit === "%" ? `${v.toFixed(0)}%` : v.toFixed(1);
  const onM = useCallback(e => { if (!ref.current) return; const r = ref.current.getBoundingClientRect(); const mx = ((e.clientX - r.left) / r.width) * vw; let c = 0, cd = Infinity; pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < cd) { cd = d; c = i; } }); setHover(c); }, [pts.length]);

  return (
    <svg ref={ref} width="100%" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", cursor: "crosshair" }} onMouseMove={onM} onMouseLeave={() => setHover(null)}>
      {yT.map((t, i) => <line key={i} x1={pd.l} y1={t.y} x2={vw - pd.r} y2={t.y} stroke={C.border} strokeWidth="0.5" strokeDasharray={i === 0 || i === 4 ? "0" : "2,3"} />)}
      {minV < 0 && maxV > 0 && <line x1={pd.l} y1={pd.t + (1 - (0 - minV) / rng) * cH} x2={vw - pd.r} y2={pd.t + (1 - (0 - minV) / rng) * cH} stroke={C.td} strokeWidth="0.8" strokeDasharray="4,2" />}
      {yT.map((t, i) => <text key={`y${i}`} x={pd.l - 6} y={t.y + 3.5} textAnchor="end" fontSize="9" fontFamily={mono} fill={C.td}>{fm(t.v)}</text>)}
      {xL.map((p, i) => <text key={`x${i}`} x={p.x} y={pd.t + cH + 16} textAnchor="middle" fontSize="8.5" fontFamily={mono} fill={C.td}>{p.time}</text>)}
      <path d={fP} fill={color} fillOpacity="0.08" />
      <path d={lP} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={color} />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="6" fill={color} fillOpacity="0.2" />
      <text x={pts[pts.length - 1].x + 8} y={pts[pts.length - 1].y + 3.5} fontSize="10" fontFamily={mono} fill={color} fontWeight="600">{fm(vals[vals.length - 1])}</text>
      {hover !== null && pts[hover] && (
        <g>
          <line x1={pts[hover].x} y1={pd.t} x2={pts[hover].x} y2={pd.t + cH} stroke={C.tm} strokeWidth="0.5" strokeDasharray="3,2" />
          <circle cx={pts[hover].x} cy={pts[hover].y} r="4" fill={C.bg} stroke={color} strokeWidth="1.5" />
          <rect x={pts[hover].x - 36} y={pts[hover].y - 26} width="72" height="18" rx="3" fill={C.panelAlt} stroke={C.borderA} strokeWidth="0.5" />
          <text x={pts[hover].x} y={pts[hover].y - 14} textAnchor="middle" fontSize="9" fontFamily={mono} fill={C.white} fontWeight="500">{fm(pts[hover].val)} @ {pts[hover].time}</text>
        </g>
      )}
      {unit && <text x={pd.l} y={pd.t - 6} fontSize="8" fontFamily={mono} fill={C.td} letterSpacing="1">{unit === "$" ? "$/MWh" : unit === "%" ? "% SoC" : unit}</text>}
    </svg>
  );
};

const Legend = ({ ports }) => {
  const ct = { BULLISH: 0, BEARISH: 0 }; ports.forEach(p => { if (ct[p.signal] !== undefined) ct[p.signal]++; });
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 9, fontFamily: mono }}>
      <div style={{ display: "flex", gap: 16 }}>
        {[{ l: "BULLISH", c: C.green }, { l: "NEUTRAL", c: C.tx }, { l: "BEARISH", c: C.red }, { l: "ANCHOR", c: C.amber }].map(x => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: x.c }} /><span style={{ color: C.td }}>{x.l}</span></div>
        ))}
      </div>
      <span style={{ color: C.td }}>{ct.BULLISH} BULLISH · {ct.BEARISH} BEARISH</span>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN TERMINAL
   ═══════════════════════════════════════════ */
export default function Terminal() {
  const [mod, setMod] = useState("ercot");
  const [regime, setRegime] = useState("ramp");
  const [sced, setSCED] = useState(() => genSCED(18, "ramp"));
  const [horizon, setH] = useState(2);
  const [entered, setE] = useState(false);
  const [hPort, setHP] = useState(null);
  const [sPort, setSP] = useState(null);
  const [wtiH] = useState(() => genWTI());
  const [pRot, setPRot] = useState([20, -15, 0]);
  const [sRot, setSRot] = useState([20, -15, 0]);
  const { countries, error } = useWorldData();

  useEffect(() => { setTimeout(() => setE(true), 50); }, []);
  useEffect(() => { const iv = setInterval(() => setSCED(p => [...p.slice(-17), genSCED(1, regime)[0]]), TICK_MS); return () => clearInterval(iv); }, [regime]);

  const r = ERCOT_REGIMES.find(x => x.id === regime) || ERCOT_REGIMES[1];
  const score = useMemo(() => calcScore(horizon), [horizon]);
  const aPort = sPort || hPort;
  const lmp = sced[sced.length - 1]?.lmp;
  const lC = lmp > 300 ? C.red : lmp > 80 ? C.amber : lmp < 0 ? C.blue : C.green;
  const hW = useMemo(() => ({ temp: 94, solar: 920, cloud: 12, wx: +0.42 }), []);

  const loading = countries === null && !error;

  const tabs = [
    { id: "ercot", label: "ERCOT POWER" },
    { id: "og", label: "O&G PHYSICAL" },
    { id: "ports", label: "OIL PORTS", icon: "⛽" },
    { id: "solar", label: "SOLAR & WEATHER", icon: "☀" },
  ];

  const globeMsg = loading
    ? <div style={{ textAlign: "center", padding: 60, fontFamily: mono, color: C.td }}>Loading world geometry...</div>
    : error
      ? <div style={{ textAlign: "center", padding: 40, fontFamily: mono, color: C.red, fontSize: 11, lineHeight: 1.8 }}>
          Failed to load world-atlas from CDN.<br />
          Run <span style={{ color: C.amber }}>npm install world-atlas</span> and import locally,<br />
          or check your network connection.
        </div>
      : null;

  return (
    <div style={{ fontFamily: sans, background: C.bg, color: C.tx, minHeight: "100vh", fontSize: 14 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* TOP BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", background: C.panel, borderBottom: `1px solid ${C.border}`, opacity: entered ? 1 : 0, transition: "opacity 0.6s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.white, letterSpacing: 2 }}>ORBIT</span>
          {tabs.map(m => (
            <button key={m.id} onClick={() => setMod(m.id)} style={{ padding: "4px 12px", fontSize: 11, fontFamily: mono, cursor: "pointer", background: mod === m.id ? C.borderA : "transparent", border: mod === m.id ? `1px solid ${C.td}` : "1px solid transparent", color: mod === m.id ? C.white : C.td }}>
              {m.icon ? `${m.icon} ` : ""}{m.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: mono, fontSize: 11 }}>
          <span style={{ color: C.td }}>WTI <span style={{ color: C.white }}>${OG.wti}</span></span>
          <span style={{ color: C.td }}>BRENT <span style={{ color: C.white }}>${OG.brent}</span></span>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, animation: "pulse 2.5s infinite" }} />
          <span style={{ color: C.green, fontWeight: 600 }}>LIVE</span>
        </div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 1280, margin: "0 auto", opacity: entered ? 1 : 0, transition: "opacity 0.8s 0.15s" }}>

        {/* ═══ ERCOT ═══ */}
        {mod === "ercot" && (<>
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: mono, color: C.amber, letterSpacing: 3 }}>ENERGY INTELLIGENCE ARBITRAGE</div>
              <div style={{ fontSize: 44, fontWeight: 300, color: C.white, fontFamily: mono, lineHeight: 1 }}>57<span style={{ fontSize: 18, color: C.amber }}>ns</span></div>
            </div>
            <div style={{ textAlign: "right", fontFamily: mono, fontSize: 10 }}><div style={{ color: C.td }}>REGIME</div><div style={{ fontSize: 14, color: r.rc, fontWeight: 600 }}>{r.label}</div></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 14 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {ERCOT_REGIMES.map(rx => (
                  <button key={rx.id} onClick={() => setRegime(rx.id)} style={{ flex: 1, padding: "14px 12px", cursor: "pointer", background: regime === rx.id ? C.panelAlt : C.panel, border: `1px solid ${regime === rx.id ? rx.rc : C.border}`, color: regime === rx.id ? rx.rc : C.td, textAlign: "left" }}>
                    <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 600 }}>{rx.label}</div>
                    <div style={{ fontSize: 9, fontFamily: sans, color: C.tm, marginTop: 4, lineHeight: 1.3 }}>{rx.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ background: `${r.rc}0a`, border: `1px solid ${r.rc}25`, padding: 14, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 10, fontFamily: mono, color: C.td, letterSpacing: 2 }}>REC</div>
                <div style={{ fontSize: 36, fontFamily: mono, color: r.rc, fontWeight: 600 }}>{r.rec}</div>
                <div style={{ fontSize: 9, fontFamily: mono, color: C.tm, marginTop: 4 }}>{r.tag}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "SPOT LMP", value: `$${lmp}`, color: lC, sub: "/MWh" },
                { label: "FLEET SoC", value: `${sced[sced.length - 1]?.soc}%`, color: C.green, sub: "avg battery" },
                { label: "AS CAPACITY", value: `${sced[sced.length - 1]?.as} MW`, color: C.blue, sub: "ancillary svc" },
                { label: "WEATHER", value: score.composite.toFixed(2), color: score.composite > 0.3 ? C.red : score.composite > 0 ? C.amber : C.green, sub: `${horizon}hr horizon` },
              ].map((s, i) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, padding: "10px 14px" }}>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.td, letterSpacing: 1.5 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontFamily: mono, color: s.color, fontWeight: 500, marginTop: 2 }}>{s.value}</div>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.tf }}>{s.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <Panel title="LMP PROFILE" rightLabel="5-MIN SCED"><div style={{ padding: "8px 6px 4px" }}><LiveChart data={sced} dataKey="lmp" color={C.amber} height={140} unit="$" /></div></Panel>
              <Panel title="FLEET SoC" rightLabel="BATTERY DISPATCH"><div style={{ padding: "8px 6px 4px" }}><LiveChart data={sced} dataKey="soc" color={C.green} height={140} unit="%" yDomain={[0, 100]} /></div></Panel>
              <Panel title="WEATHER SCORE" rightLabel={`${horizon}HR HORIZON`}><div style={{ padding: "8px 6px 4px" }}><LiveChart data={sced.map(d => ({ ...d, ws: score.composite }))} dataKey="ws" color={C.blue} height={140} unit="score" yDomain={[-1, 1]} /></div></Panel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
              <Panel title="SIGNAL DECOMPOSITION" rightLabel="WEIGHTED FACTORS">
                <div style={{ padding: "6px 0" }}>
                  {score.details.map((s, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 44px 1fr 54px 60px", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: i < score.details.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.tx }}>{s.label}</span>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.td }}>{(s.w * 100).toFixed(0)}%</span>
                      <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${Math.abs(s.value) * 100}%`, height: "100%", background: s.value > 0 ? s.color : C.blue, borderRadius: 2 }} /></div>
                      <span style={{ fontSize: 10, fontFamily: mono, color: s.value > 0 ? C.red : C.green, textAlign: "right" }}>{s.value > 0 ? "+" : ""}{s.value.toFixed(2)}</span>
                      <span style={{ fontSize: 9, fontFamily: mono, color: C.td, textAlign: "right" }}>{(s.conf * 100).toFixed(0)}% conf</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="FORECAST HORIZON">
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                    <span style={{ fontSize: 36, fontFamily: mono, color: C.white, fontWeight: 300 }}>{horizon}<span style={{ fontSize: 14, color: C.td }}>hr</span></span>
                    <span style={{ fontSize: 10, fontFamily: mono, color: score.composite > 0.3 ? C.red : score.composite > 0 ? C.amber : C.green }}>{score.composite > 0.3 ? "HIGH RISK" : score.composite > 0 ? "MODERATE" : "LOW RISK"}</span>
                  </div>
                  <input type="range" min="1" max="72" value={horizon} onChange={e => setH(+e.target.value)} style={{ width: "100%", accentColor: C.amber, cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>{["1HR", "24HR", "48HR", "72HR"].map(l => <span key={l} style={{ fontSize: 9, fontFamily: mono, color: C.td }}>{l}</span>)}</div>
                  <div style={{ marginTop: 16, padding: "10px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                    <div style={{ fontSize: 9, fontFamily: mono, color: C.td, letterSpacing: 1 }}>COMPOSITE</div>
                    <div style={{ fontSize: 20, fontFamily: mono, color: C.white, marginTop: 2 }}>{score.composite.toFixed(3)}</div>
                    <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 8 }}><div style={{ width: `${((score.composite + 1) / 2) * 100}%`, height: "100%", background: score.composite > 0.3 ? C.red : score.composite > 0 ? C.amber : C.green, borderRadius: 2, transition: "width 0.4s" }} /></div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </>)}

        {/* ═══ O&G ═══ */}
        {mod === "og" && (<>
          <div style={{ marginBottom: 20 }}><div style={{ fontSize: 10, fontFamily: mono, color: C.amber, letterSpacing: 3 }}>ENERGY INTELLIGENCE ARBITRAGE</div><div style={{ fontSize: 28, fontWeight: 600, color: C.white }}>O&G Physical</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {[{ l: "WTI CRUDE", v: OG.wti, chg: OG.wtiChg, u: "$/bbl" }, { l: "BRENT CRUDE", v: OG.brent, chg: OG.brentChg, u: "$/bbl" }, { l: "HENRY HUB", v: OG.hh, chg: OG.hhChg, u: "$/MMBtu" }, { l: "3-2-1 CRACK", v: OG.crack321, chg: OG.crackChg, u: "$/bbl" }].map((p, i) => (
                <div key={i} style={{ background: C.panel, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.td, letterSpacing: 1.5 }}>{p.l}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 26, fontFamily: mono, color: C.white, fontWeight: 500 }}>${p.v}</span>
                    <span style={{ fontSize: 11, fontFamily: mono, color: p.chg >= 0 ? C.green : C.red, fontWeight: 600 }}>{p.chg >= 0 ? "+" : ""}{p.chg.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.tf, marginTop: 2 }}>{p.u}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Panel title="WTI 52-WEEK" rightLabel="WEEKLY CLOSE"><div style={{ padding: "8px 6px 4px" }}><LiveChart data={wtiH.map(d => ({ ...d, time: `W${d.week}` }))} dataKey="wti" color={C.amber} height={160} unit="$" /></div></Panel>
              <Panel title="CUSHING STORAGE">
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 32, fontFamily: mono, color: C.white }}>{OG.cushing}</span>
                    <span style={{ fontSize: 14, fontFamily: mono, color: C.td }}>M bbl</span>
                    <span style={{ fontSize: 11, fontFamily: mono, color: C.green }}>+{OG.cushingChg.toFixed(1)}</span>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: mono, color: C.td, marginBottom: 4 }}><span>UTILIZATION</span><span>{((OG.cushing / OG.cushingCap) * 100).toFixed(1)}%</span></div>
                    <div style={{ height: 8, background: C.border, borderRadius: 4 }}><div style={{ width: `${(OG.cushing / OG.cushingCap) * 100}%`, height: "100%", background: C.green, borderRadius: 4 }} /></div>
                  </div>
                  <div style={{ marginTop: 16 }}><LiveChart data={wtiH.map(d => ({ ...d, time: `W${d.week}` }))} dataKey="cushing" color={C.green} height={100} unit="M bbl" /></div>
                </div>
              </Panel>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Panel title="PIPELINE FLOWS" rightLabel="M BPD">
                <div style={{ padding: "4px 0" }}>
                  {OG.pipelines.map((p, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "170px 1fr 60px 70px", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: i < OG.pipelines.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.tx }}>{p.name}</span>
                      <div style={{ height: 4, background: C.border, borderRadius: 2 }}><div style={{ width: `${(p.flow / p.cap) * 100}%`, height: "100%", background: (p.flow / p.cap) > 0.9 ? C.amber : C.green, borderRadius: 2 }} /></div>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.white, textAlign: "right" }}>{p.flow}/{p.cap}</span>
                      <span style={{ fontSize: 9, fontFamily: mono, textAlign: "right", color: p.status === "NOMINAL" ? C.green : C.amber }}>{p.status}</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="REFINERY UTILIZATION" rightLabel="PADD REGIONS">
                <div style={{ padding: "4px 0" }}>
                  {OG.refinery.map((rv, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 50px 55px", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: i < OG.refinery.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.tx }}>{rv.region}</span>
                      <div style={{ height: 4, background: C.border, borderRadius: 2 }}><div style={{ width: `${rv.util}%`, height: "100%", background: rv.util > 90 ? C.green : C.amber, borderRadius: 2 }} /></div>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.white, textAlign: "right" }}>{rv.util}%</span>
                      <span style={{ fontSize: 10, fontFamily: mono, color: C.td, textAlign: "right" }}>{rv.runs} {rv.unit}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </>)}

        {/* ═══ PORTS ═══ */}
        {mod === "ports" && (<>
          <div style={{ marginBottom: 20 }}><div style={{ fontSize: 10, fontFamily: mono, color: C.amber, letterSpacing: 3 }}>ORBIT QUANT RESEARCH</div><div style={{ fontSize: 28, fontWeight: 600, color: C.white }}>Global Energy Intelligence</div></div>
          {globeMsg || (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
              <Panel title="GLOBAL OIL PORT NETWORK" rightLabel="DRAG TO ROTATE">
                <div style={{ background: "#080c14", padding: 8 }}>
                  <PortsGlobe countries={countries} ports={PORTS} activePort={aPort} hPort={hPort} setHP={setHP} sPort={sPort} setSP={setSP} rot={pRot} setRot={setPRot} />
                </div>
                <Legend ports={PORTS} />
              </Panel>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "3px 3px 0 0" }}>
                  <span style={{ fontSize: 10, fontFamily: mono, letterSpacing: 2, color: C.td }}>PORT ROSTER · {PORTS.length} TRACKED</span>
                </div>
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 3px 3px", flex: 1, overflowY: "auto", maxHeight: 520 }}>
                  {PORTS.map((p, i) => {
                    const isA = aPort?.id === p.id;
                    return (
                      <div key={p.id} onClick={() => setSP(sPort?.id === p.id ? null : p)} onMouseEnter={() => setHP(p)} onMouseLeave={() => setHP(null)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", borderBottom: i < PORTS.length - 1 ? `1px solid ${C.border}` : "none", borderLeft: isA ? `3px solid ${p.signalColor}` : "3px solid transparent", background: isA ? `${p.signalColor}08` : "transparent", transition: "all 0.2s" }}>
                        <div>
                          <div style={{ fontSize: 12, fontFamily: sans, color: C.white, fontWeight: 500 }}>{p.name}</div>
                          <div style={{ fontSize: 9, fontFamily: mono, color: C.td, marginTop: 2 }}>{p.country} · {p.throughput}</div>
                        </div>
                        <span style={{ fontSize: 10, fontFamily: mono, color: p.signalColor, fontWeight: 700 }}>{p.signal}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {aPort && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14 }}>
              <Panel title={aPort.name.toUpperCase()} rightLabel={aPort.country}>
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 9, fontFamily: mono, color: C.td }}>{aPort.type}</div>
                  <div style={{ fontSize: 24, color: C.white, fontFamily: mono, marginTop: 2 }}>{aPort.throughput}</div>
                  <div style={{ marginTop: 8, padding: "6px 12px", background: `${aPort.signalColor}12`, border: `1px solid ${aPort.signalColor}30`, display: "inline-block" }}>
                    <span style={{ fontSize: 14, fontFamily: mono, color: aPort.signalColor, fontWeight: 700 }}>{aPort.tradeAction}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.tx, marginTop: 10, lineHeight: 1.5 }}>{aPort.impact}</div>
                </div>
              </Panel>
              <Panel title="INTEL & HOUSTON NEXUS">
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.tm, lineHeight: 1.5, marginBottom: 10, padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                    <span style={{ color: C.td, fontSize: 9, letterSpacing: 1 }}>INTEL </span>{aPort.intel}
                  </div>
                  <div style={{ fontSize: 10, color: C.tx, lineHeight: 1.5 }}>
                    <span style={{ color: C.td, fontSize: 9, letterSpacing: 1 }}>HOUSTON LINK </span>{aPort.houstonLink}
                  </div>
                </div>
              </Panel>
              <Panel title="ANALYSIS CHAIN">
                <div style={{ padding: "4px 0" }}>
                  {aPort.details.map((d, i) => (
                    <div key={i} style={{ padding: "8px 14px", borderBottom: i < aPort.details.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ fontSize: 9, fontFamily: mono, color: C.amber, letterSpacing: 1, marginBottom: 3 }}>{d.step}</div>
                      <div style={{ fontSize: 10, color: C.tm, lineHeight: 1.4 }}>{d.detail}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </>)}

        {/* ═══ SOLAR & WEATHER ═══ */}
        {mod === "solar" && (<>
          <div style={{ marginBottom: 20 }}><div style={{ fontSize: 10, fontFamily: mono, color: C.amber, letterSpacing: 3 }}>ORBIT QUANT RESEARCH</div><div style={{ fontSize: 28, fontWeight: 600, color: C.white }}>Global Energy Intelligence</div></div>
          {globeMsg || (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
              <Panel title="SOLAR IRRADIANCE & TEMPERATURE" rightLabel="DRAG TO ROTATE">
                <div style={{ background: "#080c14", padding: 8 }}>
                  <SolarGlobe countries={countries} rot={sRot} setRot={setSRot} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 9, fontFamily: mono }}>
                  <span style={{ color: C.td }}>TEMP</span>
                  <div style={{ flex: "0 0 140px", height: 8, borderRadius: 4, background: "linear-gradient(to right, #1a2a6c, #2e5fa1, #3a8c6e, #5ca644, #a8b834, #d4a020, #d47020, #c83c20, #a01818)" }} />
                  <span style={{ color: C.td }}>50°F → 110°F+</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: C.td }}>{PORTS.filter(p => p.signal === "BULLISH").length} BULLISH · {PORTS.filter(p => p.signal === "BEARISH").length} BEARISH</span>
                </div>
              </Panel>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Panel title="HOUSTON, TX">
                  <div style={{ padding: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[{ label: "TEMP", value: `${hW.temp}°F`, color: C.red }, { label: "SOLAR", value: `${hW.solar} W/m²`, color: C.amber }, { label: "CLOUD", value: `${hW.cloud}%`, color: C.blue }, { label: "WX SCORE", value: `+${hW.wx.toFixed(2)}`, color: C.green }].map((s, i) => (
                        <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, fontFamily: mono, color: C.td, letterSpacing: 1.5 }}>{s.label}</div>
                          <div style={{ fontSize: 22, fontFamily: mono, color: s.color, fontWeight: 600, marginTop: 4 }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <Panel title="ERCOT REGIME"><div style={{ padding: 14, textAlign: "center" }}><div style={{ fontSize: 22, fontFamily: mono, color: r.rc, fontWeight: 700 }}>{r.label}</div></div></Panel>
                <Panel title="ERCOT IMPACT">
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.6 }}>
                      Moderate load. Solar surplus window narrowing. Watch for cloud buildup.
                      {regime === "solar" && " Grid awash in cheap solar — ideal for battery charging."}
                      {regime === "ramp" && " Net load climbing. Deploy stored energy."}
                      {regime === "stress" && " Conservation voltage reduction possible."}
                    </div>
                  </div>
                </Panel>
                <Panel title="DATA SOURCE">
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 10, fontFamily: mono, color: C.tm, lineHeight: 1.8 }}>
                      <div style={{ color: C.amber, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>DATA SOURCE</div>
                      NWS api.weather.gov/stations/KIAH<br />
                      NREL NSRDB / Solcast (irradiance)<br />
                      Kasten-Czeplak model (cloud→GHI)
                    </div>
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </>)}

        {/* Footer */}
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.tf, display: "flex", justifyContent: "space-between" }}>
          <span><span style={{ color: C.tx, fontWeight: 600 }}>Garrick Piñón</span> · Quantsultant™ · Orbit Quant Research</span>
          <span style={{ fontFamily: mono }}>EIA · NWS · NHC · NREL · FRED</span>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}*{margin:0;padding:0;box-sizing:border-box}input[type="range"]{-webkit-appearance:none;height:4px;background:${C.border};border-radius:2px;outline:none}input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:${C.amber};cursor:pointer;border:2px solid ${C.bg}}`}</style>
    </div>
  );
}
