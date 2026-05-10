import math

from shared.fx.ingest import get_rba_aud_per_usd


F11_SAMPLE = """\ufeffF11 EXCHANGE RATES
Title,A$1=USD,Trade-weighted Index May 1970 = 100
Description,AUD/USD Exchange Rate; see notes for further detail.,Australian Dollar Trade-weighted Index
Frequency,Monthly,Monthly
Type,Indicative,Indicative
Units,USD,Index


Source,WM/Reuters,RBA
Publication date,27-Feb-2026,27-Feb-2026
Series ID,FXRUSD,FXRTWI
31-Jan-2026,0.6200,65.0
27-Feb-2026,0.6500,66.0
"""


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text

    def raise_for_status(self) -> None:
        return None


def test_get_rba_aud_per_usd_parses_current_f11_format(monkeypatch):
    monkeypatch.setattr(
        "shared.fx.ingest.requests.get",
        lambda url, timeout=20: _FakeResponse(F11_SAMPLE),
    )

    series = get_rba_aud_per_usd()

    assert not series.empty
    assert series.index[-1].strftime("%Y-%m-%d") == "2026-02-27"
    assert math.isclose(float(series.iloc[-1]), 1.0 / 0.65, rel_tol=1e-9)
