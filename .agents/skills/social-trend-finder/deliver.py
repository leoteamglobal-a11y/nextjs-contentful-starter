#!/usr/bin/env python3
"""
deliver.py  (SKILL SIDE — runs inside Claude, stdlib only)

Emails the finished digest to the company recipient list via the SendGrid HTTP
API (no SDK). Recipients + sender come from ~/.social-trend-finder/config.json;
the SendGrid key comes from ~/.social-trend-finder/.env (SENDGRID_API_KEY).

The digest body is HTML and is read from --file, --message, or stdin.

Usage:
  python3 deliver.py --subject "Social Trends - 17 Jun" --file /tmp/stf-digest.html
  echo "<h1>...</h1>" | python3 deliver.py --subject "..."

If no key / recipients / from address are configured, the body is printed to
stdout so Claude can show it in chat instead (graceful fallback).
"""

import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError

USER_DIR = Path.home() / ".social-trend-finder"
CONFIG_PATH = USER_DIR / "config.json"
ENV_PATH = USER_DIR / ".env"
SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"


def load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            return {}
    return {}


def get_body(args) -> str:
    if args.message:
        return args.message
    if args.file:
        return Path(args.file).read_text()
    return sys.stdin.read()


def send_sendgrid(api_key, from_email, recipients, subject, html) -> int:
    payload = {
        "personalizations": [{"to": [{"email": e} for e in recipients]}],
        "from": {"email": from_email},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }
    req = Request(
        SENDGRID_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(req, timeout=20) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", default="Social Trends Digest")
    ap.add_argument("--file")
    ap.add_argument("--message")
    args = ap.parse_args()

    body = get_body(args)
    if not body.strip():
        print(json.dumps({"status": "skipped", "reason": "empty body"}))
        return

    config = load_config()
    api_key = load_env(ENV_PATH).get("SENDGRID_API_KEY", "")
    recipients = config.get("recipients", [])
    from_email = config.get("fromEmail", "")

    if not api_key or not recipients or not from_email:
        sys.stderr.write(
            "Delivery not configured (need SENDGRID_API_KEY + recipients + "
            "fromEmail) — printing digest instead of emailing.\n"
        )
        print(body)
        return

    try:
        status = send_sendgrid(api_key, from_email, recipients, args.subject, body)
        print(json.dumps({
            "status": "ok" if status in (200, 202) else "error",
            "httpStatus": status,
            "recipients": recipients,
        }))
    except HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        print(json.dumps({"status": "error", "httpStatus": e.code, "detail": detail}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "error", "detail": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
