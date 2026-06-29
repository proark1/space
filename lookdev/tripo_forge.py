"""Shared Tripo3D + Unit Forge logic for SIGNAL LOST.

Imported by apps/client/static_server.py (production) so the Unit Forge backend
lives in one place. The Tripo API calls take a key; the filesystem helpers take a
`units` directory so each server can point at its own (volume-backed) dir.

NOTE: lookdev/serve.py currently carries an inline copy of this same logic for the
local dev server. If you change a Tripo shape or a view prompt here, mirror it there
(or migrate serve.py to import this module).
"""
import os, json, ssl, base64, urllib.request, urllib.error

TRIPO = "https://api.tripo3d.ai/v2/openapi"            # image/multiview -> textured, auto-rigged 3D
GBASE = "https://generativelanguage.googleapis.com"   # Gemini (Nano Banana) for the source views
GMODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-3-pro-image")
GASPECT = os.environ.get("GEMINI_ASPECT", "3:4")      # portrait fits a standing full-body figure
GSIZE = os.environ.get("GEMINI_IMAGE_SIZE", "2K")
CTX = ssl.create_default_context()

UNIT_MIME = {"glb": "model/gltf-binary", "gltf": "model/gltf+json", "png": "image/png",
             "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "img": None}

# Front/back/side orthographic character-sheet prompts fed to Gemini before Tripo meshes them.
# Tripo multiview order is [front, left, back, right]; the "side" view goes in the LEFT slot.
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


def img_mime(data):  # sniff image type from magic bytes
    if data[:4] == b"\x89PNG": return "image/png"
    if data[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if data[:4] == b"GIF8": return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    return "application/octet-stream"


# ---- Tripo API ---------------------------------------------------------------
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


def upload(data, mime, key):  # free; returns (image_token, ext) — the token doubles as a file_token
    ext = (mime.split("/")[-1] or "png").replace("jpeg", "jpg")
    body, ct = _multipart("file", "view." + ext, mime or "image/png", data)
    return _tripo("POST", "/upload/sts", key, data=body, ctype=ct).get("image_token"), ext


def balance(key):
    return _tripo("GET", "/user/balance", key, timeout=30)


def model_task(tokens, key, *, texture=True, pbr=True):
    """tokens = [front, left, back, right]; each (file_token, ext) or None.
    One view -> image_to_model; two+ -> multiview_to_model (costs credits)."""
    present = [t for t in tokens if t]
    if not present:
        raise ValueError("need at least a front-view image")
    if len(present) == 1:
        tok, ext = present[0]
        payload = {"type": "image_to_model", "file": {"type": ext, "file_token": tok},
                   "texture": texture, "pbr": pbr}
    else:
        files = []
        for t in tokens:
            files.append({"type": t[1], "file_token": t[0]} if t else {})
        payload = {"type": "multiview_to_model", "files": files, "texture": texture, "pbr": pbr}
    return _tripo("POST", "/task", key, data=json.dumps(payload).encode(), ctype="application/json").get("task_id")


def rig_task(model_task_id, key, out_format="glb"):
    payload = {"type": "animate_rig", "original_model_task_id": model_task_id, "out_format": out_format}
    return _tripo("POST", "/task", key, data=json.dumps(payload).encode(), ctype="application/json").get("task_id")


def task(task_id, key):
    return _tripo("GET", "/task/" + task_id, key, timeout=30)


def _as_url(v):  # output fields are sometimes a bare URL, sometimes {"url":...,"type":...}
    if isinstance(v, dict): return v.get("url") or ""
    return v or ""


def glb_url(t):  # prefer the textured PBR mesh, fall back to base / rigged model
    out = t.get("output") or {}
    for k in ("pbr_model", "rigged_model", "model", "base_model"):
        u = _as_url(out.get(k))
        if u: return u
    return ""


def rendered_url(t):
    return _as_url((t.get("output") or {}).get("rendered_image"))


def download(url, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(url), context=CTX, timeout=timeout) as r:
        return r.read()


# ---- Gemini view generation (supports a reference image for back/side) -------
def gemini_view(prompt, ref_b64, ref_mime, key):
    parts = [{"text": prompt}]
    if ref_b64:
        parts.append({"inlineData": {"mimeType": ref_mime or "image/png", "data": ref_b64}})
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


def view_prompt(view, desc):
    return UNIT_VIEW_PROMPT[view].format(d=desc)


# ---- units storage (per-unit JSON sidecar + view/model files) ----------------
def safe_id(s):
    return "".join(c for c in (s or "") if c.isalnum() or c in "-_")[:48] or "unit"


def unit_file(units, name):
    return os.path.join(units, os.path.basename(name))


def load_unit(units, uid):
    fp = unit_file(units, safe_id(uid) + ".json")
    if os.path.isfile(fp):
        try: return json.load(open(fp))
        except Exception: pass
    return {"id": safe_id(uid)}


def save_unit(units, meta):
    with open(unit_file(units, meta["id"] + ".json"), "w") as f:
        json.dump(meta, f)
