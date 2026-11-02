#!/usr/bin/env python3
"""Run local fixed-model checks; only aggregate HY results leave the cache.

The synthetic fixtures are original examples, not an accuracy benchmark.
No network requests or user-text logging are performed by this program.
"""
import argparse
import gc
import json
from pathlib import Path
import time
from core import digest, dump, infer, session_for, tokenizer_for

ROOT = Path(__file__).resolve().parents[2]


def main(args):
    cache = args.cache.expanduser().resolve()
    metadata = json.loads((cache / 'metadata.json').read_text())
    tokenizer = tokenizer_for(cache / 'inputs')
    text = (ROOT / 'HY.txt').read_bytes().decode('utf-8')
    annotation = json.loads((ROOT / 'src/data/generated/default-pinyin.json').read_text())
    fixtures = json.loads((ROOT / 'docs/research-assets/contextual-pinyin/synthetic-fixtures.json').read_text())['cases']
    results = {}
    for name, path in [('fp32', cache / 'original/g2pw.onnx'), ('int8', cache / 'g2pw.int8.onnx')]:
        start = time.monotonic()
        session = session_for(path)
        readings, _, indices = infer(text, metadata, tokenizer, session)
        targets = []
        for number, fixture in enumerate(fixtures):
            predicted, _, _ = infer(fixture['text'], metadata, tokenizer, session)
            for target in fixture['targets']:
                value = predicted[target['index']]
                plain = value.rstrip('12345') if value else None
                targets.append({'case': number, 'index': target['index'], 'expected': target['expected'],
                    'predicted': value, 'matches': plain == target['expected']})
        results[name] = {'readings': readings, 'indices': indices, 'targets': targets,
                         'seconds': round(time.monotonic() - start, 3)}
        del session
        gc.collect()
        print(f'Completed {name}: {len(indices)} article model occurrences, {len(targets)} synthetic targets', flush=True)
    fp, quant = results['fp32'], results['int8']
    changed = [i for i, (a, b) in enumerate(zip(fp['readings'], quant['readings'])) if a != b]
    generated_matches = quant['readings'] == annotation['readings'] and quant['indices'] == annotation['modelIndices']
    report = {'date': '2026-11-02', 'provider': 'g2pw', 'modelVersion': annotation['modelVersion'],
        'sourceSha256': digest(ROOT / 'HY.txt'), 'modelSha256': digest(cache / 'g2pw.int8.onnx'),
        'article': {'codepoints': len(text), 'annotatedOccurrences': sum(x is not None for x in quant['readings']),
                    'modelOccurrences': len(quant['indices']), 'fp32Int8DifferentPositions': changed,
                    'generatedMatchesLocalInt8': generated_matches},
        'synthetic': {'description': 'Original small diagnostic cases; not representative accuracy or an official benchmark.',
                     'cases': len(fixtures), 'targets': len(quant['targets']),
                     **{key: {'matches': sum(t['matches'] for t in value['targets']), 'targets': value['targets']}
                        for key, value in results.items()}},
        'wallSeconds': {key: value['seconds'] for key, value in results.items()}}
    dump(args.output, report)
    if not generated_matches:
        raise ValueError('Generated article annotation differs from local int8 inference')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    main(parser.parse_args())
