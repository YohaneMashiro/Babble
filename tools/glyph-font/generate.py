#!/usr/bin/env python3
"""Babble original program (MIT): deterministic CC0 Jigmo webfont shards.

The original ZIP is an external, hash-pinned build input, never a runtime fetch.
Run with the versions in requirements.txt; normal distribution checks need Node
only and verify already-generated assets without downloading or rebuilding fonts.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

import brotli
import fontTools
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
ZIP_SHA = '5744c7386d129475d87607ca66d043c8793c65448adeaedc921b6931890e5d0b'
POLICY = 'jigmo-20250912-cjk-1024-v1'
FONTTOOLS = '4.60.2'
BROTLI = '1.2.1'
RANGES = [(0x2e80, 0x2fff), (0x31c0, 0x31ef), (0x3400, 0x4dbf),
          (0x4e00, 0x9fff), (0xf900, 0xfad9), (0x20000, 0x2a6df),
          (0x2a700, 0x2b73f), (0x2b740, 0x2b81d), (0x2b820, 0x2cead),
          (0x2ceb0, 0x2ebe0), (0x2ebf0, 0x2ee5d), (0x2f800, 0x2fa1d),
          (0x30000, 0x3134a), (0x31350, 0x33479)]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def eligible(point):
    return any(start <= point <= end for start, end in RANGES)


def compact_ranges(points):
    result = []
    for point in sorted(points):
        if result and result[-1][1] + 1 == point:
            result[-1][1] = point
        else:
            result.append([point, point])
    return result


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-zip', type=Path, required=True)
    parser.add_argument('--reuse-verified-lock', type=Path,
                        help='Reuse unchanged shards from an earlier matching-source lock, checking bytes and exact cmap')
    args = parser.parse_args()
    if fontTools.__version__ != FONTTOOLS or brotli.__version__ != BROTLI:
        raise ValueError('Use the exact FontTools/Brotli versions in requirements.txt')
    raw = args.source_zip.read_bytes()
    if len(raw) != 35559738 or digest(raw) != ZIP_SHA:
        raise ValueError('The fixed original Jigmo ZIP does not match its pin')
    reusable = {}
    if args.reuse_verified_lock:
        previous = json.loads(args.reuse_verified_lock.read_text())
        if previous['source']['sha256'] != ZIP_SHA or previous['policyId'] != POLICY or previous['toolchain'] != {'fontTools': FONTTOOLS, 'brotli': BROTLI}:
            raise ValueError('Reuse lock is not from the same source, policy and toolchain')
        counts = {}
        for item in previous['generated']:
            counts[item['path']] = counts.get(item['path'], 0) + 1
        reusable = {item['path']: item for item in previous['generated']
                    if item['path'].endswith('.woff2') and counts[item['path']] == 1}
    output = ROOT / 'src/assets/glyph-font'
    output.mkdir(parents=True, exist_ok=True)
    generated, sources, shards, all_points = [], [], [], set()
    with ZipFile(io.BytesIO(raw)) as archive:
        for name in ['LICENSE.txt', 'README.txt', 'THANKS.txt']:
            supplied = ROOT / 'tools/glyph-font/inputs' / name
            if supplied.read_bytes() != archive.read(name):
                raise ValueError('Original font notice changed: ' + name)
        for name in ['Jigmo.ttf', 'Jigmo2.ttf', 'Jigmo3.ttf']:
            original = archive.read(name)
            sources.append({'file': name, 'bytes': len(original), 'sha256': digest(original)})
            font = TTFont(io.BytesIO(original), lazy=False, recalcTimestamp=False)
            cmap = font.getBestCmap()
            groups = {}
            for point, glyph_name in cmap.items():
                if not eligible(point) or point in all_points:
                    continue
                # The BMP font also contains a few supplementary examples.
                # Follow the upstream plane ownership so those cannot create a
                # second partial shard that another source font overwrites.
                owner = 'Jigmo.ttf' if point < 0x20000 else 'Jigmo2.ttf' if point < 0x30000 else 'Jigmo3.ttf'
                if name != owner:
                    continue
                glyph = font['glyf'][glyph_name]
                if not glyph.isComposite() and glyph.numberOfContours <= 0:
                    raise ValueError('A selected character has no outline: U+%X' % point)
                groups.setdefault(point >> 10, []).append(point)
                all_points.add(point)
            font.close()
            for block, points in sorted(groups.items()):
                identifier = '%03x' % block
                filename = 'glyph-' + identifier + '.woff2'
                if any(shard['id'] == identifier or shard['file'] == filename for shard in shards):
                    raise ValueError('Two source fonts attempted to own the same shard')
                # Start from the exact original for every shard; no cumulative
                # mutations and no current-time font timestamps are permitted.
                path = 'src/assets/glyph-font/' + filename
                previous = reusable.get(path)
                cached = (output / filename).read_bytes() if previous and (output / filename).exists() else None
                if cached and len(cached) == previous['bytes'] and digest(cached) == previous['sha256']:
                    checked = TTFont(io.BytesIO(cached), lazy=False, recalcTimestamp=False)
                    cmap_matches = set(checked.getBestCmap()) == set(points)
                    checked.close()
                else:
                    cmap_matches = False
                if cmap_matches:
                    data = cached
                else:
                    data = create_subset(original, points)
                (output / filename).write_bytes(data)
                record = {'id': identifier, 'file': filename, 'bytes': len(data),
                          'sha256': digest(data), 'characters': len(points),
                          'ranges': compact_ranges(points)}
                shards.append(record)
                generated.append({'path': path, 'bytes': len(data), 'sha256': digest(data)})
                print(identifier, len(points), len(data), 'reused' if cmap_matches else 'generated', flush=True)
    manifest = {'schemaVersion': 1, 'policyId': POLICY, 'family': 'Babble Glyphs',
                'sourceVersion': 'Jigmo 2025-09-12', 'license': 'CC0-1.0',
                'scope': 'Unicode17 CJK default glyphs and selected radicals/strokes; no IVS or Unicode18-complete claim',
                'characters': len(all_points), 'shards': sorted(shards, key=lambda item: item['id'])}
    data = encoded(manifest)
    (output / 'manifest.json').write_bytes(data)
    generated.append({'path': 'src/assets/glyph-font/manifest.json', 'bytes': len(data), 'sha256': digest(data)})
    inputs = []
    for path in ['tools/glyph-font/generate.py', 'tools/glyph-font/requirements.txt',
                 'tools/glyph-font/inputs/LICENSE.txt', 'tools/glyph-font/inputs/README.txt',
                 'tools/glyph-font/inputs/THANKS.txt']:
        data = (ROOT / path).read_bytes()
        inputs.append({'path': path, 'bytes': len(data), 'sha256': digest(data)})
    lock = {'schemaVersion': 1, 'policyId': POLICY,
            'source': {'url': 'https://kamichikoichi.github.io/jigmo/Jigmo-20250912.zip',
                       'licenseUrl': 'https://kamichikoichi.github.io/jigmo/',
                       'bytes': len(raw), 'sha256': ZIP_SHA, 'fonts': sources},
            'toolchain': {'fontTools': FONTTOOLS, 'brotli': BROTLI},
            'inputs': inputs, 'generated': sorted(generated, key=lambda item: item['path']),
            'totals': {'shards': len(shards), 'characters': len(all_points),
                       'fontBytes': sum(item['bytes'] for item in shards)}}
    (ROOT / 'data/glyph-font.lock.json').write_bytes(encoded(lock))
    print(json.dumps(lock['totals']), flush=True)


def create_subset(original, points):
    font = TTFont(io.BytesIO(original), lazy=False, recalcTimestamp=False)
    options = subset.Options()
    options.recalc_timestamp = False
    options.layout_features = []
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.name_languages = [0x409]
    options.notdef_outline = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=points)
    subsetter.subset(font)
    actual = set(font.getBestCmap())
    if actual != set(points):
        raise ValueError('Subset cmap did not preserve its exact requested set')
    font.flavor = 'woff2'
    buffer = io.BytesIO()
    font.save(buffer, reorderTables=True)
    font.close()
    return buffer.getvalue()


if __name__ == '__main__':
    main()
