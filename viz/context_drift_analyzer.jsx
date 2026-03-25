import { useState } from "react";

const assumptions = [
  {
    id: "price_caps",
    param: "Price cap regime",
    equities: "$∞ (no hard cap in equities)",
    ercot: "DA: $5,000/MWh (DASWCAP)\nRT: $2,000/MWh (RTSWCAP)\nSystem lambda capped at VOLL ($5,000)",
    drift: "critical",
    impact: "Your return distribution has a hard ceiling. In equities, a 10σ move is theoretically unbounded. In ERCOT, the maximum single-interval gain is capped at $5,000/MWh. Your MCMC's tail distribution must be truncated — any simulation path that assumes unbounded upside is generating phantom returns that physically cannot occur.",
    fix: "Replace unbounded return distribution with a censored distribution. Use a truncated Cauchy or bounded Pareto with VOLL as the upper bound. Re-run MCMC with ceiling at $5,000/MWh DA and $2,000/MWh RT."
  },
  {
    id: "settlement",
    param: "Settlement frequency",
    equities: "Continuous (sub-second fills)",
    ercot: "SCED every 5 min, SPP every 15 min\nDAM settles hourly\nAS co-optimized every 5 min",
    drift: "critical",
    impact: "Your 57ns engine's speed advantage is irrelevant to P&L in a 5-minute settlement market. You cannot trade 'between' SCED runs — there is no continuous order book. The 57ns matters only if you're competing with other automated systems to submit optimal bids before each SCED deadline. Your MCMC needs to model returns at 5-min/15-min intervals, not tick-by-tick.",
    fix: "Resample all return series to 5-minute intervals (SCED granularity). Model the decision as 'optimal bid submission' not 'optimal execution timing'. The edge is forecast accuracy within each 5-min window, not speed between windows."
  },
  {
    id: "fill_rate",
    param: "Fill rate / execution certainty",
    equities: "~99%+ for marketable orders",
    ercot: "SCED dispatches based on merit order — your offer may not clear. Batteries face SoC constraints that ERCOT now models. If SoC is too low for AS qualification, you get nothing.",
    drift: "critical",
    impact: "In equities, if you send a market order, you get filled. In ERCOT, you submit offers and SCED decides whether to dispatch you. Your MCMC likely assumes near-certain execution. In reality, a battery with 30% SoC may fail to qualify for RRS even if the price is attractive. Fill rate could be 40-70% depending on node and conditions.",
    fix: "Add a stochastic fill probability layer to your MCMC. Model P(dispatch | offer, SoC, congestion) as a Bernoulli variable conditioned on grid state. Use the 60-day SCED disclosure data to calibrate fill rates by node."
  },
  {
    id: "vol_structure",
    param: "Volatility structure",
    equities: "Mean-reverting intraday, trending multi-day. Your OU process handles this.",
    ercot: "Bi-modal: near-zero vol during solar surplus (mid-day), extreme spikes at solar cliff (HE17-21) and thermal stress events. Not Gaussian. Not even fat-tailed Gaussian.",
    drift: "high",
    impact: "ERCOT LMP volatility has shifted structurally. The peak price period has moved from HE16-18 to HE19-21 due to solar penetration. Post-RTC+B, AS prices tripled on Day 1 (non-spin went $25→$78 under identical grid conditions). Your OU parameters need separate calibration per time-of-day regime, not a single σ.",
    fix: "Replace single OU process with a regime-switching model: at minimum 4 regimes (overnight baseload, solar surplus, evening ramp, scarcity event). Calibrate each regime's OU parameters independently. Use ERCOT historical LMP data segmented by hour-ending."
  },
  {
    id: "correlation",
    param: "Asset correlation structure",
    equities: "Cross-asset correlations are financial (SPX vs individual stocks, sector rotation).",
    ercot: "Correlations are PHYSICAL. Solar output → LMP is driven by weather. Wind output → LMP is driven by different weather. Gas price → thermal offer stack. Temperature → load. These are causal, not statistical.",
    drift: "high",
    impact: "Your MCMC likely models correlations from a covariance matrix estimated on historical returns. In energy, the correlations are non-stationary and driven by observable physical variables. A correlation estimated in January (heating season, low solar, high gas demand) will be wrong in July (cooling season, high solar, different gas dynamics). The correlation matrix itself is a function of season, time-of-day, and weather state.",
    fix: "Replace static correlation matrix with a conditional copula model where copula parameters are functions of: (1) season, (2) hour-ending, (3) temperature forecast, (4) solar/wind forecast. Or use a factor model where the factors are physical: solar_output, wind_output, temperature, gas_price."
  },
  {
    id: "dart_spread",
    param: "DA-RT spread behavior",
    equities: "N/A (single continuous market)",
    ercot: "Post-RTC+B: virtual AS in DAM creates new convergence dynamics. DA AS now financially binding only. RT AS is the 'real' market. Spread behavior has no pre-Dec-5 history to calibrate against.",
    drift: "critical",
    impact: "This is your biggest data gap. The DART spread was a major revenue source pre-RTC+B, but the entire mechanism has changed. Virtual AS participation in DAM is expected to compress DART spreads over time. Your MCMC cannot use pre-Dec-5 spread distributions — they are from a dead market design.",
    fix: "For the first 6 months post-RTC+B, you must build spread models from first principles using the ASDC curves and co-optimization logic, not from historical calibration. Use the Enverus case studies (Swap the Reg, Solar Cliff, Mid-Day Soak) as scenario templates. After Q2 2026, you'll have enough post-RTC+B data to start empirical calibration."
  },
  {
    id: "transaction_costs",
    param: "Transaction cost model",
    equities: "Commission + spread + market impact. Well-understood.",
    ercot: "QSE fees + ERCOT admin charges + credit/collateral costs + set-point deviation penalties (>3% or >3MW = financial penalty) + UFE allocation + congestion rent redistribution",
    drift: "high",
    impact: "ERCOT's fee structure is fundamentally different from equities. The set-point deviation penalty alone can eat an entire trade's profit if your battery doesn't deliver exactly what SCED instructed. Collateral requirements changed with RTC+B to cover virtual AS activity. These costs are path-dependent (depends on what you were dispatched for) not just size-dependent.",
    fix: "Build an ERCOT-specific cost model from the Nodal Protocols. Key components: ERCOT system admin fee (~$0.555/MWh), QSE fees, credit requirement (varies by activity), deviation charges (XO, XU, YO, YU variables from NP6-653-M post-RTC+B). Factor in that some costs only materialize on dispatch, not on offer submission."
  },
  {
    id: "liquidity",
    param: "Market liquidity",
    equities: "Deep, continuous, multi-venue. You can always exit.",
    ercot: "No secondary market for real-time positions. Once dispatched by SCED, you deliver or face penalties. DAM has some bilateral trading but nothing like equities depth. CRR auctions provide some hedging but are monthly/annual.",
    drift: "high",
    impact: "In equities, if your model is wrong, you close the position and take a small loss. In ERCOT, if you've committed to a day-ahead AS obligation and conditions change, you either perform or pay penalties. There is no 'stop loss' equivalent. Your MCMC's drawdown model needs to account for the inability to exit positions cleanly.",
    fix: "Model positions as commitment contracts, not fungible assets. Add a 'performance obligation' constraint to the MCMC: once dispatched, the path must include delivery or penalty cost. Maximum drawdown calculations should include worst-case penalty scenarios, not just adverse price moves."
  }
];

const driftColors = {
  critical: { bg: "#2a0e0e", border: "#8b2020", text: "#ff6b6b", label: "Critical drift" },
  high: { bg: "#2a1a0e", border: "#8b5e20", text: "#ffaa6b", label: "High drift" }
};

export default function ContextDriftAnalyzer() {
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? assumptions : assumptions.filter(a => a.drift === filter);
  const critCount = assumptions.filter(a => a.drift === "critical").length;
  const highCount = assumptions.filter(a => a.drift === "high").length;

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
      background: "#0a0a0a",
      color: "#e0e0e0",
      minHeight: "100vh",
      padding: "2rem 1.5rem"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#666", textTransform: "uppercase", marginBottom: 8 }}>
            MCMC Context Drift Analysis
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.3 }}>
            Equities → ERCOT RTC+B: Parameter Audit
          </h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 8, lineHeight: 1.6 }}>
            {critCount} critical drifts · {highCount} high drifts · {assumptions.length} parameters audited
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {["all", "critical", "high"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontFamily: "inherit",
                background: filter === f ? "#222" : "transparent",
                color: filter === f ? "#fff" : "#666",
                border: `1px solid ${filter === f ? "#444" : "#222"}`,
                borderRadius: 4,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: 1
              }}
            >
              {f === "all" ? `All (${assumptions.length})` : f === "critical" ? `Critical (${critCount})` : `High (${highCount})`}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((a, i) => {
            const c = driftColors[a.drift];
            const isOpen = expanded === a.id;
            return (
              <div
                key={a.id}
                style={{
                  background: isOpen ? c.bg : "#111",
                  border: `1px solid ${isOpen ? c.border : "#1a1a1a"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                  transition: "all 0.2s ease"
                }}
              >
                <div
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  style={{
                    padding: "14px 16px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 3,
                        background: c.border + "33",
                        color: c.text,
                        fontWeight: 600,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap"
                      }}>
                        {c.label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>
                        {a.param}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#666", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>Equities: {a.equities.split("\n")[0].substring(0, 40)}{a.equities.length > 40 ? "…" : ""}</span>
                    </div>
                  </div>
                  <span style={{ color: "#444", fontSize: 16, flexShrink: 0 }}>
                    {isOpen ? "−" : "+"}
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: "0 16px 16px" }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 16
                    }}>
                      <div style={{ background: "#0a1a0a", border: "1px solid #1a2a1a", borderRadius: 4, padding: 12 }}>
                        <div style={{ fontSize: 10, color: "#4a8a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                          Equities assumption
                        </div>
                        <div style={{ fontSize: 12, color: "#8aba8a", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                          {a.equities}
                        </div>
                      </div>
                      <div style={{ background: "#1a0a0a", border: "1px solid #2a1a1a", borderRadius: 4, padding: 12 }}>
                        <div style={{ fontSize: 10, color: "#8a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                          ERCOT RTC+B reality
                        </div>
                        <div style={{ fontSize: 12, color: "#ba8a8a", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                          {a.ercot}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: "#111", borderRadius: 4, padding: 12, marginBottom: 12, borderLeft: `3px solid ${c.border}` }}>
                      <div style={{ fontSize: 10, color: c.text, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                        Impact on your MCMC
                      </div>
                      <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.7 }}>
                        {a.impact}
                      </div>
                    </div>

                    <div style={{ background: "#0a0f1a", borderRadius: 4, padding: 12, borderLeft: "3px solid #2050aa" }}>
                      <div style={{ fontSize: 10, color: "#6090dd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                        Recommended fix
                      </div>
                      <div style={{ fontSize: 12, color: "#aac", lineHeight: 1.7 }}>
                        {a.fix}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: "2rem",
          padding: "16px",
          background: "#0a0a1a",
          border: "1px solid #1a1a3a",
          borderRadius: 6
        }}>
          <div style={{ fontSize: 10, color: "#6060aa", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
            Bottom line
          </div>
          <p style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7, margin: 0 }}>
            Of the 8 parameters audited, 4 are critical drifts that would materially change your MCMC output.
            The most dangerous is the DART spread assumption — there is literally no historical data for the
            post-RTC+B regime to calibrate against. The second most dangerous is the fill rate model —
            equities fill rates near 100% do not translate to a dispatch-based market where SCED decides
            whether you get to play. Re-running your 1M MCMC with these corrections will likely compress
            your return distribution — but the returns that survive are the ones that are actually capturable.
          </p>
        </div>
      </div>
    </div>
  );
}
