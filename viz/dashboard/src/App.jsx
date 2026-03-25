import { useState, useEffect, useMemo } from "react";
import { C, mono, sans } from "./theme";
import { MiniChart } from "./components/MiniChart";
import { WorldPortsHeatmap } from "./components/WorldPortsHeatmap";
import { Panel, Stat } from "./components/CommonUI";
import { genDayLMP, genWeatherHistory, genWTIHistory, genSCED } from "./utils/dataGenerators";
import { calcScore } from "./utils/scoringEngine";
import WeatherPanel from "./WeatherPanel";

export default function App() {
  const [module, setModule] = useState("ercot");
  const [regime, setRegime] = useState("ramp");
  const [sced, setSCED] = useState(() => genSCED(18, "ramp"));
  const [horizon, setHorizon] = useState(2);
  const [entered, setEntered] = useState(false);
  const [selectedPort, setSelectedPort] = useState(null); // New: Track selected port for Right Panel

  const [dayLMP] = useState(() => genDayLMP("ramp"));
  const [wxHistory] = useState(() => genWeatherHistory());
  const [wtiHistory] = useState(() => genWTIHistory());
  const score = useMemo(() => calcScore(horizon), [horizon]);

  useEffect(() => { setTimeout(() => setEntered(true), 50); }, []);

  // Real-time SCED simulation
  useEffect(() => {
    const iv = setInterval(() => setSCED(p => [...p.slice(-17), genSCED(1, regime)[0]]), 4000);
    return () => clearInterval(iv);
  }, [regime]);

  return (
    <div style={{ fontFamily: sans, background: C.bg, color: C.tx, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ─── TOP NAVIGATION ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", background: C.panel, borderBottom: `1px solid ${C.border}`, opacity: entered ? 1 : 0, transition: "opacity .3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.white, letterSpacing: 1 }}>ORBIT</span>
          {[
            { id: "ercot", label: "ERCOT POWER" },
            { id: "og", label: "O&G PHYSICAL" },
            { id: "ports", label: "GLOBAL PORTS" },
            { id: "solar", label: "SOLAR & WEATHER" },
          ].map(m => (
            <button key={m.id} onClick={() => { setModule(m.id); setSelectedPort(null); }} style={{
              padding: "4px 12px", fontSize: 11, fontFamily: mono, cursor: "pointer",
              background: module === m.id ? `${C.amber}20` : "transparent",
              border: `1px solid ${module === m.id ? C.amber : "transparent"}`,
              color: module === m.id ? C.white : C.td,
              borderRadius: 2, transition: "all .2s",
            }}>{m.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: mono, fontSize: 11 }}>
          <span style={{ color: C.green }}>● LIVE</span>
          <span style={{ color: C.td }}>WX SCORE: <span style={{ color: C.amber }}>{score.composite.toFixed(3)}</span></span>
        </div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 1280, margin: "0 auto", opacity: entered ? 1 : 0, transition: "all .5s" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>

          {/* ─── MAIN WORKSPACE ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(module === "ports" || module === "solar" || module === "og") ? (
              <WorldPortsHeatmap view={module} onSelectPort={setSelectedPort} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                  {/* Your existing ERCOT Regime buttons */}
                  {[{ id: 'solar', label: 'SOLAR', rec: 'BUY', color: C.green }, { id: 'ramp', label: 'RAMP', rec: 'SELL', color: C.amber }, { id: 'stress', label: 'STRESS', rec: 'HOLD', color: C.red }].map(rx => (
                    <Panel key={rx.id} title={rx.label} C={C} style={{ cursor: 'pointer', borderColor: regime === rx.id ? rx.color : C.border }} onClick={() => setRegime(rx.id)}>
                      <div style={{ padding: 14, fontSize: 24, fontFamily: mono, color: C.white }}>{rx.rec}</div>
                    </Panel>
                  ))}
                </div>
                <Panel title="LMP PROFILE" C={C}><MiniChart data={sced} yKey="lmp" color={C.amber} height={180} /></Panel>
              </div>
            )}
          </div>

          {/* ─── RIGHT INFORMATION PANEL ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {module === "solar" || module === "weather" ? (
              <WeatherPanel />
            ) : (
              <Panel title={selectedPort ? selectedPort.name.toUpperCase() : "NETWORK INTELLIGENCE"} C={C}>
                <div style={{ padding: 16, fontSize: 11, color: C.tx, lineHeight: 1.6 }}>
                  {selectedPort ? (
                    <>
                      <div style={{ color: selectedPort.color, fontWeight: 700, marginBottom: 8 }}>{selectedPort.signal} // {selectedPort.type}</div>
                      {selectedPort.intel}
                    </>
                  ) : "Select a global port or asset to view real-time intelligence and Houston nexus analysis."}
                </div>
              </Panel>
            )}
            <Panel title="MARKET BASIS" C={C}>
              <div style={{ padding: 16 }}>
                <Stat label="WTI CRUDE" value={78.37} unit="$/bbl" sub="+1.24" C={C} />
                <MiniChart data={wtiHistory} yKey="wti" color={C.amber} height={80} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}