import numpy as np
import pandas as pd


class FXClassifier:
    def __init__(self, horizon_days: int = 10):
        self.horizon_days = horizon_days
        self.w = None
        self.b = 0.0

    def fit(self, fx: pd.Series):
        fx = fx.dropna().astype(float)
        ret1 = fx.pct_change(1)
        X = np.column_stack([
            ret1.rolling(5).mean(),
            ret1.rolling(20).mean(),
            ret1.rolling(60).std(),
        ])
        y = (fx.pct_change(self.horizon_days).shift(-self.horizon_days) > 0).astype(int)
        df = pd.DataFrame(X, index=fx.index).join(y.rename("y")).dropna()
        if df.empty:
            self.w = np.zeros(X.shape[1])
            self.b = 0.0
            return self
        Xn = df.iloc[:, :-1].values
        yn = df["y"].values

        rng = np.random.default_rng(0)
        self.w = rng.normal(0, 0.1, size=Xn.shape[1])
        self.b = 0.0

        for _ in range(200):
            z = Xn @ self.w + self.b
            p = 1 / (1 + np.exp(-z))
            grad_w = (Xn.T @ (p - yn)) / len(Xn) + 5e-3 * self.w
            grad_b = float(np.mean(p - yn))
            self.w -= 0.05 * grad_w
            self.b -= 0.05 * grad_b

        return self

    def predict_proba_up(self, fx: pd.Series) -> float:
        fx = fx.dropna().astype(float)
        ret1 = fx.pct_change(1)
        X = np.column_stack([
            ret1.rolling(5).mean(),
            ret1.rolling(20).mean(),
            ret1.rolling(60).std(),
        ])
        X_df = pd.DataFrame(X, index=fx.index).dropna()
        if X_df.shape[0] == 0 or self.w is None:
            return 0.5
        X_last = X_df.iloc[-1:].values
        z = X_last @ self.w + self.b
        p = 1 / (1 + np.exp(-z))
        return float(p[0])

