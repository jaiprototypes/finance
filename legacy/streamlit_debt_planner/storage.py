import sqlite3, os, datetime as dt
from typing import Optional, Dict

DB_PATH = os.getenv("APP_DB_PATH", "app_data.db")

DDL = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  principal REAL NOT NULL,
  apr REAL NOT NULL,
  kind TEXT NOT NULL,
  secured INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  loan_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY(loan_id) REFERENCES loans(id)
);
CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS balances (
  currency TEXT PRIMARY KEY,
  amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS fx (
  date TEXT PRIMARY KEY,
  aud_per_usd REAL NOT NULL
);
"""

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

# --------------------
# Date / interest utils
# --------------------
def _parse_date(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y-%m-%d").date()

def _fmt_date(d: dt.date) -> str:
    return d.strftime("%Y-%m-%d")

def _today() -> dt.date:
    return dt.date.today()

def _daily_rate(apr: float) -> float:
    # APR as decimal (e.g., 0.16) -> daily compounding
    return (1.0 + float(apr)) ** (1.0 / 365.0) - 1.0

# --------------------
# DB init & migration
# --------------------
def init_db():
    con = connect()
    cur = con.cursor()
    # Create base tables
    for stmt in DDL.strip().split(";"):
        s = stmt.strip()
        if s:
            cur.execute(s)

    # --- Add new columns to loans if missing ---
    cur.execute("PRAGMA table_info(loans)")
    loan_cols = {r["name"] for r in cur.fetchall()}
    if "accrued_interest" not in loan_cols:
        cur.execute("ALTER TABLE loans ADD COLUMN accrued_interest REAL DEFAULT 0.0")
    if "last_accrual" not in loan_cols:
        cur.execute("ALTER TABLE loans ADD COLUMN last_accrual TEXT")
    if "created_at" not in loan_cols:
        cur.execute("ALTER TABLE loans ADD COLUMN created_at TEXT")

    # Initialize created_at / last_accrual if NULL on existing rows
    today = _fmt_date(_today())
    cur.execute("UPDATE loans SET created_at = COALESCE(created_at, ?)", (today,))
    cur.execute("UPDATE loans SET last_accrual = COALESCE(last_accrual, created_at)")

    # --- Add split columns to payments if missing ---
    cur.execute("PRAGMA table_info(payments)")
    pay_cols = {r["name"] for r in cur.fetchall()}
    if "interest_paid" not in pay_cols:
        cur.execute("ALTER TABLE payments ADD COLUMN interest_paid REAL DEFAULT 0.0")
    if "principal_paid" not in pay_cols:
        cur.execute("ALTER TABLE payments ADD COLUMN principal_paid REAL DEFAULT 0.0")

    con.commit()
    con.close()

# --------------------
# Balances & FX
# --------------------
def upsert_balance(currency: str, amount: float):
    con = connect(); cur = con.cursor()
    cur.execute("REPLACE INTO balances(currency, amount) VALUES(?,?)", (currency, amount))
    con.commit(); con.close()

def get_balances() -> Dict[str, float]:
    con = connect(); cur = con.cursor()
    rows = cur.execute("SELECT currency, amount FROM balances").fetchall()
    con.close()
    return {r["currency"]: r["amount"] for r in rows}

def get_fx_max_date():
    con = connect(); cur = con.cursor()
    row = cur.execute("SELECT MAX(date) AS d FROM fx").fetchone()
    con.close()
    return row["d"]  # e.g., "2025-10-10" or None if empty

def upsert_fx_many(pairs):
    con = connect(); cur = con.cursor()
    cur.executemany("REPLACE INTO fx(date,aud_per_usd) VALUES(?,?)", pairs)
    con.commit(); con.close()

def get_fx_series(limit: Optional[int]=None):
    con = connect(); cur = con.cursor()
    q = "SELECT date,aud_per_usd FROM fx ORDER BY date ASC"
    if limit:
        q += f" LIMIT {int(limit)}"
    rows = cur.execute(q).fetchall()
    con.close()
    return [dict(r) for r in rows]

# --------------------
# Loans
# --------------------
def add_loan(name, currency, principal, apr, kind, secured):
    con = connect(); cur = con.cursor()
    today = _fmt_date(_today())
    cur.execute(
        """INSERT INTO loans(name,currency,principal,apr,kind,secured,accrued_interest,last_accrual,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (name, currency, float(principal), float(apr), kind, 1 if secured else 0, 0.0, today, today)
    )
    con.commit()
    lid = cur.lastrowid
    con.close()
    return lid

def update_loan_principal(loan_id: int, new_principal: float):
    con = connect(); cur = con.cursor()
    cur.execute("UPDATE loans SET principal=? WHERE id=?", (new_principal, loan_id))
    con.commit(); con.close()

def get_loan(loan_id: int) -> dict | None:
    con = connect(); cur = con.cursor()
    row = cur.execute("SELECT * FROM loans WHERE id=?", (loan_id,)).fetchone()
    con.close()
    return dict(row) if row else None

def list_loans():
    con = connect(); cur = con.cursor()
    rows = cur.execute("SELECT * FROM loans ORDER BY secured ASC, apr DESC").fetchall()
    con.close()
    return [dict(r) for r in rows]

def list_loans_with_total():
    con = connect(); cur = con.cursor()
    rows = [dict(r) for r in cur.execute("SELECT * FROM loans ORDER BY secured ASC, apr DESC").fetchall()]
    con.close()
    for r in rows:
        r["principal"] = float(r["principal"])
        r["accrued_interest"] = float(r.get("accrued_interest", 0.0) or 0.0)
        r["total_balance"] = r["principal"] + r["accrued_interest"]
    return rows

def update_loan(loan_id: int, *, name=None, currency=None, principal=None, apr=None, kind=None, secured=None):
    con = connect(); cur = con.cursor()
    fields = []
    vals = []
    if name is not None:
        fields.append("name=?"); vals.append(name)
    if currency is not None:
        fields.append("currency=?"); vals.append(currency)
    if principal is not None:
        fields.append("principal=?"); vals.append(principal)
    if apr is not None:
        fields.append("apr=?"); vals.append(apr)
    if kind is not None:
        fields.append("kind=?"); vals.append(kind)
    if secured is not None:
        fields.append("secured=?"); vals.append(1 if secured else 0)
    if fields:
        vals.append(loan_id)
        cur.execute(f"UPDATE loans SET {', '.join(fields)} WHERE id=?", vals)
        con.commit()
    con.close()

def delete_loan(loan_id: int):
    con = connect(); cur = con.cursor()
    cur.execute("DELETE FROM payments WHERE loan_id=?", (loan_id,))
    cur.execute("DELETE FROM loans WHERE id=?", (loan_id,))
    con.commit(); con.close()

# --------------------
# Interest accrual & payments
# --------------------
def accrue_interest_to(loan_id: int, up_to_yyyy_mm_dd: str):
    """Accrue daily-compounded interest up to the given date (exclusive)."""
    con = connect(); cur = con.cursor()
    L = cur.execute(
        "SELECT id, principal, accrued_interest, apr, last_accrual, created_at FROM loans WHERE id=?",
        (loan_id,)
    ).fetchone()
    if not L:
        con.close()
        return

    principal = float(L["principal"])
    acc_int = float(L["accrued_interest"] or 0.0)
    apr = float(L["apr"] or 0.0)

    up_to = _parse_date(up_to_yyyy_mm_dd)

    # --- Determine the start date for accrual: last_accrual if exists, else created_at, else fallback ---
    if L["last_accrual"]:
        start = _parse_date(L["last_accrual"])
    elif L["created_at"]:
        start = _parse_date(L["created_at"])
    else:
        # Safety fallback: if neither exist, we set start = up_to so zero days accrue
        start = up_to

    days = (up_to - start).days
    if days <= 0 or apr <= 0 or (principal + acc_int) <= 0:
        # No accrual needed (zero days, zero APR, or zero balance)
        # But update last_accrual so we do not re-process the same date again
        cur.execute(
            "UPDATE loans SET last_accrual=? WHERE id=?",
            (_fmt_date(up_to), loan_id)
        )
        con.commit()
        con.close()
        return

    # Compute daily rate and compound
    dr = _daily_rate(apr)
    base = principal + acc_int
    interest = base * ((1.0 + dr) ** days - 1.0)

    acc_int += interest
    cur.execute(
        "UPDATE loans SET accrued_interest=?, last_accrual=? WHERE id=?",
        (acc_int, _fmt_date(up_to), loan_id)
    )
    con.commit()
    con.close()


def add_payment(date, loan_id, amount, currency, note=""):
    """
    Record a payment:
      1) Accrue daily-compounded interest up to 'date'
      2) Apply payment directly to total balance (principal + accrued interest)
      3) If fully paid, delete all records for that loan (Option 2 behavior)
    """
    amount = float(amount)

    # Accrue interest first
    accrue_interest_to(loan_id, date)

    con = connect()
    cur = con.cursor()
    L = cur.execute("SELECT principal, accrued_interest FROM loans WHERE id=?", (loan_id,)).fetchone()
    if not L:
        con.close()
        return

    principal = float(L["principal"])
    acc_int = float(L["accrued_interest"])
    total_balance = principal + acc_int

    # Apply payment
    remaining = max(0.0, total_balance - amount)

    # If fully paid — delete everything
    EPS = 1e-4
    if remaining <= EPS:
        cur.execute("DELETE FROM payments WHERE loan_id=?", (loan_id,))
        cur.execute("DELETE FROM loans WHERE id=?", (loan_id,))
        con.commit()
        con.close()
        return

    # Otherwise update remaining principal/interest ratio proportionally
    # (interest first, but purely for internal consistency)
    interest_ratio = acc_int / total_balance if total_balance > 0 else 0
    new_acc_int = remaining * interest_ratio
    new_principal = remaining - new_acc_int

    # Record the payment
    cur.execute(
        """INSERT INTO payments(date,loan_id,amount,currency,note)
           VALUES(?,?,?,?,?)""",
        (date, loan_id, amount, currency, note)
    )

    # Update loan balance
    cur.execute(
        "UPDATE loans SET principal=?, accrued_interest=?, last_accrual=? WHERE id=?",
        (new_principal, new_acc_int, date, loan_id)
    )

    con.commit()
    con.close()


def list_payments(limit: int=200):
    con = connect(); cur = con.cursor()
    rows = cur.execute("""
      SELECT p.*, l.name as loan_name
      FROM payments p
      JOIN loans l ON l.id = p.loan_id
      ORDER BY date DESC, p.id DESC
      LIMIT ?
    """, (limit,)).fetchall()
    con.close()
    return [dict(r) for r in rows]

def add_deposit(date, currency, amount, note=""):
    con = connect(); cur = con.cursor()
    cur.execute("INSERT INTO deposits(date,currency,amount,note) VALUES(?,?,?,?)",
                (date,currency,amount,note))
    cur.execute(
        "INSERT INTO balances(currency,amount) VALUES(?,?) "
        "ON CONFLICT(currency) DO UPDATE SET amount = amount + excluded.amount",
        (currency,amount)
    )
    con.commit(); did = cur.lastrowid; con.close(); return did

def list_deposits(limit: int=200):
    con = connect(); cur = con.cursor()
    rows = cur.execute("SELECT * FROM deposits ORDER BY date DESC, id DESC LIMIT ?", (limit,)).fetchall()
    con.close()
    return [dict(r) for r in rows]