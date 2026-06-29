import datetime
import json
import os
import ssl
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.environ.get("STATIC_ROOT") or os.getcwd()
AUDIO_DIR = os.environ.get("AUDIO_DIR") or os.path.join(ROOT, "audio")
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
ELEVENLABS_BASE = "https://api.elevenlabs.io"
CTX = ssl.create_default_context()

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


def safe_asset_id(asset_id):
    cleaned = "".join(c if c.isalnum() or c in "._-" else "_" for c in asset_id)
    return cleaned.strip("._") or "clip"


def key_of(headers):
    return headers.get("x-eleven-key") or os.environ.get("ELEVENLABS_API_KEY") or ""


def read_json(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0"))
        return json.loads(handler.rfile.read(length).decode() or "{}")
    except Exception as exc:
        raise ValueError("bad request: " + str(exc)) from exc


def post_elevenlabs(endpoint, payload, key, accept):
    req = urllib.request.Request(
        ELEVENLABS_BASE + endpoint,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": accept,
        },
    )
    with urllib.request.urlopen(req, context=CTX, timeout=300) as response:
        return response.read(), response.headers.get("Content-Type", "")


def get_elevenlabs(endpoint, key):
    req = urllib.request.Request(ELEVENLABS_BASE + endpoint, headers={"xi-api-key": key})
    with urllib.request.urlopen(req, context=CTX, timeout=30) as response:
        return json.loads(response.read().decode())


def save_audio(asset_id, data, content_type):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    ext = ".wav" if "wav" in content_type.lower() else ".mp3"
    filename = safe_asset_id(asset_id) + ext
    path = os.path.join(AUDIO_DIR, filename)
    with open(path, "wb") as audio:
        audio.write(data)
    size, created = stamp(path)
    return {
        "id": os.path.splitext(filename)[0],
        "file": "audio/" + filename,
        "kind": "audio",
        "mime": MEDIA_MIME.get(ext[1:], content_type or "audio/mpeg"),
        "size": size,
        "createdAt": created,
    }


def duration_seconds(value, fallback):
    try:
        return max(0.5, min(30.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def music_length_ms(value, fallback_seconds):
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        seconds = fallback_seconds
    return int(max(3.0, min(600.0, seconds)) * 1000)


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

    def _voices(self):
        key = key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste an ElevenLabs API key first."}, 200)
        try:
            data = get_elevenlabs("/v1/voices", key)
            voices = [
                {"voice_id": voice.get("voice_id"), "name": voice.get("name")}
                for voice in data.get("voices", [])
                if voice.get("voice_id") and voice.get("name")
            ]
            return self._json({"ok": True, "voices": voices})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": exc.read().decode()[:600]}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _generate_audio(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        key = key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste an ElevenLabs API key first."}, 200)

        asset_id = str(body.get("id") or "clip")
        prompt = str(body.get("prompt") or "").strip()
        kind = str(body.get("kind") or "sound").lower()
        if not prompt:
            return self._json({"ok": False, "error": "No generation prompt was provided."}, 200)

        try:
            if kind == "music":
                endpoint = "/v1/music"
                payload = {
                    "prompt": prompt,
                    "music_length_ms": music_length_ms(body.get("durationSeconds"), 30),
                }
            elif kind == "voice":
                voice_id = str(body.get("voiceId") or "").strip()
                if not voice_id:
                    return self._json({"ok": False, "error": "Select an ElevenLabs voice before generating voice lines."}, 200)
                endpoint = "/v1/text-to-speech/" + voice_id
                payload = {
                    "text": prompt,
                    "model_id": str(body.get("modelId") or "eleven_v3"),
                    "voice_settings": {
                        "stability": 0.4,
                        "similarity_boost": 0.75,
                        "style": 0.5,
                        "use_speaker_boost": True,
                    },
                }
            else:
                endpoint = "/v1/sound-generation"
                payload = {
                    "text": prompt,
                    "duration_seconds": duration_seconds(body.get("durationSeconds"), 4),
                    "prompt_influence": 0.5,
                }
                if body.get("loop"):
                    payload["loop"] = True

            audio, content_type = post_elevenlabs(endpoint, payload, key, "audio/mpeg")
            saved = save_audio(asset_id, audio, content_type)
            return self._json({"ok": True, **saved, "contentType": content_type})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": exc.read().decode()[:800]}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def do_GET(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        local_path = os.path.join(ROOT, request_path.lstrip("/"))
        basename = os.path.basename(request_path)

        if request_path == "/api/manifest":
            return self._json({"items": manifest_items(), "audioDir": AUDIO_DIR})
        if request_path == "/api/voices":
            return self._voices()
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

    def do_POST(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)

        if request_path == "/api/generate":
            return self._generate_audio()

        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving SIGNAL LOST client from {ROOT} on http://{HOST}:{PORT} with audio dir {AUDIO_DIR}", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
