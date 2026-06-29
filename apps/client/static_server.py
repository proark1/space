import base64
import datetime
import json
import os
import ssl
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

ROOT = os.environ.get("STATIC_ROOT") or os.getcwd()
AUDIO_DIR = os.environ.get("AUDIO_DIR") or os.path.join(ROOT, "audio")
APPROVED_FILE = os.path.join(AUDIO_DIR, "_approved.json")
ADMIN_CONTENT_DIR = os.environ.get("ADMIN_CONTENT_DIR") or os.path.join(ROOT, "admin_content")
# Unit Forge: per-unit source views (.img) + generated Tripo3D models (.glb). Point UNITS_DIR
# at a Railway volume (e.g. /data/units) for persistence; defaults next to the served root.
UNITS_DIR = os.environ.get("UNITS_DIR") or os.path.join(ROOT, "units_data")
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
ELEVENLABS_BASE = "https://api.elevenlabs.io"
GEMINI_BASE = "https://generativelanguage.googleapis.com"
GEMINI_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
GEMINI_SIZE = os.environ.get("GEMINI_IMAGE_SIZE", "2K")
SIGNAL_LOST_VOICE_PREFIX = "SL ·"
CTX = ssl.create_default_context()
GEMINI_ASPECT_RATIOS = ("1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9")

# Shared Tripo3D + Unit Forge logic. In the container tripo_forge.py is copied adjacent;
# in local apps/client dev it lives in lookdev/, so fall back to that path.
try:
    import tripo_forge as tf
except ImportError:  # pragma: no cover - local dev convenience
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lookdev"))
    import tripo_forge as tf


def tripo_key_of(headers):
    return headers.get("x-tripo-key") or os.environ.get("TRIPO_API_KEY") or ""
LOOKDEV_ROUTES = {
    "/game": "/game.html",
    "/game/": "/game.html",
    "/units": "/units.html",
    "/units/": "/units.html",
    "/crew": "/units.html",
    "/units-alpha": "/units_alpha.html",
    "/units-alpha/": "/units_alpha.html",
    "/unit-alpha": "/units_alpha.html",
    "/alpha": "/units_alpha.html",
    "/launch": "/launch.html",
    "/launch/": "/launch.html",
    "/outbound": "/launch.html",
    "/lobby": "/lobby.html",
    "/lobby/": "/lobby.html",
    "/waiting": "/lobby.html",
    "/play": "/lobby.html",
    "/start": "/lobby.html",
    "/intro": "/lobby.html",
    "/pad": "/pad.html",
    "/pad/": "/pad.html",
    "/launchpad": "/pad.html",
    "/dock": "/dock.html",
    "/dock/": "/dock.html",
    "/docking": "/dock.html",
    "/exterior": "/exterior.html",
    "/exterior/": "/exterior.html",
    "/outside": "/exterior.html",
}

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

ADMIN_CONTENT_MIME = {
    **MEDIA_MIME,
    "glb": "model/gltf-binary",
    "gltf": "model/gltf+json",
    "json": "application/json",
}

ADMIN_SCENES = {
    "spaceship": {
        "id": "spaceship",
        "name": "Space Ship",
        "modelUrl": "",
        "baseColor": "#717a86",
        "emissiveColor": "#36e0d0",
        "emissiveIntensity": 2.4,
        "scale": 1.0,
        "positionY": 0.0,
        "rotationY": 0.15,
        "ambientIntensity": 0.85,
        "keyIntensity": 3.3,
        "fogDensity": 0.00045,
    },
    "lobby": {
        "id": "lobby",
        "name": "Lobby",
        "modelUrl": "",
        "baseColor": "#c9ced6",
        "emissiveColor": "#bfe9ff",
        "emissiveIntensity": 1.6,
        "scale": 1.0,
        "positionY": 0.0,
        "rotationY": 0.0,
        "ambientIntensity": 0.7,
        "keyIntensity": 1.5,
        "fogDensity": 0.009,
    },
}


def stamp(path):
    st = os.stat(path)
    return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")


def load_approved():
    try:
        with open(APPROVED_FILE) as handle:
            data = json.load(handle)
        return set(data) if isinstance(data, list) else set()
    except (OSError, ValueError):
        return set()


def add_approved(asset_id):
    approved = load_approved()
    approved.add(asset_id)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    tmp = APPROVED_FILE + ".tmp"
    with open(tmp, "w") as handle:
        json.dump(sorted(approved), handle)
    os.replace(tmp, APPROVED_FILE)
    return approved


def manifest_items():
    if not os.path.isdir(AUDIO_DIR):
        return []
    items = []
    approved = load_approved()
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
            "approved": os.path.splitext(name)[0] in approved,
        })
    return items


def safe_asset_id(asset_id):
    cleaned = "".join(c if c.isalnum() or c in "._-" else "_" for c in asset_id)
    return cleaned.strip("._") or "clip"


def safe_admin_scene_id(scene_id):
    cleaned = "".join(c if c.isalnum() or c in "-_" else "-" for c in str(scene_id or "").lower())
    return cleaned.strip("-_")


def safe_admin_model_id(model_id):
    cleaned = "".join(c if c.isalnum() or c in "-_" else "-" for c in str(model_id or "").lower())
    return cleaned.strip("-_") or "model"


def admin_scene_path(scene_id):
    return os.path.join(ADMIN_CONTENT_DIR, "scenes", safe_admin_scene_id(scene_id) + ".json")


def admin_model_path(model_id):
    return os.path.join(ADMIN_CONTENT_DIR, "models", safe_admin_model_id(model_id) + ".glb")


def number_or(value, fallback, lo=None, hi=None):
    try:
        out = float(value)
    except (TypeError, ValueError):
        return fallback
    if not out == out or out in (float("inf"), float("-inf")):
        return fallback
    if lo is not None:
        out = max(lo, out)
    if hi is not None:
        out = min(hi, out)
    return out


def hex_color_or(value, fallback):
    text = str(value or "").strip()
    if len(text) == 7 and text[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in text[1:]):
        return text
    return fallback


def load_admin_scene(scene_id):
    scene_id = safe_admin_scene_id(scene_id)
    if scene_id not in ADMIN_SCENES:
        raise ValueError("Unknown admin scene.")
    data = dict(ADMIN_SCENES[scene_id])
    path = admin_scene_path(scene_id)
    try:
        with open(path) as handle:
            saved = json.load(handle)
        if isinstance(saved, dict):
            data.update(saved)
    except (OSError, ValueError):
        pass
    data["id"] = scene_id
    return data


def normalize_admin_scene(scene_id, body):
    base = load_admin_scene(scene_id)
    incoming = body if isinstance(body, dict) else {}
    model_url = str(incoming.get("modelUrl") or base.get("modelUrl") or "").strip()
    if model_url and not (model_url.startswith(("/", "http://", "https://"))):
        model_url = ""
    return {
        **base,
        "modelUrl": model_url,
        "baseColor": hex_color_or(incoming.get("baseColor"), base["baseColor"]),
        "emissiveColor": hex_color_or(incoming.get("emissiveColor"), base["emissiveColor"]),
        "emissiveIntensity": number_or(incoming.get("emissiveIntensity"), base["emissiveIntensity"], 0, 12),
        "scale": number_or(incoming.get("scale"), base["scale"], 0.05, 20),
        "positionY": number_or(incoming.get("positionY"), base["positionY"], -50, 50),
        "rotationY": number_or(incoming.get("rotationY"), base["rotationY"], -6.2832, 6.2832),
        "ambientIntensity": number_or(incoming.get("ambientIntensity"), base["ambientIntensity"], 0, 5),
        "keyIntensity": number_or(incoming.get("keyIntensity"), base["keyIntensity"], 0, 12),
        "fogDensity": number_or(incoming.get("fogDensity"), base["fogDensity"], 0, 0.05),
    }


def save_admin_scene(scene_id, data):
    os.makedirs(os.path.dirname(admin_scene_path(scene_id)), exist_ok=True)
    data = dict(data)
    data["updatedAt"] = datetime.datetime.now().isoformat(timespec="seconds")
    tmp = admin_scene_path(scene_id) + ".tmp"
    with open(tmp, "w") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
    os.replace(tmp, admin_scene_path(scene_id))
    return data


def decode_glb_data_url(data_url, max_bytes=120_000_000):
    text = str(data_url or "")
    if "," in text:
        text = text.split(",", 1)[1]
    if len(text) > max_bytes * 2:
        raise ValueError("GLB upload is too large.")
    try:
        raw = base64.b64decode(text)
    except Exception as exc:
        raise ValueError("GLB data is not valid base64.") from exc
    if not raw:
        raise ValueError("GLB upload is empty.")
    if len(raw) > max_bytes:
        raise ValueError("GLB upload is too large.")
    if not tf.is_glb(raw):
        raise ValueError("Not a .glb file.")
    return raw


def key_of(headers):
    return headers.get("x-eleven-key") or os.environ.get("ELEVENLABS_API_KEY") or ""


def gemini_key_of(headers):
    return headers.get("x-gemini-key") or os.environ.get("GEMINI_API_KEY") or ""


def read_json(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0"))
        return json.loads(handler.rfile.read(length).decode() or "{}")
    except Exception as exc:
        raise ValueError("bad request: " + str(exc)) from exc


def http_error_message(exc):
    raw = exc.read().decode()[:1200]
    try:
        data = json.loads(raw)
        message = ((data.get("error") or {}).get("message") or data.get("message"))
        if message:
            return str(message)
    except Exception:
        pass
    return raw or ("HTTP " + str(exc.code))


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


def signal_lost_voices(data):
    return [
        {"voice_id": voice.get("voice_id"), "name": voice.get("name")}
        for voice in data.get("voices", [])
        if voice.get("voice_id")
        and voice.get("name")
        and str(voice.get("name")).strip().startswith(SIGNAL_LOST_VOICE_PREFIX)
    ]


def require_signal_lost_voice(key, voice_id):
    voices = signal_lost_voices(get_elevenlabs("/v1/voices", key))
    for voice in voices:
        if voice.get("voice_id") == voice_id:
            return voice
    raise ValueError("Use one of the SL · voices for voice generation.")


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


def image_extension(mime):
    if "jpeg" in mime or "jpg" in mime:
        return ".jpg"
    if "webp" in mime:
        return ".webp"
    if "gif" in mime:
        return ".gif"
    return ".png"


def save_image(asset_id, data, content_type):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    ext = image_extension(content_type.lower())
    filename = safe_asset_id(asset_id) + ext
    path = os.path.join(AUDIO_DIR, filename)
    with open(path, "wb") as image:
        image.write(data)
    size, created = stamp(path)
    return {
        "id": os.path.splitext(filename)[0],
        "file": "audio/" + filename,
        "kind": "image",
        "mime": MEDIA_MIME.get(ext[1:], content_type or "image/png"),
        "size": size,
        "createdAt": created,
    }


def save_voice_preview(asset_id, data):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    filename = safe_asset_id(asset_id) + ".mp3"
    path = os.path.join(AUDIO_DIR, filename)
    with open(path, "wb") as audio:
        audio.write(data)
    size, created = stamp(path)
    return {
        "id": os.path.splitext(filename)[0],
        "file": "audio/" + filename,
        "kind": "voice-preview",
        "mime": "audio/mpeg",
        "size": size,
        "createdAt": created,
    }


def decode_image_data_url(data_url):
    if not data_url.startswith("data:") or ";base64," not in data_url:
        raise ValueError("Expected a base64 image data URL.")
    header, encoded = data_url.split(",", 1)
    content_type = header[5:].split(";", 1)[0].lower()
    if content_type not in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        raise ValueError("Only PNG, JPEG, WebP, or GIF images can be saved.")
    if len(encoded) > 24_000_000:
        raise ValueError("Image upload is too large.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("Image data is not valid base64.") from exc
    if len(data) > 16_000_000:
        raise ValueError("Image upload is too large.")
    return data, content_type


def generate_gemini_image(prompt, key, aspect_ratio=None):
    generation_config = {"responseModalities": ["IMAGE"]}
    image_config = {}
    if aspect_ratio:
        image_config["aspectRatio"] = aspect_ratio
    if GEMINI_SIZE:
        image_config["imageSize"] = GEMINI_SIZE
    if image_config:
        generation_config["imageConfig"] = image_config

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }
    req = urllib.request.Request(
        GEMINI_BASE + "/v1beta/models/" + GEMINI_MODEL + ":generateContent",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, context=CTX, timeout=180) as response:
        data = json.loads(response.read().decode())

    candidates = data.get("candidates") or []
    if not candidates:
        feedback = (data.get("promptFeedback") or {}).get("blockReason")
        raise RuntimeError("Gemini returned no image" + (": blocked (" + feedback + ")" if feedback else ""))

    for part in ((candidates[0].get("content") or {}).get("parts") or []):
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            import base64

            return base64.b64decode(inline["data"]), (inline.get("mimeType") or inline.get("mime_type") or "image/png")
    raise RuntimeError("Gemini returned no image")


def ratio_value(ratio):
    left, _, right = ratio.partition(":")
    try:
        return float(left) / float(right)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def normalize_gemini_aspect_ratio(ratio):
    if not ratio:
        return None
    value = ratio_value(ratio)
    if value is None:
        return None
    return min(GEMINI_ASPECT_RATIOS, key=lambda candidate: abs((ratio_value(candidate) or value) - value))


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


def newest_existing(names):
    found = []
    for name in names:
        path = os.path.join(AUDIO_DIR, name)
        if os.path.isfile(path):
            found.append((os.path.getmtime(path), "/audio/" + name))
    found.sort()
    return found[-1][1] if found else None


def published_share_image():
    """Newest landing share image on the asset server for OpenGraph/Twitter tags.
    Prefers the purpose-built social card, then falls back to the saved hero."""
    return (
        newest_existing(["landing-social-card.jpg", "landing-social-card.jpeg", "landing-social-card.png", "landing-social-card.webp"])
        or newest_existing(["landing-hero.jpg", "landing-hero.jpeg", "landing-hero.png", "landing-hero.webp"])
    )


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

    def _serve_admin_content(self, request_path, send_body=True):
        rel = request_path[len("/admin-content/"):]
        safe_parts = [part for part in rel.split("/") if part and part not in (".", "..")]
        root = os.path.abspath(ADMIN_CONTENT_DIR)
        path = os.path.abspath(os.path.join(root, *safe_parts))
        if path != root and not path.startswith(root + os.sep):
            self.send_response(404)
            self.end_headers()
            return
        if not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.basename(path).rsplit(".", 1)[-1].lower() if "." in os.path.basename(path) else ""
        data_len = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", ADMIN_CONTENT_MIME.get(ext, "application/octet-stream"))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(data_len))
        self.end_headers()
        if send_body:
            with open(path, "rb") as content:
                self.wfile.write(content.read())

    def _public_base(self):
        host = (self.headers.get("Host") or (HOST + ":" + str(PORT))).split(",")[0].strip()
        proto = self.headers.get("X-Forwarded-Proto") or ("http" if host.startswith(("localhost", "127.")) else "https")
        return proto.split(",")[0].strip() + "://" + host

    def _serve_index(self, send_body=True):
        path = os.path.join(ROOT, "index.html")
        try:
            with open(path, "rb") as page:
                html = page.read().decode("utf-8", "replace")
        except OSError:
            self.send_response(404)
            self.end_headers()
            return
        share = published_share_image()
        if share and "</head>" in html:
            image = self._public_base() + share
            title = "SIGNAL LOST — Co-op Horror Panic Simulator"
            desc = ("A funny-scary co-op space horror game where your voice is useful, your "
                    "flashlight is incriminating, and the rescue signal is not asking nicely.")
            tags = (
                '<meta property="og:type" content="website">'
                '<meta property="og:title" content="' + title + '">'
                '<meta property="og:description" content="' + desc + '">'
                '<meta property="og:image" content="' + image + '">'
                '<meta name="twitter:card" content="summary_large_image">'
                '<meta name="twitter:title" content="' + title + '">'
                '<meta name="twitter:description" content="' + desc + '">'
                '<meta name="twitter:image" content="' + image + '">'
            )
            html = html.replace("</head>", tags + "</head>", 1)
        data = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    def _voices(self):
        key = key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste an ElevenLabs API key first."}, 200)
        try:
            data = get_elevenlabs("/v1/voices", key)
            voices = signal_lost_voices(data)
            return self._json({"ok": True, "voices": voices})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": http_error_message(exc)}, 200)
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
                require_signal_lost_voice(key, voice_id)
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
            return self._json({"ok": False, "status": exc.code, "error": http_error_message(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _generate_image(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        key = gemini_key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste a Gemini API key first."}, 200)

        asset_id = str(body.get("id") or "image")
        prompt = str(body.get("prompt") or "").strip()
        aspect_ratio = normalize_gemini_aspect_ratio(str(body.get("ratio") or "").strip())
        if not prompt:
            return self._json({"ok": False, "error": "No image prompt was provided."}, 200)

        try:
            image, content_type = generate_gemini_image(prompt, key, aspect_ratio)
            if len(image) > 16_000_000:
                return self._json({"ok": False, "error": "Generated image is too large."}, 200)
            saved = save_image(asset_id, image, content_type)
            return self._json({"ok": True, **saved, "model": GEMINI_MODEL, "contentType": content_type})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": http_error_message(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _design_voice(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        key = key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste an ElevenLabs API key first."}, 200)

        asset_id = str(body.get("id") or "voice")
        payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
        if not str(payload.get("voice_description") or "").strip():
            return self._json({"ok": False, "error": "No voice description was provided."}, 200)
        if len(str(payload.get("text") or "")) < 100:
            return self._json({"ok": False, "error": "Voice preview text must be at least 100 characters."}, 200)

        try:
            raw, _ = post_elevenlabs("/v1/text-to-voice/design", payload, key, "application/json")
            data = json.loads(raw.decode())
            previews = []
            for index, preview in enumerate(data.get("previews", [])):
                audio_b64 = preview.get("audio_base_64")
                if not audio_b64:
                    continue
                saved = save_voice_preview(f"{asset_id}-preview-{index + 1}", base64.b64decode(audio_b64))
                previews.append({
                    **saved,
                    "generated_voice_id": preview.get("generated_voice_id"),
                    "duration": preview.get("duration_secs"),
                })
            return self._json({"ok": True, "id": safe_asset_id(asset_id), "previews": previews, "text": data.get("text", "")})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": http_error_message(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _save_voice(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        key = key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "Paste an ElevenLabs API key first."}, 200)

        payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
        if not str(payload.get("generated_voice_id") or "").strip():
            return self._json({"ok": False, "error": "No generated voice preview was selected."}, 200)
        if not str(payload.get("voice_name") or "").strip().startswith(SIGNAL_LOST_VOICE_PREFIX):
            return self._json({"ok": False, "error": "Voice names must start with SL ·."}, 200)

        try:
            raw, _ = post_elevenlabs("/v1/text-to-voice", payload, key, "application/json")
            data = json.loads(raw.decode())
            return self._json({"ok": True, "voice_id": data.get("voice_id"), "name": data.get("name") or payload.get("voice_name")})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": http_error_message(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _save_image_upload(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length > 25_000_000:
            return self._json({"ok": False, "error": "Image upload is too large."}, 200)

        try:
            body = read_json(self)
            asset_id = str(body.get("id") or "image")
            data_url = str(body.get("dataUrl") or "")
            image, content_type = decode_image_data_url(data_url)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        try:
            saved = save_image(asset_id, image, content_type)
            return self._json({"ok": True, **saved, "contentType": content_type})
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def do_GET(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        local_path = os.path.join(ROOT, request_path.lstrip("/"))
        basename = os.path.basename(request_path)

        if request_path in ("/", "/index.html"):
            return self._serve_index()
        if request_path == "/api/manifest":
            return self._json({"items": manifest_items(), "audioDir": AUDIO_DIR})
        if request_path == "/api/voices":
            return self._voices()
        if request_path == "/api/units":
            return self._json({"items": self._units_manifest(), "dir": UNITS_DIR})
        if request_path == "/api/tripo-balance":
            return self._tripo_balance()
        if request_path == "/api/unit-status":
            return self._unit_status(parsed.query)
        if request_path.startswith("/api/admin/scene/"):
            return self._admin_scene(request_path.rsplit("/", 1)[-1])
        if request_path.startswith("/u/"):
            return self._serve_unit(request_path)
        if request_path.startswith("/admin-content/"):
            return self._serve_admin_content(request_path)
        if request_path in ("/forge", "/forge/", "/units-forge", "/unit-forge"):
            self.path = "/units_forge.html"
            return super().do_GET()
        if request_path in ("/model", "/model/", "/viewer", "/forge3d"):
            self.path = "/model.html"
            return super().do_GET()
        if request_path.startswith("/audio/"):
            return self._serve_media(request_path)
        if request_path in LOOKDEV_ROUTES:
            self.path = LOOKDEV_ROUTES[request_path]
            return super().do_GET()

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

        if request_path in ("/", "/index.html"):
            return self._serve_index(send_body=False)
        if request_path == "/api/manifest":
            return self._json({"items": manifest_items(), "audioDir": AUDIO_DIR}, send_body=False)
        if request_path.startswith("/audio/"):
            return self._serve_media(request_path, send_body=False)
        if request_path in LOOKDEV_ROUTES:
            self.path = LOOKDEV_ROUTES[request_path]
            return super().do_HEAD()

        if request_path != "/" and not os.path.exists(local_path) and "." not in basename:
            self.path = "/index.html"

        return super().do_HEAD()

    def _approve(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        raw_id = str(body.get("id") or "").strip()
        if not raw_id:
            return self._json({"ok": False, "error": "No asset id was provided."}, 200)
        asset_id = safe_asset_id(raw_id)
        try:
            add_approved(asset_id)
            return self._json({"ok": True, "id": asset_id, "approved": True})
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _admin_scene(self, scene_id):
        try:
            return self._json({"ok": True, "scene": load_admin_scene(scene_id), "contentDir": ADMIN_CONTENT_DIR})
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _save_admin_scene(self, scene_id):
        try:
            body = read_json(self)
            scene = save_admin_scene(scene_id, normalize_admin_scene(scene_id, body))
            return self._json({"ok": True, "scene": scene})
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _admin_model_upload(self):
        try:
            body = read_json(self)
            model_id = safe_admin_model_id(body.get("id"))
            raw = decode_glb_data_url(body.get("dataUrl"))
            os.makedirs(os.path.dirname(admin_model_path(model_id)), exist_ok=True)
            path = admin_model_path(model_id)
            with open(path, "wb") as handle:
                handle.write(raw)
            size, updated = stamp(path)
            return self._json({
                "ok": True,
                "id": model_id,
                "url": "/admin-content/models/" + model_id + ".glb?t=" + str(int(os.stat(path).st_mtime)),
                "size": size,
                "updatedAt": updated,
            })
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _save_admin_unit(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

        uid = tf.safe_id(body.get("id"))
        if not uid:
            return self._json({"ok": False, "error": "No unit id was provided."}, 200)
        try:
            meta = tf.load_unit(UNITS_DIR, uid)
            meta["id"] = uid
            for key in ("name", "kind", "prompt", "role"):
                value = body.get(key)
                if isinstance(value, str):
                    meta[key] = value.strip()
            meta["height"] = number_or(body.get("height"), meta.get("height", 1.8), 0.1, 20)
            meta["scale"] = number_or(body.get("scale"), meta.get("scale", 1.0), 0.05, 20)
            meta["yaw"] = number_or(body.get("yaw"), meta.get("yaw", 0), -6.2832, 6.2832)
            meta["positionY"] = number_or(body.get("positionY"), meta.get("positionY", 0), -20, 20)
            meta["colliderRadius"] = number_or(body.get("colliderRadius"), meta.get("colliderRadius", 0.35), 0.01, 10)
            meta["colliderHeight"] = number_or(body.get("colliderHeight"), meta.get("colliderHeight", meta["height"]), 0.01, 20)
            meta["adminUpdatedAt"] = datetime.datetime.now().isoformat(timespec="seconds")
            os.makedirs(UNITS_DIR, exist_ok=True)
            tf.save_unit(UNITS_DIR, meta)
            items = [item for item in self._units_manifest() if item.get("id") == uid]
            return self._json({"ok": True, "unit": items[0] if items else meta})
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    # ---- Unit Forge: front/back/side views -> Tripo3D textured + auto-rigged 3D ----
    def _units_manifest(self):
        items = []
        if not os.path.isdir(UNITS_DIR):
            return items
        for name in sorted(os.listdir(UNITS_DIR)):
            if not name.endswith(".json"):
                continue
            try:
                meta = json.load(open(os.path.join(UNITS_DIR, name)))
            except Exception:
                continue
            uid = meta.get("id") or os.path.splitext(name)[0]

            def url_if(suffix, uid=uid):
                path = tf.unit_file(UNITS_DIR, uid + suffix)
                return ("/u/" + uid + suffix + "?t=" + str(int(os.stat(path).st_mtime))) if os.path.isfile(path) else None

            meta["frontUrl"] = url_if("_front.img")
            meta["backUrl"] = url_if("_back.img")
            meta["sideUrl"] = url_if("_side.img")
            meta["glbUrl"] = url_if(".glb")
            meta["riggedUrl"] = url_if("_rigged.glb")
            items.append(meta)
        return items

    def _serve_unit(self, request_path):
        name = os.path.basename(request_path[len("/u/"):])
        path = tf.unit_file(UNITS_DIR, name)
        if not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        data = open(path, "rb").read()
        ctype = tf.UNIT_MIME.get(ext) or tf.img_mime(data)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _tripo_balance(self):
        key = tripo_key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "no tripo key"}, 200)
        try:
            data = tf.balance(key)
            return self._json({"ok": True, "balance": data.get("balance"), "frozen": data.get("frozen")})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "status": exc.code, "error": exc.read().decode()[:400]}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _unit_status(self, query):
        params = parse_qs(query)
        task_id = (params.get("task_id") or [""])[0]
        uid = tf.safe_id((params.get("id") or [""])[0])
        kind = (params.get("kind") or ["model"])[0]
        if not task_id:
            return self._json({"ok": False, "error": "no task_id"}, 200)
        key = tripo_key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "no tripo key"}, 200)
        try:
            task = tf.task(task_id, key)
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (exc.code, exc.read().decode()[:300])}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        status = task.get("status")
        out = {"ok": True, "status": status, "progress": task.get("progress"), "rendered": tf.rendered_url(task)}
        if status == "success":
            glb = tf.glb_url(task)
            suffix = "_rigged.glb" if kind == "rig" else ".glb"
            if glb:
                try:
                    os.makedirs(UNITS_DIR, exist_ok=True)
                    with open(tf.unit_file(UNITS_DIR, uid + suffix), "wb") as handle:
                        handle.write(tf.download(glb))
                    size, _ = stamp(tf.unit_file(UNITS_DIR, uid + suffix))
                    out["glb"] = "/u/" + uid + suffix + "?t=" + str(int(os.stat(tf.unit_file(UNITS_DIR, uid + suffix)).st_mtime))
                    out["size"] = size
                except Exception as exc:
                    out["ok"] = False
                    out["error"] = "model done but download failed: " + str(exc)
            meta = tf.load_unit(UNITS_DIR, uid)
            meta[kind + "_status"] = "success"
            meta[kind + "_task"] = task_id
            if out.get("glb"):
                meta[kind + "_glb"] = out["glb"]
            tf.save_unit(UNITS_DIR, meta)
        elif status in ("failed", "banned", "expired", "cancelled", "unknown"):
            meta = tf.load_unit(UNITS_DIR, uid)
            meta[kind + "_status"] = status
            tf.save_unit(UNITS_DIR, meta)
            out["error"] = "task %s" % status
        return self._json(out)

    def _unit_image(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        uid = tf.safe_id(body.get("id"))
        view = body.get("view")
        if view not in ("front", "back", "side"):
            return self._json({"ok": False, "error": "view must be 'front', 'back' or 'side'"}, 200)
        meta = tf.load_unit(UNITS_DIR, uid)
        if body.get("name"):
            meta["name"] = body["name"]
        desc = (body.get("prompt") or meta.get("prompt") or meta.get("name") or "").strip()
        if body.get("prompt"):
            meta["prompt"] = body["prompt"]
        try:
            data_url = body.get("dataUrl", "") or ""
            if data_url:
                mime = "image/png"
                if data_url.startswith("data:") and ";base64," in data_url:
                    mime = data_url[5:data_url.index(";base64,")]
                    data_url = data_url.split(",", 1)[1]
                elif "," in data_url:
                    data_url = data_url.split(",", 1)[1]
                raw = base64.b64decode(data_url)
                if not raw:
                    return self._json({"ok": False, "error": "empty image"}, 200)
                if len(raw) > 12_000_000:
                    return self._json({"ok": False, "error": "image too large (max 12 MB)"}, 200)
                out_mime = mime
            else:
                gkey = gemini_key_of(self.headers)
                if not gkey:
                    return self._json({"ok": False, "error": "No Gemini key — paste one, or upload an image."}, 200)
                if not desc:
                    return self._json({"ok": False, "error": "describe the unit first (prompt is empty)"}, 200)
                ref_b64, ref_mime = None, None
                if view in ("back", "side"):
                    front = tf.unit_file(UNITS_DIR, uid + "_front.img")
                    if os.path.isfile(front):
                        fb = open(front, "rb").read()
                        ref_b64 = base64.b64encode(fb).decode()
                        ref_mime = tf.img_mime(fb)
                raw, out_mime = tf.gemini_view(tf.view_prompt(view, desc), ref_b64, ref_mime, gkey)
                if len(raw) > 16_000_000:
                    return self._json({"ok": False, "error": "generated image too large"}, 200)
            os.makedirs(UNITS_DIR, exist_ok=True)
            path = tf.unit_file(UNITS_DIR, uid + "_" + view + ".img")
            with open(path, "wb") as handle:
                handle.write(raw)
            size, updated = stamp(path)
            meta[view + "_at"] = updated
            tf.save_unit(UNITS_DIR, meta)
            return self._json({"ok": True, "view": view, "size": size, "updatedAt": updated,
                               "url": "/u/" + uid + "_" + view + ".img?t=" + str(int(os.stat(path).st_mtime)),
                               "dataUrl": "data:" + (out_mime or "image/png") + ";base64," + base64.b64encode(raw).decode()})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "error": "Gemini HTTP %s: %s" % (exc.code, exc.read().decode()[:400])}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _unit_model(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        uid = tf.safe_id(body.get("id"))
        key = tripo_key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "No Tripo key — paste one or set TRIPO_API_KEY."}, 200)
        views = {v: tf.unit_file(UNITS_DIR, uid + "_" + v + ".img") for v in ("front", "back", "side")}
        missing = [v for v, path in views.items() if not os.path.isfile(path)]
        if missing:
            return self._json({"ok": False, "error": "all 3 views required — still missing: " + ", ".join(missing)}, 200)
        try:
            def up(path):
                raw = open(path, "rb").read()
                return tf.upload(raw, tf.img_mime(raw), key)

            tokens = [up(views["front"]), up(views["side"]), up(views["back"]), None]  # [front, left, back, right]
            task_id = tf.model_task(tokens, key, texture=body.get("texture", True), pbr=body.get("pbr", True))
            meta = tf.load_unit(UNITS_DIR, uid)
            if body.get("name"):
                meta["name"] = body["name"]
            meta["model_task"] = task_id
            meta["model_status"] = "running"
            meta.pop("rig_task", None)
            meta.pop("rig_status", None)
            tf.save_unit(UNITS_DIR, meta)
            return self._json({"ok": True, "task_id": task_id})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (exc.code, exc.read().decode()[:400])}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _unit_rig(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        uid = tf.safe_id(body.get("id"))
        key = tripo_key_of(self.headers)
        if not key:
            return self._json({"ok": False, "error": "No Tripo key."}, 200)
        meta = tf.load_unit(UNITS_DIR, uid)
        if not meta.get("model_task") or meta.get("model_status") != "success":
            return self._json({"ok": False, "error": "build the 3D model first (and let it finish)"}, 200)
        try:
            task_id = tf.rig_task(meta["model_task"], key)
            meta["rig_task"] = task_id
            meta["rig_status"] = "running"
            tf.save_unit(UNITS_DIR, meta)
            return self._json({"ok": True, "task_id": task_id})
        except urllib.error.HTTPError as exc:
            return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (exc.code, exc.read().decode()[:400])}, 200)
        except Exception as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)

    def _unit_delete(self):
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        uid = tf.safe_id(body.get("id"))
        for suffix in ("_front.img", "_back.img", "_side.img", ".glb", "_rigged.glb", ".json"):
            try:
                os.remove(tf.unit_file(UNITS_DIR, uid + suffix))
            except OSError:
                pass
        return self._json({"ok": True, "id": uid})

    def _unit_glb(self):  # upload a ready .glb directly (skip Tripo) — used as the unit's model
        try:
            body = read_json(self)
        except ValueError as exc:
            return self._json({"ok": False, "error": str(exc)}, 200)
        uid = tf.safe_id(body.get("id"))
        data_url = body.get("dataUrl", "") or ""
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        try:
            raw = base64.b64decode(data_url)
        except Exception:
            raw = b""
        if not raw:
            return self._json({"ok": False, "error": "empty file"}, 200)
        if len(raw) > 80_000_000:
            return self._json({"ok": False, "error": "GLB too large (max 80 MB)"}, 200)
        if not tf.is_glb(raw):
            return self._json({"ok": False, "error": "not a .glb file (must be binary glTF)"}, 200)
        rigged = bool(body.get("rigged"))
        suffix = "_rigged.glb" if rigged else ".glb"
        os.makedirs(UNITS_DIR, exist_ok=True)
        path = tf.unit_file(UNITS_DIR, uid + suffix)
        with open(path, "wb") as handle:
            handle.write(raw)
        meta = tf.load_unit(UNITS_DIR, uid)
        if body.get("name"):
            meta["name"] = body["name"]
        meta["model_status"] = "uploaded"
        tf.save_unit(UNITS_DIR, meta)
        size, _ = stamp(path)
        return self._json({"ok": True, "size": size, "rigged": rigged,
                           "glb": "/u/" + uid + suffix + "?t=" + str(int(os.stat(path).st_mtime))})

    def do_POST(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)

        if request_path == "/api/generate":
            return self._generate_audio()
        if request_path == "/api/generate-image":
            return self._generate_image()
        if request_path == "/api/design":
            return self._design_voice()
        if request_path == "/api/save-voice":
            return self._save_voice()
        if request_path == "/api/save-image":
            return self._save_image_upload()
        if request_path == "/api/approve":
            return self._approve()
        if request_path == "/api/unit-image":
            return self._unit_image()
        if request_path == "/api/unit-model":
            return self._unit_model()
        if request_path == "/api/unit-rig":
            return self._unit_rig()
        if request_path == "/api/unit-delete":
            return self._unit_delete()
        if request_path == "/api/unit-glb":
            return self._unit_glb()
        if request_path == "/api/admin/unit":
            return self._save_admin_unit()
        if request_path == "/api/admin/model":
            return self._admin_model_upload()
        if request_path.startswith("/api/admin/scene/"):
            return self._save_admin_scene(request_path.rsplit("/", 1)[-1])

        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving SIGNAL LOST client from {ROOT} on http://{HOST}:{PORT} with audio dir {AUDIO_DIR}", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
