"""Builds a small Takeout-style zip (video + sidecar) for the smoke test."""
import json
import zipfile

with zipfile.ZipFile("smoke-takeout.zip", "w") as z:
    z.writestr("Takeout/Google Photos/2025/VID_smoke.mp4", b"smoke-video-bytes")
    z.writestr(
        "Takeout/Google Photos/2025/VID_smoke.mp4.supplemental-metadata.json",
        json.dumps(
            {
                "title": "Smoke clip",
                "photoTakenTime": {"timestamp": "1737838060"},
                "geoDataExif": {"latitude": -23.2217, "longitude": -44.7309},
            }
        ),
    )
    z.writestr("Takeout/Google Photos/2025/IMG_smoke.jpg", b"smoke-jpeg-bytes")

print("smoke-takeout.zip written")
