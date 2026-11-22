#!/usr/bin/env python3
"""Stage only approved public Garnished assets for Cloudflare Workers."""
from pathlib import Path
import html
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
required = [
    "index.html",
    "manifest.webmanifest",
    "assets/garnished-logo.svg",
    "assets/garnished-circle-transparent.png",
    "assets/garnished-home-icon.jpg",
    "assets/garnished-favicon.ico",
]
if dist.exists():
    shutil.rmtree(dist)
for rel in required:
    source = root / rel
    if not source.is_file():
        raise SystemExit(f"Missing public asset: {rel}")
    target = dist / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

source_html = (dist / "index.html").read_text(encoding="utf-8")
version = re.search(r'<meta name="garnished-build" content="([^"]+)"', source_html)
if not version:
    raise SystemExit("Missing Garnished build marker in index.html")
if 'create_garnished_invoice_with_items' not in source_html:
    raise SystemExit("Invoice save flow missing from build")
sha = subprocess.check_output(["git", "rev-parse", "--short=8", "HEAD"], cwd=root, text=True).strip()
updated = version.group(1) + "+" + sha
source_html = source_html.replace(
    f'<meta name="garnished-build" content="{version.group(1)}"',
    f'<meta name="garnished-build" content="{updated}"', 1
).replace(
    f"const GARNISHED_BUILD='{version.group(1)}'",
    f"const GARNISHED_BUILD='{updated}'", 1
)
(dist / "index.html").write_text(source_html, encoding="utf-8")
print(f"Garnished build {updated}; staged {len(required)} public files")
for rel in required:
    assert (dist / rel).is_file()
assert not (dist / "supabase").exists()
assert not any(dist.rglob("*.zip"))
