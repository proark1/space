import base64
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
APPROVED_FILE = os.path.join(AUDIO_DIR, "_approved.json")
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
ELEVENLABS_BASE = "https://api.elevenlabs.io"
GEMINI_BASE = "https://generativelanguage.googleapis.com"
GEMINI_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
GEMINI_SIZE = os.environ.get("GEMINI_IMAGE_SIZE", "2K")
SIGNAL_LOST_VOICE_PREFIX = "SL ·"
CTX = ssl.create_default_context()
GEMINI_ASPECT_RATIOS = ("1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9")
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

        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving SIGNAL LOST client from {ROOT} on http://{HOST}:{PORT} with audio dir {AUDIO_DIR}", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
