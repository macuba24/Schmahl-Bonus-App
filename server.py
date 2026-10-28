"""Kundenkarte der Schmahl GmbH. Ein Prozess, eine SQLite-Datei, kein Konto."""

from __future__ import annotations

import json
import os
import secrets
import socket
import sqlite3
import sys
import threading
import traceback
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo

HOST = "127.0.0.1"
PORT = 8765
ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DB_PATH = ROOT / "data" / "schmahl.sqlite"
RECEIPTS = ROOT / "data" / "receipts"
LOCK = threading.Lock()
BERLIN = ZoneInfo("Europe/Berlin")
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TIERS = (100_000, 300_000, 500_000, 1_000_000)
MONTHS = (
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
)

SHOP = {
    "name": "Schmahl GmbH",
    "wordmark": "Schmahl",
    "street": "Carl-Spaeter-Straße 13",
    "district": "Industriegebiet Rheinhafen",
    "postalCode": "56070",
    "city": "Koblenz",
    "phone": "0261 / 30488-0",
    "phoneHref": "tel:+49261304880",
    "hours": ("Mo.–Fr. 7.30–17.00 Uhr", "Samstags geschlossen"),
}

DEFAULT_BENEFITS = {
    100_000: "Sichtprüfung eines Geräts",
    300_000: "Vorteil auf Verschleißteile, den der Laden an der Kasse nennt",
    500_000: "kostenlose Abholung eines Geräts zur Inspektion im Ortsgebiet",
    1_000_000: "ein Service im Jahr, den der Laden an der Kasse festlegt",
}

SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS customers (
      number TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      kundennummer TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT NOT NULL REFERENCES customers(number),
      amount_cents INTEGER NOT NULL,
      booked_at TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS benefits (
      tier_cents INTEGER PRIMARY KEY,
      text TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS redemptions (
      customer_number TEXT NOT NULL REFERENCES customers(number),
      year INTEGER NOT NULL,
      tier_cents INTEGER NOT NULL,
      redeemed_at TEXT NOT NULL,
      PRIMARY KEY (customer_number, year, tier_cents)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS purchases_customer_year
    ON purchases(customer_number, year)
    """,
    """
    CREATE INDEX IF NOT EXISTS purchases_month
    ON purchases(year, month)
    """,
    """
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT NOT NULL REFERENCES customers(number),
      stored_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_number TEXT NOT NULL REFERENCES customers(number),
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
]


class AppError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def euro_label(cents: int) -> str:
    euros = int(cents) // 100
    return f"{euros:,}".replace(",", ".") + " Euro"


def two_percent_cents(amount_cents: int) -> int:
    share = (Decimal(int(amount_cents)) * Decimal(2) / Decimal(100)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return int(share)


def local_now() -> datetime:
    return datetime.now(BERLIN).replace(microsecond=0)


def clean_name(value) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    text = " ".join(text.split())
    if not text:
        raise AppError("Bitte den Namen eingeben.")
    if len(text) > 40:
        raise AppError("Der Name ist zu lang. Höchstens 40 Zeichen.")
    if any(unicodedata.category(ch).startswith("C") for ch in text):
        raise AppError("Der Name enthält ein Zeichen, das nicht geht.")
    return text


def clean_benefit(value) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    text = " ".join(text.split())
    if not text:
        raise AppError("Ein Vorteilssatz ist leer.")
    if len(text) > 240:
        raise AppError("Ein Vorteilssatz ist zu lang. Höchstens 240 Zeichen.")
    return text


def parse_cents(value) -> int:
    if isinstance(value, bool) or value is None:
        raise AppError("Bitte den gezahlten Betrag in Euro.")
    text = str(value).strip().replace("€", "").replace("\u00a0", "").replace(" ", "")
    if not text:
        raise AppError("Bitte den gezahlten Betrag in Euro.")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        amount = Decimal(text)
    except InvalidOperation:
        raise AppError("Der Betrag ist so nicht lesbar. Zum Beispiel 400,00.")
    if amount <= 0:
        raise AppError("Der Betrag ist größer als null.")
    if amount > Decimal("1000000"):
        raise AppError("Der Betrag ist zu hoch für diese Fassung.")
    cents = int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if cents <= 0:
        raise AppError("Der Betrag ist größer als null.")
    return cents


def normalize_number(value) -> str:
    text = "".join(str(value or "").split()).upper()
    if any(unicodedata.category(ch).startswith("C") for ch in text):
        raise AppError("Diese Kundennummer gibt es nicht.")
    if len(text) > 32:
        raise AppError("Diese Kundennummer gibt es nicht.")
    return text


def parse_tier(value) -> int:
    try:
        tier = int(str(value).strip())
    except (TypeError, ValueError):
        raise AppError("Diese Stufe gibt es nicht.")
    if tier not in TIERS:
        raise AppError("Diese Stufe gibt es nicht.")
    return tier


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def db():
    with LOCK:
        conn = connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db() -> None:
    with db() as conn:
        for statement in SCHEMA:
            conn.execute(statement)
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(customers)")}
        if "address" not in columns:
            conn.execute("ALTER TABLE customers ADD COLUMN address TEXT NOT NULL DEFAULT ''")
        if "kundennummer" not in columns:
            conn.execute("ALTER TABLE customers ADD COLUMN kundennummer TEXT NOT NULL DEFAULT ''")
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS customers_kundennummer
            ON customers(kundennummer)
            WHERE kundennummer != ''
            """
        )
        conn.executemany(
            """
            INSERT INTO benefits (tier_cents, text)
            VALUES (?, ?)
            ON CONFLICT(tier_cents) DO NOTHING
            """,
            list(DEFAULT_BENEFITS.items()),
        )


def benefit_rows(conn):
    rows = conn.execute("SELECT tier_cents, text FROM benefits ORDER BY tier_cents").fetchall()
    found = {int(row["tier_cents"]): row["text"] for row in rows}
    return [(tier, found.get(tier, DEFAULT_BENEFITS[tier])) for tier in TIERS]


def benefits_json(conn) -> list:
    return [
        {"tierCents": tier, "label": euro_label(tier), "text": text}
        for tier, text in benefit_rows(conn)
    ]


def month_turnover(conn, year: int, month: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM purchases WHERE year = ? AND month = ?",
        (year, month),
    ).fetchone()
    return int(row["s"])


def month_json(conn, moment: datetime) -> dict:
    total = month_turnover(conn, moment.year, moment.month)
    return {
        "year": moment.year,
        "month": moment.month,
        "monthName": MONTHS[moment.month - 1],
        "turnoverCents": total,
        "feeCents": two_percent_cents(total),
    }


def app_url() -> str:
    raw = os.environ.get("SCHMAHL_URL", "").strip()
    if raw:
        if not raw.startswith(("http://", "https://")):
            raw = "http://" + raw
        return raw.rstrip("/") + "/"
    ip = "127.0.0.1"
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("10.255.255.255", 1))
        ip = sock.getsockname()[0]
        sock.close()
    except OSError:
        pass
    return f"http://{ip}:{PORT}/"


def qr_svg(url: str) -> str:
    import segno

    code = segno.make(url, error="h")
    svg = code.svg_inline(scale=4, border=4)
    start = svg.find("<svg")
    return svg[start:] if start >= 0 else svg


def prospekt_page(url: str) -> bytes:
    svg = qr_svg(url)
    html = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kundenkarte Schmahl</title>
  <style>
    @page {{ margin: 14mm; }}
    body {{ margin: 0; background: #fff; color: #111; font-family: "Segoe UI", sans-serif; }}
    main {{ max-width: 92mm; margin: 0 auto; text-align: center; padding: 10mm 6mm 12mm; }}
    h1 {{ font-size: 22pt; font-weight: 650; margin: 0 0 3mm; letter-spacing: 0.01em; }}
    .lead {{ font-size: 13pt; margin: 0 0 6mm; }}
    svg {{ width: 62mm; height: 62mm; }}
    .url {{ font-family: Consolas, "Courier New", monospace; font-size: 11pt; margin: 5mm 0 2mm; word-break: break-all; }}
    .hint {{ font-size: 10pt; margin: 0; }}
    .tools {{ margin-top: 8mm; font-size: 11pt; }}
    @media screen {{
      body {{ background: #e8e4dc; }}
      main {{ background: #fff; margin-top: 8mm; box-shadow: 0 0 0 1px rgba(0,0,0,0.06); }}
    }}
    @media print {{
      .tools {{ display: none; }}
    }}
  </style>
</head>
<body>
  <main>
    <h1>Schmahl</h1>
    <p class="lead">Kundenkarte aufs Handy laden</p>
    {svg}
    <p class="url">{escape(url)}</p>
    <p class="hint">Derselbe Kode hängt im Laden und steht auf dem Prospekt.</p>
    <p class="tools"><a href="/prospekt.svg">Zeichen für den Druck speichern</a></p>
  </main>
</body>
</html>
"""
    return html.encode("utf-8")


def laden_json(conn) -> dict:
    now = local_now()
    return {
        "name": SHOP["name"],
        "wordmark": SHOP["wordmark"],
        "street": SHOP["street"],
        "district": SHOP["district"],
        "postalCode": SHOP["postalCode"],
        "city": SHOP["city"],
        "phone": SHOP["phone"],
        "phoneHref": SHOP["phoneHref"],
        "hours": list(SHOP["hours"]),
        "tiers": benefits_json(conn),
        "month": month_json(conn, now),
        "appUrl": app_url(),
    }


def get_customer(conn, number: str):
    row = conn.execute("SELECT * FROM customers WHERE number = ?", (number,)).fetchone()
    if row is None and number:
        row = conn.execute(
            "SELECT * FROM customers WHERE kundennummer = ? AND kundennummer != ''",
            (number,),
        ).fetchone()
    if row is None:
        raise AppError("Diesen Kode oder diese Kundennummer gibt es nicht.", 404)
    return row


def year_turnover(conn, number: str, year: int) -> int:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(amount_cents), 0) AS s
        FROM purchases
        WHERE customer_number = ? AND year = ?
        """,
        (number, year),
    ).fetchone()
    return int(row["s"])


def card_json(conn, number: str, moment: datetime | None = None) -> dict:
    moment = moment or local_now()
    customer = get_customer(conn, number)
    ident = customer["number"]
    turnover = year_turnover(conn, ident, moment.year)
    reached = None
    nxt = None
    for tier in TIERS:
        if turnover >= tier:
            reached = tier
        elif nxt is None:
            nxt = tier
    redeemed = {
        int(row["tier_cents"])
        for row in conn.execute(
            "SELECT tier_cents FROM redemptions WHERE customer_number = ? AND year = ?",
            (ident, moment.year),
        )
    }
    benefits = []
    for tier, text in benefit_rows(conn):
        benefits.append(
            {
                "tierCents": tier,
                "label": euro_label(tier),
                "text": text,
                "reached": turnover >= tier,
                "redeemed": tier in redeemed,
            }
        )
    return {
        "number": customer["number"],
        "kode": customer["number"],
        "name": customer["name"],
        "address": customer["address"] or "",
        "kundennummer": customer["kundennummer"] or "",
        "year": moment.year,
        "turnoverCents": turnover,
        "reachedTierCents": reached,
        "nextTierCents": nxt,
        "remainingCents": None if nxt is None else nxt - turnover,
        "benefits": benefits,
        "receipt": latest_receipt(conn, number),
        "messages": message_rows(conn, number),
    }


def mint_number(conn) -> str:
    for _ in range(40):
        number = "".join(secrets.choice(ALPHABET) for _ in range(8))
        if conn.execute("SELECT 1 FROM customers WHERE number = ?", (number,)).fetchone() is None:
            return number
    raise AppError("Gerade lässt sich kein Kundenkode erzeugen. Bitte noch einmal.", 500)


def clean_address(value) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    text = " ".join(text.split())
    if not text:
        raise AppError("Bitte die Adresse eingeben.")
    if len(text) > 120:
        raise AppError("Die Adresse ist zu lang. Höchstens 120 Zeichen.")
    if any(unicodedata.category(ch).startswith("C") for ch in text):
        raise AppError("Die Adresse enthält ein Zeichen, das nicht geht.")
    return text


def clean_kundennummer(value) -> str:
    text = "".join(str(value or "").split()).upper()
    if not text:
        raise AppError("Bitte die Kundennummer eingeben.")
    if len(text) > 32:
        raise AppError("Die Kundennummer ist zu lang.")
    if any(unicodedata.category(ch).startswith("C") for ch in text):
        raise AppError("Die Kundennummer enthält ein Zeichen, das nicht geht.")
    return text


def create_customer(conn, name) -> dict:
    cleaned = clean_name(name)
    number = mint_number(conn)
    now = local_now()
    conn.execute(
        "INSERT INTO customers (number, name, created_at) VALUES (?, ?, ?)",
        (number, cleaned, now.isoformat(timespec="seconds")),
    )
    return card_json(conn, number, now)


def book(conn, raw_number, amount) -> dict:
    number = normalize_number(raw_number)
    if not number:
        raise AppError("Bitte die Kundennummer eingeben.")
    get_customer(conn, number)
    cents = parse_cents(amount)
    now = local_now()
    conn.execute(
        """
        INSERT INTO purchases (customer_number, amount_cents, booked_at, year, month)
        VALUES (?, ?, ?, ?, ?)
        """,
        (number, cents, now.isoformat(timespec="seconds"), now.year, now.month),
    )
    return {"card": card_json(conn, number, now), "month": month_json(conn, now)}


def clean_message(value) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).replace("\r\n", "\n").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in text.split("\n")]
    text = "\n".join(line for line in lines if line)
    if not text:
        raise AppError("Bitte eine Nachricht schreiben.")
    if len(text) > 1000:
        raise AppError("Die Nachricht ist zu lang. Höchstens 1000 Zeichen.")
    if any(unicodedata.category(ch).startswith("C") for ch in text):
        raise AppError("Die Nachricht enthält ein Zeichen, das nicht geht.")
    return text


def clean_sender(value) -> str:
    sender = str(value or "").strip().lower()
    if sender not in ("kunde", "firma"):
        raise AppError("Der Absender stimmt nicht.")
    return sender


def message_rows(conn, number: str) -> list:
    rows = conn.execute(
        """
        SELECT id, sender, body, created_at
        FROM messages
        WHERE customer_number = ?
        ORDER BY id DESC
        LIMIT 40
        """,
        (number,),
    ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "sender": row["sender"],
            "text": row["body"],
            "at": row["created_at"],
        }
        for row in reversed(rows)
    ]


def latest_receipt(conn, number: str):
    row = conn.execute(
        """
        SELECT id, stored_at
        FROM receipts
        WHERE customer_number = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (number,),
    ).fetchone()
    if row is None:
        return None
    return {"id": int(row["id"]), "storedAt": row["stored_at"]}


def post_message(conn, raw_number, text, sender) -> dict:
    number = normalize_number(raw_number)
    if not number:
        raise AppError("Bitte die Kundennummer eingeben.")
    get_customer(conn, number)
    body = clean_message(text)
    who = clean_sender(sender)
    now = local_now()
    conn.execute(
        """
        INSERT INTO messages (customer_number, sender, body, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (number, who, body, now.isoformat(timespec="seconds")),
    )
    return card_json(conn, number, now)


def save_receipt(conn, raw_number, payload) -> dict:
    import base64

    number = normalize_number(raw_number)
    if not number:
        raise AppError("Bitte die Kundennummer eingeben.")
    get_customer(conn, number)
    if not isinstance(payload, str) or not payload.strip():
        raise AppError("Die Rechnung fehlt.")
    encoded = payload.strip()
    if "," in encoded and encoded.lower().startswith("data:"):
        encoded = encoded.split(",", 1)[1]
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception:
        raise AppError("Die Rechnung ist so nicht lesbar.")
    if len(raw) < 200 or len(raw) > 1_200_000:
        raise AppError("Die Rechnung ist zu groß oder leer.")
    if not raw.startswith(b"\xff\xd8"):
        raise AppError("Bitte die Rechnung als Foto aufnehmen.")
    now = local_now()
    cursor = conn.execute(
        "INSERT INTO receipts (customer_number, stored_at) VALUES (?, ?)",
        (number, now.isoformat(timespec="seconds")),
    )
    receipt_id = int(cursor.lastrowid)
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    (RECEIPTS / f"{receipt_id}.jpg").write_bytes(raw)
    return card_json(conn, number, now)


def redeem_benefit(conn, raw_number, tier_value) -> dict:
    number = normalize_number(raw_number)
    if not number:
        raise AppError("Bitte die Kundennummer eingeben.")
    get_customer(conn, number)
    tier = parse_tier(tier_value)
    now = local_now()
    if year_turnover(conn, number, now.year) < tier:
        raise AppError("Diese Stufe ist noch nicht erreicht.")
    exists = conn.execute(
        """
        SELECT 1 FROM redemptions
        WHERE customer_number = ? AND year = ? AND tier_cents = ?
        """,
        (number, now.year, tier),
    ).fetchone()
    if exists is not None:
        raise AppError("Dieser Vorteil ist schon eingelöst.")
    conn.execute(
        """
        INSERT INTO redemptions (customer_number, year, tier_cents, redeemed_at)
        VALUES (?, ?, ?, ?)
        """,
        (number, now.year, tier, now.isoformat(timespec="seconds")),
    )
    return card_json(conn, number, now)


def update_benefits(conn, body: dict) -> list:
    texts = body.get("texts") if isinstance(body, dict) else None
    if not isinstance(texts, dict):
        raise AppError("Die Vorteilssätze fehlen.")
    cleaned = {}
    for tier in TIERS:
        raw = texts.get(str(tier), texts.get(tier))
        if raw is None:
            raise AppError("Es braucht alle vier Vorteilssätze.")
        cleaned[tier] = clean_benefit(raw)
    conn.executemany(
        "UPDATE benefits SET text = ? WHERE tier_cents = ?",
        [(text, tier) for tier, text in cleaned.items()],
    )
    return benefits_json(conn)


def self_check() -> None:
    import shutil
    import tempfile

    global DB_PATH
    original = DB_PATH
    folder = Path(tempfile.mkdtemp(prefix="schmahl-"))
    try:
        assert two_percent_cents(40_000) == 800
        assert two_percent_cents(110_000) == 2_200
        assert two_percent_cents(25) == 1
        assert two_percent_cents(24) == 0
        assert two_percent_cents(75) == 2
        assert parse_cents("400") == 40_000
        assert parse_cents("400,00") == 40_000
        assert parse_cents("1.100,00") == 110_000
        assert parse_cents("700") == 70_000
        assert SHOP["name"] == "Schmahl GmbH"
        assert SHOP["street"] == "Carl-Spaeter-Straße 13"
        assert SHOP["postalCode"] == "56070"
        assert SHOP["city"] == "Koblenz"
        assert SHOP["phone"] == "0261 / 30488-0"
        assert "7.30" in SHOP["hours"][0] and "17.00" in SHOP["hours"][0]
        assert "geschlossen" in SHOP["hours"][1]
        assert list(DEFAULT_BENEFITS) == list(TIERS)
        assert DEFAULT_BENEFITS[100_000].startswith("Sichtprüfung")

        DB_PATH = folder / "t.sqlite"
        init_db()
        with db() as conn:
            names = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            assert {"customers", "purchases", "benefits", "redemptions"} <= names
            assert "lose" not in names and "shops" not in names
            laden = laden_json(conn)
        assert laden["name"] == "Schmahl GmbH"
        assert [tier["text"] for tier in laden["tiers"]] == list(DEFAULT_BENEFITS.values())
        assert laden["month"]["feeCents"] == 0

        with db() as conn:
            card = create_customer(conn, "Ada Berger")
            number = card["number"]
        assert len(number) == 8
        assert set(number) <= set(ALPHABET)
        assert card["turnoverCents"] == 0
        assert card["reachedTierCents"] is None
        assert card["remainingCents"] == 100_000

        try:
            with db() as conn:
                book(conn, "", "400")
            raise AssertionError("ohne Nummer gebucht")
        except AppError as error:
            assert "Kundennummer" in str(error)
        try:
            with db() as conn:
                book(conn, "ZZZZZZZZ", "400")
            raise AssertionError("fremde Nummer gebucht")
        except AppError as error:
            assert "nicht" in str(error)
        with db() as conn:
            assert conn.execute("SELECT COUNT(*) AS n FROM purchases").fetchone()["n"] == 0

        with db() as conn:
            first = book(conn, number.lower(), "400")
        assert first["card"]["turnoverCents"] == 40_000
        assert first["card"]["reachedTierCents"] is None
        assert first["card"]["remainingCents"] == 60_000
        assert first["card"]["benefits"][0]["reached"] is False
        assert first["month"]["turnoverCents"] == 40_000
        assert first["month"]["feeCents"] == 800

        try:
            with db() as conn:
                book(conn, number, "")
            raise AssertionError("leerer Betrag gebucht")
        except AppError as error:
            assert "Betrag" in str(error)
        with db() as conn:
            assert conn.execute("SELECT COUNT(*) AS n FROM purchases").fetchone()["n"] == 1

        with db() as conn:
            second = book(conn, number, "700")
        assert second["card"]["turnoverCents"] == 110_000
        assert second["card"]["reachedTierCents"] == 100_000
        assert second["card"]["remainingCents"] == 190_000
        assert second["card"]["benefits"][0]["reached"] is True
        assert second["card"]["benefits"][0]["redeemed"] is False
        assert second["card"]["benefits"][0]["text"] == "Sichtprüfung eines Geräts"
        assert second["card"]["benefits"][1]["reached"] is False
        assert second["month"]["turnoverCents"] == 110_000
        assert second["month"]["feeCents"] == 2_200

        try:
            with db() as conn:
                redeem_benefit(conn, number, 300_000)
            raise AssertionError("offene höhere Stufe ging durch")
        except AppError as error:
            assert "noch nicht" in str(error)

        with db() as conn:
            marked = redeem_benefit(conn, number, "100000")
        assert marked["benefits"][0]["redeemed"] is True
        try:
            with db() as conn:
                redeem_benefit(conn, number, 100_000)
            raise AssertionError("doppeltes Einlösen ging durch")
        except AppError as error:
            assert "schon" in str(error)

        with db() as conn:
            update_benefits(
                conn,
                {
                    "texts": {
                        "100000": "Sichtprüfung am Tresen",
                        "300000": DEFAULT_BENEFITS[300_000],
                        "500000": DEFAULT_BENEFITS[500_000],
                        "1000000": DEFAULT_BENEFITS[1_000_000],
                    }
                },
            )
            again = card_json(conn, number)
            now = local_now()
            conn.execute(
                """
                INSERT INTO purchases (customer_number, amount_cents, booked_at, year, month)
                VALUES (?, ?, ?, ?, ?)
                """,
                (number, 500_000, now.isoformat(timespec="seconds"), now.year - 1, 12),
            )
            kept = card_json(conn, number)
            month = month_json(conn, now)
        assert again["benefits"][0]["text"] == "Sichtprüfung am Tresen"
        assert again["benefits"][0]["redeemed"] is True
        assert kept["turnoverCents"] == 110_000
        assert month["turnoverCents"] == 110_000
        assert month["feeCents"] == 2_200

        with db() as conn:
            exact = create_customer(conn, "Bea")
            full = book(conn, exact["number"], "1000,00")
        assert full["card"]["reachedTierCents"] == 100_000
        assert full["card"]["remainingCents"] == 200_000
        assert full["month"]["feeCents"] == two_percent_cents(110_000 + 100_000)

        with db() as conn:
            wrote = post_message(conn, exact["number"], "Wann ist die Säge fertig?", "kunde")
        assert wrote["messages"][-1]["sender"] == "kunde"
        assert wrote["messages"][-1]["text"] == "Wann ist die Säge fertig?"

        print("Prüfung in Ordnung.", flush=True)
    finally:
        DB_PATH = original
        shutil.rmtree(folder, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError):
            return

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    def _handle(self):
        try:
            parsed = urlparse(self.path)
            parts = [unquote(part) for part in parsed.path.split("/") if part]
            if self.command == "GET" and parsed.path == "/prospekt":
                self._bytes(prospekt_page(app_url()), 200, "text/html; charset=utf-8")
                return
            if self.command == "GET" and parsed.path == "/prospekt.svg":
                svg = qr_svg(app_url()).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
                self.send_header("Content-Length", str(len(svg)))
                self.send_header("Content-Disposition", 'attachment; filename="schmahl-prospekt.svg"')
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(svg)
                return
            if self.command == "GET" and parsed.path in ("/", "/index.html"):
                self._file("index.html", "text/html; charset=utf-8")
                return
            if self.command == "GET" and parsed.path == "/app.js":
                self._file("app.js", "text/javascript; charset=utf-8")
                return
            if self.command == "GET" and parsed.path == "/style.css":
                self._file("style.css", "text/css; charset=utf-8")
                return
            if self.command == "GET" and parsed.path == "/logo.png":
                logo = STATIC / "logo.png"
                if logo.is_file():
                    self._bytes(logo.read_bytes(), 200, "image/png")
                else:
                    self._empty(404)
                return
            if parsed.path == "/favicon.ico":
                self._empty(204)
                return
            if (
                self.command == "GET"
                and len(parts) == 3
                and parts[:2] == ["api", "rechnung"]
                and parts[2].isdigit()
            ):
                self._receipt(int(parts[2]))
                return
            if parts and parts[0] == "api":
                payload, status = self._api(parts)
                self._json(payload, status)
                return
            self._json({"error": "Diese Seite gibt es nicht."}, 404)
        except AppError as error:
            self._json({"error": str(error)}, error.status)
        except Exception:
            traceback.print_exc()
            self._json({"error": "Das hat auf dem Server nicht geklappt."}, 500)

    def _api(self, parts):
        method = self.command
        if method == "GET" and parts == ["api", "laden"]:
            with db() as conn:
                return laden_json(conn), 200
        if method == "POST" and parts == ["api", "kunde"]:
            body = self._body()
            with db() as conn:
                return create_customer(conn, body.get("name")), 200
        if method == "GET" and len(parts) == 3 and parts[:2] == ["api", "kunde"]:
            number = normalize_number(parts[2])
            if not number:
                raise AppError("Bitte die Kundennummer eingeben.")
            with db() as conn:
                return card_json(conn, number), 200
        if method == "POST" and parts == ["api", "buchung"]:
            body = self._body()
            with db() as conn:
                return book(conn, body.get("number"), body.get("amount")), 200
        if method == "POST" and parts == ["api", "eingeloest"]:
            body = self._body()
            with db() as conn:
                return redeem_benefit(conn, body.get("number"), body.get("tierCents")), 200
        if method == "POST" and parts == ["api", "vorteile"]:
            body = self._body()
            with db() as conn:
                return {"tiers": update_benefits(conn, body)}, 200
        if method == "POST" and parts == ["api", "nachricht"]:
            body = self._body()
            with db() as conn:
                return post_message(conn, body.get("number"), body.get("text"), body.get("sender")), 200
        if method == "POST" and parts == ["api", "rechnung"]:
            body = self._body(2_500_000)
            with db() as conn:
                return save_receipt(conn, body.get("number"), body.get("jpeg")), 200
        raise AppError("Diese Seite gibt es nicht.", 404)

    def _receipt(self, receipt_id: int) -> None:
        path = RECEIPTS / f"{receipt_id}.jpg"
        if not path.is_file():
            self._json({"error": "Diese Rechnung gibt es nicht."}, 404)
            return
        self._bytes(path.read_bytes(), 200, "image/jpeg")

    def _body(self, limit: int = 20_000) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise AppError("Das ist zu groß.", 413)
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AppError("Das Format stimmt nicht.")
        if not isinstance(payload, dict):
            raise AppError("Das Format stimmt nicht.")
        return payload

    def _file(self, name: str, content_type: str) -> None:
        self._bytes((STATIC / name).read_bytes(), 200, content_type)

    def _json(self, payload, status: int) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._bytes(raw, status, "application/json; charset=utf-8")

    def _empty(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _bytes(self, raw: bytes, status: int, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    init_db()
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        print(f"Port {PORT} ist belegt ({error}).", flush=True)
        raise SystemExit(1)
    httpd.daemon_threads = True
    print(f"Kundenkarte Schmahl  http://127.0.0.1:{PORT}", flush=True)
    print(f"Prospekt             {app_url()}prospekt", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Stopp.", flush=True)
        httpd.server_close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        try:
            self_check()
        except Exception as error:
            traceback.print_exc()
            print(f"Prüfung fehlgeschlagen: {error}", flush=True)
            raise SystemExit(1)
    else:
        main()
