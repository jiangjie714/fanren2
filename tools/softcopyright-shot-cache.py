#!/usr/bin/env python3
"""为软著《用户手册》PDF 预生成降采样截图缓存。

背景：tools/gen-softcopyright.mjs 把截图以 data URI 内嵌进 HTML 再打印成 PDF。
原始截图是 720×1280 / 720×1560 的 PNG，59 张无损内嵌会让手册 PDF 达到 ~50MB，
接近版权中心上传的大小上限。

本脚本把 docs/screenshots/ 下的截图统一降采样为宽 480 的 JPEG（q85）写入
docs/软著申请材料/_shots_cache/。480px 在手册里的实际显示宽度约 60mm，
等效约 200dpi，打印清晰度足够，PDF 体积降到 ~5MB。

用法：
    python3 tools/softcopyright-shot-cache.py            # 增量生成（已存在且更新则跳过）
    python3 tools/softcopyright-shot-cache.py --force    # 全量重生成

依赖：Pillow（项目用 /usr/local/opt/python@3.11/libexec/bin/python3）
生成脚本会自动优先使用缓存；缓存缺失时回退到原始截图，不会报错。
"""
import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print('[error] 需要 Pillow：/usr/local/opt/python@3.11/libexec/bin/python3 -m pip install Pillow')
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'screenshots'
DST = ROOT / 'docs' / '软著申请材料' / '_shots_cache'

TARGET_W = 480
QUALITY = 85
EXTS = ('.png', '.jpg', '.jpeg')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='忽略时间戳，全量重生成')
    args = ap.parse_args()

    if not SRC.is_dir():
        print(f'[error] 找不到截图目录 {SRC}')
        return 1
    DST.mkdir(parents=True, exist_ok=True)

    made = skipped = 0
    for src in sorted(SRC.iterdir()):
        if src.suffix.lower() not in EXTS or not src.is_file():
            continue
        dst = DST / (src.stem + '.jpg')
        if dst.exists() and not args.force and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        with Image.open(src) as im:
            im = im.convert('RGB')
            if im.width > TARGET_W:
                h = round(im.height * TARGET_W / im.width)
                im = im.resize((TARGET_W, h), Image.LANCZOS)
            im.save(dst, 'JPEG', quality=QUALITY, optimize=True)
        made += 1

    total = sum(1 for p in DST.iterdir() if p.suffix == '.jpg')
    print(f'[shots-cache] 新生成 {made} 张，跳过 {skipped} 张；缓存共 {total} 张 → {DST}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
