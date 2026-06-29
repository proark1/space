import os, json, ssl, base64, sqlite3, threading, datetime, http.server, urllib.request, urllib.error, urllib.parse

ROOT  = os.path.dirname(os.path.abspath(__file__))
# AUDIO_DIR points at a persistent Railway volume (e.g. /data/audio); defaults to ./audio locally
AUDIO = os.environ.get("AUDIO_DIR") or os.path.join(ROOT, "audio")
DB_PATH = os.path.join(AUDIO, "_catalog.db")
HERO  = os.path.join(AUDIO, "_hero.img")  # commemorative lobby portrait (any image type) — on the persistent volume
PORT  = int(os.environ.get("PORT", "8173"))
HOST  = os.environ.get("HOST", "0.0.0.0")
EL    = "https://api.elevenlabs.io"
GBASE  = "https://generativelanguage.googleapis.com"            # Gemini image generation (Nano Banana)
GMODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")  # Nano Banana Pro — best likeness for a hero master
GASPECT = os.environ.get("GEMINI_ASPECT", "3:4")               # portrait, fits the lobby frame
GSIZE   = os.environ.get("GEMINI_IMAGE_SIZE", "2K")            # 1K | 2K | 4K  (set "" to let the model default)
SL_VOICE_PREFIX = "SL ·"
TRIPO  = "https://api.tripo3d.ai/v2/openapi"                    # Tripo3D — image/multiview -> textured, auto-rigged 3D
# UNITS_DIR holds per-unit front/back source images + generated .glb models; point at the Railway
# volume (e.g. /data/units) in prod just like AUDIO_DIR; defaults to ./units locally.
UNITS = os.environ.get("UNITS_DIR") or os.path.join(ROOT, "units_data")
os.makedirs(AUDIO, exist_ok=True)
os.makedirs(UNITS, exist_ok=True)
os.chdir(ROOT)
CTX = ssl.create_default_context()
MIME = {"mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg"}
_dblock = threading.Lock()

def _db():
    c = sqlite3.connect(DB_PATH)
    c.execute("""CREATE TABLE IF NOT EXISTS assets(
        id TEXT PRIMARY KEY, kind TEXT, category TEXT, prompt TEXT,
        voice_id TEXT, file TEXT, size INTEGER, created_at TEXT)""")
    return c

def record(id, kind=None, category=None, prompt=None, voice_id=None, file=None, size=None, created_at=None):
    try:
        with _dblock:
            c = _db()
            c.execute("""INSERT INTO assets(id,kind,category,prompt,voice_id,file,size,created_at)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,category=excluded.category,
                prompt=excluded.prompt,voice_id=excluded.voice_id,file=excluded.file,
                size=excluded.size,created_at=excluded.created_at""",
                (id, kind, category, prompt, voice_id, file, size, created_at))
            c.commit(); c.close()
    except Exception as e:
        print("db record error:", e, flush=True)

def db_rows():
    cols = ["id", "kind", "category", "prompt", "voice_id", "file", "size", "created_at"]
    try:
        with _dblock:
            c = _db()
            rows = [dict(zip(cols, r)) for r in c.execute("SELECT " + ",".join(cols) + " FROM assets")]
            c.close(); return rows
    except Exception as e:
        print("db read error:", e, flush=True); return []

def el_post(endpoint, payload, key, accept):
    req = urllib.request.Request(EL + endpoint, data=json.dumps(payload).encode(), method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": accept})
    with urllib.request.urlopen(req, context=CTX, timeout=300) as r:
        return r.read(), r.headers.get("Content-Type", "")

def el_voices(key):
    req = urllib.request.Request(EL + "/v1/voices", headers={"xi-api-key": key})
    with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
        return json.loads(r.read().decode())

def sl_voices(data):
    return [
        {"voice_id": v.get("voice_id"), "name": v.get("name")}
        for v in data.get("voices", [])
        if v.get("voice_id") and v.get("name") and str(v.get("name")).strip().startswith(SL_VOICE_PREFIX)
    ]

def tts_voice_id(endpoint):
    marker = "/v1/text-to-speech/"
    if marker not in endpoint:
        return None
    return endpoint.split(marker, 1)[1].split("/", 1)[0].split("?", 1)[0]

def require_sl_voice(key, voice_id):
    for voice in sl_voices(el_voices(key)):
        if voice.get("voice_id") == voice_id:
            return voice
    raise ValueError("Use one of the SL · voices for voice generation.")

def stamp(path):
    st = os.stat(path)
    return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")

def key_of(h):
    return h.headers.get("x-eleven-key") or os.environ.get("ELEVENLABS_API_KEY") or ""

def gkey_of(h):  # Gemini key — header (pasted in admin) or server env, never a file
    return h.headers.get("x-gemini-key") or os.environ.get("GEMINI_API_KEY") or ""

def img_mime(data):  # sniff image type from magic bytes so /hero serves the right Content-Type
    if data[:4] == b"\x89PNG": return "image/png"
    if data[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if data[:4] == b"GIF8": return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    return "application/octet-stream"

HERO_PROMPT = (
    "Using the person in the attached photograph as the exact subject, create a dramatic, photorealistic "
    "commemorative HERO PORTRAIT of this same person — preserve their face, identity and likeness faithfully. "
    "Depict them as the legendary astronaut-commander who answered the first signal and saved the world: "
    "standing tall and resolute in a sleek white-and-grey spacesuit, helmet held under one arm, in front of a "
    "massive rocket lifting off on a launch pad with billowing fire and smoke, dramatic golden-hour backlight "
    "and lens flare, epic and inspiring, a slightly weathered heroic sci-fi tone. Vertical portrait composition, "
    "cinematic lighting, head-and-torso framing. He is a saviour Earth remembers.")

def gemini_image(prompt, img_b64, mime, key):
    """Call Gemini (Nano Banana) image generation: photo + prompt -> generated image bytes."""
    parts = [{"text": prompt}]
    if img_b64:
        parts.append({"inlineData": {"mimeType": mime or "image/jpeg", "data": img_b64}})
    gen = {"responseModalities": ["IMAGE"]}
    ic = {}
    if GASPECT: ic["aspectRatio"] = GASPECT
    if GSIZE:   ic["imageSize"] = GSIZE
    if ic: gen["imageConfig"] = ic
    payload = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen}
    req = urllib.request.Request(GBASE + "/v1beta/models/" + GMODEL + ":generateContent",
        data=json.dumps(payload).encode(), method="POST",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=180) as r:
        data = json.loads(r.read().decode())
    cands = data.get("candidates") or []
    if not cands:
        fb = (data.get("promptFeedback") or {}).get("blockReason")
        raise RuntimeError("Gemini returned no image" + (": blocked (" + fb + ")" if fb else ""))
    for part in ((cands[0].get("content") or {}).get("parts") or []):
        inl = part.get("inlineData") or part.get("inline_data")
        if inl and inl.get("data"):
            return base64.b64decode(inl["data"]), (inl.get("mimeType") or inl.get("mime_type") or "image/png")
    raise RuntimeError("Gemini returned no image (finishReason=%s)" % cands[0].get("finishReason"))

# ---- Tripo3D: front/back images -> textured, optionally auto-rigged 3D model --------------------
def tkey_of(h):  # Tripo key — header (pasted in admin) or server env, never a file
    return h.headers.get("x-tripo-key") or os.environ.get("TRIPO_API_KEY") or ""

def _multipart(field, filename, ctype, data):
    b = "----slUnitForge"; nl = "\r\n"; out = b""
    out += ("--" + b + nl).encode()
    out += ('Content-Disposition: form-data; name="%s"; filename="%s"%s' % (field, filename, nl)).encode()
    out += ("Content-Type: %s%s%s" % (ctype, nl, nl)).encode()
    out += data + nl.encode() + ("--" + b + "--" + nl).encode()
    return out, "multipart/form-data; boundary=" + b

def _tripo(method, path, key, *, data=None, ctype=None, timeout=120):
    req = urllib.request.Request(TRIPO + path, data=data, method=method,
        headers={"Authorization": "Bearer " + key})
    if ctype: req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        env = json.loads(r.read().decode())
    if env.get("code") != 0:  # Tripo wraps everything in {code, data, message, suggestion}
        raise RuntimeError("Tripo %s: %s" % (env.get("code"), env.get("message") or env))
    return env.get("data") or {}

def tripo_upload(data, mime, key):  # free; returns an image_token usable as a file_token
    ext = (mime.split("/")[-1] or "png").replace("jpeg", "jpg")
    body, ct = _multipart("file", "view." + ext, mime or "image/png", data)
    return _tripo("POST", "/upload/sts", key, data=body, ctype=ct).get("image_token"), ext

def tripo_balance(key):
    return _tripo("GET", "/user/balance", key, timeout=30)

def tripo_model_task(tokens, key, *, texture=True, pbr=True):
    """tokens = list of (file_token, ext) in [front, left, back, right] order; None for a missing view.
    One view -> image_to_model; two+ -> multiview_to_model (costs credits)."""
    present = [t for t in tokens if t]
    if not present:
        raise ValueError("need at least a front-view image")
    if len(present) == 1:
        tok, ext = present[0]
        payload = {"type": "image_to_model", "file": {"type": ext, "file_token": tok},
                   "texture": texture, "pbr": pbr}
    else:
        # multiview wants a fixed [front, left, back, right] order; {} marks a skipped view
        files = []
        for t in tokens:
            files.append({"type": t[1], "file_token": t[0]} if t else {})
        payload = {"type": "multiview_to_model", "files": files, "texture": texture, "pbr": pbr}
    return _tripo("POST", "/task", key, data=json.dumps(payload).encode(),
                  ctype="application/json").get("task_id")

def tripo_rig_task(model_task_id, key, out_format="glb"):
    payload = {"type": "animate_rig", "original_model_task_id": model_task_id, "out_format": out_format}
    return _tripo("POST", "/task", key, data=json.dumps(payload).encode(),
                  ctype="application/json").get("task_id")

def tripo_task(task_id, key):
    return _tripo("GET", "/task/" + task_id, key, timeout=30)

def _as_url(v):  # Tripo output fields are sometimes a bare URL, sometimes {"url":...,"type":...}
    if isinstance(v, dict): return v.get("url") or ""
    return v or ""

def tripo_glb_url(task):  # prefer the textured PBR mesh, fall back to base / rigged model
    out = task.get("output") or {}
    for k in ("pbr_model", "rigged_model", "model", "base_model"):
        u = _as_url(out.get(k))
        if u: return u
    return ""

def download(url, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(url), context=CTX, timeout=timeout) as r:
        return r.read()

UNIT_MIME = {"glb": "model/gltf-binary", "gltf": "model/gltf+json", "png": "image/png",
             "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "img": None}
def safe_id(s):  # unit ids become filenames — keep them filesystem-safe
    return "".join(c for c in (s or "") if c.isalnum() or c in "-_")[:48] or "unit"
def unit_file(name):
    return os.path.join(UNITS, os.path.basename(name))
def unit_meta_path(uid):
    return unit_file(safe_id(uid) + ".json")
def load_unit(uid):  # per-unit sidecar = source of truth for views, task ids, status
    fp = unit_meta_path(uid)
    if os.path.isfile(fp):
        try: return json.load(open(fp))
        except Exception: pass
    return {"id": safe_id(uid)}
def save_unit(meta):
    with open(unit_meta_path(meta["id"]), "w") as f:
        json.dump(meta, f)

# Front/back/side orthographic character-sheet prompts fed to Gemini before Tripo turns them into a mesh.
# Tripo multiview order is [front, left, back, right]; the "side" view goes in the LEFT slot, so it is a left profile.
UNIT_VIEW_PROMPT = {
    "front": ("Orthographic FRONT view full-body character/creature sheet of: {d}. The ENTIRE figure from "
              "head to toe is in frame, standing straight facing the camera in a neutral A-pose, arms slightly "
              "away from the body, legs apart. Plain flat neutral mid-grey studio background, even soft lighting, "
              "NO cast shadows, no ground plane, no props, no text, no watermark. Orthographic projection (no "
              "perspective distortion), centered, clean readable silhouette. A single subject only."),
    "back":  ("Orthographic BACK view full-body sheet of the EXACT SAME character/creature shown in the attached "
              "reference image — identical outfit, colors, materials, proportions and gear — now seen directly "
              "from BEHIND. The entire figure head to toe is in frame, standing straight in the same A-pose. Plain "
              "flat neutral mid-grey studio background, even soft lighting, NO cast shadows, no props, no text. "
              "Orthographic projection, centered. A single subject only."),
    "side":  ("Orthographic SIDE PROFILE view (a clean 90° view of the LEFT side) full-body sheet of the EXACT SAME "
              "character/creature shown in the attached reference image — identical outfit, colors, materials, "
              "proportions and gear — seen from directly beside it. The entire figure head to toe is in frame, "
              "standing straight in the same A-pose. Plain flat neutral mid-grey studio background, even soft "
              "lighting, NO cast shadows, no props, no text. Orthographic projection, centered. A single subject only."),
}

def kind_of(endpoint):
    if "sound-generation" in endpoint: return "sfx"
    if "music" in endpoint: return "music"
    if "text-to-speech" in endpoint: return "voice-line"
    return "audio"

class H(http.server.SimpleHTTPRequestHandler):
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def _serve_bytes(self, data, ctype):
        # Serves media with HTTP Range support so the browser can pull just the header
        # bytes it needs for <audio preload="metadata"> (duration) and seek cheaply —
        # without this the player would download every clip in full on page load.
        total = len(data)
        hdrs = {"Content-Type": ctype, "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"}
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            try:
                s, _, e = rng[6:].split(",")[0].strip().partition("-")
                if s == "":                      # suffix range "bytes=-N" -> the final N bytes
                    start = max(0, total - int(e)); end = total - 1
                else:
                    start = int(s); end = int(e) if e else total - 1
                end = min(end, total - 1)
                if start < 0 or start > end or start >= total:
                    raise ValueError
                chunk = data[start:end + 1]
                self.send_response(206)
                hdrs["Content-Range"] = "bytes %d-%d/%d" % (start, end, total)
                hdrs["Content-Length"] = str(len(chunk))
                for k, v in hdrs.items(): self.send_header(k, v)
                self.end_headers(); self.wfile.write(chunk); return
            except Exception:
                pass  # malformed range -> fall through to a normal 200
        self.send_response(200)
        hdrs["Content-Length"] = str(total)
        for k, v in hdrs.items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

    def _save(self, eid, data, ext=".mp3"):
        fn = eid.replace("/", "_") + ext
        with open(os.path.join(AUDIO, fn), "wb") as f:
            f.write(data)
        size, created = stamp(os.path.join(AUDIO, fn))
        return {"id": eid, "file": "audio/" + fn, "size": size, "createdAt": created}

    def _manifest(self):
        rows = {r["id"]: r for r in db_rows() if r.get("file")}
        out = {}
        for r in rows.values():
            out[r["id"]] = {"id": r["id"], "file": r["file"], "size": r.get("size"),
                            "createdAt": r.get("created_at"), "kind": r.get("kind"),
                            "prompt": r.get("prompt"), "voice_id": r.get("voice_id")}
        for fn in sorted(os.listdir(AUDIO)):  # include any files not yet in the catalog
            if fn.lower().endswith((".mp3", ".wav", ".ogg")):
                iid = os.path.splitext(fn)[0]
                if iid not in out:
                    size, created = stamp(os.path.join(AUDIO, fn))
                    out[iid] = {"id": iid, "file": "audio/" + fn, "size": size, "createdAt": created}
        return list(out.values())

    def _units_manifest(self):
        items = []
        for fn in sorted(os.listdir(UNITS)):
            if not fn.endswith(".json"):
                continue
            try:
                m = json.load(open(os.path.join(UNITS, fn)))
            except Exception:
                continue
            uid = m.get("id") or os.path.splitext(fn)[0]
            def url_if(suffix):  # cache-bust on mtime so regenerated views/models refresh in the UI
                fp = unit_file(uid + suffix)
                return ("/u/" + uid + suffix + "?t=" + str(int(os.stat(fp).st_mtime))) if os.path.isfile(fp) else None
            m["frontUrl"]  = url_if("_front.img")
            m["backUrl"]   = url_if("_back.img")
            m["sideUrl"]   = url_if("_side.img")
            m["glbUrl"]    = url_if(".glb")
            m["riggedUrl"] = url_if("_rigged.glb")
            items.append(m)
        return items

    def _unit_status(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        task_id = (q.get("task_id") or [""])[0]
        uid = safe_id((q.get("id") or [""])[0])
        kind = (q.get("kind") or ["model"])[0]   # "model" | "rig"
        if not task_id:
            return self._json({"ok": False, "error": "no task_id"}, 200)
        k = tkey_of(self)
        if not k:
            return self._json({"ok": False, "error": "no tripo key"}, 200)
        try:
            t = tripo_task(task_id, k)
        except urllib.error.HTTPError as e:
            return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (e.code, e.read().decode()[:300])}, 200)
        except Exception as e:
            return self._json({"ok": False, "error": str(e)}, 200)
        status = t.get("status"); progress = t.get("progress")
        out = {"ok": True, "status": status, "progress": progress,
               "rendered": _as_url((t.get("output") or {}).get("rendered_image"))}
        if status == "success":
            glb = tripo_glb_url(t)
            suffix = "_rigged.glb" if kind == "rig" else ".glb"
            if glb:
                try:
                    data = download(glb)
                    with open(unit_file(uid + suffix), "wb") as f:
                        f.write(data)
                    size, created = stamp(unit_file(uid + suffix))
                    out["glb"] = "/u/" + uid + suffix + "?t=" + str(int(os.stat(unit_file(uid + suffix)).st_mtime))
                    out["size"] = size
                    record(uid + ":" + kind, "unit-" + kind, "unit", None, task_id,
                           "units/" + uid + suffix, size, created)
                except Exception as e:
                    out["ok"] = False; out["error"] = "model done but download failed: " + str(e)
            m = load_unit(uid)
            m[kind + "_status"] = "success"; m[kind + "_task"] = task_id
            if out.get("glb"): m[kind + "_glb"] = out["glb"]
            save_unit(m)
        elif status in ("failed", "banned", "expired", "cancelled", "unknown"):
            m = load_unit(uid); m[kind + "_status"] = status; save_unit(m)
            out["error"] = "task %s" % status
        return self._json(out)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/game", "/game/"):
            self.path = "/index.html"; return super().do_GET()
        if p in ("/admin", "/admin/"):
            self.path = "/admin.html"; return super().do_GET()
        if p in ("/exterior", "/exterior/", "/outside"):
            self.path = "/exterior.html"; return super().do_GET()
        if p in ("/launch", "/launch/", "/outbound"):
            self.path = "/launch.html"; return super().do_GET()
        if p in ("/pad", "/pad/", "/launchpad"):
            self.path = "/pad.html"; return super().do_GET()
        if p in ("/units", "/units/", "/crew"):
            self.path = "/units.html"; return super().do_GET()
        if p in ("/units-alpha", "/units-alpha/", "/unit-alpha", "/alpha"):
            self.path = "/units_alpha.html"; return super().do_GET()
        if p in ("/model", "/model/", "/viewer", "/forge3d"):
            self.path = "/model.html"; return super().do_GET()
        if p in ("/lobby", "/lobby/", "/waiting", "/play", "/start", "/intro"):
            self.path = "/lobby.html"; return super().do_GET()
        if p in ("/dock", "/dock/", "/docking"):
            self.path = "/dock.html"; return super().do_GET()
        if p in ("/hero", "/hero.jpg", "/hero.png", "/hero.img"):
            if os.path.isfile(HERO):
                data = open(HERO, "rb").read()
                return self._serve_bytes(data, img_mime(data))
            self.send_response(404); self.end_headers(); return
        if p == "/api/hero":
            ex = os.path.isfile(HERO)
            return self._json({"exists": ex, "url": "/hero" if ex else None,
                               "updatedAt": stamp(HERO)[1] if ex else None})
        if p == "/api/manifest":
            return self._json({"items": self._manifest(), "audioDir": AUDIO, "db": DB_PATH})
        if p == "/api/units":
            return self._json({"items": self._units_manifest(), "dir": UNITS})
        if p == "/api/tripo-balance":
            k = tkey_of(self)
            if not k: return self._json({"ok": False, "error": "no tripo key"}, 200)
            try:
                d = tripo_balance(k)
                return self._json({"ok": True, "balance": d.get("balance"), "frozen": d.get("frozen")})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "status": e.code, "error": e.read().decode()[:400]}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)
        if p == "/api/unit-status":
            return self._unit_status()
        if p.startswith("/u/"):  # per-unit source images (.img) + generated models (.glb), from the volume
            name = os.path.basename(p[len("/u/"):])
            fp = unit_file(name)
            if os.path.isfile(fp):
                ext = name.rsplit(".", 1)[-1].lower()
                ct = UNIT_MIME.get(ext, "application/octet-stream")
                data = open(fp, "rb").read()
                return self._serve_bytes(data, ct if ct else img_mime(data))
            self.send_response(404); self.end_headers(); return
        if p == "/api/voices":
            k = key_of(self)
            if not k: return self._json({"ok": False, "error": "no api key"}, 200)
            try:
                vs = sl_voices(el_voices(k))
                return self._json({"ok": True, "voices": vs})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "status": e.code, "error": e.read().decode()[:400]}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)
        if p.startswith("/audio/"):
            name = os.path.basename(p[len("/audio/"):])
            fp = os.path.join(AUDIO, name)
            if os.path.isfile(fp):
                ctype = MIME.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
                return self._serve_bytes(open(fp, "rb").read(), ctype)
            self.send_response(404); self.end_headers(); return
        return super().do_GET()

    def do_POST(self):
        p = self.path.split("?")[0]
        if p not in ("/api/generate", "/api/design", "/api/save-voice", "/api/delete-voice",
                     "/api/hero-upload", "/api/hero-generate",
                     "/api/unit-image", "/api/unit-model", "/api/unit-rig", "/api/unit-delete", "/api/unit-glb"):
            self.send_response(404); self.end_headers(); return
        try:
            ln = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(ln).decode() or "{}")
        except Exception as e:
            return self._json({"ok": False, "error": "bad request: " + str(e)}, 200)
        if p == "/api/hero-generate":  # Gemini turns the uploaded photo into the hero; auto-hangs in the lobby
            gk = gkey_of(self)
            if not gk:
                return self._json({"ok": False, "error": "No Gemini API key — set GEMINI_API_KEY on the server or paste a key in the Hero panel."}, 200)
            try:
                du = body.get("dataUrl", ""); mime = "image/jpeg"
                if du.startswith("data:") and ";base64," in du:
                    mime = du[5:du.index(";base64,")]; du = du.split(",", 1)[1]
                elif "," in du:
                    du = du.split(",", 1)[1]
                prompt = (body.get("prompt") or "").strip() or HERO_PROMPT
                out, omime = gemini_image(prompt, du or None, mime, gk)
                if len(out) > 16_000_000:
                    return self._json({"ok": False, "error": "generated image too large"}, 200)
                with open(HERO, "wb") as f:
                    f.write(out)  # auto-hang in the lobby
                size, updated = stamp(HERO)
                return self._json({"ok": True, "model": GMODEL, "size": size, "updatedAt": updated,
                                   "dataUrl": "data:" + omime + ";base64," + base64.b64encode(out).decode()})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "error": "Gemini HTTP " + str(e.code) + ": " + e.read().decode()[:500]}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)
        if p == "/api/hero-upload":  # local image storage — no ElevenLabs key required
            try:
                du = body.get("dataUrl", "")
                if "," in du:
                    du = du.split(",", 1)[1]
                raw = base64.b64decode(du)
                if not raw:
                    return self._json({"ok": False, "error": "empty image"}, 200)
                if len(raw) > 8_000_000:
                    return self._json({"ok": False, "error": "image too large (max 8 MB)"}, 200)
                with open(HERO, "wb") as f:
                    f.write(raw)
                size, updated = stamp(HERO)
                return self._json({"ok": True, "file": "/hero", "size": size, "updatedAt": updated})
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)

        if p == "/api/unit-image":  # front/back view for a unit — Gemini-generated or uploaded; stored on the volume
            uid = safe_id(body.get("id"))
            view = body.get("view")
            if view not in ("front", "back", "side"):
                return self._json({"ok": False, "error": "view must be 'front', 'back' or 'side'"}, 200)
            meta = load_unit(uid)
            if body.get("name"): meta["name"] = body["name"]
            desc = (body.get("prompt") or meta.get("prompt") or meta.get("name") or "").strip()
            if body.get("prompt"): meta["prompt"] = body["prompt"]
            try:
                du = body.get("dataUrl", "") or ""
                if du:  # uploaded image -> store as-is
                    mime = "image/png"
                    if du.startswith("data:") and ";base64," in du:
                        mime = du[5:du.index(";base64,")]; du = du.split(",", 1)[1]
                    elif "," in du:
                        du = du.split(",", 1)[1]
                    raw = base64.b64decode(du)
                    if not raw: return self._json({"ok": False, "error": "empty image"}, 200)
                    if len(raw) > 12_000_000: return self._json({"ok": False, "error": "image too large (max 12 MB)"}, 200)
                    omime = mime
                else:  # generate with Gemini (Nano Banana) from a character-sheet prompt
                    gk = gkey_of(self)
                    if not gk:
                        return self._json({"ok": False, "error": "No Gemini key — paste one in the Forge or set GEMINI_API_KEY, or upload an image."}, 200)
                    if not desc:
                        return self._json({"ok": False, "error": "describe the unit first (prompt is empty)"}, 200)
                    prompt = UNIT_VIEW_PROMPT[view].format(d=desc)
                    ref_b64, ref_mime = None, None
                    if view in ("back", "side"):  # condition back/side on the generated front for consistency
                        fp = unit_file(uid + "_front.img")
                        if os.path.isfile(fp):
                            fb = open(fp, "rb").read(); ref_b64 = base64.b64encode(fb).decode(); ref_mime = img_mime(fb)
                    raw, omime = gemini_image(prompt, ref_b64, ref_mime, gk)
                    if len(raw) > 16_000_000: return self._json({"ok": False, "error": "generated image too large"}, 200)
                with open(unit_file(uid + "_" + view + ".img"), "wb") as f:
                    f.write(raw)
                size, updated = stamp(unit_file(uid + "_" + view + ".img"))
                meta[view + "_at"] = updated; save_unit(meta)
                record(uid + ":" + view, "unit-image", view, desc, None,
                       "units/" + uid + "_" + view + ".img", size, updated)
                return self._json({"ok": True, "view": view, "size": size, "updatedAt": updated,
                                   "url": "/u/" + uid + "_" + view + ".img?t=" + str(int(os.stat(unit_file(uid + '_' + view + '.img')).st_mtime)),
                                   "dataUrl": "data:" + (omime or "image/png") + ";base64," + base64.b64encode(raw).decode()})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "error": "Gemini HTTP %s: %s" % (e.code, e.read().decode()[:400])}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)

        if p == "/api/unit-model":  # upload the unit's 3 views to Tripo and start a multiview -> mesh task
            uid = safe_id(body.get("id"))
            tk = tkey_of(self)
            if not tk:
                return self._json({"ok": False, "error": "No Tripo key — paste one in the Forge or set TRIPO_API_KEY."}, 200)
            views = {v: unit_file(uid + "_" + v + ".img") for v in ("front", "back", "side")}
            missing = [v for v, fp in views.items() if not os.path.isfile(fp)]
            if missing:  # all 3 views are required
                return self._json({"ok": False, "error": "all 3 views required — still missing: " + ", ".join(missing)}, 200)
            try:
                def up(fp):
                    d = open(fp, "rb").read(); return tripo_upload(d, img_mime(d), tk)
                # Tripo multiview order = [front, left, back, right]; the side view goes in the LEFT slot
                tokens = [up(views["front"]), up(views["side"]), up(views["back"]), None]
                task_id = tripo_model_task(tokens, tk,
                                           texture=body.get("texture", True), pbr=body.get("pbr", True))
                meta = load_unit(uid)
                if body.get("name"): meta["name"] = body["name"]
                meta["model_task"] = task_id; meta["model_status"] = "running"
                meta.pop("rig_task", None); meta.pop("rig_status", None)  # stale rig no longer applies
                save_unit(meta)
                return self._json({"ok": True, "task_id": task_id})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (e.code, e.read().decode()[:400])}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)

        if p == "/api/unit-rig":  # auto-rig a finished model (humanoid/biped) -> rigged glb
            uid = safe_id(body.get("id"))
            tk = tkey_of(self)
            if not tk:
                return self._json({"ok": False, "error": "No Tripo key."}, 200)
            meta = load_unit(uid)
            model_task = meta.get("model_task")
            if not model_task or meta.get("model_status") != "success":
                return self._json({"ok": False, "error": "build the 3D model first (and let it finish)"}, 200)
            try:
                task_id = tripo_rig_task(model_task, tk)
                meta["rig_task"] = task_id; meta["rig_status"] = "running"; save_unit(meta)
                return self._json({"ok": True, "task_id": task_id})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "error": "Tripo HTTP %s: %s" % (e.code, e.read().decode()[:400])}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)

        if p == "/api/unit-glb":  # upload a ready .glb directly (skip Tripo) — used as the unit's model
            uid = safe_id(body.get("id"))
            du = body.get("dataUrl", "") or ""
            if "," in du: du = du.split(",", 1)[1]
            try: raw = base64.b64decode(du)
            except Exception: raw = b""
            if not raw: return self._json({"ok": False, "error": "empty file"}, 200)
            if len(raw) > 80_000_000: return self._json({"ok": False, "error": "GLB too large (max 80 MB)"}, 200)
            if raw[:4] != b"glTF": return self._json({"ok": False, "error": "not a .glb file (must be binary glTF)"}, 200)
            rigged = bool(body.get("rigged"))
            suffix = "_rigged.glb" if rigged else ".glb"
            with open(unit_file(uid + suffix), "wb") as f: f.write(raw)
            meta = load_unit(uid)
            if body.get("name"): meta["name"] = body["name"]
            meta["model_status"] = "uploaded"; save_unit(meta)
            size, _ = stamp(unit_file(uid + suffix))
            return self._json({"ok": True, "size": size, "rigged": rigged,
                "glb": "/u/" + uid + suffix + "?t=" + str(int(os.stat(unit_file(uid + suffix)).st_mtime))})

        if p == "/api/unit-delete":  # remove a unit's images + models + sidecar
            uid = safe_id(body.get("id"))
            for suf in ("_front.img", "_back.img", "_side.img", ".glb", "_rigged.glb", ".json"):
                try: os.remove(unit_file(uid + suf))
                except OSError: pass
            return self._json({"ok": True, "id": uid})

        k = key_of(self)
        if not k:
            return self._json({"ok": False, "error": "No API key — paste your ElevenLabs key at the top."}, 200)
        try:
            if p == "/api/generate":
                ep = body.get("endpoint", "")
                if not ep.startswith("/v1/"): return self._json({"ok": False, "error": "bad endpoint"}, 200)
                payload = body.get("payload", {})
                requested_voice = tts_voice_id(ep)
                if requested_voice:
                    require_sl_voice(k, requested_voice)
                audio, ct = el_post(ep, payload, k, "audio/mpeg")
                ext = ".wav" if "wav" in ct else ".mp3"
                saved = self._save(body.get("id", "clip"), audio, ext)
                vid = requested_voice
                record(saved["id"], kind_of(ep), body.get("category"),
                       payload.get("text") or payload.get("prompt"), vid,
                       saved["file"], saved["size"], saved["createdAt"])
                return self._json({"ok": True, **saved, "contentType": ct})

            if p == "/api/design":
                payload = body.get("payload", {})
                raw, _ = el_post("/v1/text-to-voice/design", payload, k, "application/json")
                data = json.loads(raw.decode())
                eid = (body.get("id") or "voice").replace("/", "_")
                out = []
                for n, pv in enumerate(data.get("previews", [])):
                    audio = base64.b64decode(pv.get("audio_base_64", ""))
                    saved = self._save(f"{eid}-preview-{n+1}", audio, ".mp3")
                    saved["generated_voice_id"] = pv.get("generated_voice_id")
                    saved["duration"] = pv.get("duration_secs")
                    record(saved["id"], "voice-preview", "voice-design", payload.get("voice_description"),
                           pv.get("generated_voice_id"), saved["file"], saved["size"], saved["createdAt"])
                    out.append(saved)
                return self._json({"ok": True, "id": eid, "previews": out, "text": data.get("text", "")})

            if p == "/api/save-voice":
                payload = body.get("payload", {})
                raw, _ = el_post("/v1/text-to-voice", payload, k, "application/json")
                data = json.loads(raw.decode())
                vid = data.get("voice_id")
                record("voice:" + (vid or "unknown"), "voice", "voice-design",
                       payload.get("voice_description"), vid, None, None,
                       datetime.datetime.now().isoformat(timespec="seconds"))
                return self._json({"ok": True, "voice_id": vid, "name": data.get("name")})

            if p == "/api/delete-voice":
                vid = body.get("voice_id")
                if not vid: return self._json({"ok": False, "error": "no voice_id"}, 200)
                req = urllib.request.Request(EL + "/v1/voices/" + vid, method="DELETE", headers={"xi-api-key": k})
                with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                    r.read()
                try:
                    with _dblock:
                        c = _db(); c.execute("DELETE FROM assets WHERE id=?", ("voice:" + vid,)); c.commit(); c.close()
                except Exception:
                    pass
                return self._json({"ok": True, "voice_id": vid})

        except urllib.error.HTTPError as e:
            return self._json({"ok": False, "status": e.code, "error": e.read().decode()[:600]}, 200)
        except Exception as e:
            return self._json({"ok": False, "error": str(e)}, 200)

    def log_message(self, *a):
        pass

_db().close()  # ensure the catalog table exists on boot
http.server.ThreadingHTTPServer.allow_reuse_address = True
srv = http.server.ThreadingHTTPServer((HOST, PORT), H)
print(f"Audio Forge + lookdev on http://{HOST}:{PORT}/   audio -> {AUDIO}   db -> {DB_PATH}", flush=True)
srv.serve_forever()
