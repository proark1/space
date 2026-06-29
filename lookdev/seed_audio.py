#!/usr/bin/env python3
"""Seed local placeholder audio for SIGNAL LOST lookdev scenes.

The generated WAVs use the same ids as the Audio Forge catalog, so browser
scenes can load them from /api/manifest without requiring paid TTS/SFX calls.
Run with --force to overwrite existing local placeholder files.
"""

from __future__ import annotations

import datetime as _dt
import math
import os
import random
import shutil
import sqlite3
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parent
AUDIO_DIR = Path(os.environ.get("AUDIO_DIR") or ROOT / "audio")
DB_PATH = AUDIO_DIR / "_catalog.db"
SR = 44_100
TAU = math.tau


def ensure_db() -> sqlite3.Connection:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """CREATE TABLE IF NOT EXISTS assets(
        id TEXT PRIMARY KEY, kind TEXT, category TEXT, prompt TEXT,
        voice_id TEXT, file TEXT, size INTEGER, created_at TEXT)"""
    )
    return con


def record_asset(asset_id: str, kind: str, category: str, prompt: str, voice_id: str | None = None) -> None:
    path = AUDIO_DIR / f"{asset_id}.wav"
    size = path.stat().st_size
    created = _dt.datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
    with ensure_db() as con:
        con.execute(
            """INSERT INTO assets(id,kind,category,prompt,voice_id,file,size,created_at)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,category=excluded.category,
            prompt=excluded.prompt,voice_id=excluded.voice_id,file=excluded.file,
            size=excluded.size,created_at=excluded.created_at""",
            (asset_id, kind, category, prompt, voice_id, f"audio/{asset_id}.wav", size, created),
        )


def fade(i: int, n: int, attack: float = 0.02, release: float = 0.08) -> float:
    a = max(1, int(SR * attack))
    r = max(1, int(SR * release))
    return min(1.0, i / a, (n - i - 1) / r)


def limit(samples: list[float], peak: float = 0.92) -> list[float]:
    mx = max(0.001, max(abs(s) for s in samples))
    if mx <= peak:
        return samples
    k = peak / mx
    return [s * k for s in samples]


def write_wav(asset_id: str, samples: list[float]) -> None:
    path = AUDIO_DIR / f"{asset_id}.wav"
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    samples = limit(samples)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SR)
        frames = bytearray()
        for s in samples:
            frames += struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767))
        out.writeframes(frames)


def synth_amb_corridor() -> list[float]:
    n = SR * 12
    rnd = random.Random(4101)
    last = 0.0
    out: list[float] = []
    for i in range(n):
        t = i / SR
        last = last * 0.985 + rnd.uniform(-1, 1) * 0.015
        hum = (
            math.sin(TAU * 49.0 * t) * 0.11
            + math.sin(TAU * 55.5 * t + 0.7) * 0.08
            + math.sin(TAU * 73.0 * t + math.sin(t * 0.22) * 0.5) * 0.035
        )
        vent = last * 0.35 + rnd.uniform(-1, 1) * 0.012
        out.append((hum + vent) * fade(i, n, 1.2, 1.2))
    return out


def synth_stalk() -> list[float]:
    n = SR * 8
    rnd = random.Random(7707)
    last = 0.0
    out: list[float] = []
    for i in range(n):
        t = i / SR
        last = last * 0.94 + rnd.uniform(-1, 1) * 0.06
        throat = math.sin(TAU * (34 + math.sin(t * 0.8) * 3) * t)
        pulse = 0.45 + 0.55 * (math.sin(t * 2.9) * 0.5 + 0.5) ** 3
        out.append((throat * 0.16 * pulse + last * 0.09) * fade(i, n, 0.35, 0.8))
    return out


def synth_shriek() -> list[float]:
    n = int(SR * 1.35)
    rnd = random.Random(991)
    out: list[float] = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = 1540 - 840 * min(1, t / 1.1) + math.sin(t * 72) * 110
        phase += TAU * f / SR
        e = fade(i, n, 0.005, 0.25) * (1 - t / 1.65)
        out.append((math.sin(phase) * 0.62 + rnd.uniform(-1, 1) * 0.18) * e)
    return out


def synth_call() -> list[float]:
    n = int(SR * 2.35)
    rnd = random.Random(5508)
    out: list[float] = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        bit = 1.0 if int(t * 12) % 5 in (0, 1) else 0.25
        f = 410 + bit * 260 + math.sin(t * 17) * 20
        phase += TAU * f / SR
        gate = 0.4 + 0.6 * (1 if int(t * 18) % 3 else 0)
        out.append((math.sin(phase) * 0.21 * gate + rnd.uniform(-1, 1) * 0.09) * fade(i, n, 0.02, 0.22))
    return out


def synth_flashlight() -> list[float]:
    n = int(SR * 0.32)
    rnd = random.Random(120)
    out: list[float] = []
    for i in range(n):
        t = i / SR
        tick = math.exp(-t * 55) * rnd.uniform(-1, 1) * 0.85
        coil = math.sin(TAU * (980 + 260 * math.exp(-t * 18)) * t) * math.exp(-t * 18) * 0.18
        out.append((tick + coil) * fade(i, n, 0.001, 0.08))
    return out


def synth_step() -> list[float]:
    n = int(SR * 0.28)
    rnd = random.Random(211)
    out: list[float] = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        phase += TAU * (72 - 28 * min(1, t / 0.18)) / SR
        thud = math.sin(phase) * math.exp(-t * 18) * 0.34
        grit = rnd.uniform(-1, 1) * math.exp(-t * 30) * 0.08
        out.append((thud + grit) * fade(i, n, 0.001, 0.09))
    return out


def synth_voice(seed: int, seconds: float, base: float, whisper: float = 0.05) -> list[float]:
    n = int(SR * seconds)
    rnd = random.Random(seed)
    out: list[float] = []
    phase = 0.0
    last_noise = 0.0
    for i in range(n):
        t = i / SR
        syll = 0.28 + 0.72 * (math.sin(t * 10.5 + seed) * 0.5 + 0.5) ** 2
        f = base + math.sin(t * 2.0) * 9 + math.sin(t * 13.0) * 2
        phase += TAU * f / SR
        carrier = math.sin(phase) + math.sin(phase * 2.03) * 0.32 + math.sin(phase * 3.04) * 0.14
        formant = 0.55 + 0.45 * math.sin(TAU * (650 + math.sin(t * 1.2) * 130) * t)
        last_noise = last_noise * 0.8 + rnd.uniform(-1, 1) * 0.2
        out.append((carrier * formant * 0.16 * syll + last_noise * whisper) * fade(i, n, 0.08, 0.22))
    return out


def render_say(asset_id: str, text: str, voice: str) -> bool:
    say = shutil.which("say")
    afconvert = shutil.which("afconvert")
    if not say or not afconvert:
        return False
    out_path = AUDIO_DIR / f"{asset_id}.wav"
    try:
        with tempfile.TemporaryDirectory() as td:
            aiff = Path(td) / f"{asset_id}.aiff"
            subprocess.run([say, "-v", voice, "-o", str(aiff), text], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            subprocess.run([afconvert, "-f", "WAVE", "-d", "LEI16", str(aiff), str(out_path)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return out_path.exists() and out_path.stat().st_size > 1000
    except Exception:
        return False


CATALOG = [
    ("amb-corridor", "music", "horror-bed", "Looping derelict corridor hum", synth_amb_corridor),
    ("crt-stalk", "sfx", "monster", "Looping close stalking presence", synth_stalk),
    ("crt-shriek", "sfx", "monster", "The Chorus capture shriek", synth_shriek),
    ("crt-call", "sfx", "signal", "Corrupted comms call and radio hash", synth_call),
    ("sfx-flashlight", "sfx", "tools", "Flashlight click and failing coil", synth_flashlight),
    ("sfx-step", "sfx", "foley", "Boot step on damp metal", synth_step),
]

VOICE_LINES = [
    (
        "vox-vesta-1",
        "voice-line",
        "VESTA",
        "Correction. One signal active. It is not on our manifest.",
        "Samantha",
        lambda: synth_voice(6101, 3.6, 154, 0.035),
    ),
    (
        "vox-vesta-3",
        "voice-line",
        "VESTA",
        "Warning. Hull integrity is failing. I will remain with you for as long as I am able.",
        "Samantha",
        lambda: synth_voice(6103, 4.8, 148, 0.035),
    ),
    (
        "vox-chorus-1",
        "voice-line",
        "The Chorus",
        "I am the rescue you called for. Restore the signal. Open the channel.",
        "Zarvox",
        lambda: synth_voice(9001, 5.2, 86, 0.11),
    ),
]


def main() -> int:
    force = "--force" in sys.argv
    created: list[str] = []
    skipped: list[str] = []

    for asset_id, kind, category, prompt, synth in CATALOG:
        path = AUDIO_DIR / f"{asset_id}.wav"
        if path.exists() and not force:
            skipped.append(asset_id)
        else:
            write_wav(asset_id, synth())
            created.append(asset_id)
        record_asset(asset_id, kind, category, prompt, "local-synth")

    for asset_id, kind, category, prompt, voice, fallback in VOICE_LINES:
        path = AUDIO_DIR / f"{asset_id}.wav"
        if path.exists() and not force:
            skipped.append(asset_id)
        else:
            if not render_say(asset_id, prompt, voice):
                write_wav(asset_id, fallback())
            created.append(asset_id)
        record_asset(asset_id, kind, category, prompt, f"local-{voice.lower()}")

    print(f"audio dir: {AUDIO_DIR}")
    print(f"catalog db: {DB_PATH}")
    if created:
        print("created: " + ", ".join(created))
    if skipped:
        print("kept: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
