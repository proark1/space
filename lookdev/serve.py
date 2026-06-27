import os, json, ssl, base64, sqlite3, threading, datetime, http.server, urllib.request, urllib.error

ROOT  = os.path.dirname(os.path.abspath(__file__))
# AUDIO_DIR points at a persistent Railway volume (e.g. /data/audio); defaults to ./audio locally
AUDIO = os.environ.get("AUDIO_DIR") or os.path.join(ROOT, "audio")
DB_PATH = os.path.join(AUDIO, "_catalog.db")
PORT  = int(os.environ.get("PORT", "8173"))
HOST  = os.environ.get("HOST", "0.0.0.0")
EL    = "https://api.elevenlabs.io"
os.makedirs(AUDIO, exist_ok=True)
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

def stamp(path):
    st = os.stat(path)
    return st.st_size, datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")

def key_of(h):
    return h.headers.get("x-eleven-key") or os.environ.get("ELEVENLABS_API_KEY") or ""

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

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/admin", "/admin/"):
            self.path = "/admin.html"; return super().do_GET()
        if p == "/api/manifest":
            return self._json({"items": self._manifest(), "audioDir": AUDIO, "db": DB_PATH})
        if p == "/api/voices":
            k = key_of(self)
            if not k: return self._json({"ok": False, "error": "no api key"}, 200)
            try:
                req = urllib.request.Request(EL + "/v1/voices", headers={"xi-api-key": k})
                with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
                    data = json.loads(r.read().decode())
                vs = [{"voice_id": v.get("voice_id"), "name": v.get("name")} for v in data.get("voices", [])]
                return self._json({"ok": True, "voices": vs})
            except urllib.error.HTTPError as e:
                return self._json({"ok": False, "status": e.code, "error": e.read().decode()[:400]}, 200)
            except Exception as e:
                return self._json({"ok": False, "error": str(e)}, 200)
        if p.startswith("/audio/"):
            name = os.path.basename(p[len("/audio/"):])
            fp = os.path.join(AUDIO, name)
            if os.path.isfile(fp):
                data = open(fp, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", MIME.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream"))
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.end_headers(); self.wfile.write(data); return
            self.send_response(404); self.end_headers(); return
        return super().do_GET()

    def do_POST(self):
        p = self.path.split("?")[0]
        if p not in ("/api/generate", "/api/design", "/api/save-voice", "/api/delete-voice"):
            self.send_response(404); self.end_headers(); return
        try:
            ln = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(ln).decode() or "{}")
        except Exception as e:
            return self._json({"ok": False, "error": "bad request: " + str(e)}, 200)
        k = key_of(self)
        if not k:
            return self._json({"ok": False, "error": "No API key — paste your ElevenLabs key at the top."}, 200)
        try:
            if p == "/api/generate":
                ep = body.get("endpoint", "")
                if not ep.startswith("/v1/"): return self._json({"ok": False, "error": "bad endpoint"}, 200)
                payload = body.get("payload", {})
                audio, ct = el_post(ep, payload, k, "audio/mpeg")
                ext = ".wav" if "wav" in ct else ".mp3"
                saved = self._save(body.get("id", "clip"), audio, ext)
                vid = ep.split("/v1/text-to-speech/")[-1] if "text-to-speech" in ep else None
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
