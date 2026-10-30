"""Generate the game's original 8-bit style SFX (mono 16-bit WAV).

Output: public/assets/audio/*.wav
Run: python tools/gen_sfx.py
"""
import math
import os
import random
import struct
import wave

RATE = 22050
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'audio')

random.seed(7)


def envelope(i, n, attack=0.01, release=0.6):
    a = min(1.0, i / max(1.0, attack * RATE))
    r = min(1.0, (n - i) / max(1.0, release * n))
    return a * r


def tone(freq_at, dur, kind='square', vol=0.5, attack=0.01, release=0.6):
    n = max(1, int(dur * RATE))
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        phase = (phase + freq_at(t, dur) / RATE) % 1.0
        if kind == 'square':
            s = 1.0 if phase < 0.5 else -1.0
        elif kind == 'saw':
            s = 2.0 * phase - 1.0
        elif kind == 'tri':
            s = 4.0 * abs(phase - 0.5) - 1.0
        else:
            s = math.sin(2.0 * math.pi * phase)
        out.append(s * vol * envelope(i, n, attack, release))
    return out


def noise(dur, vol=0.4, attack=0.005, release=0.8):
    n = max(1, int(dur * RATE))
    return [random.uniform(-1, 1) * vol * envelope(i, n, attack, release) for i in range(n)]


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for track in tracks:
        for i, value in enumerate(track):
            out[i] += value
    return [max(-1.0, min(1.0, v)) for v in out]


def seq(notes):
    out = []
    for freq, dur, kind, vol in notes:
        out.extend(tone(lambda t, d, f=freq: f, dur, kind, vol, 0.005, 0.5))
    return out


def save(name, samples, gain=0.9):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.wav')
    peak = max(1e-6, max(abs(s) for s in samples))
    scale = gain / max(1.0, peak)
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b''.join(
            struct.pack('<h', int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in samples
        )
        w.writeframes(frames)
    print(f'{name}.wav  {len(samples) / RATE * 1000:.0f} ms')


def build_bgm():
    """16 s seamless loop: slow minor drone plus sparse bell plucks."""
    dur = 16.0
    n = int(dur * RATE)
    out = [0.0] * n
    for freq, amp, lfo_rate, phase in [
        (55.0, 0.16, 0.125, 0.0),
        (82.5, 0.10, 0.125, 1.7),
        (110.0, 0.07, 0.25, 0.6),
        (164.81, 0.035, 0.125, 2.4),
    ]:
        for i in range(n):
            t = i / RATE
            lfo = 0.6 + 0.4 * math.sin(2 * math.pi * lfo_rate * t + phase)
            out[i] += amp * lfo * math.sin(2 * math.pi * freq * t)
    for beat, freq in enumerate([220.0, 261.63, 329.63, 196.0]):
        start = int(beat * 4.0 * RATE)
        for i in range(int(1.4 * RATE)):
            if start + i >= n:
                break
            t = i / RATE
            out[start + i] += 0.075 * math.exp(-3.2 * t) * math.sin(2 * math.pi * freq * t)
    save('bgm_loop', out, gain=0.55)


def build():
    save('sfx_shoot', mix(
        tone(lambda t, d: 820 - 520 * (t / d), 0.07, 'square', 0.32),
        noise(0.02, 0.12),
    ))
    save('sfx_hit', mix(
        noise(0.05, 0.35),
        tone(lambda t, d: 240 - 120 * (t / d), 0.06, 'square', 0.2),
    ))
    save('sfx_kill', mix(
        tone(lambda t, d: 420 - 330 * (t / d), 0.2, 'saw', 0.3),
        noise(0.14, 0.22),
    ))
    save('sfx_hurt', mix(
        tone(lambda t, d: 260 - 170 * (t / d), 0.24, 'square', 0.35),
        noise(0.07, 0.25),
    ))
    save('sfx_coin', seq([
        (1180, 0.05, 'square', 0.28),
        (1560, 0.07, 'square', 0.26),
    ]))
    save('sfx_heart', seq([
        (620, 0.06, 'tri', 0.34),
        (820, 0.06, 'tri', 0.3),
        (980, 0.08, 'tri', 0.28),
    ]))
    save('sfx_item', seq([
        (523, 0.06, 'square', 0.26),
        (659, 0.06, 'square', 0.26),
        (784, 0.07, 'square', 0.26),
        (1046, 0.12, 'square', 0.24),
    ]))
    save('sfx_boss', mix(
        tone(lambda t, d: 150 - 80 * (t / d), 0.16, 'saw', 0.38),
        noise(0.1, 0.2),
    ))
    save('sfx_explode', mix(
        noise(0.32, 0.45),
        tone(lambda t, d: 90 - 50 * (t / d), 0.3, 'sine', 0.42),
    ))
    save('sfx_beam', mix(
        tone(lambda t, d: 280 + 900 * (t / d), 0.3, 'saw', 0.28),
        noise(0.05, 0.12),
    ))
    save('sfx_chest', mix(
        tone(lambda t, d: 180 + 120 * (t / d), 0.18, 'saw', 0.25),
        seq([(520, 0.05, 'tri', 0.24), (780, 0.06, 'tri', 0.24), (1040, 0.1, 'tri', 0.22)]),
    ))
    save('sfx_clear', seq([
        (784, 0.08, 'square', 0.24),
        (1046, 0.16, 'square', 0.22),
    ]))
    save('sfx_shop', seq([
        (560, 0.06, 'tri', 0.28),
        (700, 0.06, 'tri', 0.26),
        (880, 0.1, 'tri', 0.24),
    ]))
    save('sfx_door', mix(
        noise(0.34, 0.3, 0.02, 0.9),
        tone(lambda t, d: 300 - 220 * (t / d), 0.3, 'sine', 0.16),
    ))


if __name__ == '__main__':
    build()
    build_bgm()
