import streamlit as st
import pandas as pd
import datetime as dt
import matplotlib.pyplot as plt

from storage import (
    init_db, add_loan, list_loans, list_loans_with_total, add_payment, list_payments,
    get_balances, upsert_balance, upsert_fx_many, get_fx_series,
    get_loan, update_loan, delete_loan, get_fx_max_date, accrue_interest_to
)
from fx import get_rba_aud_per_usd
from engine import recommend, FXClassifier

# -------------------- FX PLOT --------------------
def plot_fx_with_labels(fx_series: pd.Series):
    """Plot AUD/USD with forecast window and model probability annotation."""
    clf = FXClassifier(horizon_days=10).fit(fx_series)
    p_up = clf.predict_proba_up(fx_series)
    H = clf.horizon_days

    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    fx_series.plot(ax=ax, lw=1.2, color="#1f77b4")

    ax.set_title(f"AUD/USD — ML P(USD ↑ in {H}d) = {p_up*100:.1f}%", fontsize=11)
    ax.set_ylabel("AUD per USD")
    ax.grid(True, alpha=0.25, linestyle="--")

    last_date = fx_series.index[-1]
    forecast_end = last_date + pd.Timedelta(days=H)
    ax.axvspan(last_date, forecast_end, color="orange", alpha=0.15)
    ax.text(
        last_date + pd.Timedelta(days=H / 2),
        fx_series.iloc[-1],
        f"→ {p_up*100:.1f}% USD up",
        color="darkorange", fontsize=9, ha="center", va="bottom"
    )

    ax.xaxis.set_major_locator(plt.MaxNLocator(10))
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    return fig

# -------------------- UTILITIES --------------------
def _fmt_money(x: float, currency: str) -> str:
    if currency.upper() == "AUD":
        return f"A${x:,.2f}"
    if currency.upper() == "USD":
        return f"${x:,.2f}"
    return f"{x:,.2f}"

def _fx_bias(prob_usd_up: float, low=0.45, high=0.55):
    # Flip for intuitive direction (AUD/USD ↑ ⇒ USD up)
    prob_usd_up = 1.0 - prob_usd_up
    if prob_usd_up >= high:
        return ("USD likely ↑", "🟢")
    if prob_usd_up <= low:
        return ("USD likely ↓", "🔴")
    return ("Neutral", "⚪️")

def render_recommendation(dec: dict, aud_cash: float, usd_cash: float):
    spot = float(dec.get("spot", 0.0))
    p_up = float(dec.get("prob_usd_up", 0.0))
    alloc_aud_to_usd = float(dec.get("alloc_aud_to_usd", 0.0))
    repay_usd = float(dec.get("repay_usd", 0.0))
    repay_aud = float(dec.get("repay_aud", 0.0))
    hold_aud = float(dec.get("hold_aud", 0.0))
    hold_usd = float(dec.get("hold_usd", 0.0))
    note = dec.get("note", "")
    H = int(dec.get("window_days", 10))
    transfer_bps = float(dec.get("transfer_bps", 0.0))
    repay_plan = dec.get("repay_plan", {})

    def clamp0(x):
        return x if x > 1e-9 else 0.0

    alloc_aud_to_usd = clamp0(alloc_aud_to_usd)
    repay_usd = clamp0(repay_usd)
    repay_aud = clamp0(repay_aud)
    hold_aud = clamp0(hold_aud)
    hold_usd = clamp0(hold_usd)

    fee_aud = alloc_aud_to_usd * transfer_bps
    usable_aud = alloc_aud_to_usd - fee_aud
    usd_received = usable_aud * spot
    usd_received = clamp0(usd_received)

    label, dot = _fx_bias(p_up)

    # Header metrics
    h1, h2, h3 = st.columns([1, 1, 1])
    with h1:
        st.metric("Spot (USD per AUD)", f"{spot:.4f}")
    with h2:
        st.metric("Prob USD ↑", f"{p_up*100:.1f}%")
        st.caption(f"Forecast window = {H} days")
    with h3:
        st.metric("FX Bias", f"{dot} {label}")

    st.divider()

    # Conversion / repayment totals
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("#### 🔁 Conversion")
        st.markdown(f"- **AUD → USD now**: {_fmt_money(alloc_aud_to_usd, 'AUD')}")
        if transfer_bps > 0 and alloc_aud_to_usd > 0:
            st.caption(f"Fee: {_fmt_money(fee_aud, 'AUD')} · USD rec’d: ${usd_received:,.2f}")
        else:
            st.caption("No transfer fee applied.")
    with c2:
        st.markdown("#### 💸 Debt Repayments (Totals)")
        st.markdown(f"- **Repay USD (total)**: {_fmt_money(repay_usd, 'USD')}")
        st.markdown(f"- **Repay AUD (total)**: {_fmt_money(repay_aud, 'AUD')}")

    st.divider()

    # Post-action cash
    p1, p2 = st.columns(2)
    with p1:
        st.metric("Hold in AUD", _fmt_money(hold_aud, "AUD"))
    with p2:
        st.metric("Hold in USD", _fmt_money(hold_usd, "USD"))

    if note:
        st.caption(f"**Note:** {note}")

    # Repayment plan detail
    if repay_plan:
        st.markdown("### 🏦 Repayment Plan by Loan")
        rows = []
        for lid, info in repay_plan.items():
            name = info.get("name", "")
            curr = info.get("currency", "")
            amt = float(info.get("amount", 0.0))
            rows.append({
                "Loan ID": lid,
                "Name": name,
                "Currency": curr,
                "Amount to repay": _fmt_money(amt, curr)
            })
        df_plan = pd.DataFrame(rows)
        st.table(df_plan)

    from textwrap import dedent
    summary_md = dedent(f"""
      <div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
      <div style="font-weight:600;margin-bottom:6px;">Summary</div>
      <div>Spot: {spot:.4f} · P(USD ↑ in {H} days): {p_up:.1%}</div>
      <div>Convert: <b>A${alloc_aud_to_usd:,.2f}</b> → USD
         {"(Fee A$" + f"{fee_aud:,.2f}" + ", USD " + f"{usd_received:,.2f})" if alloc_aud_to_usd>0 and transfer_bps>0 else ""}</div>
      <div>Repay USD: <b>US${repay_usd:,.2f}</b> · Repay AUD: <b>A${repay_aud:,.2f}</b></div>
      <div>Post-action: <b>A${hold_aud:,.2f}</b> · <b>US${hold_usd:,.2f}</b></div>
      <div style="color:#6b7280;margin-top:6px;">{note}</div>
      </div>
    """)
    st.markdown(summary_md, unsafe_allow_html=True)

    with st.expander("See raw JSON"):
        st.json(dec)

# -------------------- APP STARTUP --------------------
st.set_page_config(page_title="FX Debt Planner", page_icon="💱", layout="wide")
st.title("💱 Personal FX Debt Planner")

init_db()

# Sidebar balances
with st.sidebar:
    st.header("Balances")
    st.session_state.setdefault("fx_autorefreshed_this_run", False)

    if st.checkbox("Auto-refresh FX on open", value=True) and not st.session_state["fx_autorefreshed_this_run"]:
        s = get_rba_aud_per_usd()
        last = get_fx_max_date()
        if last:
            s = s[s.index > pd.to_datetime(last)]
        new_pairs = [(d.strftime("%Y-%m-%d"), float(v)) for d, v in s.dropna().items()]
        if new_pairs:
            upsert_fx_many(new_pairs)
        st.success(f"FX updated (+{len(new_pairs)} new days).")
        st.session_state["fx_autorefreshed_this_run"] = True

    bals = get_balances()
    aud_bal = st.number_input("AUD cash", value=float(bals.get("AUD", 0.0)), step=100.0)
    usd_bal = st.number_input("USD cash", value=float(bals.get("USD", 0.0)), step=100.0)
    if st.button("Save balances"):
        upsert_balance("AUD", aud_bal)
        upsert_balance("USD", usd_bal)
        st.success("Balances saved.")

tab1, tab2, tab3, tab4 = st.tabs(["Overview", "Loans & Payments", "FX Data", "Recommendation"])

# --- Overview tab ---
with tab1:
    st.subheader("Loans Overview")
    today = dt.date.today().strftime("%Y-%m-%d")

    # First, accrue interest up to today for each loan with a positive principal
    for l in list_loans():
        if float(l.get("principal", 0)) > 0:
            try:
                accrue_interest_to(l["id"], today)
            except Exception as e:
                st.warning(f"Interest accrual failed for {l['name']}: {e}")

    # Now list loans with updated total balance etc.
    loans = list_loans_with_total()
    df_loans = pd.DataFrame(loans)

    if not df_loans.empty:
        # Add the “accrual from” date (last_accrual column)
        df_loans["accrual_from"] = df_loans["last_accrual"]

        # Define columns to show
        cols = [
            "id", "name", "currency", "apr",
            "principal", "accrued_interest", "accrual_from",
            "total_balance", "kind", "secured"
        ]

        # Prepare display DataFrame
        df_show = df_loans[cols].copy()

        # Format numeric columns
        for c in ["principal", "accrued_interest", "total_balance"]:
            df_show[c] = df_show[c].astype(float).map("{:,.2f}".format)

        # Format the accrual_from column as date string
        df_show["accrual_from"] = pd.to_datetime(df_show["accrual_from"]).dt.strftime("%Y-%m-%d")

        st.dataframe(df_show, use_container_width=True)

        # Compute totals
        usd_total = df_loans.loc[df_loans["currency"] == "USD", "total_balance"].sum()
        aud_total = df_loans.loc[df_loans["currency"] == "AUD", "total_balance"].sum()

        st.metric("Total USD Debt (incl. interest)", f"${usd_total:,.2f}")
        st.metric("Total AUD Debt (incl. interest)", f"A${aud_total:,.2f}")
    else:
        st.info("Add loans in the next tab.")

# --- Loans & Payments tab ---
with tab2:
    st.subheader("Add Loan")
    with st.form("add_loan"):
        name = st.text_input("Name")
        currency = st.selectbox("Currency", ["USD","AUD"])
        principal = st.number_input("Principal", min_value=0.0, step=100.0)
        apr = st.number_input("APR (0.16 = 16%)", min_value=0.0, max_value=1.0, value=0.08, step=0.005)
        kind = st.selectbox("Kind", ["credit_card","student_private","student_federal","promo","other"])
        secured = st.checkbox("Secured?", value=False)
        if st.form_submit_button("Add Loan") and name and principal>0:
            add_loan(name, currency, principal, apr, kind, secured)
            st.success("Loan added.")

    st.divider()
    st.subheader("Record Payment")
    loans = list_loans_with_total()
    if loans:
        loan_opt = {f"#{l['id']} {l['name']} ({l['currency']})": l for l in loans}
        with st.form("pay"):
            sel = st.selectbox("Loan", list(loan_opt.keys()))
            amt = st.number_input("Amount", min_value=0.0, step=50.0)
            date = st.date_input("Date", value=dt.date.today())
            note = st.text_input("Note","")
            if st.form_submit_button("Record") and amt>0:
                L = loan_opt[sel]
                add_payment(str(date), L["id"], amt, L["currency"], note)
                st.success("Payment recorded.")
                st.rerun()
    else:
        st.info("No loans yet.")

    st.subheader("Recent Payments")
    pays = list_payments()
    if pays:
        dfp = pd.DataFrame(pays)
        cols = ["date","loan_name","amount","currency","note"]
        dfp["amount"] = dfp["amount"].astype(float).map("{:,.2f}".format)
        st.dataframe(dfp[cols], use_container_width=True)
    else:
        st.caption("None yet.")

    st.divider()
    st.subheader("Edit / Delete Loan")
    loans = list_loans_with_total()
    if not loans:
        st.info("No loans to edit yet.")
    else:
        options = {
          f"#{l['id']} — {l['name']} ({l['currency']}) @ {l['apr']*100:.2f}% — {l['principal']:,.2f}": l["id"]
          for l in loans
        }
        sel_label = st.selectbox("Select a loan to edit", list(options.keys()))
        sel_id = options[sel_label]
        L = get_loan(sel_id)

        with st.form("edit_loan_form"):
            c1, c2 = st.columns(2)
            name = c1.text_input("Name", value=L["name"])
            currency = c2.selectbox("Currency", ["USD","AUD"], index=0 if L["currency"]=="USD" else 1)
            principal = c1.number_input("Principal", min_value=0.0, step=50.0, value=float(L["principal"]))
            apr = c2.number_input("APR (0.16 = 16%)", min_value=0.0, max_value=1.0,
                                  value=float(L["apr"]), step=0.005)
            kind = c1.selectbox("Kind", ["credit_card","student_private","student_federal","promo","other"],
                                index=["credit_card","student_private","student_federal","promo","other"].index(L["kind"]))
            secured = c2.checkbox("Secured?", value=bool(L["secured"]))
            if st.form_submit_button("Save changes"):
                update_loan(sel_id, name=name, currency=currency,
                             principal=principal, apr=apr, kind=kind, secured=secured)
                st.success("Loan updated.")
                st.rerun()

        with st.expander("Danger zone: Delete this loan"):
            if st.checkbox("I understand this will delete the loan and its payments"):
                if st.button("Delete loan", type="primary"):
                    delete_loan(sel_id)
                    st.success("Loan deleted.")
                    st.rerun()

# --- FX Data tab ---
with tab3:
    st.subheader("FX Data")
    c1, c2 = st.columns(2)

    with c1:
        if st.button("Fetch RBA now"):
            try:
                s = get_rba_aud_per_usd()
                upsert_fx_many([(d.strftime("%Y-%m-%d"), float(v)) for d, v in s.dropna().items()])
                st.success(f"Loaded {len(s)} points from RBA.")
            except Exception as e:
                st.error("Fetch failed.")
                st.code(str(e))

        if st.button("FX refresh (append most recent from RBA)"):
            try:
                s = get_rba_aud_per_usd()
                last = get_fx_max_date()
                if last:
                    s = s[s.index > pd.to_datetime(last)]
                new_pairs = [(d.strftime("%Y-%m-%d"), float(v)) for d, v in s.dropna().items()]
                if new_pairs:
                    upsert_fx_many(new_pairs)
                st.success(f"FX updated (+{len(new_pairs)} new days).")
            except Exception as e:
                st.error("Refresh failed.")
                st.code(str(e))

    with c2:
        up = st.file_uploader("Upload CSV (date, AUD_per_USD) or (date, AUD/USD)", type=["csv"])
        if up is not None and not st.session_state.get("fx_uploaded_once"):
            df = pd.read_csv(up, dtype=str, low_memory=False)
            def is_date_col(series): return pd.to_datetime(series, errors="coerce").notna().mean() > 0.1
            date_col = next((c for c in df.columns if is_date_col(df[c])), None)
            if date_col:
                def to_numeric_clean(s):
                    s = s.astype(str).str.replace(",", "").str.replace(r"[^0-9.\-]", "", regex=True)
                    return pd.to_numeric(s, errors="coerce")
                rate_col = next((c for c in df.columns if c != date_col), None)
                vals = to_numeric_clean(df[rate_col])
                dates = pd.to_datetime(df[date_col], errors="coerce")
                header = str(rate_col).upper()
                aud_per_usd = (1.0 / vals if "AUD/USD" in header or ("USD" in header and "AUD" in header and "PER" not in header) else vals)
                ser = pd.Series(aud_per_usd.values, index=dates).sort_index().dropna().asfreq("B").ffill()
                upsert_fx_many([(d.strftime("%Y-%m-%d"), float(v)) for d, v in ser.items()])
                st.success(f"Imported {len(ser)} FX points.")
                st.session_state["fx_uploaded_once"] = True
            else:
                st.error("No valid date column detected.")

    fx_rows = get_fx_series()
    if fx_rows:
        fx_df = pd.DataFrame(fx_rows)
        fx_df["date"] = pd.to_datetime(fx_df["date"])
        fx_df["aud_per_usd"] = pd.to_numeric(fx_df["aud_per_usd"], errors="coerce")
        fx_df = fx_df.dropna().sort_values("date").set_index("date")
        st.pyplot(plot_fx_with_labels(fx_df["aud_per_usd"]))
    else:
        st.info("No FX data yet.")

# --- Recommendation tab ---
with tab4:
    st.subheader("Recommendation")
    bals = get_balances()
    aud_cash = float(bals.get("AUD", 0.0))
    usd_cash = float(bals.get("USD", 0.0))
    fx_rows = get_fx_series()

    if not fx_rows:
        st.warning("Load FX first.")
    else:
        fx = pd.Series(
            [r["aud_per_usd"] for r in fx_rows],
            index=pd.to_datetime([r["date"] for r in fx_rows]),
            name="AUD_per_USD"
        )

        loans_now = list_loans_with_total()
        usd_debt = sum(l["total_balance"] for l in loans_now if l["currency"] == "USD")
        aud_debt = sum(l["total_balance"] for l in loans_now if l["currency"] == "AUD")
        usd_apr = max([l["apr"] for l in loans_now if l["currency"] == "USD"] + [0.0])
        aud_apr = max([l["apr"] for l in loans_now if l["currency"] == "AUD"] + [0.0])

        c1, c2, c3, c4, c5 = st.columns([1,1,1,1,1])
        min_buf = c1.number_input("Min AUD buffer", value=500.0, step=50.0)
        risk = c2.slider("Risk aversion", 0.5, 4.0, 2.5, 0.1)
        bps_val = c3.number_input("Transfer fee (bp)", value=50.0, step=5.0)
        transfer_bps = bps_val / 10000.0
        history_days = int(c4.number_input("Use last X days of FX history", min_value=1, value=365, step=30))
        forecast_days = int(c5.number_input("Forecast horizon (days)", min_value=1, value=10, step=1))

        if st.button("Compute"):
            dec = recommend(
                fx, aud_cash, usd_cash, aud_debt, usd_debt,
                usd_apr, aud_apr,
                min_buffer_aud=min_buf,
                risk_aversion=risk,
                transfer_bps=transfer_bps,
                history_days=history_days,
                forecast_days=forecast_days
            )
            render_recommendation(dec, aud_cash=aud_cash, usd_cash=usd_cash)
