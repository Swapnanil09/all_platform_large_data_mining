#!/usr/bin/env python3
"""QueryDeck launcher.  Usage:  python run.py  [--host H] [--port P]"""

import argparse
import webbrowser

import uvicorn


def main() -> None:
    ap = argparse.ArgumentParser(description="QueryDeck — multi-database query console")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=9001)
    ap.add_argument("--reload", action="store_true", help="auto-reload on code changes")
    ap.add_argument("--open", action="store_true", help="open the browser on start")
    args = ap.parse_args()

    url = f"http://{args.host if args.host != '0.0.0.0' else 'localhost'}:{args.port}"
    print("\n  QueryDeck")
    print(f"  -> {url}")
    print("  Ctrl+C to stop.\n")
    if args.open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    uvicorn.run("app:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
