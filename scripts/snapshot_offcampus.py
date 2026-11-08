#!/usr/bin/env python3
"""
Snapshot off-campus energy drink prices and store hours from Snowflake into offcampus.js.

Runs the two procedures from ENERGY_DRINK_PRICE_AGENT.agent.yaml:
  GET_ENERGY_DRINK_PRICES(brand, store_type)  -> store, brand, product, size_oz, pack_count, price,
                                                  price_per_oz, last_updated
  GET_STORE_HOURS()                           -> store address and hours

The site is static (GitHub Pages), so it can't hold a Snowflake login. Instead this script runs on a
schedule in GitHub Actions (.github/workflows/offcampus-snapshot.yml) with the login in repository
secrets, and writes the results to offcampus.js, which the site loads like data.js.

Environment (GitHub repository secrets / variables):
  SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_WAREHOUSE        required
  SNOWFLAKE_PRIVATE_KEY (+ SNOWFLAKE_PRIVATE_KEY_PASSPHRASE)     key-pair login, or
  SNOWFLAKE_PASSWORD                                             a password or programmatic access token
  SNOWFLAKE_ROLE                                                 optional
  PRICES_PROCEDURE  default MY_DB.PUBLIC.GET_ENERGY_DRINK_PRICES
  HOURS_PROCEDURE   default MY_DB.PUBLIC.GET_STORE_HOURS

With no Snowflake settings it prints a notice and exits without touching offcampus.js, so the
scheduled job stays green until the secrets are added.

Store positions: the procedures return addresses, not coordinates, so new addresses are looked up once
with OpenStreetMap's Nominatim (1 request per second, as its usage policy asks) and cached in
scripts/store_coords.json. Fix a wrong pin by editing that file.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "offcampus.js"
COORDS = ROOT / "scripts" / "store_coords.json"
MANUAL = ROOT / "scripts" / "manual_stores.json"

PRICES_PROC = os.environ.get("PRICES_PROCEDURE") or "MY_DB.PUBLIC.GET_ENERGY_DRINK_PRICES"
HOURS_PROC = os.environ.get("HOURS_PROCEDURE") or "MY_DB.PUBLIC.GET_STORE_HOURS"
STORE_TYPES = ["GROCERY", "CONVENIENCE", "WHOLESALE"]
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_NAMES = {d: d for d in DAYS}
DAY_NAMES.update({"monday": "mon", "tuesday": "tue", "wednesday": "wed", "thursday": "thu",
                  "friday": "fri", "saturday": "sat", "sunday": "sun",
                  "tues": "tue", "weds": "wed", "thur": "thu", "thurs": "thu"})
USER_AGENT = "tamu-energize-snapshot/1.0 (https://github.com/inayah-sudo/tamu-energize)"
WHOLESALE_RE = re.compile(r"costco|sam'?s club|bj'?s wholesale", re.I)
IDENT_RE = re.compile(r'^[A-Za-z0-9_$."]+$')


# ---------------------------------------------------------------- Snowflake

def connect():
    import snowflake.connector

    kw = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "client_session_keep_alive": False,
    }
    if os.environ.get("SNOWFLAKE_ROLE"):
        kw["role"] = os.environ["SNOWFLAKE_ROLE"]
    pem = os.environ.get("SNOWFLAKE_PRIVATE_KEY")
    if pem:
        from cryptography.hazmat.primitives import serialization

        passphrase = os.environ.get("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE")
        key = serialization.load_pem_private_key(pem.encode(), password=passphrase.encode() if passphrase else None)
        kw["private_key"] = key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    else:
        kw["password"] = os.environ["SNOWFLAKE_PASSWORD"]
    return snowflake.connector.connect(**kw)


def call(cur, proc, *args):
    """CALL a procedure and return its rows as dicts with lower-case keys.

    Handles procedures that RETURN TABLE(...) and ones that return a single VARIANT / JSON value.
    """
    if not IDENT_RE.match(proc):
        sys.exit("Procedure name looks wrong: %r" % proc)
    cur.execute("CALL %s(%s)" % (proc, ", ".join(["%s"] * len(args))), args)
    cols = [c[0].lower() for c in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    if len(rows) == 1 and len(cols) == 1:          # VARIANT / JSON result
        value = rows[0][cols[0]]
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                return rows
        if isinstance(value, dict):
            value = value.get("rows") or value.get("data") or [value]
        if isinstance(value, list):
            return [{str(k).lower(): v for k, v in item.items()} for item in value if isinstance(item, dict)]
    return rows


# ---------------------------------------------------------------- normalising

def first(row, *names):
    for n in names:
        if n in row and row[n] not in (None, ""):
            return row[n]
    return None


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        m = re.search(r"-?\d+(?:\.\d+)?", str(v))
        return float(m.group()) if m else None


def iso(v):
    if v is None or v == "":
        return ""
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return str(v)


def store_key(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


TIME_RE = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?", re.I)


def to_hhmm(text):
    m = TIME_RE.fullmatch(text.strip())
    if not m:
        return None
    h, mins, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if ap.startswith("p") and h < 12:
        h += 12
    if ap.startswith("a") and h == 12:
        h = 0
    if text.strip().lower() in ("midnight",):
        h, mins = 0, 0
    if h > 24 or mins > 59:
        return None
    return "%02d:%02d" % (h % 24, mins)


def day_spec(value):
    """'7:00 AM - 10:00 PM', '07:00-22:00', 'Closed', '24 hours' -> the app's hours format, or None."""
    if value is None:
        return None
    text = str(value).strip().lower().replace("–", "-").replace("—", "-").replace(" to ", "-")
    if not text:
        return None
    if text in ("closed", "close"):
        return "closed"
    if "24" in text and "hour" in text or text in ("24h", "24/7", "open 24 hours"):
        return "24h"
    text = text.replace("midnight", "12:00 am").replace("noon", "12:00 pm")
    windows = []
    for part in text.split(","):
        bits = [b for b in part.split("-") if b.strip()]
        if len(bits) != 2:
            return None
        a, b = to_hhmm(bits[0]), to_hhmm(bits[1])
        if not a or not b:
            return None
        windows.append(a + "-" + b)
    return ",".join(windows) or None


def hours_from_row(row):
    """Per-day hours from one GET_STORE_HOURS row, if its shape allows. Returns (hours | None, text)."""
    hours = {}
    for col, val in row.items():
        c = col.replace("hours_", "").replace("_hours", "").replace("_open", "")
        if c in DAY_NAMES:
            spec = day_spec(val)
            if spec:
                hours[DAY_NAMES[c]] = spec
    raw = first(row, "hours", "hours_of_operation", "store_hours", "hours_text")
    if isinstance(raw, str) and raw.strip().startswith("{"):
        try:
            raw = json.loads(raw)
        except ValueError:
            pass
    if isinstance(raw, dict):
        for k, v in raw.items():
            k = str(k).lower()
            if k in DAY_NAMES and day_spec(v):
                hours[DAY_NAMES[k]] = day_spec(v)
        raw = None
    if len(hours) == 7:
        return hours, ""
    if raw is not None and day_spec(raw):          # one spec for every day, e.g. "6 AM - 11 PM"
        return {d: day_spec(raw) for d in DAYS}, ""
    return (hours if len(hours) == 7 else None), (str(raw) if raw is not None else "")


def build_stores(price_rows, hour_rows):
    stores = {}

    def get_store(name):
        k = store_key(name)
        if k not in stores:
            stores[k] = {"name": str(name).strip(), "store_type": "", "address": "", "hours": None,
                         "hours_text": "", "lat": None, "lng": None, "products": []}
        return stores[k]

    # Hours rows: either one row per store, or one row per store and day (day + open/close columns).
    per_day = {}
    for row in hour_rows:
        name = first(row, "store", "store_name", "name")
        if not name:
            continue
        s = get_store(name)
        s["address"] = s["address"] or str(first(row, "address", "store_address", "full_address") or "")
        s["store_type"] = s["store_type"] or str(first(row, "store_type", "type", "category") or "").lower()
        lat, lng = num(first(row, "lat", "latitude")), num(first(row, "lng", "lon", "longitude"))
        if lat is not None and lng is not None:
            s["lat"], s["lng"] = lat, lng
        day = str(first(row, "day", "day_of_week", "weekday") or "").strip().lower()
        if day[:3] in DAYS or day in DAY_NAMES:
            d = DAY_NAMES.get(day, day[:3])
            o, c = first(row, "open_time", "opens", "open"), first(row, "close_time", "closes", "close")
            spec = day_spec("%s - %s" % (o, c)) if o is not None and c is not None else day_spec(first(row, "hours"))
            if spec:
                per_day.setdefault(store_key(name), {})[d] = spec
            continue
        hours, text = hours_from_row(row)
        if hours:
            s["hours"] = hours
        elif text:
            s["hours_text"] = text
    for k, days in per_day.items():
        if len(days) == 7:
            stores[k]["hours"] = days

    for row in price_rows:
        name = first(row, "store", "store_name", "name")
        brand = first(row, "brand")
        if not name or not brand:
            continue
        s = get_store(name)
        s["store_type"] = s["store_type"] or str(first(row, "store_type", "_store_type") or "").lower()
        s["address"] = s["address"] or str(first(row, "address", "store_address") or "")
        s["products"].append({
            "brand": str(brand),
            "product": str(first(row, "product", "product_name", "item") or brand),
            "size_oz": num(first(row, "size_oz", "oz", "size")),
            "pack_count": int(num(first(row, "pack_count", "count", "pack_size")) or 1),
            "price": num(first(row, "price", "price_usd")),
            "last_updated": iso(first(row, "last_updated", "updated_at", "observed_at")),
        })

    out = []
    for s in stores.values():
        if WHOLESALE_RE.search(s["name"]):
            s["store_type"] = "wholesale"
        s["membership_required"] = s["store_type"] == "wholesale"
        # one product per brand/product/size/pack: keep the most recently updated row
        seen = {}
        for p in s["products"]:
            k = (p["brand"], p["product"], p["size_oz"], p["pack_count"])
            if k not in seen or p["last_updated"] > seen[k]["last_updated"]:
                seen[k] = p
        s["products"] = sorted(seen.values(), key=lambda p: (p["brand"], p["product"], p["pack_count"], p["size_oz"] or 0))
        s["id"] = re.sub(r"[^a-z0-9]+", "-", s["name"].lower()).strip("-")[:40]
        out.append(s)
    return sorted(out, key=lambda s: s["name"].lower())


def merge_manual(stores):
    """Add the stores from scripts/manual_stores.json. Snowflake wins for anything it provides."""
    if not MANUAL.exists():
        return stores
    by_key = {store_key(s["name"]): s for s in stores}
    for m in json.loads(MANUAL.read_text(encoding="utf-8")).get("stores", []):
        k = store_key(m["name"])
        if k not in by_key:
            by_key[k] = {"name": m["name"], "store_type": "", "address": "", "hours": None,
                         "hours_text": "", "lat": None, "lng": None, "products": [],
                         "membership_required": False,
                         "id": re.sub(r"[^a-z0-9]+", "-", m["name"].lower()).strip("-")[:40]}
        s = by_key[k]
        for field in ("short", "store_type", "address", "hours", "hours_text", "lat", "lng"):
            if s.get(field) in (None, "") and m.get(field) not in (None, ""):
                s[field] = m[field]
        if not s["products"]:
            s["products"] = m.get("products", [])
        s["membership_required"] = s["store_type"] == "wholesale"
    return sorted(by_key.values(), key=lambda s: s["name"].lower())


# ---------------------------------------------------------------- store positions

def place_stores(stores):
    cache = json.loads(COORDS.read_text(encoding="utf-8")) if COORDS.exists() else {}
    changed = False
    for s in stores:
        if s["lat"] is not None:
            continue
        addr = s["address"] or s["name"]
        key = (s["name"] + " | " + addr).strip()
        if key not in cache:
            query = addr if re.search(r"\bTX\b|Texas", addr, re.I) else addr + ", College Station, TX"
            url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
                {"q": query, "format": "json", "limit": 1, "countrycodes": "us"})
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=20) as r:
                    hits = json.load(r)
                cache[key] = [float(hits[0]["lat"]), float(hits[0]["lon"])] if hits else None
            except Exception as e:  # leave it for the next run
                print("  could not look up %r: %s" % (query, e))
                continue
            changed = True
            time.sleep(1.1)
        if cache.get(key):
            s["lat"], s["lng"] = cache[key]
    if changed:
        COORDS.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def keep_map_stores(stores):
    """Publish only real stores that have a map position; sample rows in Snowflake stay out of the site."""
    kept = []
    for s in stores:
        if re.match(r"sample\b", s["name"], re.I) or re.search(r"test address", s["address"], re.I):
            print("  leaving out sample store: %s" % s["name"])
        elif s["lat"] is None or s["lng"] is None:
            print("  leaving out %s: no map position (add lat/lng in scripts/store_coords.json)" % s["name"])
        else:
            kept.append(s)
    return kept


# ---------------------------------------------------------------- output

def read_existing():
    if not OUT.exists():
        return None
    text = OUT.read_text(encoding="utf-8")
    m = re.search(r"window\.OFFCAMPUS_DATA\s*=\s*(\{.*\});?\s*$", text, re.S)
    try:
        return json.loads(m.group(1)) if m else None
    except ValueError:
        return None


def write(stores):
    old = read_existing()
    if old and old.get("meta", {}).get("status") == "ok" and old.get("stores") == stores:
        print("No changes since the last snapshot.")
        return
    data = {
        "meta": {
            "status": "ok",
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "source": "Snowflake: %s, %s" % (PRICES_PROC, HOURS_PROC),
            "store_count": len(stores),
            "product_count": sum(len(s["products"]) for s in stores),
        },
        "stores": stores,
    }
    header = ("/*\n * offcampus.js - off-campus energy drink prices and store hours for College Station.\n"
              " * Written by scripts/snapshot_offcampus.py from Snowflake. Don't edit by hand.\n */\n")
    OUT.write_text(header + "window.OFFCAMPUS_DATA = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Wrote %d stores and %d products to %s" % (len(stores), data["meta"]["product_count"], OUT.name))


def default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    return str(o)


def main():
    needed = ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_WAREHOUSE"]
    missing = [n for n in needed if not os.environ.get(n)]
    if not (os.environ.get("SNOWFLAKE_PRIVATE_KEY") or os.environ.get("SNOWFLAKE_PASSWORD")):
        missing.append("SNOWFLAKE_PRIVATE_KEY or SNOWFLAKE_PASSWORD")
    if missing:
        print("::notice::Snowflake isn't set up yet (missing %s). offcampus.js was left as it is." % ", ".join(missing))
        return

    conn = connect()
    try:
        cur = conn.cursor()
        price_rows = []
        for t in STORE_TYPES:
            for row in call(cur, PRICES_PROC, "ALL", t):
                row.setdefault("_store_type", t.lower())
                price_rows.append(row)
        hour_rows = call(cur, HOURS_PROC)
    finally:
        conn.close()

    # Decimal / date values from Snowflake -> plain JSON types
    price_rows = json.loads(json.dumps(price_rows, default=default))
    hour_rows = json.loads(json.dumps(hour_rows, default=default))
    print("Got %d price rows and %d store-hours rows." % (len(price_rows), len(hour_rows)))

    stores = merge_manual(build_stores(price_rows, hour_rows))
    place_stores(stores)
    write(keep_map_stores(stores))


if __name__ == "__main__":
    main()
