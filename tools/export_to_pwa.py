"""Exportiert die Daten der alten Streamlit-Budget-App als Sicherungsdatei für die neue PWA.

Aufruf im Ordner der alten App (dort, wo app.py liegt):
    .venv\\Scripts\\python export_to_pwa.py
Ergebnis: budget-sicherung-aus-alter-app.json im selben Ordner. Die Datenbank wird nur gelesen.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DB = HERE / "data" / "budget.db"
OUT_NAME = "budget-sicherung-aus-alter-app.json"


def normalize(text: str) -> str:
    return " ".join(str(text or "").split())


def tx_key(date: str, amount: int, payee: str, purpose: str) -> str:
    return "|".join([date, str(amount), normalize(payee).lower(), normalize(purpose).lower()])


def columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def tables(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def convert(db_path: Path) -> dict:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    acc_cols = columns(conn, "accounts")
    tx_cols = columns(conn, "transactions")
    has = tables(conn)

    profiles = {}
    if "import_profiles" in has:
        for r in conn.execute("SELECT account_id, mapping_json FROM import_profiles"):
            m = json.loads(r["mapping_json"])
            profiles[r["account_id"]] = {
                "date": m.get("date"), "amount": m.get("amount"), "purpose": m.get("purpose"),
                "payee": m.get("payee"), "debit": m.get("debit"), "credit": m.get("credit"),
                "useDebitCredit": bool(m.get("use_debit_credit")),
            }

    accounts = []
    for r in conn.execute("SELECT * FROM accounts ORDER BY id"):
        accounts.append({
            "id": r["id"], "name": r["name"], "area": r["area"],
            "openingBalance": r["opening_balance_cents"],
            "potType": r["pot_type"] if "pot_type" in acc_cols else None,
            "potBudget": r["pot_budget_cents"] if "pot_budget_cents" in acc_cols else None,
            "potExcluded": json.loads(r["pot_excluded_json"] or "[]") if "pot_excluded_json" in acc_cols else [],
            "profile": profiles.get(r["id"]),
        })

    categories = [{"id": r["id"], "name": r["name"], "kind": r["kind"], "order": r["sort_order"]}
                  for r in conn.execute("SELECT * FROM categories ORDER BY sort_order, id")]

    transactions = []
    for r in conn.execute("SELECT * FROM transactions ORDER BY id"):
        transactions.append({
            "id": r["id"], "accountId": r["account_id"], "date": r["booking_date"], "amount": r["amount_cents"],
            "payee": r["payee"], "purpose": r["purpose"], "categoryId": r["category_id"],
            "manual": bool(r["category_manual"]),
            "transfer": bool(r["is_transfer"]) if "is_transfer" in tx_cols else False,
            "transferManual": bool(r["transfer_manual"]) if "transfer_manual" in tx_cols else False,
            "key": tx_key(r["booking_date"], r["amount_cents"], r["payee"], r["purpose"]),
        })

    rules = [{"id": r["id"], "keyword": r["keyword"], "categoryId": r["category_id"], "priority": r["priority"]}
             for r in conn.execute("SELECT * FROM rules")]
    budgets = {f"{r['category_id']}|{r['area']}": r["amount_cents"] for r in conn.execute("SELECT * FROM budgets")}
    overrides = {f"{r['category_id']}|{r['area']}|{r['month']}": r["amount_cents"]
                 for r in conn.execute("SELECT * FROM budget_overrides")}
    pot_overrides = {}
    if "account_budget_overrides" in has:
        pot_overrides = {f"{r['account_id']}|{r['month']}": r["amount_cents"]
                         for r in conn.execute("SELECT * FROM account_budget_overrides")}
    fixed = [{"id": r["id"], "name": r["name"], "amount": r["amount_cents"], "rhythm": r["rhythm"],
              "nextDue": r["next_due"], "area": r["area"], "categoryId": r["category_id"]}
             for r in conn.execute("SELECT * FROM fixed_costs")]
    conn.close()

    all_ids = [x["id"] for group in (accounts, categories, transactions, rules, fixed) for x in group]
    now = datetime.now(timezone.utc).isoformat()
    state = {
        "version": 1, "nextId": max(all_ids, default=0) + 1, "accounts": accounts, "categories": categories,
        "transactions": transactions, "rules": rules, "budgets": budgets, "budgetOverrides": overrides,
        "potOverrides": pot_overrides, "fixedCosts": fixed, "ignoredSubscriptions": [],
        "meta": {"created": now, "updated": now, "lastBackup": None},
    }
    return {"app": "budget-pwa", "format": 1, "exportedAt": now, "data": state}


def main() -> None:
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DB
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / OUT_NAME
    if not db_path.exists():
        sys.exit(f"Keine Datenbank gefunden unter {db_path}. Liegt das Skript im Ordner der alten App?")
    payload = convert(db_path)
    out_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    data = payload["data"]
    print(f"Fertig: {len(data['accounts'])} Konten, {len(data['transactions'])} Buchungen, "
          f"{len(data['rules'])} Regeln, {len(data['fixedCosts'])} Fixkosten.")
    print(f"Sicherungsdatei: {out_path}")


if __name__ == "__main__":
    main()
