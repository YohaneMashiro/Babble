#!/usr/bin/env python3
"""Generate independently derived Xiaohe shape candidates and reject disagreements.

AGPL-3.0-only. Reuses OverflowCat's licensed root-key definitions and Yi Bai IDS,
plus the attributed KFCD decomposition, TJYSunset stroke, and Unicode radical
inputs. The external official reference is a validator, never an output source.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import csv
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
INPUT_LOCK = ROOT / 'data/shape-expansion-inputs.lock.json'
LOCK = ROOT / 'data/shape-expansion.lock.json'
OUTPUT = ROOT / 'src/data/generated/shape-expansion.json'
INPUTS = ROOT / 'tools/shape-expansion/inputs'
LEGACY = ROOT / 'tools/libre-flypy-audit'
IDS_ID = 'yi-bai-ids-2023'
ROOT_ID = 'libre-flypy-root-map-1.2.0'
OVERRIDE_ID = 'libre-flypy-ids-overrides-1.2.0'
CHAIZI_ID = 'kfcd-chaizi-e177ab5'
UNICODE_ID = 'unicode-equivalent-ideograph-17.0.0'
STROKE_ID = 'tjy-strokes-f993e6d'
IDC = {char: 2 for char in '⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻'} | {'⿲': 3, '⿳': 3}
CANONICAL = {'a': '一', 'l': '丨', 'p': '丿', 'd': '丶', 'v': '乛', 'n': 'ㄟ'}
# Explicit six-class labels. Curved / bent strokes are fold (V), vertical hook
# remains vertical (L). These labels describe strokes, not guessed character roots.
CJK_STROKE_KEYS = {chr(i): 'v' for i in range(0x31C0, 0x31E4)} | {
    '㇐': 'a', '㇀': 'a', '㇑': 'l', '㇚': 'l',
    '㇒': 'p', '㇓': 'p', '㇔': 'd', '㇏': 'n', '㇝': 'n',
}
LEGACY_STROKES = set('一丨亅丿丶乀乁乛乚乙𠃌𠃍𠃊𠄌𠃋𠃎𠄎𡿨ㄟ') | set(CJK_STROKE_KEYS)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sound_code(value: str, scheme: dict) -> str | None:
    value = unicodedata.normalize('NFD', value.lower().replace('u:', 'v'))
    value = value.replace('u\u0308', 'v')
    value = re.sub('[\u0300-\u036f1-5]', '', value).replace('ü', 'v')
    if not re.fullmatch('[a-z]+', value):
        return None
    if value in scheme['zeroInitials']:
        return scheme['zeroInitials'][value]
    initial = next((key for key in sorted(scheme['initials'], key=lambda x: -len(x)) if value.startswith(key)), None)
    if not initial:
        return None
    final = value[len(initial):]
    if final == 'ue':
        final = 've'
    if final not in scheme['finals']:
        return None
    return scheme['initials'][initial] + scheme['finals'][final]


def normalized_reference_root(label: str) -> str:
    # The reference sometimes appends reading annotations: e.g. 夬guài. This
    # removes only that annotation; no Chinese root name or shape is substituted.
    if re.fullmatch('[\u3400-\u9fff][A-Za-z\u00C0-\u024F]+', label):
        return label[0]
    return label


def parse_tree(value: str, index: int = 0):
    if index >= len(value):
        raise ValueError('Incomplete IDS')
    char = value[index]
    index += 1
    if char in IDC:
        children = []
        for _ in range(IDC[char]):
            child, index = parse_tree(value, index)
            children.append(child)
        # Retain the upstream below-surround writing-order exception.
        if char == '⿶' and children[0] in ('凵', '𠃊'):
            children.reverse()
        return (char, tuple(children)), index
    return char, index


def boundary(tree, side: int) -> str:
    return tree if isinstance(tree, str) else boundary(tree[1][0 if side == 0 else -1], side)


def load_inputs():
    text = (LEGACY / 'src/roots.rs').read_text()
    common, first, last = re.split(r'let only_in_(?:firsts|lasts) =', text)
    parse = lambda source: dict(re.findall(r"\('(.+?)', '([a-z])'\)", source))
    first_keys, last_keys = parse(common) | parse(first), parse(common) | parse(last)
    # Each variant keeps both boundaries together. The two ends are never
    # selected from unrelated alternative top-level decompositions.
    variants = defaultdict(list)
    for relative in ('inputs/ids_lv2.txt', 'my_ids.txt'):
        source_id = IDS_ID if relative.startswith('inputs/') else OVERRIDE_ID
        for raw in (LEGACY / relative).read_text().splitlines():
            raw = raw.split('//')[0].strip()
            if '\t' not in raw:
                continue
            char, source = raw.split('\t', 1)
            if len(char) != 1:
                continue
            for value in re.split('[;\t]', source):
                if value.startswith('#('):
                    strokes = value[2:value.find(')')].replace('>', '')
                    if strokes and all(stroke in LEGACY_STROKES for stroke in strokes):
                        variants[char].append((strokes[0], strokes[-1], source_id, '源笔画：' + strokes))
                clean = re.sub(r'\([^)]*\)|\[[^]]*\]|\{[^}]*\}', '', value).replace('↷', '').strip()
                if not clean or '#' in clean:
                    continue
                try:
                    tree, used = parse_tree(clean)
                except ValueError:
                    continue
                if used != len(clean):
                    continue
                first, last = boundary(tree, 0), boundary(tree, 1)
                if first != char or last != char:
                    variants[char].append((first, last, source_id, '源 IDS：' + clean))
    for relative in ('chaizi-jt.txt', 'chaizi-ft.txt'):
        for raw in (INPUTS / relative).read_text().splitlines():
            fields = raw.split('\t')
            char = fields[0]
            if len(char) != 1:
                continue
            for field in fields[1:]:
                pieces = field.split()
                if len(pieces) >= 2 and all(len(piece) == 1 for piece in pieces):
                    variants[char].append((pieces[0], pieces[-1], CHAIZI_ID, '源拆字：' + ' '.join(pieces)))
    for row in csv.reader((INPUTS / 'Strokes.txt').read_text().splitlines()):
        if len(row) < 3 or len(row[1]) != 1 or not row[0].startswith('U+'):
            continue
        pattern = row[2]
        clean = pattern.removeprefix('^').removesuffix('$')
        atoms = re.findall(r'[\u31C0-\u31E3]|\[[\u31C0-\u31E3]+\]', clean)
        if not atoms or ''.join(atoms) != clean:
            continue  # Do not interpret unknown regex constructs as stroke facts.
        firsts, lasts = atoms[0].strip('[]'), atoms[-1].strip('[]')
        for first in firsts:
            for last in lasts:
                variants[row[1]].append((first, last, STROKE_ID, '源笔顺：' + pattern))
    for char in variants:
        variants[char] = tuple(dict.fromkeys(variants[char]))
    equivalent = {}
    for line in (INPUTS / 'EquivalentUnifiedIdeograph.txt').read_text().splitlines():
        line = line.split('#')[0].strip()
        if not line:
            continue
        source, target = map(str.strip, line.split(';'))
        limits = source.split('..')
        for codepoint in range(int(limits[0], 16), int(limits[-1], 16) + 1):
            equivalent[chr(codepoint)] = chr(int(target, 16))
    inverse = defaultdict(list)
    for radical, char in equivalent.items():
        inverse[char].append(radical)
    return first_keys, last_keys, variants, equivalent, inverse


def generate(reference_path: Path):
    reference = json.loads(reference_path.read_text())
    readings = json.loads((ROOT / 'src/data/generated/readings.json').read_text())['characters']
    scheme = json.loads((ROOT / 'src/data/generated/sound-mapping.json').read_text())
    legacy = json.loads((ROOT / 'src/data/generated/shape-traces.json').read_text())['characters']
    first_keys, last_keys, variants, equivalent, inverse = load_inputs()

    @lru_cache(None)
    def candidates(char: str, side: int, depth: int = 5):
        table = first_keys if side == 0 else last_keys
        found = {}

        def add(root, key, path, evidence, sources):
            token = root, key
            if token not in found or len(path) < len(found[token][0]):
                found[token] = (path, evidence, sources)

        if char in CJK_STROKE_KEYS:
            key = CJK_STROKE_KEYS[char]
            add(CANONICAL[key], key, (char, CANONICAL[key]), ('笔画归类：' + char + '→' + CANONICAL[key],), (STROKE_ID,))
        if char in table:
            key = table[char]
            if char in LEGACY_STROKES and key in CANONICAL:
                root = CANONICAL[key]
                add(root, key, (char,) if char == root else (char, root), ('笔画归类：' + char + '→' + root,), (ROOT_ID,))
            else:
                add(char, key, (char,), (), (ROOT_ID,))
            if char in equivalent and equivalent[char] in table and table[equivalent[char]] == key:
                add(equivalent[char], key, (char, equivalent[char]), ('Unicode 等价部件：' + char + '→' + equivalent[char],), (ROOT_ID, UNICODE_ID))
        for radical in inverse.get(char, ()):
            if radical in table:
                add(radical, table[radical], (char, radical), ('Unicode 等价部件：' + char + '→' + radical,), (ROOT_ID, UNICODE_ID))
        if depth:
            for first, last, source, tree in variants.get(char, ()):
                child = first if side == 0 else last
                if child == char:
                    continue
                for (root, key), (path, evidence, sources) in candidates(child, side, depth - 1).items():
                    add(root, key, (char,) + path, (tree,) + evidence, (source,) + sources)
        return found

    accepted = {}
    tested = 0
    accepted_all = 0
    all_codes = 0
    # The character inventory, readings, roots and full output codes come from
    # licensed sources. Reference strings are only compared and never emitted.
    for char in sorted(variants):
        if char not in readings or char not in reference:
            continue
        sound_codes = sorted({code for reading in readings[char]['readings'] if (code := sound_code(reading, scheme))})
        if not sound_codes:
            continue
        allowed_codes = set(re.findall('[a-z]{4}', reference[char]['1']))
        expected_roots = tuple(normalized_reference_root(label) for label in reference[char]['2'].split())
        if len(expected_roots) != 2:
            continue
        matches = {}
        for first, last, source, tree in variants[char]:
            if first == char or last == char:
                continue
            for (first_root, first_key), fp in candidates(first, 0).items():
                for (last_root, last_key), lp in candidates(last, 1).items():
                    tested += 1
                    if (first_root, last_root) != expected_roots:
                        continue
                    if any(unicodedata.category(root) == 'Co' or root in '?\ufffd' for root in (first_root, last_root)):
                        continue
                    codes = [prefix + first_key + last_key for prefix in sound_codes]
                    codes = [code for code in codes if code in allowed_codes]
                    for code in codes:
                        matches.setdefault(code, {
                            'firstRoot': first_root, 'lastRoot': last_root,
                            'firstRootPath': list((char,) + fp[0]),
                            'lastRootPath': list((char,) + lp[0]),
                            'idsTree': tree,
                            'sourceIds': sorted(set((source,) + fp[2] + lp[2])),
                            'notes': list(dict.fromkeys((tree,) + fp[1] + lp[1])),
                        })
        if not matches:
            continue
        accepted_all += 1
        all_codes += len(matches)
        # Supplemental output only: retain legacy records byte-for-byte and
        # avoid shipping duplicate codes with a replacement provenance claim.
        new_codes = [code for code in sorted(matches) if code not in legacy.get(char, {}).get('codes', [])]
        if not new_codes:
            continue
        record = matches[new_codes[0]]
        record['codes'] = new_codes
        accepted[char] = record
    total_chars = set(legacy) | set(accepted)
    stats = {
        'candidateRootPairsTested': tested,
        'independentlyDerivedAcceptedCharacters': accepted_all,
        'independentlyDerivedAcceptedCodes': all_codes,
        'supplementalCharacters': len(accepted),
        'supplementalUniqueCodes': sum(len(item['codes']) for item in accepted.values()),
        'legacyShapeCharacters': len(legacy),
        'combinedShapeCharacters': len(total_chars),
    }
    return {
        'metadata': {
            'id': 'babble-shape-expansion-v1', 'version': '1.0.0',
            'auditedAt': '2026-10-26', 'sourceLock': 'data/shape-expansion.lock.json',
            'inputLock': 'data/shape-expansion-inputs.lock.json',
            'license': 'AGPL-3.0-only; input notices separately retained',
            'selection': 'Generate actual first/last source-boundary derivations and six-class stroke forms, then require exact full-code and normalized root-glyph agreement with an external research reference. Reference fields are never used to construct output fields.',
            'statistics': stats,
            'limitations': ['A validated subset rather than a complete dictionary.', 'A derivation path is source evidence, not a full lesson or a claim about every writing-order step.', 'Alternative source decompositions and root/stroke endpoints are candidates; only externally validated results are distributed.'],
        },
        'characters': accepted,
    }


def inputs_to_hash():
    lock = json.loads(INPUT_LOCK.read_text())
    # Updating a derived-output lock must never silently approve changes to a
    # source still advertised as an unchanged upstream commit.
    declared = [item for source in lock['sources'] for item in source['files']]
    declared += lock.get('licenseTexts', [])
    for item in declared:
        path = ROOT / item['path']
        if digest(path) != item['sha256'] or path.stat().st_size != item['bytes']:
            raise ValueError('Pinned input checksum/size mismatch: ' + item['path'])
    legacy_lock = json.loads((ROOT / 'data/shape-sources.lock.json').read_text())
    for relative in ('src/roots.rs', 'inputs/ids_lv2.txt', 'my_ids.txt'):
        if digest(LEGACY / relative) != legacy_lock['files'][relative]:
            raise ValueError('Pinned legacy input checksum mismatch: ' + relative)
    if digest(ROOT / legacy_lock['generated']['path']) != legacy_lock['generated']['sha256']:
        raise ValueError('Legacy trace artifact checksum mismatch')
    for source in json.loads((ROOT / 'data/sources.lock.json').read_text())['sources']:
        generated = source['generated']
        if digest(ROOT / generated['path']) != generated['sha256']:
            raise ValueError('Pinned reading/sound input checksum mismatch: ' + generated['path'])
    files = [ROOT / item['path'] for source in lock['sources'] for item in source['files']]
    files += [ROOT / item['path'] for item in lock.get('licenseTexts', [])]
    files += [INPUT_LOCK, LEGACY / 'src/roots.rs', LEGACY / 'inputs/ids_lv2.txt', LEGACY / 'my_ids.txt', ROOT / 'src/data/generated/readings.json', ROOT / 'src/data/generated/sound-mapping.json', ROOT / 'src/data/generated/shape-traces.json']
    return {str(path.relative_to(ROOT)): digest(path) for path in sorted(set(files))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--update-lock', action='store_true')
    args = parser.parse_args()
    reference = args.reference.resolve()
    if ROOT == reference or ROOT in reference.parents:
        raise ValueError('Research-only reference must remain outside the project')
    legacy_lock = json.loads((ROOT / 'data/shape-sources.lock.json').read_text())
    if digest(reference) != legacy_lock['researchReference']['sha256']:
        raise ValueError('External research reference checksum mismatch')
    hashes = inputs_to_hash()
    if not args.update_lock:
        lock = json.loads(LOCK.read_text())
        if lock['generator']['sha256'] != digest(Path(__file__)) or lock['files'] != hashes:
            raise ValueError('Locked tool or input changed; inspect and explicitly update the audit lock')
    result = generate(reference)
    content = (json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    if not args.update_lock:
        if hashlib.sha256(content).hexdigest() != lock['generated']['sha256'] or result['metadata']['statistics'] != lock['expected']:
            raise ValueError('Derived output or statistics differ from the audited lock')
    if args.check:
        if args.output.read_bytes() != content:
            raise ValueError('Generated supplement differs from checked-in artifact')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(content)
    if args.update_lock:
        lock = {
            'schemaVersion': 1, 'auditedAt': '2026-10-26',
            'generator': {'id': 'babble-shape-expansion-v1', 'version': '1.0.0', 'path': 'tools/shape-expansion/generate.py', 'sha256': digest(Path(__file__)), 'license': 'AGPL-3.0-only'},
            'inputLock': 'data/shape-expansion-inputs.lock.json',
            'researchReference': {**legacy_lock['researchReference'], 'use': 'External negative validator only; no reference field is copied into generated records.'},
            'selectionPolicy': [
                'Use only licensed source character decompositions, root-key definitions, Unicode equivalences, stroke sequences, and modern readings.',
                'First and last derivations share the same top-level decomposition; recursively follow only the corresponding ordered boundary.',
                'Canonicalize six stroke classes and Unicode equivalent radical glyphs with traceable source paths.',
                'Generate sound keys from modern Unihan readings and the pinned sound scheme; shape keys come from traced source root/stroke rules.',
                'Require exact generated full-code agreement and root-glyph agreement; strip only an explicit trailing romanized pronunciation annotation in the validator.',
                'Exclude private-use, missing and replacement roots; keep the legacy artifact unchanged.',
                'Supplemental generated codes retain the tool/input licensing and are not labelled as CC0 release records.',
            ],
            'files': hashes, 'expected': result['metadata']['statistics'],
            'generated': {'path': str(args.output.relative_to(ROOT)), 'sha256': hashlib.sha256(content).hexdigest()},
        }
        LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['metadata']['statistics'], ensure_ascii=False, indent=2))
    print(('Verified ' if args.check else 'Wrote ') + str(args.output))


if __name__ == '__main__':
    main()
