#!/usr/bin/env python3
from __future__ import annotations
import argparse
import base64
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.request
from PIL import Image, ImageOps, ImageDraw, ImageFont

ROOT = Path('/Users/bytedance/dot-codex')
ENV_FILE = Path('/Users/bytedance/工作/评测集和评测集信息-1/config/gemini.env')
OUT_DIR = ROOT / 'output' / 'reference-review'
MODEL = 'gemini-3-pro-image-preview'
DOT_SIZE = (296, 152)
THRESHOLD = 190
DEFAULT_REFERENCE_IMAGE = Path('/Users/bytedance/工作/参考.png')

BASE_STYLE_PROMPT = ' '.join([
    'Create a monochrome pixel-art illustration for a Dot Quote/0 E Ink screen.',
    'The subject is always the same Siamese cat mascot: very cute chibi proportions, short body, short limbs, slightly oversized head, oversized triangular ears, huge round eyes, tidy expressive tail.',
    'The cat must still read as Siamese through ear silhouette and a dark facial mask shape around the eyes and nose, not through realistic anatomy or color rendering.',
    'Use crisp retro handheld pixel-art sticker style, 1-bit friendly contrast, bold clean outlines, soft cute energy, simple background, no gradients, no painterly textures.',
    'Make it feel closer to a cute avatar sticker than a realistic cat drawing.',
    'Composition must stay stable across states so they feel like the same character set.',
    f'Target composition is landscape {DOT_SIZE[0]}x{DOT_SIZE[1]} with one main subject and one small prop.',
    'The image should remain readable after nearest-neighbor scaling and monochrome thresholding.',
    'Do not add text labels inside the artwork.',
    'Avoid extra animals, humans, room scenes, or decorative clutter.',
    'The face should be front-readable and adorable first, elegant second.',
    'Prefer a plain white background with no decorative frame or heavy black fills.',
    'A reference image is provided. Stay close to that reference for face shape, eye size, head-to-body ratio, paw size, and overall sticker-like cuteness.',
    'Keep exactly one cat in the image.',
    'Do not duplicate the character.',
    'Do not create ghosting, afterimages, extra heads, or echo outlines.',
    'Preserve the reference cat identity closely: giant round eyes, simple mouth line, rounded head, short seated body, tiny paws.',
    'Treat the reference image as the canonical character design.'
])

HOLDS = {
    'starting': 'This is the hold frame. Use the provided reference image as the exact base character. Keep one single cat only. The pose should stay very close to the original reference image: front-facing seated cat with the same big eyes and rounded face, but now the cat is sitting on a tiny box. Ears fully alert. Tail curled like a question mark. A tiny cursor cube sits beside it. No ghosting, no second face, no duplicate outline, no overlapping heads.',
    'running': 'This is the hold frame. Use the provided reference image as the exact base character. Keep one single cat only. The same cat is actively busy by playing with a yarn ball. One paw is near or on the yarn ball. Body leans forward only a little. Keep the head and face very close to the reference design with huge round eyes and rounded mask shape. Plain white background only. No framing panel or border.',
    'waiting_input': 'This is the hold frame. Use the provided reference image as the exact base character. Keep one single cat only. The same cat sits in a puzzled thinking pose. One small paw raised slightly. Above its head is one thought bubble containing three tiny clear icons: a fish, a freeze-dried treat, and a yarn ball. Keep the face and body proportions very close to the reference image.',
    'completed': 'This is the hold frame. Use the provided reference image as the exact base character. Keep one single cat only. The same cat sits proudly with chest lifted and neat posture. A small freeze-dried treat cube appears beside it like a reward it expects to receive. Add a few tiny celebratory ribbon or confetti accents behind the cat to make the scene feel festive, but keep the background mostly clean and white. The treat must look like a tiny square snack cube, not a fish, not a bowl. Keep the face and body proportions very close to the reference image.',
    'failed': 'This is the hold frame. Use the provided reference image as the exact base character. Keep one single cat only. The same cat encountered a problem, but it must still look like the same cat from the reference image. Make the cat puffed up and startled, like a cute炸毛 state, with slightly bigger fur silhouette, ears angled back, tense eyes, and a small annoyed mouth. Add a small clean X icon nearby. Keep the face and body proportions very close to the reference image. Plain white background only. No large black fills, no border frame, no noisy shadows.'
}


def load_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.strip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def load_reference_image(path: Path | None) -> bytes | None:
    if not path:
        return None
    if not path.exists():
        raise FileNotFoundError(f'Reference image not found: {path}')
    image = Image.open(path).convert('RGBA')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


def call_gemini(api_key: str, prompt: str, reference_image: bytes | None = None, attempts: int = 3) -> bytes:
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
    parts = [{'text': f'{BASE_STYLE_PROMPT} {prompt}'}]
    if reference_image:
        parts.append({
            'inline_data': {
                'mime_type': 'image/png',
                'data': base64.b64encode(reference_image).decode('ascii')
            }
        })
    payload = {
        'contents': [{'parts': parts}],
        'generationConfig': {'responseModalities': ['TEXT', 'IMAGE']}
    }
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'x-goog-api-key': api_key,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            for cand in data.get('candidates', []):
                for part in cand.get('content', {}).get('parts', []):
                    inline = part.get('inlineData') or part.get('inline_data')
                    if inline and inline.get('data'):
                        return base64.b64decode(inline['data'])
            raise RuntimeError(f'No image data returned: {json.dumps(data)[:500]}')
        except Exception as error:
            last_error = error
            print(f'Gemini request failed on attempt {attempt}/{attempts}: {error}', file=sys.stderr, flush=True)
            if attempt < attempts:
                time.sleep(3 * attempt)
    raise RuntimeError(f'Gemini image request failed after {attempts} attempts: {last_error}')


def process_for_dot(image_bytes: bytes) -> Image.Image:
    source = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
    source.thumbnail(DOT_SIZE, Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', DOT_SIZE, (255, 255, 255, 255))
    x = (DOT_SIZE[0] - source.width) // 2
    y = (DOT_SIZE[1] - source.height) // 2
    canvas.alpha_composite(source, (x, y))
    gray = ImageOps.grayscale(canvas)
    bw = gray.point(lambda p: 255 if p >= THRESHOLD else 0, mode='1').convert('L')
    return bw


def make_contact_sheet(images: list[tuple[str, Image.Image]]) -> Image.Image:
    padding = 12
    label_h = 24
    cols = 1
    width = DOT_SIZE[0] + padding * 2
    height = (DOT_SIZE[1] + label_h + padding) * len(images) + padding
    sheet = Image.new('L', (width, height), 255)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    y = padding
    for name, image in images:
        draw.text((padding, y), name, fill=0, font=font)
        y += label_h
        sheet.paste(image, (padding, y))
        y += DOT_SIZE[1] + padding
    return sheet


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', action='append', dest='states', help='State(s) to generate. Repeatable.')
    parser.add_argument('--reference-image', default=str(DEFAULT_REFERENCE_IMAGE), help='Reference image path')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env = load_env(ENV_FILE)
    api_key = env.get('GEMINI_API_KEY', '')
    if not api_key:
        raise SystemExit('Missing GEMINI_API_KEY')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reference_image = load_reference_image(Path(args.reference_image)) if args.reference_image else None
    rendered = []
    states = args.states or list(HOLDS.keys())
    for state in states:
        if state not in HOLDS:
            raise SystemExit(f'Unsupported state: {state}')
    for state in states:
        prompt = HOLDS[state]
        print(f'generating {state}...', flush=True)
        raw = call_gemini(api_key, prompt, reference_image=reference_image)
        (OUT_DIR / state).mkdir(parents=True, exist_ok=True)
        raw_path = OUT_DIR / state / 'hold.raw.jpg'
        final_path = OUT_DIR / state / 'hold.reference.png'
        raw_path.write_bytes(raw)
        img = process_for_dot(raw)
        img.save(final_path)
        rendered.append((state, img))
        print(f'wrote {final_path}', flush=True)
    if rendered:
        contact = make_contact_sheet(rendered)
        contact_path = OUT_DIR / 'reference-contact-sheet.png'
        contact.save(contact_path)
        print(f'wrote {contact_path}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
