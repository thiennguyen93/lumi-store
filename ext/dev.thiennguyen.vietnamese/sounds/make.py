# The switch sounds of Lumi Gõ tiếng Việt, made from nothing but arithmetic,
# so they are the extension's own (no sound of anybody else's is in them).
#
#   python3 -I sounds/make.py            # ui/sounds/switch-on.wav and switch-off.wav
#   python3 -I sounds/make.py --all DIR  # every candidate below, to listen to
#
# On rises (typing becomes Vietnamese), off falls (typing becomes English):
# the same pair either way round, so the ear learns one shape. 44.1 kHz,
# 16-bit mono WAV, about -10 dBFS at its peak — heard, never loud.
#
# The candidates are the ones the owner liked when choosing (2026-11-03), kept
# here as a reference though only CHOSEN ships: a later change of mind is one
# word below and a run of this script, and the recipes stay in one place.
import math
import os
import struct
import sys
import wave

RATE = 44100
CHOSEN = "marimba"


def wav(samples, path):
    peak = max(1e-9, max(abs(s) for s in samples))
    gain = 0.32 / peak
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s * gain)) * 32767)) for s in samples))


def env(i, n, attack, decay):
    t = i / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    fade = min(1.0, (n - i) / (0.004 * RATE))  # no click at the end
    return a * math.exp(-t / decay) * fade


def voice(freq, seconds, decay, partials, attack=0.003):
    """A struck tone: the fundamental and (multiple, amplitude, decay) partials."""
    n = int(seconds * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        s = math.sin(2 * math.pi * freq * t)
        for mult, amp, d in partials:
            s += amp * math.sin(2 * math.pi * freq * mult * t) * math.exp(-t / d)
        out.append(env(i, n, attack, decay) * s)
    return out


def mix(parts):
    """parts: (start seconds, samples)."""
    length = max(int(start * RATE) + len(s) for start, s in parts)
    out = [0.0] * length
    for start, s in parts:
        o = int(start * RATE)
        for i, v in enumerate(s):
            out[o + i] += v
    return out


def notes(freqs, gap, tail, make):
    return mix([(k * gap, make(f, tail if k == len(freqs) - 1 else gap + 0.12)) for k, f in enumerate(freqs)])


C5, G5 = 523.25, 783.99
C6, G6 = 1046.5, 1568.0


def bell(f, s):
    return voice(f, s, 0.09, [(2.01, 0.25, 0.045)])


def pure(f, s):
    return voice(f, s, 0.08, [], attack=0.004)


def marimba(f, s):
    return voice(f, s, 0.07, [(4.0, 0.35, 0.012), (9.9, 0.12, 0.005)], attack=0.001)


def kalimba(f, s):
    return voice(f, s, 0.14, [(5.4, 0.3, 0.012), (2.0, 0.08, 0.05)], attack=0.001)


# name: (what it is, on, off)
CANDIDATES = {
    "chime": ("A bell, C–G, a fifth", lambda: notes([C6, G6], 0.075, 0.34, bell), lambda: notes([G6, C6], 0.075, 0.34, bell)),
    "chime-lower": ("The bell an octave lower: warmer", lambda: notes([C5, G5], 0.075, 0.34, bell), lambda: notes([G5, C5], 0.075, 0.34, bell)),
    "chime-round": ("The bell with no overtone: softer", lambda: notes([C6, G6], 0.075, 0.3, pure), lambda: notes([G6, C6], 0.075, 0.3, pure)),
    "marimba": ("Wooden bars, C–G", lambda: notes([C5, G5], 0.075, 0.28, marimba), lambda: notes([G5, C5], 0.075, 0.28, marimba)),
    "marimba-high": ("The marimba an octave up", lambda: notes([C6, G6], 0.07, 0.24, marimba), lambda: notes([G6, C6], 0.07, 0.24, marimba)),
    "kalimba": ("A thumb piano, C–G", lambda: notes([C6, G6], 0.08, 0.4, kalimba), lambda: notes([G6, C6], 0.08, 0.4, kalimba)),
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    if sys.argv[1:2] == ["--all"]:
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
        for name, (_, on, off) in CANDIDATES.items():
            wav(on(), os.path.join(out, f"{name}-on.wav"))
            wav(off(), os.path.join(out, f"{name}-off.wav"))
        return
    out = os.path.join(here, "..", "ui", "sounds")
    os.makedirs(out, exist_ok=True)
    _, on, off = CANDIDATES[CHOSEN]
    wav(on(), os.path.join(out, "switch-on.wav"))
    wav(off(), os.path.join(out, "switch-off.wav"))


main()
