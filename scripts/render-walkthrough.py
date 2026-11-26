"""Render the Memory Atlas demonstration from the site's example archive."""
import argparse
import functools
import json
import math
import random
import re
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT, FPS = 1280, 720, 25
SIZE = (WIDTH, HEIGHT)
TIMES = (0, 4, 10, 17, 24, 31, 38, 42)
INK, MUTED, GOLD = "#f4eee3", "#c4bdc6", "#e2bd83"
PANEL, RAISED, LINE = "#1b1b25", "#242330", "#3c3645"
CHAPTERS = ("导入", "星图", "原文", "回顾", "复习")


def example():
    script = """
import { sampleArchive } from './dist/demo.js';
import { assemble } from './dist/analysis.js';
import { scheduleReview } from './dist/growth-core.js';
const a = sampleArchive();
const graph = assemble(a.sessions, a.groups);
const next = scheduleReview({}, 'good', new Date('2026-11-01T12:00:00Z'));
console.log(JSON.stringify({
  count: a.sessions.length, themes: graph.themes, nodes: graph.nodes,
  edges: graph.edges,
  session: a.sessions.find(session => session.title === '久期与债券风险'),
  days: Math.round((Date.parse(next.due) - Date.parse('2026-11-01T12:00:00Z')) / 86400000)
}));
"""
    return json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", script], cwd=ROOT, encoding="utf-8"
    ))


def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def interpolate(a, b, progress):
    return a + (b - a) * progress


def tint(hex_color, base=INK, ratio=0.38):
    a = bytes.fromhex(hex_color.lstrip("#"))
    b = bytes.fromhex(base.lstrip("#"))
    return tuple(round(interpolate(m, n, ratio)) for m, n in zip(a, b))


def background():
    x, y = np.meshgrid(np.linspace(0, 1, WIDTH), np.linspace(0, 1, HEIGHT))
    violet = np.exp(-4.0 * ((x - 0.82) ** 2 + (y - 0.35) ** 2))
    green = np.exp(-7.5 * ((x - 0.36) ** 2 + (y - 0.87) ** 2))
    pixels = np.stack((14 + 14 * violet + 5 * green, 15 + 9 * violet + 13 * green,
                       21 + 19 * violet + 11 * green), axis=-1)
    return Image.fromarray(pixels.astype(np.uint8), "RGB")


class Film:
    def __init__(self, dataset, font_dir):
        self.data = dataset
        self.font_dir = font_dir
        self.bg = background()
        self.pet_dir = ROOT / "dist" / "pets"
        self.stars = [(random.Random(i).uniform(38, WIDTH - 38),
                       random.Random(i + 197).uniform(78, HEIGHT - 76),
                       (i % 9) / 9) for i in range(87)]
        self.positions = self.graph_positions()
        self.concepts = sorted(
            (node for node in dataset["nodes"] if node["type"] == "concept"),
            key=lambda node: -node["weight"],
        )
        self.questions = [node for node in dataset["nodes"]
                          if node["type"] == "question" and node.get("threadCount", 0) > 1]
        self.open = [node for node in dataset["nodes"]
                     if node["type"] == "loop" and not node.get("resolved")]

    @functools.lru_cache
    def font(self, size, serif=False, weight=450):
        family = "NotoSerifSC" if serif else "NotoSansSC"
        face = ImageFont.truetype(str(self.font_dir / (family + "-VF.ttf")), size)
        face.set_variation_by_axes([weight])
        return face

    @functools.lru_cache
    def pet(self, name, size):
        return Image.open(self.pet_dir / (name + ".webp")).convert("RGBA").resize(
            (size, size), Image.Resampling.LANCZOS
        )

    def label(self, draw, x, y, text, size=19, color=INK, serif=False, weight=450, anchor="lt"):
        draw.text((int(x), int(y)), text, fill=color, font=self.font(size, serif, weight), anchor=anchor)

    def wrapped(self, draw, x, y, text, width, size=18, color=MUTED, limit=3):
        font = self.font(size)
        lines, line = [], ""
        for unit in re.findall(r"\n|[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*|[^\n]", text):
            if unit == "\n" or (line and font.getlength(line + unit) > width):
                lines.append(line.rstrip())
                line = "" if unit == "\n" else unit.lstrip()
            else:
                line += unit
        lines.append(line)
        for index, row in enumerate(lines[:limit]):
            if index == limit - 1 and len(lines) > limit:
                row = row[:-1] + "…"
            self.label(draw, x, y + index * (size + 10), row, size, color)

    def chip(self, draw, box, text, selected=False, size=17):
        draw.rounded_rectangle(box, radius=9, fill=GOLD if selected else RAISED,
                               outline="#b59468" if selected else LINE)
        self.label(draw, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, text,
                   size, "#29221d" if selected else INK, weight=540, anchor="mm")

    @staticmethod
    def star(draw, x, y, radius, color):
        inner = radius * 0.27
        draw.polygon(((x, y - radius), (x + inner, y - inner), (x + radius, y),
                      (x + inner, y + inner), (x, y + radius), (x - inner, y + inner),
                      (x - radius, y), (x - inner, y - inner)), fill=color)

    def chrome(self, draw, time, scene):
        self.star(draw, 73, 51, 13, GOLD)
        draw.ellipse((53, 31, 93, 71), outline="#67513a", width=1)
        self.label(draw, 105, 40, "Memory Atlas", 22, INK, serif=True, weight=550)
        self.label(draw, 1207, 44, "使用示例", 16, MUTED, anchor="rt")
        draw.line((54, 89, 1226, 89), fill=LINE)
        draw.line((54, 632, 1226, 632), fill=LINE)
        for index, chapter in enumerate(CHAPTERS):
            x = 55 + index * 234
            start, end = TIMES[index + 1:index + 3]
            progress = min(1, max(0, (time - start) / (end - start)))
            draw.rounded_rectangle((x, 650, x + 204, 653), radius=1, fill=LINE)
            if progress:
                draw.rounded_rectangle((x, 650, x + int(204 * progress), 653), radius=1, fill=GOLD)
            color = GOLD if index + 1 == scene else MUTED
            self.label(draw, x, 668, chapter, 16, color)

    def headline(self, draw, time, title, subtitle, x=63, top=192):
        x = x + int((1 - smooth(time / 0.75)) * -23)
        for index, line in enumerate(title.split("\n")):
            self.label(draw, x, top + index * 73, line, 54, INK, True, 520)
        self.wrapped(draw, x, top + len(title.split("\n")) * 73 + 19,
                     subtitle, 390, size=22)

    def graph_positions(self):
        anchors = [(0.48, 0.39), (0.20, 0.63), (0.76, 0.29), (0.22, 0.25), (0.78, 0.68)]
        positions = {}
        for index, theme in enumerate(self.data["themes"]):
            x, y = anchors[index % len(anchors)]
            color = tint(theme["color"])
            positions[theme["id"]] = (x, y, color, True, theme["id"], theme["label"])
            children = [n for n in self.data["nodes"]
                        if n["type"] != "topic" and n.get("topics", [None])[:1] == [theme["id"]]]
            children.sort(key=lambda node: (-node["weight"], node["id"]))
            for offset, node in enumerate(children[:12]):
                angle = offset * 2.39996 + 0.72 * index
                radius = 0.055 + 0.013 * (offset % 5)
                positions[node["id"]] = (
                    x + math.cos(angle) * radius, y + math.sin(angle) * radius * 1.28,
                    color, False, theme["id"], node["label"],
                )
        return positions

    def galaxy(self, draw, box, time, reveal=1, selected=None, labels=True):
        x, y, width, height = box
        for index, stretch in enumerate((0.74, 0.62, 0.48)):
            mw, mh = width * stretch, height * (0.70 - 0.18 * index)
            cx, cy = x + width * 0.50, y + height * 0.50
            draw.ellipse((cx - mw / 2, cy - mh / 2, cx + mw / 2, cy + mh / 2),
                         outline=("#4d3e42", "#37313e", "#302936")[index], width=1)
        active = {}
        for index, (key, (px, py, color, main, theme, label)) in enumerate(self.positions.items()):
            stage = smooth((reveal * 1.6 - (index % 15) / 27) * 1.7)
            if stage <= 0.02:
                continue
            sx = x + width * interpolate(0.5, px, stage)
            sy = y + height * interpolate(0.5, py, stage)
            active[key] = (sx, sy, color, main, theme, label)
        for edge in self.data["edges"]:
            a, b = active.get(edge["from"]), active.get(edge["to"])
            if a and b:
                lit = selected and selected in (a[4], b[4])
                draw.line((a[0], a[1], b[0], b[1]), fill="#886b52" if lit else "#464052", width=1)
        for sx, sy, color, main, theme, label in active.values():
            dimmed = selected and theme != selected
            if main:
                radius = 12 + 2 * math.sin(1.7 * time + sx / 22)
                for outer in (5, 12):
                    r = radius + outer
                    draw.ellipse((sx - r, sy - r, sx + r, sy + r),
                                 outline="#4b3e45" if dimmed else "#715743", width=1)
                self.star(draw, sx, sy, radius, "#63566b" if dimmed else color)
                if labels:
                    self.label(draw, sx, sy - 29, label, 18, "#98919b" if dimmed else INK,
                               weight=550, anchor="mb")
            else:
                r = 2.2 if dimmed else 3
                draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill="#5b5267" if dimmed else color)

    @staticmethod
    def window(draw, box):
        draw.rounded_rectangle(box, radius=18, fill=PANEL, outline="#5c4a52", width=2)

    def cursor(self, draw, x, y, age=-1):
        if 0 <= age < 0.52:
            radius = 8 + age * 57
            draw.ellipse((x - radius, y - radius, x + radius, y + radius),
                         outline="#bd9360" if age < 0.31 else "#72563f", width=2)
        draw.polygon(((x, y), (x + 4, y + 20), (x + 10, y + 15),
                      (x + 16, y + 24), (x + 20, y + 21), (x + 14, y + 12),
                      (x + 21, y + 11)), fill="#fbedd1", outline="#41372d", width=1)

    def opening(self, image, draw, time):
        self.headline(draw, time, "聊过的，\n还能找回来。", "把 ChatGPT 对话整理成一张可以回看的星图。", top=171)
        self.galaxy(draw, (515, 119, 679, 461), time, reveal=0.78 + 0.22 * smooth(time / 3), labels=False)
        for index, (name, label, x, y) in enumerate((
            ("owl", "从 AlphaFold 看科学发现", 619, 175),
            ("cat", "久期与债券风险", 923, 260),
            ("moth", "记录注意力的去向", 646, 477),
        )):
            offset = 9 * math.sin(time * 1.04 + index)
            self.window(draw, (x, y + offset, x + 254, y + offset + 58))
            pet = self.pet(name, 49)
            image.paste(pet, (x + 8, int(y + offset + 4)), pet)
            self.label(draw, x + 67, y + offset + 20, label, 17, INK)

    def importing(self, image, draw, time):
        self.headline(draw, time, "把对话\n带进来", "选择 ChatGPT 导出的文件，也可以粘贴对话。")
        self.window(draw, (492, 137, 1190, 555))
        self.label(draw, 528, 164, "导入对话", 28, INK, True, 550)
        self.chip(draw, (528, 215, 638, 248), "选择文件", selected=True, size=16)
        self.chip(draw, (646, 215, 756, 248), "粘贴文本", size=16)
        draw.rounded_rectangle((528, 266, 1153, 410), radius=14, fill="#1e202b",
                               outline="#67546a", width=2)
        if time < 2.5:
            drift = smooth(time / 2.25)
            x, y = interpolate(1029, 735, drift), interpolate(171, 313, drift)
            self.label(draw, 839, 385, "选择文件，或拖到这里", 16, MUTED, anchor="mm")
            self.chip(draw, (x, y, x + 190, y + 43), "conversations.json")
            self.cursor(draw, x + 158, y + 31)
        else:
            self.label(draw, 840, 329, "conversations.json", 24, GOLD, anchor="mm")
        self.label(draw, 531, 435, "✓  保留对话原文", 17, MUTED)
        self.chip(draw, (529, 479, 750, 523), "导入并生成星图", selected=True)
        if time > 2.55:
            progress = smooth((time - 2.55) / 0.8)
            self.cursor(draw, interpolate(875, 705, progress), interpolate(344, 507, progress), time - 3.35)
        if time > 3.9:
            self.chip(draw, (848, 481, 1154, 523),
                      f"已在本地整理 {self.data['count']} 段对话")

    def mapping(self, image, draw, time):
        self.headline(draw, time, "散落的聊天，\n有了脉络。", "从主题找到对话，也能按时间回看。", top=170)
        self.window(draw, (474, 126, 1203, 581))
        self.label(draw, 500, 151, "我的对话", 19, INK, weight=550)
        self.chip(draw, (608, 142, 706, 181), "近 30 天", size=16)
        self.chip(draw, (1042, 142, 1101, 181), "星图", selected=True, size=15)
        self.chip(draw, (1107, 142, 1181, 181), "时间轴", size=15)
        draw.line((494, 194, 1183, 194), fill=LINE)
        self.galaxy(draw, (486, 200, 704, 360), time, reveal=smooth(time / 2.65))
        if time > 4.2:
            amount = smooth((time - 4.2) / 1.3)
            self.cursor(draw, interpolate(1107, 841, amount), interpolate(512, 342, amount), time - 5.5)

    def reading(self, image, draw, time):
        self.headline(draw, time, "点一颗星，\n回到当时。", "从金融学习找到当时讨论久期的原始对话。", top=173)
        self.window(draw, (460, 138, 1194, 571))
        self.galaxy(draw, (464, 156, 339, 392), time, selected="topic-finance", labels=False)
        draw.line((807, 159, 807, 548), fill=LINE)
        session = self.data["session"]
        if time < 2.0:
            self.label(draw, 834, 172, "金融学习", 25, INK, True, 550)
            self.label(draw, 834, 232, "来源对话", 17, GOLD)
            self.chip(draw, (834, 263, 1163, 310), session["title"])
            amount = smooth((time - 0.45) / 1.1)
            self.cursor(draw, interpolate(760, 1105, amount), interpolate(359, 289, amount), time - 1.55)
        else:
            self.label(draw, 832, 171, session["title"], 25, INK, True, 550)
            for index, turn in enumerate(session["turns"]):
                top = 226 + index * 131
                draw.rounded_rectangle((831, top, 1169, top + 116), radius=12,
                                       fill=RAISED, outline=LINE)
                self.label(draw, 848, top + 13, "你" if index == 0 else "ChatGPT", 15, GOLD)
                self.wrapped(draw, 848, top + 39, turn["text"], 300, 17, INK, 3)

    def review(self, image, draw, time):
        self.headline(draw, time, "最近在想什么？", "回顾会整理常聊的话题、新知识点和待跟进事项。", top=204)
        self.window(draw, (485, 129, 1197, 578))
        self.label(draw, 519, 152, "对话回顾", 27, INK, True, 550)
        self.chip(draw, (1054, 146, 1166, 184), "近 30 天", size=17)
        self.label(draw, 519, 210, f"{self.data['count']} 段对话", 24, GOLD, weight=540)
        blocks = [
            ("常聊主题", [t["label"] for t in self.data["themes"][:2]]),
            ("新知识点", [node["label"] for node in self.concepts
                       if node["label"] in ("Duration", "Macaulay Duration")]),
            ("反复追问", [q["label"] for q in self.questions[:2]]),
            ("待跟进", [node["label"] for node in self.open[:2]]),
        ]
        for index, (label, rows) in enumerate(blocks):
            left = 518 + (index % 2) * 328
            top = 258 + (index // 2) * 144 + round(15 * (1 - smooth((time - index * 0.17) / 0.55)))
            draw.rounded_rectangle((left, top, left + 306, top + 127), radius=12, fill=RAISED)
            self.label(draw, left + 16, top + 12, label, 17, GOLD)
            for row, value in enumerate(rows):
                self.wrapped(draw, left + 16, top + 44 + row * 32, value, 272, 15, INK, 1)

    def recall(self, image, draw, time):
        self.headline(draw, time, "值得记的，\n收进复习卡。", "先试着回忆，再展开原文核对。", top=171)
        self.window(draw, (500, 151, 1188, 565))
        if time < 2.05:
            self.label(draw, 537, 183, "节点详情", 21, MUTED)
            self.label(draw, 537, 252, "Duration", 43, INK, True, 550)
            self.label(draw, 540, 322, "知识点", 17, MUTED)
            self.chip(draw, (539, 418, 714, 463), "加入复习", selected=True)
            travel = smooth(time / 1.15)
            self.cursor(draw, interpolate(866, 685, travel), interpolate(333, 444, travel), time - 1.22)
        else:
            self.label(draw, 537, 179, "复习卡", 28, INK, True, 540)
            draw.rounded_rectangle((537, 225, 1151, 524), radius=14, fill=RAISED, outline=LINE)
            self.label(draw, 559, 255, "Duration", 32, INK, True, 550)
            self.label(draw, 561, 316, "回忆后，展开原文核对", 18, GOLD)
            if time > 3.1:
                self.wrapped(draw, 561, 354, self.data["session"]["turns"][1]["text"], 544, 17, MUTED, 3)
            for index, label in enumerate(("还没记住", "有点模糊", "记住了")):
                x = 560 + index * 122
                self.chip(draw, (x, 458, x + 111, 501), label, time > 5.3 and index == 2, 16)
            if time > 5.3:
                self.label(draw, 1116, 472, f"{self.data['days']} 天后再练", 18, GOLD, anchor="rt")
            elif time > 4:
                self.cursor(draw, 871, 490, time - 4.9)

    def closing(self, image, draw, time):
        self.galaxy(draw, (40, 115, 1200, 471), time, labels=False)
        draw.rounded_rectangle((330, 216, 950, 514), radius=22, fill="#191925", outline="#5c4a52")
        self.star(draw, 640, 257, 16, GOLD)
        self.label(draw, 640, 299, "用自己的对话，做一张星图。", 35, INK, True, 550, "mt")
        self.label(draw, 640, 363, "Memory Atlas", 21, MUTED, True, 480, "mt")
        self.chip(draw, (558, 421, 722, 466), "进入星图", selected=True)

    def frame(self, scene, t, absolute):
        image = self.bg.copy()
        draw = ImageDraw.Draw(image)
        for x, y, seed in self.stars:
            glow = 40 + int(33 * (0.5 + 0.5 * math.sin(absolute * 1.25 + seed * 15)))
            draw.ellipse((x, y, x + 1.5, y + 1.5), fill=(glow + 13, glow, glow + 9))
        methods = (self.opening, self.importing, self.mapping, self.reading,
                   self.review, self.recall, self.closing)
        methods[scene](image, draw, t)
        self.chrome(draw, absolute, scene)
        return image

    def poster(self):
        image = self.bg.copy()
        draw = ImageDraw.Draw(image)
        self.galaxy(draw, (525, 107, 688, 468), 1.5, labels=False)
        self.star(draw, 85, 161, 13, GOLD)
        self.label(draw, 111, 151, "Memory Atlas", 22, GOLD, True, 530)
        self.label(draw, 64, 220, "从一份对话", 60, INK, True, 560)
        self.label(draw, 64, 306, "到一张星图", 60, INK, True, 560)
        self.label(draw, 68, 441, "导入 · 图谱 · 原文 · 回顾 · 复习", 21, MUTED)
        for name, x, y in (("owl", 740, 139), ("cat", 1018, 210), ("moth", 821, 478)):
            pet = self.pet(name, 78)
            image.paste(pet, (x, y), pet)
        draw.line((65, 581, 1213, 581), fill=LINE)
        self.label(draw, 67, 608, "完整使用示例", 18, GOLD)
        self.label(draw, 1213, 608, "00:42", 18, MUTED, anchor="rt")
        return image


def soundtrack(path):
    rate = 44100
    length = TIMES[-1]
    audio = np.zeros((rate * length, 2))

    def note(start, duration, midi, volume, pan, decay):
        first = int(start * rate)
        count = min(int(duration * rate), len(audio) - first)
        t = np.arange(count) / rate
        tone = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
        envelope = (1 - np.exp(-t / 0.032)) * np.exp(-t / decay)
        envelope *= np.minimum(1, (count / rate - t) / 0.23)
        sound = (np.sin(tone) + 0.25 * np.sin(2 * tone) + 0.07 * np.sin(3.005 * tone)) * envelope
        for channel, balance in enumerate((math.sqrt(1 - pan), math.sqrt(pan))):
            audio[first:first + count, channel] += volume * balance * sound

    chords = ((45, 52, 55, 57, 60, 64), (41, 48, 52, 55, 57, 60),
              (48, 55, 59, 62, 64, 67), (43, 50, 53, 57, 59, 62))
    for index, start in enumerate(range(0, length, 4)):
        bass, low, mid, *keys = chords[index % len(chords)]
        note(start, 4.3, bass, 0.052, 0.5, 2.1)
        for offset, pitch in enumerate((low, keys[0], mid, keys[2], keys[1], keys[0])):
            onset = start + 0.37 + offset * 0.51
            if onset < length - 0.2:
                note(onset, 2.9, pitch, 0.061 if offset % 2 else 0.047,
                     0.35 if offset % 2 else 0.67, 0.83)
    for cut in TIMES[1:-1]:
        note(cut + 0.02, 1.75, 76, 0.032, 0.57, 0.68)
    audio *= np.minimum(1, np.arange(len(audio)) / (rate * 0.65))[:, None]
    audio *= np.minimum(1, np.arange(len(audio), 0, -1) / (rate * 1.25))[:, None]
    audio *= 1.9
    with wave.open(str(path), "wb") as wav:
        wav.setparams((2, 2, rate, 0, "NONE", "not compressed"))
        wav.writeframes(np.rint(np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())


def render(film, ffmpeg, target):
    target.mkdir(parents=True, exist_ok=True)
    film.poster().save(target / "atlas-walkthrough.webp", quality=91, method=6)
    with tempfile.TemporaryDirectory() as directory:
        audio = Path(directory) / "score.wav"
        soundtrack(audio)
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
            "-pix_fmt", "rgb24", "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS),
            "-i", "pipe:0", "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            str(target / "atlas-walkthrough.mp4"),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as process:
            for frame in range(TIMES[-1] * FPS):
                absolute = frame / FPS
                scene = next(n for n, end in enumerate(TIMES[1:]) if absolute < end)
                time = absolute - TIMES[scene]
                image = film.frame(scene, time, absolute)
                if scene and time < 0.28:
                    previous = film.frame(scene - 1, TIMES[scene] - TIMES[scene - 1], absolute)
                    image = Image.blend(previous, image, smooth(time / 0.28))
                process.stdin.write(image.tobytes())
            process.stdin.close()
            if process.wait():
                raise RuntimeError("FFmpeg did not finish encoding")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    parser.add_argument("--target", type=Path, default=ROOT / "dist" / "media")
    options = parser.parse_args()
    render(Film(example(), options.font_dir), options.ffmpeg, options.target)


if __name__ == "__main__":
    main()
