# Makes the placeholder sound effects in src/data/sounds/ from maths (noise, sine waves, a plucked string), so the game
# has something to play until real sounds replace them. Run: python3 scripts/make-placeholder-sounds.py
# Each sound is a function of time; change a number and run it again to hear the difference.
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'sounds'


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    gain = 0.9 / peak
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s * gain)) * 32767)) for s in samples))


class BandPass:
    # A resonant filter: lets through a band of pitches round `freq`, which can move as the sound plays.
    def __init__(self, q):
        self.q = q
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0

    def __call__(self, x, freq):
        w = 2 * math.pi * min(freq, RATE * 0.45) / RATE
        alpha = math.sin(w) / (2 * self.q)
        b0, b2 = alpha, -alpha
        a0, a1, a2 = 1 + alpha, -2 * math.cos(w), 1 - alpha
        y = (b0 * x + b2 * self.x2 - a1 * self.y1 - a2 * self.y2) / a0
        self.x2, self.x1, self.y2, self.y1 = self.x1, x, self.y1, y
        return y


def env(t, attack, length, curve=2.0):
    # Fades in over `attack`, then out by `length`.
    if t < attack:
        return t / attack
    return max(0.0, 1 - (t - attack) / (length - attack)) ** curve



def dash():
    # A short, low swish that drops in pitch.
    n = int(RATE * 0.2)
    bp = BandPass(1.8)
    return [bp(random.uniform(-1, 1), 1800 - 1300 * (i / n)) * env(i / RATE, 0.015, 0.2, 2.2) for i in range(n)]



def hit():
    # A thud: a low tone dropping fast, with a crunchy burst of noise on top.
    n = int(RATE * 0.14)
    bp = BandPass(1.2)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        phase += 2 * math.pi * (190 * math.exp(-t * 28) + 55) / RATE
        thud = math.sin(phase) * env(t, 0.002, 0.14, 2.2)
        crunch = bp(random.uniform(-1, 1), 1400) * env(t, 0.001, 0.05, 1.5)
        out.append(thud + crunch * 0.8)
    return out



def voice_blip():
    # One syllable of retro "talking": a soft square wave with a tiny drop in pitch. The game plays it every few
    # letters while a line types out, at each speaker's own pitch.
    n = int(RATE * 0.06)
    out = []
    phase = 0.0
    lp = 0.0
    for i in range(n):
        t = i / RATE
        phase += (440 * (1 - 0.12 * t / 0.06)) / RATE
        square = 1.0 if (phase % 1) < 0.35 else -1.0
        lp += (square - lp) * 0.35
        out.append(lp * env(t, 0.004, 0.06, 1.4))
    return out


SOUNDS = {'dash_swish': dash, 'enemy_hit': hit, 'voice_blip': voice_blip}

if __name__ == '__main__':
    # Names on the command line make just those (python3 scripts/make-placeholder-sounds.py voice_blip), so sounds
    # already liked are not remade. Each sound has its own fixed random seed, so a remake is the same every time.
    for name in sys.argv[1:] or SOUNDS:
        random.seed(name)
        write(name, SOUNDS[name]())
        print(f'wrote {name}.wav')
