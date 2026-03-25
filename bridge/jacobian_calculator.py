import json
import math
import logging
import os

_HERE   = os.path.dirname(os.path.abspath(__file__))
_POLICY = os.path.join(_HERE, "..", "data", "platform_policy.json")
_MACRO  = os.path.join(_HERE, "..", "data", "macro_context.json")


class JacobianCalculator:
    """
    Calculates the Jacobian sensitivity matrix mapping slow-data macro/narrative signals
    to fast-data risk parameters for the hft_engine.

    Extended with:
      - Regime-clarity position scaling  (platform_policy.json)
      - e7 supply-stress conflict guard  (macro_context.json s7 signal)
      - 10/14-day rebalance clock logic  (policy rebalance_days)
    """

    def __init__(self):
        self.logger = logging.getLogger("JacobianBridge")

        # Base parameter state P
        self.p_state = {
            "max_position_mw":      10.0,
            "bid_ask_threshold":     0.5,
            "da_rt_spread_trigger": 15.0,
            "as_allocation_weight":  0.5,   # 0 = energy only, 1.0 = AS only
            "kill_volatility":     100.0,
        }

        self._policy = self._load_json(_POLICY)
        self._macro  = self._load_json(_MACRO)

    # ── helpers ────────────────────────────────────────────────────────────

    @staticmethod
    def _load_json(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    @staticmethod
    def _clamp(x, lo=0.0, hi=1.0):
        return max(lo, min(hi, x))

    # ── regime-clarity scaling ─────────────────────────────────────────────

    def _regime_clarity(self):
        """
        Composite confidence score that drives position sizing.

        regime_clarity = regime_confidence * (1 - e7_conflict_penalty)

        e7_conflict_penalty = clamp(|e7| / penalty_scale, 0, 1) * max_haircut
          e7=0.00  -> penalty=0.00  (clean signal)
          e7=0.15  -> penalty=0.25  (yellow zone, half haircut)
          e7>=0.30 -> penalty=0.50  (hard conflict, max haircut)

        Returns (clarity: float, diagnostics: dict)
        """
        macro       = self._macro
        policy      = self._policy
        sz_cfg      = policy.get("position_sizing", {})
        kill_cfg    = policy.get("kill_conditions",  {})

        # Pull live values from macro_context.json
        regime_confidence = macro.get("regime_confidence", 0.70)
        macro_regime      = macro.get("macro_regime", "unknown")
        s7_raw = (
            macro.get("jacobian_signal_vector", {})
                 .get("s7_dxy_wti_r", 0.0)
        )
        e7 = s7_raw   # already signed; use absolute value for penalty

        # Hard kill conditions
        e7_hard_stop   = kill_cfg.get("e7_hard_stop", 0.25)
        conf_min       = kill_cfg.get("regime_confidence_min", 0.55)
        required_regime= policy.get("entry_conditions", {}).get("required_regime", "monetary_easing")

        if abs(e7) >= e7_hard_stop:
            return 0.0, {"reason": "e7_hard_stop", "e7": e7,
                         "threshold": e7_hard_stop}
        if regime_confidence < conf_min:
            return 0.0, {"reason": "low_confidence", "confidence": regime_confidence,
                         "min": conf_min}
        if macro_regime != required_regime:
            return 0.0, {"reason": "wrong_regime", "current": macro_regime,
                         "required": required_regime}

        # e7 conflict penalty
        penalty_scale  = sz_cfg.get("e7_penalty_scale",    0.30)
        max_haircut    = sz_cfg.get("max_conflict_haircut", 0.50)
        e7_penalty     = self._clamp(abs(e7) / penalty_scale) * max_haircut

        clarity        = regime_confidence * (1.0 - e7_penalty)

        # Scaling ramp: 0% at floor, 100% at floor+range
        floor          = sz_cfg.get("clarity_floor", 0.60)
        rng            = sz_cfg.get("clarity_range",  0.30)
        position_scale = self._clamp((clarity - floor) / rng)

        # Yellow zone -> cap at 0.50 and prefer 14-day rebalance
        e7_yz          = policy.get("entry_conditions", {}).get("e7_yellow_zone", [0.08, 0.15])
        in_yellow      = e7_yz[0] <= abs(e7) < e7_yz[1]
        if in_yellow:
            position_scale = min(position_scale, 0.50)

        diag = {
            "macro_regime":      macro_regime,
            "regime_confidence": round(regime_confidence, 4),
            "e7":                round(e7, 4),
            "e7_penalty":        round(e7_penalty, 4),
            "clarity":           round(clarity, 4),
            "position_scale":    round(position_scale, 4),
            "in_yellow_zone":    in_yellow,
            "rebalance_days":    14 if in_yellow else
                                 self._policy.get("rebalance", {}).get("primary_days", 10),
        }
        return position_scale, diag

    # ── main entry point ───────────────────────────────────────────────────

    def compute_jacobian(self, s_state):
        """
        s_state = Vector of slow signals from the Python intelligence layer.
        s1 = solar_error_proxy
        s2 = sentiment_drift_proxy   (WTI momentum signal, [0,1])
        s3 = regime_indicator
        s4 = asdc_scarcity_prob      (ORDC-driven, [0,1])
        s5 = vpp_dispatch_prob
        s6 = macro_composite         (optional, ignored in bridge)
        s7 = dxy_wti_r               (signed rho, used for regime clarity)
        s8 = wti_10y_r               (signed rho, informational)
        """
        s1, s2, s3, s4, s5 = s_state[:5]

        # ── Jacobian partials (unchanged physics) ──────────────────────────
        # Solar forecast error -> spread width
        dp1_ds1 = 2.0 * s1

        # Momentum/sentiment drift -> reduce max position
        dp1_ds2 = -5.0 * s2

        # ASDC/ORDC scarcity -> shift toward AS allocation
        dp4_ds4 = 0.8 * s4

        # ── Base parameter update ──────────────────────────────────────────
        new_params = self.p_state.copy()
        raw_max_mw = max(0.0, self.p_state["max_position_mw"] + dp1_ds1 + dp1_ds2)
        new_params["as_allocation_weight"] = min(
            1.0, max(0.0, self.p_state["as_allocation_weight"] + dp4_ds4)
        )

        # ── Regime-clarity position scaling ───────────────────────────────
        position_scale, clarity_diag = self._regime_clarity()
        new_params["max_position_mw"] = round(raw_max_mw * position_scale, 4)

        # Kill-volatility tightens proportionally in low-clarity environments
        # Full clarity -> kill_volatility=100; zero clarity -> 25 (tight stop)
        new_params["kill_volatility"] = round(
            25.0 + 75.0 * position_scale, 2
        )

        # bid_ask_threshold widens when clarity is low (demand bigger edge to trade)
        new_params["bid_ask_threshold"] = round(
            self.p_state["bid_ask_threshold"] + (1.0 - position_scale) * 1.5, 4
        )

        # ── Logging ───────────────────────────────────────────────────────
        self.logger.info(
            f"J-calc: scale={position_scale:.3f} "
            f"regime={clarity_diag.get('macro_regime','?')} "
            f"e7={clarity_diag.get('e7', 0):.3f} "
            f"max_mw={new_params['max_position_mw']:.2f} "
            f"rebalance={clarity_diag.get('rebalance_days',10)}d"
        )

        # Attach policy diagnostics for upstream consumers
        new_params["_policy"] = {
            "position_scale":  position_scale,
            "rebalance_days":  clarity_diag.get("rebalance_days", 10),
            "policy_firing":   position_scale > 0.0,
            **clarity_diag,
        }

        return new_params


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    calc = JacobianCalculator()

    print("=== Current live state ===")
    # Use actual signal vector from macro_context.json if available
    try:
        with open(_MACRO, encoding="utf-8") as f:
            mc = json.load(f)
        s_vec = mc.get("jacobian_signal_vector", {}).get("_raw", [])
        if len(s_vec) >= 5:
            print(f"Signal vector from macro_context.json: {s_vec}")
            params = calc.compute_jacobian(s_vec)
        else:
            raise ValueError("short vector")
    except Exception:
        s_state = (0.5, 0.8, 1, 0.9, 0.2)
        print(f"Signal vector (fallback sample): {s_state}")
        params = calc.compute_jacobian(s_state)

    policy_info = params.pop("_policy", {})
    print("\nHFT Parameters:")
    print(json.dumps(params, indent=2))
    print("\nPolicy State:")
    print(json.dumps(policy_info, indent=2))
