import React, { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { C, mono } from "../theme";

const PORTS = [
  { id: "houston", name: "Houston Ship Channel", lat: 29.76, lon: -95.36, color: C.amber, signal: "ANCHOR", type: "HUB", intel: "PADD 3 at 92.4% util. Channel congestion +$0.35/bbl." },
  { id: "ras_tanura", name: "Ras Tanura", lat: 26.65, lon: 50.15, color: C.green, signal: "BULLISH", type: "EXPORT", intel: "OPEC+ cuts holding. Saudi signaling no increase until Q4." },
  { id: "rotterdam", name: "Rotterdam", lat: 51.92, lon: 4.48, color: C.red, signal: "BEARISH", type: "TRADING", intel: "EU margins compressing. Diesel demand down 4% YoY." },
];

const Barrel = ({ x, y, color, size = 16 }) => (
  <g transform={`translate(${x - size / 2}, ${y - size * 0.7})`}>
    <ellipse cx={size / 2} cy={size * 0.2} rx={size * 0.4} ry={size * 0.2} fill={color} />
    <rect x={size * 0.1} y={size * 0.2} width={size * 0.8} height={size * 0.8} fill={color} opacity={0.9} />
    <ellipse cx={size / 2} cy={size} rx={size * 0.4} ry={size * 0.2} fill={color} filter="brightness(0.7)" />
  </g>
);

export const WorldPortsHeatmap = ({ view, onSelectPort }) => {
  const [rotation, setRotation] = useState([-95, -25, 0]);
  const [worldData, setWorldData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
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
          }))
        };
        setWorldData(countries);
      });
  }, []);

  const width = 560, height = 500;
  const projection = d3.geoOrthographic().scale(240).translate([width / 2, height / 2]).rotate(rotation).clipAngle(90);
  const pathGen = d3.geoPath().projection(projection);

  const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY, rot: [...rotation] }); };
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setRotation([dragStart.rot[0] - dx * 0.3, Math.max(-80, Math.min(80, dragStart.rot[1] + dy * 0.3)), 0]);
  }, [isDragging, dragStart]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", () => setIsDragging(false));
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, position: "relative" }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontFamily: mono, color: C.td, display: "flex", justifyContent: "space-between" }}>
        <span>{view === 'solar' ? 'THERMAL IRRADIANCE MAP' : 'GLOBAL PORT NETWORK'}</span>
        <span style={{ opacity: 0.5 }}>DRAG TO ROTATE</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: 20, cursor: isDragging ? 'grabbing' : 'grab' }}>
        <svg ref={svgRef} width={width} height={height} onMouseDown={handleMouseDown}>
          <defs>
            <radialGradient id="gs"><stop offset="70%" stopColor="transparent" /><stop offset="100%" stopColor={C.amber} stopOpacity="0.1" /></radialGradient>
          </defs>
          <circle cx={width / 2} cy={height / 2} r={240} fill={C.ocean} />
          {worldData && worldData.features.map((f, i) => (
            <path key={i} d={pathGen(f.geometry)} fill={view === "solar" ? "#0F1626" : C.land} stroke={C.landStroke} strokeWidth={0.5} />
          ))}
          <circle cx={width / 2} cy={height / 2} r={240} fill="url(#gs)" pointerEvents="none" />

          {view !== 'solar' && PORTS.map(p => {
            const [px, py] = projection([p.lon, p.lat]);
            const isVis = d3.geoDistance([-rotation[0], -rotation[1]], [p.lon, p.lat]) < Math.PI / 2;
            if (!isVis) return null;
            return (
              <g key={p.id} onClick={() => onSelectPort(p)} style={{ cursor: "pointer" }}>
                <Barrel x={px} y={py} color={p.color} />
                <text x={px} y={py - 20} fontSize={9} fill={C.white} fontFamily={mono} textAnchor="middle">{p.name.split(' ')[0].toUpperCase()}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

function topojsonFeature(topology, obj) {
  const arcs = topology.arcs, transform = topology.transform;
  const decodeArc = (i) => {
    const rev = i < 0, arc = arcs[rev ? ~i : i], coords = [];
    let x = 0, y = 0;
    for (const p of arc) {
      x += p[0]; y += p[1];
      coords.push(transform ? [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]] : [x, y]);
    }
    if (rev) coords.reverse(); return coords;
  };
  const decodeRing = (r) => { const coords = []; for (const i of r) { const ac = decodeArc(i); coords.push(...(coords.length > 0 ? ac.slice(1) : ac)); } return coords; };
  if (obj.type === "Polygon") return { type: "Polygon", coordinates: obj.arcs.map(decodeRing) };
  if (obj.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: obj.arcs.map(p => p.map(decodeRing)) };
  return obj;
}