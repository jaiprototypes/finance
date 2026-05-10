import numpy as np
import pandas as pd

from .model import FXClassifier


RISK_AVERSION_BY_PROFILE = {
    "conservative": 4.0,
    "neutral": 2.5,
    "aggressive": 1.5,
}


def recommend(
    fx: pd.Series,
    aud_cash: float,
    usd_cash: float,
    aud_debt: float,
    usd_debt: float,
    usd_debt_apr: float,
    aud_debt_apr: float,
    usd_cash_rate_annual: float = 0.05,
    aud_cash_rate_annual: float = 0.045,
    min_buffer_aud: float = 500.0,
    risk_aversion: float = 2.5,
    transfer_bps: float = 0.0005,
    use_existing_usd_for_repay: bool = True,
    loan_list: list[dict] | None = None,
    history_days: int | None = None,
    forecast_days: int | None = None,
    debug: bool = False,
):
    fx = fx.dropna().astype(float)
    if fx.empty:
        return {
            "error": "FX series is empty.",
            "alloc_aud_to_usd": 0.0,
            "repay_usd": 0.0,
            "repay_aud": 0.0,
            "hold_aud": aud_cash,
            "hold_usd": usd_cash,
            "prob_usd_up": 0.0,
            "spot": None,
            "note": "Load FX data first.",
            "window_days": forecast_days or 0,
            "history_days": history_days,
            "transfer_bps": transfer_bps,
            "repay_plan": {},
        }

    if history_days is not None:
        cutoff = fx.index.max() - pd.Timedelta(days=history_days)
        fx = fx.loc[fx.index >= cutoff]
        if debug:
            print(f"Using last {history_days} days of FX history: from {cutoff.date()} to {fx.index.max().date()}")
        if fx.empty:
            fx = fx.dropna().astype(float)

    spot = float(fx.iloc[-1])
    clf = FXClassifier(horizon_days=forecast_days or 10)
    clf = clf.fit(fx)
    p_up = clf.predict_proba_up(fx)
    H = clf.horizon_days

    aud_daily = aud_cash_rate_annual / 252.0
    usd_daily = usd_cash_rate_annual / 252.0
    aud_debt_daily = aud_debt_apr / 252.0
    usd_debt_daily = usd_debt_apr / 252.0

    hret = fx.pct_change(H).dropna()
    if len(hret) > 0:
        mu_H = float(hret.ewm(alpha=1.0 / (H + 1)).mean().iloc[-1])
        sig_H = float(hret.std())
    else:
        mu_H = sig_H = 0.0

    up = 1 + mu_H + sig_H
    dn = 1 + mu_H - sig_H
    E = p_up * up + (1 - p_up) * dn

    grid = np.linspace(0.0, 1.0, 21)
    best_val = -1e18
    best = None

    max_convertible_aud = max(0.0, aud_cash / (1.0 + transfer_bps))

    for f in grid:
        conv_aud = max_convertible_aud * f
        fee = conv_aud * transfer_bps
        usable_aud = max(0.0, conv_aud - fee)
        usd_gained = usable_aud * spot if spot > 0 else 0.0

        aud_after = aud_cash - conv_aud - fee
        usd_after = usd_cash + usd_gained

        if usd_debt > 0:
            repay_usd_capacity = usd_after if use_existing_usd_for_repay else usd_gained
            repay_usd = min(usd_debt, repay_usd_capacity)
        else:
            repay_usd = 0.0
        usd_after -= repay_usd

        if aud_debt > 0:
            repay_aud_capacity = max(0.0, aud_after - min_buffer_aud)
            repay_aud = min(aud_debt, repay_aud_capacity)
        else:
            repay_aud = 0.0
        aud_after -= repay_aud

        aud_after = max(0.0, aud_after)
        usd_after = max(0.0, usd_after)

        aud_future = aud_after * ((1 + aud_daily) ** H)
        usd_future_aud = usd_after * ((1 + usd_daily) ** H) * spot * E
        saved_aud = repay_aud * (((1 + aud_debt_daily) ** H) - 1.0)
        saved_usd_aud = repay_usd * (((1 + usd_debt_daily) ** H) - 1.0) * spot * E

        expected_total = aud_future + usd_future_aud + saved_aud + saved_usd_aud
        risk_penalty = risk_aversion * usd_after * spot * max(sig_H, 0.0)
        val = expected_total - risk_penalty
        repay_sum = repay_usd + repay_aud

        if best is None or val > best_val + 1e-6 or (abs(val - best_val) <= 1e-6 and repay_sum > best[7]):
            best = (conv_aud, repay_usd, repay_aud, aud_after, usd_after, p_up, spot, repay_sum)
            best_val = val

    if best is None:
        return {
            "alloc_aud_to_usd": 0.0,
            "repay_usd": 0.0,
            "repay_aud": 0.0,
            "hold_aud": aud_cash,
            "hold_usd": usd_cash,
            "prob_usd_up": round(p_up, 3),
            "spot": round(spot, 4),
            "note": "No feasible solution found.",
            "window_days": H,
            "history_days": history_days,
            "transfer_bps": transfer_bps,
            "repay_plan": {},
        }

    conv_aud, repay_usd, repay_aud, hold_aud, hold_usd, p_best, best_spot, _ = best

    plan = {}
    if loan_list:
        def sort_key(l):
            return (l.get("secured", False), -l.get("apr", 0.0), l.get("total_balance", float("inf")))

        usd_loans = [l for l in loan_list if l.get("currency") == "USD" and l.get("total_balance", 0) > 0]
        aud_loans = [l for l in loan_list if l.get("currency") == "AUD" and l.get("total_balance", 0) > 0]
        usd_loans_sorted = sorted(usd_loans, key=sort_key)
        aud_loans_sorted = sorted(aud_loans, key=sort_key)

        rem_usd = repay_usd
        rem_aud = repay_aud

        for l in usd_loans_sorted:
            if rem_usd <= 0:
                break
            to_pay = min(l["total_balance"], rem_usd)
            plan[str(l.get("id"))] = {
                "currency": "USD",
                "amount": round(to_pay, 2),
                "name": l.get("name", ""),
            }
            rem_usd -= to_pay

        for l in aud_loans_sorted:
            if rem_aud <= 0:
                break
            to_pay = min(l["total_balance"], rem_aud)
            plan[str(l.get("id"))] = {
                "currency": "AUD",
                "amount": round(to_pay, 2),
                "name": l.get("name", ""),
            }
            rem_aud -= to_pay

    explanation = (
        f"Spot {best_spot:.4f} AUD/USD - P(USD up in {H} d) = {p_best:.1%}\n"
        f"Convert: A${conv_aud:,.2f} -> USD\n"
        f"Repay USD: US${repay_usd:,.2f}, Repay AUD: A${repay_aud:,.2f}\n"
        f"Post-action: A${hold_aud:,.2f}, US${hold_usd:,.2f}"
    )

    return {
        "alloc_aud_to_usd": round(conv_aud, 2),
        "repay_usd": round(repay_usd, 2),
        "repay_aud": round(repay_aud, 2),
        "hold_aud": round(hold_aud, 2),
        "hold_usd": round(hold_usd, 2),
        "prob_usd_up": round(p_best, 3),
        "spot": round(best_spot, 4),
        "note": "USD-first rule; configurable FX history and forecast horizon.",
        "window_days": int(H),
        "history_days": history_days,
        "transfer_bps": transfer_bps,
        "explanation": explanation,
        "repay_plan": plan,
    }


def recommend_with_profile(profile: str, **kwargs):
    risk_aversion = RISK_AVERSION_BY_PROFILE.get(profile, RISK_AVERSION_BY_PROFILE["neutral"])
    return recommend(risk_aversion=risk_aversion, **kwargs)

