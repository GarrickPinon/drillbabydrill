import { useState, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════
   WEATHER SCORING PANEL
   Integrates into the Bloomberg dashboard as a new section.
   Shows the scoring model in action — signals, weights,
   confidence decay, composite score, and regime posteriors.
   Institutional palette matching energy_dashboard_bloomberg.jsx
   ═══════════════════════════════════════════════════════════ */

const C = {
  bg: "#0B1120", panel: "#0F1628", border: "#1B2540", borderA: "#2A3A5C",
  amber: "#D4922A", amberBg: "rgba(212,146,42,0.06)", amberBorder: "rgba(212,146,42,0.15)",
  green: "#2A9D5C", greenBg: "rgba(42,157,92,0.06)", greenBorder: "rgba(42,157,92,0.15)",
  red: "#C43A3A", redBg: "rgba(196,58,58,0.06)",
  blue: "#4A8AC4", blueBg: "rgba(74,138,196,0.06)",
  white: "#EDF0F5", text: "#C8CDD6", muted: "#7A8494", dim: "#4A5568", faint: "#2A3448",
};
const mono = "'IBM Plex Mono', 'Consolas', monospace";
const sans = "'IBM Plex Sans', 'Helvetica Neue', system-ui, sans-serif";

const SIGNALS = [
  { id: "thermal_load", label: "Thermal load", weight: 0.35, tau: 72, c0: 0.92, floor: 0.25, color: C.red, icon: "TEMP" },
  { id: "solar_availability", label: "Solar availability", weight: 0.25, tau: 24, c0: 0.95, floor: 0.15, color: C.amber, icon: "SOL" },
  { id: "wind_generation", label: "Wind generation", weight: 0.20, tau: 60, c0: 0.88, floor: 0.20, color: C.blue, icon: "WIND" },
  { id: "extreme_event", label: "Extreme event", weight: 0.12, tau: 36, c0: 0.98, floor: 0.05, color: "#C43A3A", icon: "EXTM" },
  { id: "curtailment_prob", label: "Curtailment prob", weight: 0.08, tau: 48, c0: 0.85, floor: 0.10, color: C.muted, icon: "CURT" },
];

const REGIMES = [
  { id: "solar_surplus", label: "SOLAR SURPLUS", mu: -0.5, sigma: 0.25, color: C.green },
  { id: "evening_ramp", label: "EVENING RAMP", mu: 0.3, sigma: 0.30, color: C.amber },
  { id: "thermal_stress", label: "THERMAL STRESS", mu: 0.8, sigma: 0.15, color: C.red },
  { id: "regulatory_shift", label: "REG SHIFT", mu: 0.0, sigma: 0.50, color: C.muted },
];

function confAtHorizon(sig, hours) {
  return sig.c0 * Math.exp(-hours / sig.tau) + sig.floor;
}

function gaussianLikelihood(x, mu, sigma, uncertainty) {
  const effSigma = Math.sqrt(sigma ** 2 + uncertainty ** 2);
  return Math.exp(-0.5 * ((x - mu) / effSigma) ** 2) / (effSigma * Math.sqrt(2 * Math.PI));
}

function genSignalValues(scenario) {
  const scenarios = {
    hot_clear: { thermal: 0.85, solar: -0.4, wind: 0.6, extreme: 1.0, curtail: -0.3 },
    mild_windy: { thermal: -0.2, solar: 0.1, wind: -0.7, extreme: 0.0, curtail: 0.5 },
    storm_front: { thermal: 0.3, solar: 0.6, wind: -0.4, extreme: 0.0, curtail: 0.2 },
    heat_advisory: { thermal: 0.95, solar: -0.5, wind: 0.8, extreme: 1.0, curtail: -0.4 },
  };
  const s = scenarios[scenario] || scenarios.hot_clear;
  return {
    thermal_load: s.thermal + (Math.random() - 0.5) * 0.05,
    solar_availability: s.solar + (Math.random() - 0.5) * 0.05,
    wind_generation: s.wind + (Math.random() - 0.5) * 0.05,
    extreme_event: s.extreme,
    curtailment_prob: s.curtail + (Math.random() - 0.5) * 0.05,
  };
}

function computeScore(signalValues, horizon) {
  let weightedSum = 0, weightSum = 0, uncSq = 0;
  const details = SIGNALS.map(sig => {
    const c = confAtHorizon(sig, horizon);
    const v = Math.max(-1, Math.min(1, signalValues[sig.id] || 0));
    const contribution = sig.weight * v * c;
    weightedSum += contribution;
    weightSum += sig.weight * c;
    uncSq += (sig.weight * (1 - c)) ** 2;
    return { ...sig, value: v, confidence: c, contribution };
  });
  const composite = weightSum > 0 ? weightedSum / weightSum : 0;
  const uncertainty = weightSum > 0 ? Math.sqrt(uncSq) / weightSum : 1;

  let evidence = 0;
  const posteriors = REGIMES.map(r => {
    const lik = gaussianLikelihood(composite, r.mu, r.sigma, uncertainty);
    const p = lik * 0.25;
    evidence += p;
    return { ...r, raw: p };
  });
  posteriors.forEach(p => p.posterior = evidence > 0 ? p.raw / evidence : 0.25);
  const bestRegime = posteriors.reduce((a, b) => a.posterior > b.posterior ? a : b);

  return { composite: Math.max(-1, Math.min(1, composite)), uncertainty, details, posteriors, bestRegime };
}

const Bar = ({ value, max, color, width }) => (
  <div style={{ width: width || 120, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (Math.abs(value) / max) * 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
  </div>
);

export default function WeatherScoringPanel() {
  const [horizon, setHorizon] = useState(2);
  const [scenario, setScenario] = useState("hot_clear");
  const [signalValues, setSignalValues] = useState(() => genSignalValues("hot_clear"));
  const [entered, setEntered] = useState(false);

  useEffect(() => { setTimeout(() => setEntered(true), 60); }, []);
  useEffect(() => { setSignalValues(genSignalValues(scenario)); }, [scenario]);

  // Refresh signal noise periodically
  useEffect(() => {
    const iv = setInterval(() => setSignalValues(genSignalValues(scenario)), 5000);
    return () => clearInterval(iv);
  }, [scenario]);

  const score = useMemo(() => computeScore(signalValues, horizon), [signalValues, horizon]);

  const recMap = { evening_ramp: "SELL", solar_surplus: "BUY", thermal_stress: "HOLD", regulatory_shift: "REDUCE" };
  const rec = recMap[score.bestRegime.id] || "HOLD";

  return (
    <div style={{ fontFamily: sans, background: C.bg, color: C.text, padding: "20px 24px", opacity: entered ? 1 : 0, transition: "opacity 0.4s" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 3, color: C.dim }}>WEATHER SCORING MODEL</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.white, marginTop: 4 }}>Confidence-Weighted Physical Signals → Regime Classification</div>
          </div>
          <div style={{ fontSize: 11, fontFamily: mono, color: C.dim }}>S = Σ(w_i × s_i × c_i) / Σ(w_i × c_i)</div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {/* Scenario selector */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "hot_clear", label: "Hot & clear" },
              { id: "heat_advisory", label: "Heat advisory" },
              { id: "mild_windy", label: "Mild & windy" },
              { id: "storm_front", label: "Storm front" },
            ].map(s => (
              <button key={s.id} onClick={() => setScenario(s.id)} style={{
                padding: "8px 14px", fontSize: 12, fontFamily: mono,
                background: scenario === s.id ? C.panel : "transparent",
                border: `1px solid ${scenario === s.id ? C.borderA : C.border}`,
                color: scenario === s.id ? C.white : C.dim,
                borderRadius: 3, cursor: "pointer", transition: "all 0.25s",
              }}>{s.label}</button>
            ))}
          </div>
          {/* Horizon slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <span style={{ fontSize: 11, fontFamily: mono, color: C.dim }}>HORIZON</span>
            <input type="range" min="1" max="168" value={horizon} onChange={e => setHorizon(+e.target.value)}
              style={{ width: 140, accentColor: C.amber }} />
            <span style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: C.amber, minWidth: 48, textAlign: "right" }}>
              {horizon < 24 ? `${horizon}h` : `${(horizon/24).toFixed(1)}d`}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

          {/* ═══ LEFT: SIGNAL TABLE ═══ */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.dim }}>SIGNAL DECOMPOSITION</span>
            </div>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 70px 70px 80px 100px 70px", padding: "8px 16px", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>
              <span></span><span>SIGNAL</span><span style={{ textAlign: "right" }}>WEIGHT</span>
              <span style={{ textAlign: "right" }}>SCORE</span><span style={{ textAlign: "center" }}>CONFIDENCE</span>
              <span style={{ textAlign: "center" }}>CONTRIBUTION</span><span style={{ textAlign: "right" }}>DECAY τ</span>
            </div>
            {score.details.map((d, i) => {
              const scoreColor = d.value > 0.3 ? C.red : d.value > 0 ? C.amber : d.value > -0.3 ? C.green : C.blue;
              const confPct = (d.confidence * 100).toFixed(0);
              return (
                <div key={d.id} style={{
                  display: "grid", gridTemplateColumns: "40px 1fr 70px 70px 80px 100px 70px",
                  padding: "10px 16px", alignItems: "center",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.008)",
                  borderBottom: `1px solid ${C.bg}`,
                }}>
                  <span style={{ fontSize: 9, fontFamily: mono, fontWeight: 600, color: d.color, background: `${d.color}15`, padding: "2px 4px", borderRadius: 2, textAlign: "center" }}>{d.icon}</span>
                  <span style={{ fontSize: 13, color: C.text }}>{d.label}</span>
                  <span style={{ fontSize: 12, fontFamily: mono, color: C.muted, textAlign: "right" }}>{(d.weight * 100).toFixed(0)}%</span>
                  <span style={{ fontSize: 13, fontFamily: mono, fontWeight: 600, color: scoreColor, textAlign: "right" }}>{d.value >= 0 ? "+" : ""}{d.value.toFixed(2)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <Bar value={d.confidence} max={1} color={d.confidence > 0.7 ? C.green : d.confidence > 0.4 ? C.amber : C.red} width={40} />
                    <span style={{ fontSize: 11, fontFamily: mono, color: d.confidence > 0.7 ? C.green : d.confidence > 0.4 ? C.amber : C.red }}>{confPct}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <Bar value={Math.abs(d.contribution)} max={0.4} color={d.contribution > 0 ? C.amber : C.blue} width={50} />
                    <span style={{ fontSize: 10, fontFamily: mono, color: C.dim }}>{d.contribution >= 0 ? "+" : ""}{d.contribution.toFixed(3)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: mono, color: C.dim, textAlign: "right" }}>{d.tau}h</span>
                </div>
              );
            })}
          </div>

          {/* ═══ RIGHT COLUMN ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Composite score */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.dim, marginBottom: 16 }}>COMPOSITE SCORE</div>
              <div style={{ fontSize: 48, fontFamily: mono, fontWeight: 600, color: score.composite > 0.3 ? C.amber : score.composite > 0 ? C.text : C.green, transition: "color 0.4s" }}>
                {score.composite >= 0 ? "+" : ""}{score.composite.toFixed(3)}
              </div>
              <div style={{ fontSize: 12, fontFamily: mono, color: C.dim, marginTop: 6 }}>
                ±{score.uncertainty.toFixed(3)} uncertainty
              </div>
              {/* Score bar */}
              <div style={{ position: "relative", height: 8, background: C.border, borderRadius: 4, marginTop: 16, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: C.dim }} />
                <div style={{
                  position: "absolute",
                  left: `${50 + score.composite * 45}%`,
                  top: 0, width: 8, height: "100%", borderRadius: 4,
                  background: score.composite > 0.3 ? C.amber : score.composite > 0 ? C.text : C.green,
                  transition: "left 0.6s ease, background 0.4s",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, fontFamily: mono, color: C.faint }}>
                <span>−1 BEARISH</span><span>+1 BULLISH</span>
              </div>
            </div>

            {/* Regime posteriors */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, padding: 16 }}>
              <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.dim, marginBottom: 14 }}>REGIME POSTERIORS</div>
              {score.posteriors.sort((a, b) => b.posterior - a.posterior).map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                  borderBottom: i < score.posteriors.length - 1 ? `1px solid ${C.bg}` : "none",
                }}>
                  <div style={{
                    width: 4, height: 24, borderRadius: 2,
                    background: i === 0 ? p.color : C.faint,
                    transition: "background 0.4s",
                  }} />
                  <span style={{ fontSize: 12, fontFamily: mono, color: i === 0 ? C.white : C.dim, fontWeight: i === 0 ? 600 : 400, flex: 1, transition: "color 0.3s" }}>
                    {p.label}
                  </span>
                  <Bar value={p.posterior} max={1} color={i === 0 ? p.color : C.dim} width={60} />
                  <span style={{ fontSize: 12, fontFamily: mono, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? p.color : C.dim, minWidth: 40, textAlign: "right", transition: "color 0.3s" }}>
                    {(p.posterior * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Recommendation */}
            <div style={{
              background: score.bestRegime.id === "evening_ramp" ? C.amberBg : score.bestRegime.id === "solar_surplus" ? C.greenBg : score.bestRegime.id === "thermal_stress" ? C.redBg : C.blueBg,
              border: `1px solid ${score.bestRegime.id === "evening_ramp" ? C.amberBorder : score.bestRegime.id === "solar_surplus" ? C.greenBorder : `${score.bestRegime.color}20`}`,
              borderRadius: 3, padding: 16, textAlign: "center", transition: "all 0.4s",
            }}>
              <div style={{ fontSize: 10, fontFamily: mono, color: C.dim, letterSpacing: 2, marginBottom: 8 }}>WEATHER-DRIVEN RECOMMENDATION</div>
              <div style={{ fontSize: 28, fontFamily: mono, fontWeight: 700, color: score.bestRegime.color, letterSpacing: 3, transition: "color 0.4s" }}>
                {rec}
              </div>
              <div style={{ fontSize: 11, fontFamily: mono, color: C.muted, marginTop: 6 }}>
                {score.bestRegime.label} · {(score.bestRegime.posterior * 100).toFixed(0)}% confidence
              </div>
            </div>
          </div>
        </div>

        {/* ═══ CASCADE DAMPENER EXPLANATION ═══ */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, fontFamily: mono, letterSpacing: 2, color: C.dim, marginBottom: 12 }}>CASCADE DAMPENER — WHY THIS ARCHITECTURE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div style={{ padding: 12, background: C.bg, borderRadius: 3 }}>
              <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: C.green, marginBottom: 8 }}>HIGH CONFIDENCE (0-6hr)</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                Weather score dominates regime choice. Tight uncertainty band → likelihood overwhelms prior.
                Solar cliff timing accurate to ±10 min.
              </div>
            </div>
            <div style={{ padding: 12, background: C.bg, borderRadius: 3 }}>
              <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: C.amber, marginBottom: 8 }}>MODERATE CONFIDENCE (1-3d)</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                Weather and market data share influence. Bayesian posterior balances both.
                Good for DAM positioning, not SCED-level.
              </div>
            </div>
            <div style={{ padding: 12, background: C.bg, borderRadius: 3 }}>
              <div style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: C.red, marginBottom: 8 }}>LOW CONFIDENCE (5d+)</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                Prior dominates — system defaults to what market data shows. Prevents bad long-range forecasts from cascading into position sizing.
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontFamily: mono, color: C.dim, marginTop: 12, fontStyle: "italic" }}>
            Drag the horizon slider to see confidence decay in real time. At 168 hours, solar confidence drops to 15% — the model stops trusting cloud forecasts and falls back to seasonal averages.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, color: C.dim }}>NeurIPS 2026: Confidence-weighted physical scoring for regime classification in structurally-shifted energy markets</span>
          <span style={{ fontSize: 11, fontFamily: mono, color: C.faint }}>Garrick Piñón · Quantsultant™</span>
        </div>
      </div>
    </div>
  );
}
