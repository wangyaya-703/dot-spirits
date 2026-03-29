#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import io
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path('/Users/bytedance/dot-codex')
ENV_FILE = Path('/Users/bytedance/工作/评测集和评测集信息-1/config/gemini.env')
REFERENCE_IMAGE = Path('/Users/bytedance/工作/参考.png')
REFERENCE_ROOT = ROOT / 'output' / 'reference-review'
THEME_ROOT = ROOT / 'assets' / 'themes' / 'siamese-sticker'
RAW_ROOT = ROOT / 'output' / 'siamese-sticker-raw'
MODEL = 'gemini-3-pro-image-preview'
DOT_SIZE = (296, 152)
THRESHOLD = 190

BASE_STYLE_PROMPT = ' '.join([
    'Create a monochrome pixel-art illustration for a Dot Quote/0 E Ink screen.',
    'The subject is always the same Siamese cat mascot: very cute chibi proportions, short body, short limbs, slightly oversized head, oversized triangular ears, huge round eyes, tidy expressive tail.',
    'The cat must still read as Siamese through ear silhouette and a dark facial mask shape around the eyes and nose, not through realistic anatomy or color rendering.',
    'Use crisp retro handheld pixel-art sticker style, 1-bit friendly contrast, bold clean outlines, soft cute energy, simple background, no gradients, no painterly textures.',
    'Make it feel closer to a cute avatar sticker than a realistic cat drawing.',
    'Composition must stay stable across frames so they feel like the same animation shot.',
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

STATE_SPECS = {
    'starting': {
        'enter': [
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 1 of 3. The cat is still waking up while sitting on the tiny box. Head slightly lower. Ears not fully raised yet. Tail more tucked in. Keep the same big eyes and rounded face as the reference character.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 2 of 3. The cat is more awake on the tiny box. One ear rises more clearly. Tail begins to curl upward. Cursor cube starts to feel active. Keep the same cute proportions.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 3 of 3. The cat is almost in the final alert pose on the tiny box. Both ears mostly raised. Tail forms a clearer question mark. Cursor cube is active. Keep it very close to the approved hold frame.'
        ]
    },
    'running': {
        'enter': [
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 1 of 3. The cat crouches and stares at the yarn ball, preparing to pounce. Large focused eyes. Body compact. Motion is more dynamic than the hold frame.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 2 of 3. One small paw springs forward and bats the yarn ball. The yarn ball jolts away clearly. Tail lifts and curves more. Keep the same head and face as the reference character.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 3 of 3. The yarn ball rolls farther and the cat lunges more obviously in playful pursuit. The motion should read clearly on an E Ink screen while still looking like the same cute sticker cat.'
        ]
    },
    'waiting_input': {
        'enter': [
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 1 of 3. The cat settles into a puzzled sitting pose. A thought bubble begins to appear above the head. Keep the same face and proportions as the approved hold frame.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 2 of 3. The cat tilts its head and raises a small paw slightly. Two icons appear in the thought bubble, such as a fish and a freeze-dried treat.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 3 of 3. The third icon, a yarn ball, appears in the thought bubble. The cat looks clearly undecided and waiting for help, very close to the approved hold frame.'
        ]
    },
    'completed': {
        'enter': [
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 1 of 3. The cat straightens from a working pose into a proud upright seated posture. The scene is beginning to feel celebratory but still mostly clean. Plain white background only. No cards, no panels, no rectangular devices, no border frame.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 2 of 3. A freeze-dried treat cube appears beside the cat and one or two small ribbon or confetti accents start to appear behind it. Keep the cat front-readable and adorable. Plain white background only. No cards, no panels, no border frame.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 3 of 3. The cat settles into a proud reward-seeking pose with bright eyes. A few small celebratory ribbon or confetti accents are visible behind the cat, leading naturally into the approved hold frame. Plain white background only. No cards, no panels, no border frame, no large rectangle around the scene.'
        ]
    },
    'failed': {
        'enter': [
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 1 of 3. The same cat notices something is wrong. Eyes tense up slightly. Ears begin to angle back. Keep the cat clearly recognizable as the same reference character.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 2 of 3. The cat puffs up a little into a startled cute炸毛 state. Tail snaps upward. Ears angle back more. Keep the same face identity as the reference character.',
            'Use the provided reference image as the exact base character. Keep one single cat only. Frame 3 of 3. The puffed-up silhouette is clearer and a small X icon is visible nearby. The cat is irritated and startled, but still cute and clearly the same character, almost matching the approved hold frame.'
        ]
    }
}


def load_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.strip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


def load_image_bytes(path: Path) -> bytes:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == '.png':
        return path.read_bytes()
    image = Image.open(path).convert('RGBA')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


def call_gemini(api_key: str, prompt: str, reference_images: list[bytes], attempts: int = 3) -> bytes:
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent'
    parts = [{'text': f'{BASE_STYLE_PROMPT} {prompt}'}]
    for image_bytes in reference_images:
      parts.append({
          'inline_data': {
              'mime_type': 'image/png',
              'data': base64.b64encode(image_bytes).decode('ascii')
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


def process_for_dot(image_bytes: bytes) -> bytes:
    source = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
    source.thumbnail(DOT_SIZE, Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', DOT_SIZE, (255, 255, 255, 255))
    x = (DOT_SIZE[0] - source.width) // 2
    y = (DOT_SIZE[1] - source.height) // 2
    canvas.alpha_composite(source, (x, y))
    gray = ImageOps.grayscale(canvas)
    bw = gray.point(lambda p: 255 if p >= THRESHOLD else 0, mode='1').convert('L')
    output = io.BytesIO()
    bw.save(output, format='PNG')
    return output.getvalue()


def ensure_dirs():
    (THEME_ROOT / 'states').mkdir(parents=True, exist_ok=True)
    (THEME_ROOT / 'defaults').mkdir(parents=True, exist_ok=True)
    RAW_ROOT.mkdir(parents=True, exist_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', action='append', dest='states', help='State(s) to generate. Repeatable.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env = load_env(ENV_FILE)
    api_key = env.get('GEMINI_API_KEY', '')
    if not api_key:
        raise SystemExit('Missing GEMINI_API_KEY')

    ensure_dirs()
    canonical_ref = load_image_bytes(REFERENCE_IMAGE)

    states = args.states or list(STATE_SPECS.keys())
    for state in states:
        if state not in STATE_SPECS:
            raise SystemExit(f'Unsupported state: {state}')

    for state in states:
        spec = STATE_SPECS[state]
        state_theme_dir = THEME_ROOT / 'states' / state
        enter_dir = state_theme_dir / 'enter'
        enter_dir.mkdir(parents=True, exist_ok=True)

        state_raw_dir = RAW_ROOT / state
        state_raw_dir.mkdir(parents=True, exist_ok=True)

        approved_hold_png = REFERENCE_ROOT / state / 'hold.reference.png'
        approved_hold_raw = REFERENCE_ROOT / state / 'hold.raw.jpg'
        if not approved_hold_png.exists() or not approved_hold_raw.exists():
            raise SystemExit(f'Missing approved reference assets for state: {state}')

        shutil.copyfile(approved_hold_png, state_theme_dir / 'hold.png')
        hold_ref = load_image_bytes(approved_hold_raw)
        previous_ref = None

        for index, prompt in enumerate(spec['enter'], start=1):
            refs = [canonical_ref, hold_ref]
            if previous_ref:
                refs.append(previous_ref)
            print(f'generating {state} enter-{index:02d}...', flush=True)
            raw = call_gemini(api_key, prompt, refs)
            raw_path = state_raw_dir / f'enter-{index:02d}.raw.jpg'
            raw_path.write_bytes(raw)
            previous_ref = load_image_bytes(raw_path)
            final_png = process_for_dot(raw)
            (enter_dir / f'enter-{index:02d}.png').write_bytes(final_png)

    shutil.copyfile(REFERENCE_ROOT / 'starting' / 'hold.reference.png', THEME_ROOT / 'defaults' / 'idle.png')
    metadata = {
        'theme': 'siamese-sticker',
        'model': MODEL,
        'referenceImage': str(REFERENCE_IMAGE),
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'states': list(STATE_SPECS.keys())
    }
    (THEME_ROOT / 'metadata.json').write_text(json.dumps(metadata, indent=2))
    print(f'wrote theme to {THEME_ROOT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
