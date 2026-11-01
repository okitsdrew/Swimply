# Makes the placeholder sound effects in src/data/sounds/ from maths (noise, sine waves, a plucked string), so the game
# has something to play until real sounds replace them. Run: python3 scripts/make-placeholder-sounds.py
# Each sound is a function of time; change a number and run it again to hear the difference.
import math
import random
import struct
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


def teleport():
    # A whoosh that sweeps up then down, with a bright magic shimmer rising underneath.
    n = int(RATE * 0.42)
    bp, bp2 = BandPass(2.5), BandPass(4)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        k = t / 0.42
        sweep = 400 + 3200 * math.sin(math.pi * min(1, k * 1.15)) ** 1.5
        noise = random.uniform(-1, 1)
        whoosh = bp(noise, sweep) + 0.5 * bp2(noise, sweep * 1.9)
        phase += 2 * math.pi * (500 + 1400 * k) / RATE
        shimmer = math.sin(phase) * 0.35 + math.sin(phase * 2.01) * 0.15
        out.append((whoosh * 1.4 + shimmer * (1 - k) ** 2) * env(t, 0.06, 0.42, 1.6))
    return out


def dash():
    # A short, low swish that drops in pitch.
    n = int(RATE * 0.2)
    bp = BandPass(1.8)
    return [bp(random.uniform(-1, 1), 1800 - 1300 * (i / n)) * env(i / RATE, 0.015, 0.2, 2.2) for i in range(n)]


def bow_shot():
    # A plucked string (Karplus-Strong: a burst of noise fed round a short delay) plus the arrow's quick swish.
    n = int(RATE * 0.22)
    delay = int(RATE / 165)
    buf = [random.uniform(-1, 1) for _ in range(delay)]
    bp = BandPass(2)
    out = []
    for i in range(n):
        t = i / RATE
        j = i % delay
        nxt = 0.5 * (buf[j] + buf[(j + 1) % delay]) * 0.985
        string = buf[j]
        buf[j] = nxt
        swish = bp(random.uniform(-1, 1), 2500 + 2500 * (i / n)) * env(t, 0.01, 0.12, 2)
        out.append(string * env(t, 0.002, 0.22, 2.5) + swish * 0.6)
    return out


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


def fire_crackle():
    # A loop of burning: a soft low roar, plus pops and snaps at random. The roar's extra tail is blended into its
    # start, and pops that run past the end wrap round, so the loop joins without a seam.
    length = 4.0
    n = int(RATE * length)
    fade = int(RATE * 0.5)
    roar, lp = [], 0.0
    for _ in range(n + fade):
        lp += (random.uniform(-1, 1) - lp) * 0.04
        roar.append(lp * 0.9)
    out = [roar[i] * (i / fade) + roar[n + i] * (1 - i / fade) if i < fade else roar[i] for i in range(n)]
    for _ in range(int(length * 14)):
        start = random.randint(0, n - 1)
        size = random.uniform(0.2, 1.0) ** 2
        bp = BandPass(random.uniform(1.5, 4))
        freq = random.uniform(1500, 5000)
        decay = random.uniform(80, 260)
        for j in range(int(RATE * 0.08)):
            out[(start + j) % n] += bp(random.uniform(-1, 1), freq) * math.exp(-j / RATE * decay) * size * 2.2
    return out


if __name__ == '__main__':
    random.seed(7)
    for name, make in [('teleport_whoosh', teleport), ('dash_swish', dash), ('bow_shot', bow_shot), ('enemy_hit', hit), ('fire_crackle', fire_crackle)]:
        write(name, make())
        print(f'wrote {name}.wav')
