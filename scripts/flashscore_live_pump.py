#!/usr/bin/env python3
"""Run the pinned Flashscore scraper and push verified snapshots to CodeRush."""
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SCRAPER_REPO = "https://github.com/omkarcloud/flashscore-scraper.git"
SCRAPER_COMMIT = "6b8a517381576b7a7a0f45ad4a23a9780fa26b72"
WORKER_URL = os.environ.get("CODERUSH_WORKER_URL", "https://coderush-devvic.tomx2000xx.workers.dev").rstrip("/")
OIDC_AUDIENCE = "api://coderush-flashscore-ingest"
POLL_SECONDS = 60
RUN_SECONDS = 345 * 60
LAGOS = ZoneInfo("Africa/Lagos")


def request_json(url, headers=None, data=None, timeout=35):
    body = None if data is None else json.dumps(data, separators=(",", ":")).encode()
    req = Request(url, data=body, headers=headers or {}, method="GET" if body is None else "POST")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def local_api(base, path, params=None):
    url = base + path
    if params:
        url += "?" + urlencode(params)
    return request_json(url, timeout=40)


def get_oidc_token():
    request_url = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL")
    request_token = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
    if not request_url or not request_token:
        raise RuntimeError("GitHub Actions OIDC token is unavailable; check id-token: write permission.")
    separator = "&" if "?" in request_url else "?"
    url = request_url + separator + "audience=" + OIDC_AUDIENCE
    result = request_json(url, headers={"Authorization": "Bearer " + request_token}, timeout=20)
    token = result.get("value")
    if not token:
        raise RuntimeError("GitHub Actions did not return an OIDC token.")
    return token


def clone_scraper(directory):
    subprocess.run(["git", "init", directory], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", directory, "remote", "add", "origin", SCRAPER_REPO], check=True)
    subprocess.run(["git", "-C", directory, "fetch", "--depth", "1", "origin", SCRAPER_COMMIT], check=True)
    subprocess.run(["git", "-C", directory, "checkout", "--detach", "FETCH_HEAD"], check=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-r", os.path.join(directory, "requirements.txt")], check=True)


def start_scraper(directory):
    env = os.environ.copy()
    env["PORT"] = "8000"
    process = subprocess.Popen(
        [sys.executable, "run.py"], cwd=directory, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    )
    base = "http://127.0.0.1:8000"
    for _ in range(90):
        if process.poll() is not None:
            raise RuntimeError("Flashscore scraper exited before becoming ready.")
        try:
            local_api(base, "/sports")
            return process, base
        except Exception:
            time.sleep(1)
    process.terminate()
    raise RuntimeError("Flashscore scraper did not become ready within 90 seconds.")


def is_final(match):
    value = (str(match.get("status") or "") + " " + str(match.get("stage") or "")).lower()
    return any(word in value for word in ("finished", "full time", "after extra time", "after penalties", "walkover", "awarded"))


def is_live(match):
    value = (str(match.get("status") or "") + " " + str(match.get("stage") or "")).lower()
    return any(word in value for word in ("live", "1st half", "2nd half", "half time", "extra time", "penalties")) and not is_final(match)


def kickoff_time(match):
    value = match.get("start_time")
    if not value:
        date = match.get("date")
        return datetime.fromisoformat(date + "T00:00:00+00:00") if date else None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def collect_day(base, day, odds_cache):
    result = local_api(base, "/matches", {"sport": "football", "date": day, "timezone": "Africa/Lagos"})
    groups = result.get("competitions") or []
    odds, details, verification = {}, {}, {}
    now = datetime.now(timezone.utc)
    for group in groups:
        for match in group.get("matches") or []:
            match_id = match.get("id")
            if not match_id:
                continue
            kickoff = kickoff_time(match)
            if kickoff and now < kickoff <= now + timedelta(hours=6) and match_id not in odds_cache:
                try:
                    price = local_api(base, "/matches/odds", {
                        "match": match_id, "bet_type": "home-draw-away",
                        "bet_scope": "full-time", "geo": "NG",
                    })
                    markets = price.get("markets") or []
                    if any(m.get("selections") for m in markets):
                        odds[match_id] = price
                        odds_cache.add(match_id)
                except Exception as exc:
                    print("odds fetch retry", match_id, str(exc)[:180], flush=True)
            if is_live(match) or is_final(match):
                try:
                    summary = local_api(base, "/matches/summary", {"match": match_id})
                    statistics = None
                    if is_live(match):
                        try:
                            statistics = local_api(base, "/matches/statistics", {"match": match_id})
                        except Exception:
                            pass
                    details[match_id] = {"summary": summary, "statistics": statistics}
                    if is_final(match):
                        try:
                            final_details = local_api(base, "/matches/details", {"match": match_id})
                            verification[match_id] = {"details": final_details, "summary": summary}
                        except Exception as exc:
                            print("final verification retry", match_id, str(exc)[:180], flush=True)
                except Exception as exc:
                    print("match detail retry", match_id, str(exc)[:180], flush=True)
    return groups, odds, details, verification


def push_snapshot(payload):
    token = get_oidc_token()
    return request_json(
        WORKER_URL + "/api/sports/ingest",
        headers={"Authorization": "Bearer " + token},
        data=payload,
        timeout=55,
    )


def main():
    start = time.monotonic()
    odds_cache = set()
    with tempfile.TemporaryDirectory(prefix="coderush-flashscore-") as directory:
        clone_scraper(directory)
        process, base = start_scraper(directory)
        try:
            cycle = 0
            while time.monotonic() - start < RUN_SECONDS:
                cycle_start = time.monotonic()
                today = datetime.now(LAGOS).date()
                days = [today.isoformat(), (today + timedelta(days=1)).isoformat()]
                competitions, odds, details, verification = [], {}, {}, {}
                for day in days:
                    try:
                        groups, day_odds, day_details, day_verification = collect_day(base, day, odds_cache)
                        competitions.extend(groups)
                        odds.update(day_odds)
                        details.update(day_details)
                        verification.update(day_verification)
                    except Exception as exc:
                        print("fixture fetch retry", day, str(exc)[:220], flush=True)
                if competitions:
                    payload = {
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                        "competitions": competitions,
                        "odds": odds,
                        "details": details,
                        "verification": verification,
                    }
                    try:
                        result = push_snapshot(payload)
                        cycle += 1
                        print("CodeRush feed cycle", cycle, json.dumps({
                            "fixtures": result.get("fixtures"), "live": result.get("live"),
                            "final": result.get("final"), "verified": result.get("verified"),
                            "odds": result.get("odds"), "settlement": result.get("settlement"),
                        }), flush=True)
                    except Exception as exc:
                        print("CodeRush ingest retry", str(exc)[:300], flush=True)
                else:
                    print("No fixture groups returned this cycle.", flush=True)
                elapsed = time.monotonic() - cycle_start
                time.sleep(max(5, POLL_SECONDS - elapsed))
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
