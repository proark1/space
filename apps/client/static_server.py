import datetime
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.environ.get("STATIC_ROOT") or os.getcwd()
AUDIO_DIR = os.environ.get("AUDIO_DIR") or os.path.join(ROOT, "audio")
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")

MEDIA_MIME = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "webm": "audio/webm",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "avif": "image/avif",
}


def stamp(path):
    st = os.stat(path)
    return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")


def manifest_items():
    if not os.path.isdir(AUDIO_DIR):
        return []
    items = []
    for name in sorted(os.listdir(AUDIO_DIR)):
        path = os.path.join(AUDIO_DIR, name)
        if not os.path.isfile(path):
            continue
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        mime = MEDIA_MIME.get(ext)
        if not mime:
            continue
        size, created = stamp(path)
        items.append({
            "id": os.path.splitext(name)[0],
            "file": "audio/" + name,
            "kind": "audio" if mime.startswith("audio/") else "image",
            "mime": mime,
            "size": size,
            "createdAt": created,
        })
    return items


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _json(self, obj, code=200, send_body=True):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def _serve_media(self, request_path, send_body=True):
        name = os.path.basename(request_path[len("/audio/"):])
        path = os.path.join(AUDIO_DIR, name)
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        mime = MEDIA_MIME.get(ext, "application/octet-stream")
        if not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return

        total = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(total))
        self.end_headers()
        if send_body:
            with open(path, "rb") as media:
                self.wfile.write(media.read())

    def do_GET(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        local_path = os.path.join(ROOT, request_path.lstrip("/"))
        basename = os.path.basename(request_path)

        if request_path == "/api/manifest":
            return self._json({"items": manifest_items(), "audioDir": AUDIO_DIR})
        if request_path.startswith("/audio/"):
            return self._serve_media(request_path)

        # Vite is a single-page app. Serve index.html for direct route loads
        # such as /admin, while preserving normal 404 behavior for asset files.
        if request_path != "/" and not os.path.exists(local_path) and "." not in basename:
            self.path = "/index.html"

        return super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        local_path = os.path.join(ROOT, request_path.lstrip("/"))
        basename = os.path.basename(request_path)

        if request_path == "/api/manifest":
            return self._json({"items": manifest_items(), "audioDir": AUDIO_DIR}, send_body=False)
        if request_path.startswith("/audio/"):
            return self._serve_media(request_path, send_body=False)

        if request_path != "/" and not os.path.exists(local_path) and "." not in basename:
            self.path = "/index.html"

        return super().do_HEAD()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving SIGNAL LOST client from {ROOT} on http://{HOST}:{PORT} with audio dir {AUDIO_DIR}", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
