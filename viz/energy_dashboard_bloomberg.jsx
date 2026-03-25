import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   BRAND: "Enterprise-Grade Physical Infrastructure Optimization"
   
   Aesthetic: Bloomberg Terminal meets SCADA control room
   Palette: Deep navy + slate + high-contrast white data
   Functional colors: Amber (warning), Green (margin), Crimson (penalty)
   Fonts: IBM Plex Sans (labels) + IBM Plex Mono (ALL numbers)
   Data density: institutional — information > whitespace
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#0B1120",
  panel: "#0F1628",
  panelHover: "#131C33",
  border: "#1B2540",
  borderActive: "#2A3A5C",
  navy: "#1E3A5F",
  navyLight: "#2A4E7A",

  amber: "#D4922A",
  amberDim: "#8A6A2A",
  amberBg: "rgba(212,146,42,0.06)",
  amberBorder: "rgba(212,146,42,0.15)",

  green: "#2A9D5C",
  greenDim: "#1A6B3A",
  greenBg: "rgba(42,157,92,0.06)",
  greenBorder: "rgba(42,157,92,0.15)",

  red: "#C43A3A",
  redDim: "#7A2828",
  redBg: "rgba(196,58,58,0.06)",
  redBorder: "rgba(196,58,58,0.15)",

  blue: "#4A8AC4",
  blueDim: "#2A5A8A",

  white: "#EDF0F5",
  textPrimary: "#C8CDD6",
  textSecondary: "#7A8494",
  textTertiary: "#4A5568",
  textFaint: "#2A3448",
};

const REGIMES = [
  { id: "solar", label: "SOLAR SURPLUS", rec: "BUY", recColor: C.green, recBg: C.greenBg, recBorder: C.greenBorder, status: "ACCUMULATE", tagline: "Grid oversupplied — lowest cost basis available", params: { volatility: "LOW", spread: "$8–22", position: "CHARGE", risk: "MINIMAL" } },
  { id: "ramp", label: "EVENING RAMP", rec: "SELL", recColor: C.amber, recBg: C.amberBg, recBorder: C.amberBorder, status: "DEPLOY", tagline: "Solar cliff confirmed — discharge window open", params: { volatility: "HIGH", spread: "$120–340", position: "DISCHARGE", risk: "MODERATE" } },
  { id: "stress", label: "THERMAL STRESS", rec: "HOLD", recColor: C.red, recBg: C.redBg, recBorder: C.redBorder, status: "DEFENSIVE", tagline: "Extreme grid conditions — preserve state of charge", params: { volatility: "EXTREME", spread: "$400+", position: "HEDGE", risk: "MAXIMUM" } },
  { id: "shift", label: "REG SHIFT", rec: "REDUCE", recColor: C.textSecondary, recBg: "rgba(122,132,148,0.06)", recBorder: "rgba(122,132,148,0.12)", status: "DE-RISK", tagline: "Policy signal detected — flatten exposure", params: { volatility: "UNCERTAIN", spread: "COMPRESSED", position: "FLATTEN", risk: "ELEVATED" } },
];

const genFlow = (n, regime) => {
  const profiles = { solar: { base: 22, vol: 14 }, ramp: { base: 195, vol: 150 }, stress: { base: 650, vol: 500 }, shift: { base: 48, vol: 35 } };
  const p = profiles[regime] || profiles.ramp;
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(now - (n - i) * 300000);
    const lmp = Math.max(-30, p.base + (Math.random() - 0.45) * p.vol);
    const as = Math.max(0, lmp * 0.25 + Math.random() * 50);
    const soc = +(35 + Math.random() * 55).toFixed(0);
    return {
      time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
      lmp: +lmp.toFixed(2), as: +as.toFixed(2), soc,
      node: ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST"][i % 4],
      dispatch: Math.random() > 0.6,
    };
  });
};

const PIPELINE = [
  { t: "17:05", src: "INTEL", msg: "Elevated urgency in ERCOT notice #4821 — sentiment drift index triggered", conf: 87 },
  { t: "17:10", src: "STRAT", msg: "Bayesian classifier: EVENING RAMP confirmed — 92% posterior", conf: 92 },
  { t: "17:10", src: "BRIDGE", msg: "Jacobian push: max_position=12MW  spread_threshold=$45/MWh", conf: null },
  { t: "17:15", src: "EXEC", msg: "DISCHARGED 8.5MW @ HB_HOUSTON — LMP $247.30/MWh [FILLED]", conf: null },
  { t: "17:15", src: "EXEC", msg: "RRS OFFERED 3.5MW — MCPC $78.20/MW [AWARDED]", conf: null },
  { t: "17:20", src: "INTEL", msg: "Weather NLP: cloud cover clearing W of Katy — solar cliff timing confirmed", conf: 94 },
  { t: "17:25", src: "EXEC", msg: "DISCHARGED 4MW @ $312.50/MWh — cumulative spread $189.40", conf: null },
  { t: "17:30", src: "STRAT", msg: "Monte Carlo: P(spike>$500) = 0.12 — HOLD remaining position", conf: 88 },
];

const srcStyle = {
  INTEL: { color: C.green, bg: C.greenBg },
  STRAT: { color: C.blue, bg: "rgba(74,138,196,0.08)" },
  BRIDGE: { color: C.amber, bg: C.amberBg },
  EXEC: { color: C.white, bg: "rgba(237,240,245,0.04)" },
};

const mono = "'IBM Plex Mono', 'Consolas', monospace";
const sans = "'IBM Plex Sans', 'Helvetica Neue', system-ui, sans-serif";

export default function Dashboard() {
  const [regime, setRegime] = useState("ramp");
  const [flow, setFlow] = useState(() => genFlow(24, "ramp"));
  const [pipeVis, setPipeVis] = useState([]);
  const [entered, setEntered] = useState(false);
  const r = REGIMES.find(x => x.id === regime);

  useEffect(() => { setTimeout(() => setEntered(true), 60); }, []);

  useEffect(() => {
    setFlow(genFlow(24, regime));
    setPipeVis([]);
    PIPELINE.forEach((_, i) => setTimeout(() => setPipeVis(p => [...p, i]), 150 + i * 140));
  }, [regime]);

  useEffect(() => {
    const iv = setInterval(() => setFlow(prev => [...prev.slice(-23), genFlow(1, regime)[0]]), 3500);
    return () => clearInterval(iv);
  }, [regime]);

  const lmpColor = (v) => v > 300 ? C.red : v > 80 ? C.amber : v < 0 ? C.blue : C.green;

  return (
    <div style={{ fontFamily: sans, background: C.bg, color: C.textPrimary, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ═══ TOP BAR ═══ */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 24px", background: C.panel, borderBottom: `1px solid ${C.border}`,
        opacity: entered ? 1 : 0, transition: "opacity 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.white, letterSpacing: 0.5 }}>EIA</span>
          <span style={{ fontSize: 11, color: C.textTertiary }}>|</span>
          <span style={{ fontSize: 12, color: C.textSecondary }}>Energy Intelligence Arbitrage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: mono, fontSize: 12 }}>
          <span style={{ color: C.textTertiary }}>ERCOT RTC+B</span>
          <span style={{ color: C.textTertiary }}>·</span>
          <span style={{ color: C.textTertiary }}>SCED 5-MIN</span>
          <span style={{ color: C.textTertiary }}>·</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2.5s ease-in-out infinite" }} />
            <span style={{ color: C.green }}>CONNECTED</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ═══ HERO STRIP ═══ */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
          opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(8px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 3, color: C.amber, marginBottom: 8 }}>
              HOUSTON IS THE ENERGY CAPITAL OF THE WORLD
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 52, fontWeight: 300, color: C.white, fontFamily: mono, letterSpacing: -2 }}>57</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: C.amber, fontFamily: mono }}>ns</span>
              <span style={{ fontSize: 14, color: C.textTertiary, marginLeft: 12 }}>decision latency — ERCOT nodal execution</span>
            </div>
          </div>
          {/* Live market summary */}
          <div style={{ display: "flex", gap: 28, fontFamily: mono, fontSize: 13 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textTertiary, marginBottom: 4, letterSpacing: 1 }}>AVG LMP</div>
              <div style={{ fontWeight: 600, color: lmpColor(flow[flow.length-1]?.lmp || 0) }}>${(flow.reduce((a,b) => a + b.lmp, 0) / flow.length).toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textTertiary, marginBottom: 4, letterSpacing: 1 }}>FLEET SoC</div>
              <div style={{ fontWeight: 600, color: C.textPrimary }}>{(flow.reduce((a,b) => a + b.soc, 0) / flow.length).toFixed(0)}%</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textTertiary, marginBottom: 4, letterSpacing: 1 }}>INTERVALS</div>
              <div style={{ fontWeight: 600, color: C.textPrimary }}>{flow.length}</div>
            </div>
          </div>
        </div>

        {/* ═══ REGIME SELECTOR + RECOMMENDATION ═══ */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 16,
          opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(8px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1) 0.08s",
        }}>
          {/* Regime tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {REGIMES.map(rx => (
              <button key={rx.id} onClick={() => setRegime(rx.id)} style={{
                flex: 1, padding: "14px 12px", textAlign: "left",
                background: regime === rx.id ? C.panelHover : C.panel,
                border: `1px solid ${regime === rx.id ? C.borderActive : C.border}`,
                borderRadius: 3, transition: "all 0.3s ease",
                position: "relative", overflow: "hidden", fontFamily: sans,
              }}>
                {regime === rx.id && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: rx.recColor, transition: "background 0.3s" }} />}
                <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: regime === rx.id ? rx.recColor : C.textTertiary, letterSpacing: 1, marginBottom: 4, transition: "color 0.3s" }}>
                  {rx.label}
                </div>
                <div style={{ fontSize: 12, color: regime === rx.id ? C.textSecondary : C.textTertiary, transition: "color 0.3s", lineHeight: 1.35 }}>
                  {rx.tagline}
                </div>
              </button>
            ))}
          </div>

          {/* BIG recommendation */}
          <div style={{
            background: r.recBg, border: `1px solid ${r.recBorder}`, borderRadius: 3,
            padding: "14px 20px", display: "flex", flexDirection: "column", justifyContent: "center",
            transition: "all 0.3s ease",
          }}>
            <div style={{ fontSize: 11, fontFamily: mono, color: C.textTertiary, letterSpacing: 2, marginBottom: 8 }}>RECOMMENDATION</div>
            <div style={{ fontSize: 36, fontFamily: mono, fontWeight: 700, color: r.recColor, letterSpacing: 3, transition: "color 0.3s", marginBottom: 4 }}>
              {r.rec}
            </div>
            <div style={{ fontSize: 12, fontFamily: mono, color: C.textSecondary }}>{r.status}</div>
          </div>
        </div>

        {/* ═══ MAIN DATA GRID ═══ */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, marginBottom: 16,
          opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(8px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1) 0.16s",
        }}>

          {/* SCED FLOW TABLE */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.textTertiary }}>SCED FLOW — 5 MIN INTERVALS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, animation: "pulse 2.5s infinite" }} />
                <span style={{ fontSize: 10, fontFamily: mono, color: C.green }}>LIVE</span>
              </div>
            </div>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "56px 100px 80px 80px 1fr 90px", padding: "8px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10, color: C.textTertiary, letterSpacing: 0.5 }}>
              <span>TIME</span><span>NODE</span><span style={{ textAlign: "right" }}>LMP</span><span style={{ textAlign: "right" }}>AS</span><span style={{ paddingLeft: 16 }}>SoC</span><span style={{ textAlign: "right" }}>STATUS</span>
            </div>
            {/* Data rows */}
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {flow.map((d, i) => (
                <div key={`${d.time}-${i}`} style={{
                  display: "grid", gridTemplateColumns: "56px 100px 80px 80px 1fr 90px",
                  padding: "7px 16px", alignItems: "center",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)",
                  borderBottom: `1px solid ${C.bg}`,
                  opacity: 0.5 + (i / flow.length) * 0.5,
                  transition: "opacity 0.5s",
                }}>
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.textTertiary }}>{d.time}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.textSecondary }}>{d.node}</span>
                  <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: lmpColor(d.lmp), textAlign: "right" }}>
                    {d.lmp < 0 ? "−" : ""}${Math.abs(d.lmp).toFixed(2)}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: C.textTertiary, textAlign: "right" }}>${d.as.toFixed(0)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16 }}>
                    <div style={{ width: 80, height: 4, background: C.border, borderRadius: 1, overflow: "hidden" }}>
                      <div style={{ width: `${d.soc}%`, height: "100%", borderRadius: 1, background: d.soc > 60 ? C.green : d.soc > 30 ? C.amber : C.red, transition: "width 0.6s ease, background 0.3s" }} />
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.textTertiary, minWidth: 28 }}>{d.soc}%</span>
                  </div>
                  <span style={{
                    fontFamily: mono, fontSize: 10, fontWeight: 600, textAlign: "right",
                    color: d.dispatch ? C.green : C.textTertiary,
                  }}>
                    {d.dispatch ? "DISPATCHED" : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: Matrix + Params */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* PAYOFF MATRIX */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.textTertiary }}>DECISION MATRIX — $/MWh</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr" }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }} />
                <div style={{ padding: 12, fontSize: 11, fontFamily: mono, color: C.textTertiary, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>SURPLUS</div>
                <div style={{ padding: 12, fontSize: 11, fontFamily: mono, color: C.textTertiary, textAlign: "center", borderBottom: `1px solid ${C.border}` }}>SCARCITY</div>

                <div style={{ padding: "14px 12px", fontSize: 12, fontFamily: mono, color: C.textSecondary, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>CHARGE</div>
                <div style={{ padding: 14, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, background: C.greenBg }}>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: C.green }}>+$12</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>0.01% deg</div>
                </div>
                <div style={{ padding: 14, textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: C.red }}>−$5</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>0.02% deg</div>
                </div>

                <div style={{ padding: "14px 12px", fontSize: 12, fontFamily: mono, color: C.textSecondary, borderRight: `1px solid ${C.border}` }}>DISCHARGE</div>
                <div style={{ padding: 14, textAlign: "center", borderRight: `1px solid ${C.border}` }}>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: C.textTertiary }}>+$3</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>0.005% deg</div>
                </div>
                <div style={{ padding: 14, textAlign: "center", background: C.amberBg }}>
                  <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: C.amber }}>+$120</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>0.01% deg</div>
                </div>
              </div>
            </div>

            {/* REGIME PARAMS */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.textTertiary, marginBottom: 14 }}>REGIME PARAMETERS</div>
              {Object.entries(r.params).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.bg}` }}>
                  <span style={{ fontSize: 12, fontFamily: mono, color: C.textTertiary, textTransform: "uppercase", letterSpacing: 1 }}>{k}</span>
                  <span style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: C.textPrimary }}>{v}</span>
                </div>
              ))}
            </div>

            {/* PHYSICAL ALPHA COMPACT */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.textTertiary, marginBottom: 14 }}>PHYSICAL ALPHA — COUNTERFACTUAL</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: "12px", background: C.bg, borderRadius: 2 }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.textTertiary, letterSpacing: 1, marginBottom: 8 }}>GBM BASELINE</div>
                  <div style={{ fontSize: 22, fontFamily: mono, fontWeight: 500, color: C.textTertiary }}>$118</div>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.textTertiary, marginTop: 4 }}>6hr hold · 0.18% deg</div>
                </div>
                <div style={{ padding: "12px", background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 2 }}>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.amber, letterSpacing: 1, marginBottom: 8 }}>PHYSICS MODEL</div>
                  <div style={{ fontSize: 22, fontFamily: mono, fontWeight: 700, color: C.white }}>$238</div>
                  <div style={{ fontSize: 10, fontFamily: mono, color: C.textSecondary, marginTop: 4 }}>2.5hr hold · 0.04% deg</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontFamily: mono, color: C.green, marginTop: 10, textAlign: "center", fontWeight: 600 }}>
                +102% ALPHA — PHYSICS CONSTRAINT ADVANTAGE
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SIGNAL PIPELINE ═══ */}
        <div style={{
          background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden", marginBottom: 16,
          opacity: entered ? 1 : 0, transform: entered ? "none" : "translateY(8px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1) 0.24s",
        }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.textTertiary }}>SIGNAL PIPELINE — INTEL → BRIDGE → EXECUTION</span>
            <span style={{ fontSize: 10, fontFamily: mono, color: C.textTertiary }}>{pipeVis.length}/{PIPELINE.length} EVENTS</span>
          </div>
          {PIPELINE.map((p, i) => {
            const s = srcStyle[p.src] || srcStyle.INTEL;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px",
                borderBottom: i < PIPELINE.length - 1 ? `1px solid ${C.bg}` : "none",
                opacity: pipeVis.includes(i) ? 1 : 0,
                transform: pipeVis.includes(i) ? "none" : "translateX(-4px)",
                transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
              }}>
                <span style={{ fontSize: 12, fontFamily: mono, color: C.textTertiary, width: 44, flexShrink: 0 }}>{p.t}</span>
                <span style={{
                  fontSize: 10, fontFamily: mono, fontWeight: 600, padding: "2px 8px", borderRadius: 2,
                  background: s.bg, color: s.color, letterSpacing: 1, flexShrink: 0,
                }}>{p.src}</span>
                <span style={{ fontSize: 13, color: C.textPrimary, lineHeight: 1.45, flex: 1 }}>{p.msg}</span>
                {p.conf && (
                  <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: p.conf > 90 ? C.green : C.amber, flexShrink: 0 }}>
                    {p.conf}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 0", borderTop: `1px solid ${C.border}`,
          opacity: entered ? 1 : 0, transition: "opacity 0.5s ease 0.5s",
        }}>
          <div style={{ fontSize: 12, color: C.textSecondary }}>
            <span style={{ fontWeight: 600, color: C.textPrimary }}>Garrick Piñón</span>
            <span style={{ color: C.textTertiary }}> · Quantsultant™ · H-Town Roundup 2026</span>
          </div>
          <div style={{ fontSize: 10, fontFamily: mono, color: C.textTertiary }}>
            57ns CORE · BAYESIAN REGIME · NLP INTEL · ERCOT RTC+B
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>
    </div>
  );
}
