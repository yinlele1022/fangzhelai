#!/usr/bin/env python3
"""
生成《反着来》Stranger-Things 风格背景音乐 (BGM)
纯 Python 标准库实现，输出 WAV 到 apps/web/assets/audio/
100% 免版权，可直接商用。

生成 3 首：
  1. bgm-menu.wav     — 暗黑氛围，合成器铺底，配合开场警告画面
  2. bgm-gameplay.wav — 驱动力强的合成器琶音，Stranger Things Theme 风格
  3. bgm-pk.wav       — 更快节奏、更侵略性的对战 BGM

用法: python scripts/generate-bgm.py
"""

import math
import random
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "apps" / "web" / "assets" / "audio"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def sine(freq, t):
    return math.sin(2 * math.pi * freq * t)


def saw(freq, t):
    """锯齿波 — 经典合成器音色"""
    return 2 * ((freq * t) % 1) - 1


def square(freq, t):
    """方波 — 8-bit / chiptune 风格"""
    return 1 if (freq * t) % 1 < 0.5 else -1


def pulse(freq, t, duty=0.25):
    """脉冲波 — 复古合成器 (如 Prophet-5)"""
    return 1 if (freq * t) % 1 < duty else -1


def triangle(freq, t):
    """三角波 — 柔和低音"""
    return 4 * abs((freq * t) % 1 - 0.5) - 1


def noise():
    return random.uniform(-1, 1)


def adsr_envelope(t, start_t, attack, decay, sustain_level, release, total_dur):
    """简单的 ADSR 包络"""
    rel_t = t - start_t
    if rel_t < 0:
        return 0
    if rel_t < attack:
        return rel_t / attack  # attack
    if rel_t < attack + decay:
        decay_t = (rel_t - attack) / decay
        return 1 - (1 - sustain_level) * decay_t  # decay to sustain
    if rel_t < total_dur - release:
        return sustain_level  # sustain
    release_t = (rel_t - (total_dur - release)) / release
    if release_t < 1:
        return sustain_level * (1 - release_t)  # release
    return 0


def arpeggio(t, root_freq, pattern, step_duration):
    """Stranger Things 风格琶音: 在 pattern 中的音符间循环"""
    step_idx = int(t / step_duration) % len(pattern)
    return root_freq * (2 ** (pattern[step_idx] / 12))


def low_pass(samples, cutoff_freq, resonance=0.5):
    """简单一阶低通滤波器"""
    dt = 1.0 / SAMPLE_RATE
    rc = 1.0 / (2 * math.pi * cutoff_freq)
    alpha = dt / (rc + dt)
    filtered = [0.0] * len(samples)
    for i in range(1, len(samples)):
        filtered[i] = filtered[i - 1] + alpha * (samples[i] - filtered[i - 1])
    return filtered


def normalize(samples, target_peak=0.85):
    peak = max(abs(s) for s in samples)
    if peak == 0:
        return samples
    scale = target_peak / peak
    return [s * scale for s in samples]


def write_wav(filename, samples_left, samples_right=None):
    if samples_right is None:
        samples_right = samples_left
    path = OUTPUT_DIR / filename
    n = min(len(samples_left), len(samples_right))
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        # Clamp and convert to int16
        for i in range(n):
            left = max(-1.0, min(1.0, samples_left[i]))
            right = max(-1.0, min(1.0, samples_right[i]))
            wf.writeframesraw(
                struct.pack("<hh", int(left * 32767), int(right * 32767))
            )
    size_kb = path.stat().st_size / 1024
    print(f"  ✓ {filename} ({size_kb:.0f} KB)")


# ============================================================
# Track 1: bgm-menu.wav — 暗黑氛围
# 缓慢的低音脉动 + 空灵泛音 + 轻微噪声
# ============================================================
def generate_menu_bgm(duration_s=30):
    print("[1/3] 生成菜单 BGM (暗黑氛围)...")
    n_samples = int(SAMPLE_RATE * duration_s)
    samples = []

    for i in range(n_samples):
        t = i / SAMPLE_RATE
        sample = 0.0

        # 低音脉动 D2 (约 73 Hz) — 每 2 秒一个周期
        bass_freq = 36.7  # D1
        pulse_t = t % 2.0
        bass_env = max(0, 1 - pulse_t * 3) if pulse_t < 0.3 else 0
        sample += sine(bass_freq, t) * bass_env * 0.35

        # 泛音层 D2~D3 — 缓慢漂移
        detune = 1 + 0.003 * sine(0.13, t)
        sample += triangle(73.4 * detune, t) * 0.15
        sample += sine(147 * detune, t) * 0.08  # 八度泛音

        # 高音泛音 — 空灵感
        sample += sine(587, t) * 0.03 * (0.5 + 0.5 * sine(0.07, t))

        # 暗噪声纹理
        sample += noise() * 0.02

        # 整体淡入淡出
        fade = 1.0
        if t < 2:
            fade = t / 2
        elif t > duration_s - 3:
            fade = (duration_s - t) / 3
        sample *= fade

        samples.append(sample)

    samples = low_pass(samples, 600)
    samples = normalize(samples, 0.8)
    write_wav("bgm-menu.wav", samples)


# ============================================================
# Track 2: bgm-gameplay.wav — Stranger Things 风格琶音
# 标志性的 8 分音符合成器琶音 + 贝斯 + 鼓点
# ============================================================
def generate_gameplay_bgm(duration_s=60):
    print("[2/3] 生成闯关 BGM (合成器琶音)...")

    # C 小调琶音模式 (半音偏移) — Stranger Things 用了很多 C minor
    # 经典模式: C-Eb-G-Bb 上行 + 变化
    arp_pattern = [0, 3, 7, 10, 15, 10, 7, 3, 0, 3, 7, 10, 12, 10, 7, 3]
    step_dur = 0.15  # ~133 BPM 八分音符
    root = 65.4  # C2

    n_samples = int(SAMPLE_RATE * duration_s)
    samples_left = []
    samples_right = []

    for i in range(n_samples):
        t = i / SAMPLE_RATE
        beat_t = t % (step_dur * len(arp_pattern))

        L = 0.0
        R = 0.0

        # === 主琶音 (锯齿波 — 经典 Prophet 音色) ===
        arp_freq = arpeggio(t, root, arp_pattern, step_dur)
        arp_env = 1.0
        # 每个音符有自己的小包络
        note_t = t % step_dur
        if note_t < 0.01:
            arp_env = note_t / 0.01  # fast attack
        elif note_t > step_dur * 0.7:
            arp_env = (step_dur - note_t) / (step_dur * 0.3)  # decay
        arp_body = saw(arp_freq, t) * 0.18 * arp_env
        arp_body = arp_body * 0.7 + saw(arp_freq * 2, t) * 0.3 * arp_env  # 加入泛音
        L += arp_body
        R += arp_body * 0.85

        # === 贝斯 (脉冲波) ===
        bass_freq = root * 0.5  # C1
        bass_note_t = t % (step_dur * 4)
        bass_env = 1.0 if bass_note_t < step_dur * 1.5 else (
            0.6 if bass_note_t < step_dur * 2.5 else 0.3
        )
        bass_body = pulse(bass_freq, t, 0.3) * 0.2 * bass_env
        L += bass_body
        R += bass_body

        # === 打击乐模拟 ===
        # Kick
        kick_t = t % 0.6  # every 1.2s
        if kick_t < 0.08:
            kick_freq = 50 + 180 * (1 - kick_t / 0.08)
            kick_env = max(0, 1 - kick_t / 0.08)
            kick = sine(kick_freq, t) * kick_env * 0.25
            L += kick
            R += kick

        # Snare (noise burst on 2 and 4)
        snare_t = t % 1.2
        if 0.5 < snare_t < 0.58:
            snare_env = max(0, 1 - (snare_t - 0.5) / 0.08)
            snare_body = noise() * snare_env * 0.15
            L += snare_body
            R += snare_body

        # Hi-hat (noise on 8ths)
        hh_t = t % 0.3
        if hh_t < 0.025:
            hh = noise() * (1 - hh_t / 0.025) * 0.06
            L += hh
            R += hh * 0.7

        # === 和弦铺底 (每 4 小节) ===
        chord_idx = int(t / (step_dur * 8)) % 4
        chord_roots = [0, 3, 5, -2]  # i, III, iv, bVII
        chord_freq = root * (2 ** (chord_roots[chord_idx] / 12))
        pad = (saw(chord_freq, t) * 0.05 +
               saw(chord_freq * 2, t) * 0.03 +
               saw(chord_freq * 1.5 + 0.5, t) * 0.02)
        L += pad
        R += pad

        # === 淡入淡出 ===
        fade = 1.0
        if t < 1.5:
            fade = t / 1.5
        elif t > duration_s - 5:
            fade = max(0, (duration_s - t) / 5)
        L *= fade
        R *= fade

        samples_left.append(L)
        samples_right.append(R)

    samples_left = low_pass(samples_left, 4000)
    samples_right = low_pass(samples_right, 4000)
    samples_left, samples_right = normalize(samples_left), normalize(samples_right)
    peak = max(max(abs(s) for s in samples_left), max(abs(s) for s in samples_right))
    scale = 0.82 / peak if peak > 0 else 1
    samples_left = [s * scale for s in samples_left]
    samples_right = [s * scale for s in samples_right]

    write_wav("bgm-gameplay.wav", samples_left, samples_right)


# ============================================================
# Track 3: bgm-pk.wav — 在线对战
# 更快 BPM (~150)、更侵略的音色、更重的贝斯
# ============================================================
def generate_pk_bgm(duration_s=45):
    print("[3/3] 生成对战 BGM (高速合成器)...")

    # E 弗里吉亚模式 — 暗黑感
    arp_pattern = [0, 1, 4, 5, 7, 8, 12, 8, 7, 5, 4, 1, 0, 1, 4, 7]
    step_dur = 0.11  # 更快 (~136 BPM per note, effectively ~150+)
    root = 82.4  # E2

    n_samples = int(SAMPLE_RATE * duration_s)
    samples_left = []
    samples_right = []

    for i in range(n_samples):
        t = i / SAMPLE_RATE

        L = 0.0
        R = 0.0

        # === 主琶音 (更尖锐的方波) ===
        arp_freq = arpeggio(t, root, arp_pattern, step_dur)
        note_t = t % step_dur
        arp_env = 1.0
        if note_t < 0.005:
            arp_env = note_t / 0.005
        elif note_t > step_dur * 0.75:
            arp_env = max(0, (step_dur - note_t) / (step_dur * 0.25))
        arp = square(arp_freq, t) * 0.22 * arp_env
        arp += saw(arp_freq * 1.5, t) * 0.08 * arp_env  # detune
        L += arp
        R += arp * 0.9

        # === 重贝斯 (失真感) ===
        bass_freq = root * 0.5
        bass_note_t = t % (step_dur * 2)
        bass_env = 1.0 if bass_note_t < step_dur * 0.8 else (
            0.7 if bass_note_t < step_dur * 1.2 else 0.5
        )
        bass = saw(bass_freq, t) * 0.25 * bass_env
        L += bass
        R += bass

        # === 侧链贝斯 (八分音符) ===
        sb_t = t % (step_dur * 4)
        sb_env = 1.0 if sb_t < step_dur * 0.6 else 0.0
        sb = pulse(root * 0.25, t, 0.2) * 0.15 * sb_env
        L += sb
        R += sb

        # === 打击乐 ===
        # Kick — every beat
        kick_t = t % 0.4
        if kick_t < 0.06:
            kick_f = 55 + 200 * (1 - kick_t / 0.06)
            kick = sine(kick_f, t) * max(0, 1 - kick_t / 0.06) * 0.28
            L += kick
            R += kick

        # Snare — on 2 and 4
        snare_t = t % 0.8
        if 0.35 < snare_t < 0.45:
            sn_env = max(0, 1 - (snare_t - 0.35) / 0.1)
            sn = noise() * sn_env * 0.18
            # Add a tone component for body
            sn += sine(180, t) * sn_env * 0.08
            L += sn
            R += sn

        # Fast hi-hat
        hh_t = t % 0.2
        if hh_t < 0.02:
            hh = noise() * (1 - hh_t / 0.02) * 0.07
            L += hh
            R += hh * 0.6

        # === 上升音效 (每 8 小节) ===
        riser_cycle = t % (step_dur * 32)
        if riser_cycle > step_dur * 28:
            riser_progress = (riser_cycle - step_dur * 28) / (step_dur * 4)
            riser_freq = 80 + riser_progress * 600
            riser = sine(riser_freq, t) * 0.06 * riser_progress
            L += riser
            R += riser

        # === 和弦铺底 ===
        chord_roots = [0, 1, 5, -2]
        chord_idx = int(t / (step_dur * 16)) % 4
        chord_f = root * (2 ** (chord_roots[chord_idx] / 12))
        pad = (saw(chord_f, t) * 0.04 + saw(chord_f * 2.01, t) * 0.02)
        L += pad
        R += pad

        fade = 1.0
        if t < 1:
            fade = t
        elif t > duration_s - 3:
            fade = max(0, (duration_s - t) / 3)
        L *= fade
        R *= fade

        samples_left.append(L)
        samples_right.append(R)

    samples_left = low_pass(samples_left, 5000)
    samples_right = low_pass(samples_right, 5000)
    left_norm = normalize(samples_left)
    right_norm = normalize(samples_right)
    write_wav("bgm-pk.wav", left_norm, right_norm)


# ============================================================
def main():
    print("《反着来》BGM 生成器")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"采样率: {SAMPLE_RATE} Hz\n")

    generate_menu_bgm(30)
    generate_gameplay_bgm(60)
    generate_pk_bgm(45)

    print(f"\n✅ 完成！文件在: {OUTPUT_DIR}")
    print("   bgm-menu.wav     — 菜单 / 开场")
    print("   bgm-gameplay.wav — 单人闯关")
    print("   bgm-pk.wav       — 在线对战")


if __name__ == "__main__":
    main()
