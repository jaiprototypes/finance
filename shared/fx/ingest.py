import io
import warnings

import pandas as pd
import requests

RBA_F11_DAILY = "https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv"
RBA_F11_MONTHLY = "https://www.rba.gov.au/statistics/tables/csv/f11-data.csv"

_DATE_FMT_TRY = ["%Y-%m-%d", "%d-%b-%Y", "%d/%m/%Y", "%Y/%m/%d"]
_F11_USD_COLUMNS = ("A$1=USD", "AUD/USD", "USD")


def _num(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.replace(",", "", regex=False)
    s = s.str.replace(r"[^0-9.\-]", "", regex=True)
    return pd.to_numeric(s, errors="coerce")


def _read_rba_table(url: str) -> pd.DataFrame:
    response = requests.get(url, timeout=20)
    response.raise_for_status()
    text = response.text.lstrip("\ufeff")
    lines = text.splitlines()
    header_index = next((idx for idx, line in enumerate(lines) if line.startswith("Title,")), None)
    if header_index is None:
        raise RuntimeError("RBA CSV header row was not found")
    return pd.read_csv(io.StringIO("\n".join(lines[header_index:])), dtype=str, low_memory=False)


def _best_date_col_and_format(df: pd.DataFrame):
    """Return (date_col, fmt or None) by checking whole-column parse coverage."""
    for column in list(df.columns):
        ser = df[column].dropna().astype(str)
        if ser.empty:
            continue
        min_valid_dates = max(2, len(ser) // 5)
        for fmt in _DATE_FMT_TRY:
            try:
                parsed = pd.to_datetime(ser, errors="coerce", format=fmt)
                valid_count = int(parsed.notna().sum())
                if valid_count >= min_valid_dates and parsed.notna().mean() >= 0.2:
                    return column, fmt
            except Exception:
                continue
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Could not infer format.*")
            parsed = pd.to_datetime(ser, errors="coerce")
        valid_count = int(parsed.notna().sum())
        if valid_count >= min_valid_dates and parsed.notna().mean() >= 0.2:
            return column, None
    return None, None


def _pick_f11_usd_col(df: pd.DataFrame) -> str | None:
    normalized = {str(column).strip().upper(): column for column in df.columns}
    for name in _F11_USD_COLUMNS:
        column = normalized.get(name.upper())
        if column is not None:
            return column
    for column in df.columns:
        label = str(column).upper()
        if "USD" in label and "INDEX" not in label and "TWI" not in label:
            return column
    return None


def get_rba_aud_per_usd() -> pd.Series:
    """Return a business-day AUD per USD series, forward-filled."""
    last_error: Exception | None = None
    for url, label in ((RBA_F11_DAILY, "F11.1"), (RBA_F11_MONTHLY, "F11")):
        try:
            df = _read_rba_table(url)
            date_col, fmt = _best_date_col_and_format(df)
            if not date_col:
                raise RuntimeError(f"No date column in {label}")
            rate_col = _pick_f11_usd_col(df)
            if not rate_col:
                raise RuntimeError(f"No AUD/USD rate column in {label}")

            dates = (
                pd.to_datetime(df[date_col], errors="coerce", format=fmt)
                if fmt
                else pd.to_datetime(df[date_col], errors="coerce")
            )
            usd_per_aud = _num(df[rate_col])
            valid = dates.notna() & usd_per_aud.notna() & (usd_per_aud > 0)
            if not valid.any():
                raise RuntimeError(f"No AUD/USD rate rows in {label}")

            aud_per_usd = 1.0 / usd_per_aud[valid]
            series = pd.Series(aud_per_usd.values, index=dates[valid], name="AUD_per_USD").sort_index()
            series = series[~series.index.duplicated(keep="last")]
            return series.asfreq("B").ffill()
        except Exception as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    raise RuntimeError("Unable to load RBA AUD/USD rates")
