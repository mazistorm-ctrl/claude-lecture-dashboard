#!/usr/bin/env python3
"""
教材ダッシュボード用の data.js を生成する。

lessons ディレクトリ（章フォルダ + assignments フォルダ）を走査し、
各レッスンのタイトルを Markdown 先頭の H1 から抽出して
`window.COURSE = {...}` 形式の data.js を書き出す。

使い方:
  python3 build_data.py --lessons ./lessons --out ./data.js --config ./course.config.json
"""
import os
import re
import json
import argparse


def first_h1(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s.startswith("#"):
                return s
    return ""


def lesson_title(path):
    """'# #01 タイトル' や '# タイトル' から表示タイトルを取り出す。"""
    h1 = first_h1(path)
    t = re.sub(r"^#+\s*", "", h1)           # 先頭の # を除去
    t = re.sub(r"^#\d+\s*", "", t).strip()  # '#01 ' のような通し番号を除去
    return t


def num_prefix(name):
    m = re.match(r"(\d+)", name)
    return int(m.group(1)) if m else 0


def build(lessons_dir, config):
    chapters_cfg = {c["dir"]: c.get("title") for c in config.get("chapters", [])}
    ordered_dirs = [c["dir"] for c in config.get("chapters", [])]

    if not ordered_dirs:
        ordered_dirs = sorted(
            [d for d in os.listdir(lessons_dir)
             if os.path.isdir(os.path.join(lessons_dir, d)) and re.match(r"ch\d+", d)],
            key=lambda d: num_prefix(d[2:]) or num_prefix(d),
        )

    chapters = []
    for idx, ch in enumerate(ordered_dirs, start=1):
        d = os.path.join(lessons_dir, ch)
        if not os.path.isdir(d):
            continue
        lessons = []
        for fn in sorted(os.listdir(d), key=num_prefix):
            if not fn.endswith(".md"):
                continue
            m = re.match(r"(\d+)", fn)
            num = m.group(1) if m else str(len(lessons) + 1)
            lessons.append({
                "num": num,
                "title": lesson_title(os.path.join(d, fn)),
                "path": f"{os.path.basename(lessons_dir)}/{ch}/{fn}",
            })
        title = chapters_cfg.get(ch) or ch
        chapters.append({"id": ch, "num": idx, "title": title, "lessons": lessons})

    assignments = []
    acfg = config.get("assignments", {"dir": "assignments"})
    adir_name = acfg.get("dir", "assignments")
    adir = os.path.join(lessons_dir, adir_name)
    if os.path.isdir(adir):
        files = [f for f in os.listdir(adir) if f.endswith(".md")]
        order = acfg.get("order")
        if order:
            files = [f"{lvl}.md" for lvl in order if f"{lvl}.md" in files]
        else:
            files = sorted(files)
        for fn in files:
            level = os.path.splitext(fn)[0]
            assignments.append({
                "level": level,
                "title": re.sub(r"^#+\s*", "", first_h1(os.path.join(adir, fn))).strip(),
                "path": f"{os.path.basename(lessons_dir)}/{adir_name}/{fn}",
            })

    return {
        "title": config.get("title", "Course"),
        "subtitle": config.get("subtitle", ""),
        "description": config.get("description", ""),
        "chapters": chapters,
        "assignments": assignments,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lessons", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--config")
    args = ap.parse_args()

    config = {}
    if args.config and os.path.exists(args.config):
        with open(args.config, encoding="utf-8") as f:
            config = json.load(f)

    data = build(os.path.abspath(args.lessons), config)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("window.COURSE = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")

    total = sum(len(c["lessons"]) for c in data["chapters"])
    print(f"OK: chapters={len(data['chapters'])} lessons={total} "
          f"assignments={len(data['assignments'])} -> {args.out}")


if __name__ == "__main__":
    main()
