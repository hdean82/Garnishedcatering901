"""Read-only checks for the production Garnished deployment."""
import json
import os
import re
import time
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ORIGIN = "https://garnishedcatering.com/"
EXPECTED = os.getenv("GARNISHED_EXPECTED_SHA", "")[:8]


def read(path, content_type):
    req = Request(urljoin(ORIGIN, path), headers={"User-Agent": "GarnishedReleaseCheck/1.0"})
    with urlopen(req, timeout=20) as response:
        assert response.status == 200, path
        assert response.headers.get_content_type() == content_type, (path, response.headers)
        data = response.read(5_000_000)
        assert data, path
        return data


for attempt in range(5):
    home = read("/" + ("?release=" + EXPECTED if EXPECTED else ""), "text/html").decode()
    build = re.search(r'name="garnished-build" content="([^"]+)"', home)
    if build and (not EXPECTED or build[1].endswith("+" + EXPECTED)):
        break
    if attempt < 4:
        time.sleep(12)
else:
    raise AssertionError(f"Expected deployed commit {EXPECTED}, found {build[1] if build else 'no build marker'}")

for route, identifier in [("/", "publicLanding"), ("/?contact=1", "contactLanding"),
                          ("/?client=1", "authBox"), ("/?team=1", "authBox")]:
    assert f'id="{identifier}"' in read(route, "text/html").decode(), route

manifest = json.loads(read("/manifest.webmanifest", "application/manifest+json"))
for icon in manifest["icons"]:
    read(icon["src"], icon["type"])
read("/assets/garnished-circle-transparent.png", "image/png")
print(f"Live build {build[1]} passed public route and asset checks")
