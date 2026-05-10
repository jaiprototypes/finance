# fx.py
import pandas as pd, io, requests, re, warnings

RBA_F12 = "https://www.rba.gov.au/statistics/tables/csv/f12-data.csv"
RBA_F11 = "https://www.rba.gov.au/statistics/tables/csv/f11-data.csv"

_DATE_FMT_TRY = ["%Y-%m-%d", "%d-%b-%Y", "%d/%m/%Y", "%Y/%m/%d"]  # common RBA/CSV patterns

def _num(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.replace(",", "", regex=False)
    s = s.str.replace(r"[^0-9.\-]", "", regex=True)
    return pd.to_numeric(s, errors="coerce")

def _best_date_col_and_format(df: pd.DataFrame, sample_n: int = 100):
    """Return (date_col, fmt or None). Tries explicit fmts first; falls back silently."""
    cols = list(df.columns)
    # sample without warnings
    for c in cols:
        ser = df[c].dropna().astype(str).head(sample_n)
        if ser.empty:
            continue
        # try explicit formats
        for fmt in _DATE_FMT_TRY:
            try:
                parsed = pd.to_datetime(ser, errors="coerce", format=fmt)
                if parsed.notna().mean() > 0.8:
                    return c, fmt
            except Exception:
                pass
        # fallback once (silence the noisy warning)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Could not infer format.*")
            parsed = pd.to_datetime(ser, errors="coerce")
        if parsed.notna().mean() > 0.8:
            return c, None
    return None, None

def _pick_rate_col(df: pd.DataFrame, date_col: str):
    best, best_score, best_vals = None, -1, None
    for c in df.columns:
        if c == date_col: 
            continue
        name = str(c).upper()
        vals = _num(df[c])
        coverage = float(vals.notna().mean())
        score = coverage + (0.5 if ("AUD/USD" in name or ("USD" in name and "AUD" in name)) else 0.0)
        if score > best_score:
            best, best_score, best_vals = c, score, vals
    return best, best_vals

def get_rba_aud_per_usd() -> pd.Series:
    # Try F12: AUD per USD (preferred)
    try:
        text = requests.get(RBA_F12, timeout=20).text
        df = pd.read_csv(io.StringIO(text), dtype=str, low_memory=False)
        date_col, fmt = _best_date_col_and_format(df)
        assert date_col, "No date column in F12"
        rate_col, rate_vals = _pick_rate_col(df, date_col)
        assert rate_col, "No rate column in F12"
        # parse dates with the format we found (quiet + fast)
        dates = pd.to_datetime(df[date_col], errors="coerce", format=fmt) if fmt else pd.to_datetime(df[date_col], errors="coerce")
        ser = pd.Series(rate_vals.values, index=dates, name="AUD_per_USD").sort_index().dropna()
        return ser.asfreq("B").ffill()
    except Exception:
        # F11: AUD/USD → invert
        text = requests.get(RBA_F11, timeout=20).text
        df = pd.read_csv(io.StringIO(text), dtype=str, low_memory=False)
        date_col, fmt = _best_date_col_and_format(df)
        if not date_col: 
            raise RuntimeError("No date column in F11")
        rate_col, rate_vals = _pick_rate_col(df, date_col)
        if not rate_col:
            raise RuntimeError("No rate column in F11")
        dates = pd.to_datetime(df[date_col], errors="coerce", format=fmt) if fmt else pd.to_datetime(df[date_col], errors="coerce")
        aud_per_usd = (1.0 / rate_vals).rename("AUD_per_USD")
        ser = pd.Series(aud_per_usd.values, index=dates, name="AUD_per_USD").sort_index().dropna()
        return ser.asfreq("B").ffill()
