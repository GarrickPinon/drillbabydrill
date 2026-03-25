import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

/*
 ═══════════════════════════════════════════════════════════════
 ORBIT QUANT — GLOBAL ENERGY INTELLIGENCE GLOBES
 
 Two interactive orthographic globe visualizations:
   1. OIL PORTS — Major world oil ports with barrel markers,
      signal colors, throughput data, Houston impact analysis
   2. SOLAR & WEATHER — Temperature/irradiance heatmap overlay
      with real-time weather scoring inputs
 
 Garrick Piñón · Quantsultant™
 ═══════════════════════════════════════════════════════════════
*/

const MONO = "'IBM Plex Mono', Consolas, monospace";
const SANS = "'IBM Plex Sans', 'Helvetica Neue', sans-serif";

const C = {
  bg: "#060B16", panel: "#0C1222", border: "#1A2540", borderA: "#2A3A5C",
  amber: "#D4922A", green: "#2A9D5C", red: "#C43A3A", blue: "#4A8AC4",
  white: "#EDF0F5", tx: "#C8CDD6", tm: "#7A8494", td: "#4A5568", tf: "#2A3448",
  ocean: "#08101E", land: "#1B2844", landStroke: "#2A3A5C",
  heatLow: "#2A3448", heatMid: "#D4922A", heatHigh: "#C43A3A",
};

const PORTS = [
  {
    id: "houston", name: "Houston Ship Channel", country: "USA", lat: 29.76, lon: -95.36, throughput: "8.2M bpd", type: "REFINING HUB", signal: "ANCHOR", color: C.amber, action: "MONITOR",
    intel: "PADD 3 at 92.4% util. Spring turnarounds approaching. Crack spreads widening.", houstonLink: "Home base — largest US refining complex.", details: "Channel congestion premium +$0.35/bbl. Lighterage delays avg 2.1 days."
  },
  {
    id: "ras_tanura", name: "Ras Tanura", country: "Saudi Arabia", lat: 26.65, lon: 50.15, throughput: "6.5M bpd", type: "EXPORT", signal: "BULLISH", color: C.green, action: "BUY WTI",
    intel: "OPEC+ cuts holding. Spare capacity ~3M bpd. No increase until Q4.", houstonLink: "Saudi cuts tighten medium-sour supply → USGC feedstock premium.", details: "Mars/WTI spread widening to $3.20/bbl vs $2.10 norm."
  },
  {
    id: "fujairah", name: "Fujairah", country: "UAE", lat: 25.12, lon: 56.33, throughput: "2.8M bpd", type: "STORAGE", signal: "NEUTRAL", color: C.tx, action: "HOLD",
    intel: "Storage at 65% capacity. No unusual builds or draws.", houstonLink: "Stable Fujairah = stable Asian demand for USGC exports.", details: "Dubai 1M-2M contango: $0.45. Not enough for aggressive fills."
  },
  {
    id: "rotterdam", name: "Rotterdam", country: "Netherlands", lat: 51.92, lon: 4.48, throughput: "5.1M bpd", type: "TRADING", signal: "BEARISH", color: C.red, action: "SELL BRENT-WTI",
    intel: "EU refinery margins compressing. Diesel -4% YoY. Carbon costs rising.", houstonLink: "Weak Rotterdam = wider Brent-WTI spread opportunity.", details: "USGC→ARA arb: $4.20/bbl, narrowing. TC2: $28K/day."
  },
  {
    id: "singapore", name: "Singapore", country: "Singapore", lat: 1.35, lon: 103.82, throughput: "4.8M bpd", type: "TRADING", signal: "BULLISH", color: C.green, action: "BUY",
    intel: "Refinery margins recovering. China demand +2.3% YoY.", houstonLink: "Strong Singapore pulls USGC crude east. LNG economics improving.", details: "JKM: $12.40/MMBtu. Sabine→Asia netback: $8.20/MMBtu."
  },
  {
    id: "jamnagar", name: "Jamnagar", country: "India", lat: 22.47, lon: 70.07, throughput: "2.8M bpd", type: "MEGA REFINERY", signal: "BULLISH", color: C.green, action: "BUY",
    intel: "Reliance at 105% nameplate. India fuel demand +6% YoY.", houstonLink: "India importing US crude at 600K+ bpd. Direct Houston customer.", details: "WTI Midland exports to India rising. Structural growth story."
  },
  {
    id: "ningbo", name: "Ningbo-Zhoushan", country: "China", lat: 29.87, lon: 121.54, throughput: "8.0M bpd", type: "IMPORT", signal: "NEUTRAL", color: C.tx, action: "HOLD",
    intel: "Imports stable 11.2M bpd. SPR fills complete. Teapots at 55%.", houstonLink: "China stability supports baseline. Property sector = downside risk.", details: "Houston→China: ~400K bpd. China prefers VLCC from Mideast."
  },
  {
    id: "primorsk", name: "Primorsk", country: "Russia", lat: 60.36, lon: 28.63, throughput: "1.5M bpd", type: "EXPORT", signal: "BEARISH", color: C.red, action: "MONITOR",
    intel: "Urals at $8-12 discount. Shadow fleet ~600 tankers.", houstonLink: "Discounted Russian crude displaces some USGC Asian exports.", details: "Pre-war 60% to EU → now 80%+ to India/China/Turkey."
  },
  {
    id: "santos", name: "Santos", country: "Brazil", lat: -23.95, lon: -46.33, throughput: "3.2M bpd", type: "PRE-SALT", signal: "NEUTRAL", color: C.tx, action: "MONITOR",
    intel: "Petrobras pre-salt at 2.8M bpd record. 3 new FPSOs in 2026.", houstonLink: "Brazilian light sweet competes with WTI Midland in Asia.", details: "FOB Santos→Singapore $2.10/bbl cheaper than FOB Houston."
  },
  {
    id: "basrah", name: "Basrah", country: "Iraq", lat: 30.51, lon: 47.83, throughput: "3.5M bpd", type: "EXPORT", signal: "NEUTRAL", color: C.tx, action: "HOLD",
    intel: "Iraq exceeding OPEC quota by 200-400K bpd. Resisting cuts.", houstonLink: "Basrah Medium competes with Mars crude at Houston refineries.", details: "BOT: 1.8M bpd. Al-Faw Grand Port adds 1.5M bpd (under construction)."
  },
];

const SOLAR_ZONES = [
  { lat: 29.76, lon: -95.36, name: "Houston, TX", temp: 94, irradiance: 920, cloud: 12, score: "+0.42", regime: "EVENING RAMP" },
  { lat: 32.78, lon: -96.80, name: "Dallas, TX", temp: 91, irradiance: 880, cloud: 18, score: "+0.35" },
  { lat: 33.45, lon: -112.07, name: "Phoenix, AZ", temp: 108, irradiance: 1020, cloud: 5, score: "+0.78" },
  { lat: 34.05, lon: -118.24, name: "Los Angeles, CA", temp: 78, irradiance: 750, cloud: 35, score: "+0.15" },
  { lat: 40.71, lon: -74.01, name: "New York, NY", temp: 72, irradiance: 620, cloud: 45, score: "-0.10" },
  { lat: 25.76, lon: -80.19, name: "Miami, FL", temp: 88, irradiance: 850, cloud: 40, score: "+0.28" },
  { lat: 47.61, lon: -122.33, name: "Seattle, WA", temp: 62, irradiance: 420, cloud: 70, score: "-0.30" },
  { lat: 41.88, lon: -87.63, name: "Chicago, IL", temp: 68, irradiance: 580, cloud: 50, score: "-0.05" },
  { lat: 23.42, lon: 53.85, name: "Abu Dhabi, UAE", temp: 112, irradiance: 1050, cloud: 3, score: "+0.85" },
  { lat: 26.07, lon: 50.55, name: "Bahrain", temp: 105, irradiance: 980, cloud: 8, score: "+0.72" },
  { lat: 24.47, lon: 54.37, name: "Dubai", temp: 110, irradiance: 1010, cloud: 5, score: "+0.80" },
  { lat: -23.55, lon: -46.63, name: "São Paulo", temp: 82, irradiance: 680, cloud: 55, score: "+0.10" },
  { lat: 1.35, lon: 103.82, name: "Singapore", temp: 88, irradiance: 720, cloud: 60, score: "+0.18" },
  { lat: 19.08, lon: 72.88, name: "Mumbai", temp: 92, irradiance: 820, cloud: 30, score: "+0.38" },
  { lat: 31.23, lon: 121.47, name: "Shanghai", temp: 75, irradiance: 580, cloud: 55, score: "+0.02" },
  { lat: 51.51, lon: -0.13, name: "London", temp: 58, irradiance: 350, cloud: 75, score: "-0.40" },
];

function tempToColor(temp) {
  if (temp >= 105) return "#CC2200";
  if (temp >= 95) return "#E84420";
  if (temp >= 85) return "#E86830";
  if (temp >= 75) return "#D49040";
  if (temp >= 65) return "#C0A050";
  if (temp >= 55) return "#8A9060";
  return "#506070";
}

function irradianceToColor(w) {
  if (w >= 1000) return "#FF3300";
  if (w >= 850) return "#E85020";
  if (w >= 700) return "#D47030";
  if (w >= 550) return "#B89040";
  if (w >= 400) return "#90A050";
  return "#607060";
}

const BarrelIcon = ({ x, y, size, color, opacity = 1 }) => (
  <g transform={`translate(${x - size / 2}, ${y - size * 0.7})`} opacity={opacity}>
    <ellipse cx={size / 2} cy={size * 0.2} rx={size * 0.4} ry={size * 0.2} fill={color} opacity={0.9} />
    <rect x={size * 0.1} y={size * 0.2} width={size * 0.8} height={size * 0.8} fill={color} opacity={0.7} rx={size * 0.05} />
    <ellipse cx={size / 2} cy={size} rx={size * 0.4} ry={size * 0.2} fill={color} opacity={0.6} />
    <line x1={size * 0.1} y1={size * 0.45} x2={size * 0.9} y2={size * 0.45} stroke={C.bg} strokeWidth={size * 0.03} opacity={0.5} />
    <line x1={size * 0.1} y1={size * 0.72} x2={size * 0.9} y2={size * 0.72} stroke={C.bg} strokeWidth={size * 0.03} opacity={0.5} />
  </g>
);

export default function EnergyGlobes() {
  const [view, setView] = useState("ports");
  const [rotation, setRotation] = useState([-95, -25, 0]);
  const [hoveredPort, setHoveredPort] = useState(null);
  const [selectedPort, setSelectedPort] = useState(null);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [selectedZone, setSelectedZone] = useState(SOLAR_ZONES[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [worldData, setWorldData] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then(topo => {
        const countries = {
          type: "FeatureCollection",
          features: topo.objects.countries.geometries.map(g => ({
            type: "Feature",
            geometry: topojsonFeature(topo, g),
            properties: g.properties || {},
          }))
        };
        setWorldData(countries);
        setTimeout(() => setLoaded(true), 100);
      })
      .catch(() => setLoaded(true));
  }, []);

  const width = 560, height = 560;
  const projection = d3.geoOrthographic()
    .scale(260)
    .translate([width / 2, height / 2])
    .rotate(rotation)
    .clipAngle(90);
  const pathGen = d3.geoPath().projection(projection);
  const graticule = d3.geoGraticule().step([15, 15])();

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, rot: [...rotation] });
  };
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setRotation([
      dragStart.rot[0] - dx * 0.3,
      Math.max(-80, Math.min(80, dragStart.rot[1] + dy * 0.3)),
      0
    ]);
  }, [isDragging, dragStart]);
  const handleMouseUp = () => { setIsDragging(false); setDragStart(null); };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove]);

  const isVisible = (lon, lat) => {
    const dist = d3.geoDistance([-rotation[0], -rotation[1]], [lon, lat]);
    return dist < Math.PI / 2;
  };

  const active = selectedPort || hoveredPort;

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.tx, minHeight: "680px", height: "100%", padding: "12px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 3, color: C.amber, marginBottom: 4 }}>ORBIT QUANT RESEARCH</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: C.white }}>Global Energy Intelligence</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ id: "ports", label: "OIL PORTS", icon: "⛽" }, { id: "solar", label: "SOLAR & WEATHER", icon: "☀" }].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); setHoveredPort(null); setSelectedPort(null); setHoveredZone(null); }}
              style={{
                padding: "8px 16px", fontFamily: MONO, fontSize: 11, letterSpacing: 1,
                background: view === tab.id ? C.borderA : "transparent",
                border: `1px solid ${view === tab.id ? C.borderA : C.border}`,
                color: view === tab.id ? C.white : C.td,
                borderRadius: 3, cursor: "pointer", transition: "all .2s",
              }}>{tab.icon} {tab.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, opacity: loaded ? 1 : 0, transition: "opacity .5s" }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden", position: "relative" }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.td }}>{view === "ports" ? "GLOBAL OIL PORT NETWORK" : "SOLAR IRRADIANCE & TEMPERATURE"}</span>
            <span style={{ fontSize: 10, fontFamily: MONO, color: C.tf }}>DRAG TO ROTATE</span>
          </div>

          <div style={{ padding: 8, display: "flex", justifyContent: "center", cursor: isDragging ? "grabbing" : "grab" }}>
            <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} onMouseDown={handleMouseDown} style={{ maxWidth: "100%" }}>
              <defs>
                <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
                  <stop offset="85%" stopColor="transparent" /><stop offset="100%" stopColor={view === "solar" ? "#D4922A" : "#4A8AC4"} stopOpacity="0.08" />
                </radialGradient>
                <radialGradient id="globeShade" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#1A2540" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.4" />
                </radialGradient>
              </defs>
              <circle cx={width / 2} cy={height / 2} r={260} fill={C.ocean} />
              {worldData && worldData.features.map((feat, i) => {
                const path = pathGen(feat);
                if (!path) return null;
                let fill = C.land;
                const centroid = d3.geoCentroid(feat);
                const lat = Math.abs(centroid[1]);
                if (view === "solar") {
                  if (lat < 15) fill = "#CC3300"; else if (lat < 25) fill = "#D45020"; else if (lat < 35) fill = "#C47030"; else if (lat < 45) fill = "#A08040"; else if (lat < 55) fill = "#708050"; else fill = "#506060";
                } else {
                  for (const port of PORTS) { if (feat.geometry && d3.geoContains(feat, [port.lon, port.lat])) { fill = `${port.color}25`; break; } }
                }
                return <path key={i} d={path} fill={fill} stroke={C.landStroke} strokeWidth={0.4} style={{ transition: "fill .3s" }} />;
              })}
              <path d={pathGen(graticule)} fill="none" stroke={C.border} strokeWidth={0.3} opacity={0.25} />
              <circle cx={width / 2} cy={height / 2} r={260} fill="url(#globeShade)" />
              <circle cx={width / 2} cy={height / 2} r={262} fill="none" stroke="url(#atmosphere)" strokeWidth={4} />

              {view === "ports" && PORTS.map(port => {
                if (!isVisible(port.lon, port.lat)) return null;
                const [px, py] = projection([port.lon, port.lat]);
                const isActive = active?.id === port.id;
                const isHouston = port.id === "houston";
                const sz = isHouston ? 20 : isActive ? 18 : 14;
                return (
                  <g key={port.id} onMouseEnter={() => setHoveredPort(port)} onMouseLeave={() => setHoveredPort(null)} onClick={(e) => { e.stopPropagation(); setSelectedPort(selectedPort?.id === port.id ? null : port); }} style={{ cursor: "pointer" }}>
                    {!isHouston && isVisible(-95.36, 29.76) && (() => { const [hx, hy] = projection([-95.36, 29.76]); return <line x1={hx} y1={hy} x2={px} y2={py} stroke={port.color} strokeWidth={isActive ? 1.2 : 0.4} strokeDasharray={isActive ? "none" : "3,3"} opacity={isActive ? 0.6 : 0.15} />; })()}
                    {(isActive || isHouston) && <circle cx={px} cy={py} r={sz * 1.2} fill={port.color} opacity={0.12}>{isHouston && <animate attributeName="r" values={`${sz};${sz * 1.5};${sz}`} dur="3s" repeatCount="indefinite" />}</circle>}
                    <BarrelIcon x={px} y={py} size={sz} color={port.color} opacity={isActive ? 1 : 0.75} />
                    <text x={px} y={py - sz * 0.8} fontSize={isActive ? 10 : 8} fontFamily={MONO} fill={isActive ? C.white : C.td} textAnchor="middle" fontWeight={isActive ? 600 : 400}>{isHouston ? "HOUSTON" : port.name.split(/[/ ]/)[0].toUpperCase()}</text>
                  </g>
                );
              })}

              {view === "solar" && SOLAR_ZONES.map((zone, i) => {
                if (!isVisible(zone.lon, zone.lat)) return null;
                const [px, py] = projection([zone.lon, zone.lat]);
                const isActive = (hoveredZone?.name === zone.name) || (selectedZone?.name === zone.name);
                const tempColor = tempToColor(zone.temp);
                const radius = Math.max(8, zone.irradiance / 50);
                return (
                  <g key={i} onMouseEnter={() => setHoveredZone(zone)} onMouseLeave={() => setHoveredZone(null)} onClick={() => setSelectedZone(zone)} style={{ cursor: "pointer" }}>
                    <circle cx={px} cy={py} r={radius * 2.5} fill={tempColor} opacity={0.08} />
                    <circle cx={px} cy={py} r={radius * 1.5} fill={tempColor} opacity={0.15} />
                    <circle cx={px} cy={py} r={isActive ? 6 : 4} fill={tempColor} stroke={isActive ? C.white : "none"} strokeWidth={1} />
                    <circle cx={px} cy={py} r={radius} fill="none" stroke={irradianceToColor(zone.irradiance)} strokeWidth={isActive ? 1.5 : 0.8} strokeDasharray={`${zone.irradiance / 100} 2`} opacity={0.6} />
                    {isActive && <text x={px} y={py - radius - 4} fontSize={9} fontFamily={MONO} fill={C.white} textAnchor="middle" fontWeight={600}>{zone.name.split(",")[0]}</text>}
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {view === "ports" ? (
              <div style={{ display: "flex", gap: 16 }}>{[["BULLISH", C.green], ["NEUTRAL", C.tx], ["BEARISH", C.red], ["ANCHOR", C.amber]].map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 1, background: color }} /><span style={{ fontSize: 9, fontFamily: MONO, color: C.td }}>{label}</span></div>
              ))}</div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 9, fontFamily: MONO, color: C.td }}>TEMP</span><div style={{ width: 120, height: 6, borderRadius: 3, background: "linear-gradient(90deg, #506070, #C0A050, #D49040, #E85020, #CC2200)" }} /><span style={{ fontSize: 9, fontFamily: MONO, color: C.td }}>50°F → 110°F+</span></div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {view === "ports" && active ? (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.td }}>{active.name.toUpperCase()}</span>
                <span style={{ fontSize: 10, fontFamily: MONO, color: C.tf }}>{active.country}</span>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                  <div><div style={{ fontSize: 10, fontFamily: MONO, color: C.td, letterSpacing: 1, marginBottom: 4 }}>{active.type}</div><div style={{ fontSize: 22, fontFamily: MONO, fontWeight: 600, color: C.white }}>{active.throughput}</div></div>
                  <div style={{ padding: "6px 12px", background: `${active.color}15`, border: `1px solid ${active.color}30`, borderRadius: 3, textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontFamily: MONO, color: C.td, letterSpacing: 1, marginBottom: 2 }}>SIGNAL</div>
                    <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: active.color }}>{active.signal}</div>
                  </div>
                </div>
                {[{ label: "INTELLIGENCE", text: active.intel, color: C.green }, { label: "HOUSTON LINK", text: active.houstonLink, color: C.amber }, { label: "DETAILS", text: active.details, color: C.blue }].map((section, i) => (
                  <div key={i} style={{ padding: "8px 10px", background: C.bg, borderRadius: 2, marginBottom: 6 }}>
                    <div style={{ fontSize: 9, fontFamily: MONO, color: section.color, letterSpacing: 1, marginBottom: 3 }}>{section.label}</div>
                    <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.5 }}>{section.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : view === "solar" && (hoveredZone || selectedZone) ? (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
              {(() => {
                const zone = hoveredZone || selectedZone;
                return (
                  <>
                    <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.td }}>{zone.name.toUpperCase()}</span>
                    </div>
                    <div style={{ padding: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                        {[
                          { label: "TEMP", value: `${zone.temp}°F`, color: tempToColor(zone.temp) },
                          { label: "SOLAR", value: `${zone.irradiance} W/m²`, color: irradianceToColor(zone.irradiance) },
                          { label: "CLOUD", value: `${zone.cloud}%`, color: zone.cloud < 30 ? C.green : zone.cloud < 60 ? C.amber : C.red },
                          { label: "WX SCORE", value: zone.score, color: zone.score.startsWith("+") ? C.amber : C.green },
                        ].map((stat, i) => (
                          <div key={i} style={{ padding: "8px 10px", background: C.bg, borderRadius: 2, textAlign: "center" }}>
                            <div style={{ fontSize: 9, fontFamily: MONO, color: C.td, letterSpacing: 1, marginBottom: 4 }}>{stat.label}</div>
                            <div style={{ fontSize: 18, fontFamily: MONO, fontWeight: 600, color: stat.color }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>
                      {zone.regime && (
                        <div style={{ padding: "8px 10px", background: "rgba(212, 146, 42, 0.1)", border: `1px solid ${C.amber}20`, borderRadius: 2, textAlign: "center" }}>
                          <div style={{ fontSize: 9, fontFamily: MONO, color: C.td, letterSpacing: 1, marginBottom: 2 }}>ERCOT REGIME</div>
                          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: C.amber }}>{zone.regime}</div>
                        </div>
                      )}
                      <div style={{ marginTop: 10, padding: "8px 10px", background: C.bg, borderRadius: 2 }}>
                        <div style={{ fontSize: 9, fontFamily: MONO, color: C.amber, letterSpacing: 1, marginBottom: 3 }}>ERCOT IMPACT</div>
                        <div style={{ fontSize: 11, color: C.tx, lineHeight: 1.5 }}>{zone.temp > 95 ? "High load. Solar cliff critical." : "Moderate load. Surp window narrowing."}</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: 2, color: C.td }}>{view === "ports" ? "ROSTER" : "WEATHER STATIONS"}</span>
              </div>
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {(view === "ports" ? PORTS : SOLAR_ZONES).map((item, i) => (
                  <div key={i} onClick={() => view === "ports" ? setSelectedPort(item) : setSelectedZone(item)} onMouseEnter={() => view === "ports" ? setHoveredPort(item) : setHoveredZone(item)} onMouseLeave={() => view === "ports" ? setHoveredPort(null) : setHoveredZone(null)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${C.bg}`, borderLeft: `2px solid ${view === "ports" ? item.color : tempToColor(item.temp)}` }}>
                    <div><div style={{ fontSize: 12, color: C.tx }}>{item.name}</div><div style={{ fontSize: 10, color: C.td }}>{view === "ports" ? item.throughput : `${item.temp}°F`}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{` ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${C.border}} `}</style>
    </div>
  );
}

function topojsonFeature(topology, obj) {
  if (obj.type === "GeometryCollection") return { type: "GeometryCollection", geometries: obj.geometries.map(g => topojsonFeature(topology, g)) };
  const arcs = topology.arcs, transform = topology.transform;
  const decodeArc = (i) => {
    const rev = i < 0, arc = arcs[rev ? ~i : i], coords = [];
    let x = 0, y = 0;
    for (const p of arc) { x += p[0]; y += p[1]; coords.push(transform ? [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]] : [x, y]); }
    if (rev) coords.reverse(); return coords;
  };
  const decodeRing = (r) => { const coords = []; for (const i of r) { const ac = decodeArc(i); coords.push(...(coords.length > 0 ? ac.slice(1) : ac)); } return coords; };
  if (obj.type === "Polygon") return { type: "Polygon", coordinates: obj.arcs.map(decodeRing) };
  if (obj.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: obj.arcs.map(p => p.map(decodeRing)) };
  return obj;
}
