#!/usr/bin/env python3
"""Rebuild fixed g2pW int8 resources and locally annotate authorized the_Tower_of_Babel.txt.

Apache-2.0; preprocessing is adapted from GitYCC/g2pW. See Apache-2.0.txt.
Downloads and raw weights are restricted to an external cache.
"""
import argparse
import ast
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile
from core import VERSION, digest, dump, metadata_for, tokenizer_for, session_for, infer

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
URL = 'https://huggingface.co/YC-Chen/g2pW/resolve/fb4784f7dce8466a53dd4f3552f5a4c5b657b90c/G2PWModel-v2-onnx.zip'
SHA = '699f3c1fd7fb0e2c2d49ed2486826fd5bff233fee7759350a91c3b49aedc4ed2'
BYTES = 589075404
SHARD_BYTES = 20 * 1024 * 1024
MODEL_SHA = '000a3dc34bebf3adf8a898d17b6be77c527b7d15ddd672b6abf028a73b81a8e1'
MODEL_BYTES = 159287333
DEPENDENCIES = {'numpy': '2.3.3', 'onnx': '1.20.0', 'onnxruntime': '1.23.2', 'transformers': '4.57.3'}


def external(path):
    path = path.expanduser().resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('Raw model and downloaded inputs must stay outside the checkout')
    return path


def inputs_for(cache, archive, download):
    pins = json.loads((HERE / 'sources.json').read_text())
    source = cache / 'inputs'
    source.mkdir(parents=True, exist_ok=True)
    for item in pins['files']:
        path = source / item['path']
        if not path.exists():
            if not download:
                raise FileNotFoundError(f'Missing fixed input {path}; pass --download')
            with urllib.request.urlopen(item['url'], timeout=180) as response:
                path.write_bytes(response.read())
        if path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
            raise ValueError(f'Fixed source input changed: {item["path"]}')
    if not archive.exists():
        if not download:
            raise FileNotFoundError('Missing original model archive; pass --download')
        with urllib.request.urlopen(URL, timeout=180) as response, archive.open('wb') as output:
            shutil.copyfileobj(response, output, 1048576)
    if archive.stat().st_size != BYTES or digest(archive) != SHA:
        raise ValueError('Original model archive differs from pinned author release')
    original = cache / 'original'
    original.mkdir(exist_ok=True)
    wanted = {'config.py', 'g2pw.onnx', 'MONOPHONIC_CHARS.txt', 'POLYPHONIC_CHARS.txt', 'version'}
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            name = Path(member.filename).name
            if name not in wanted:
                continue
            if '..' in Path(member.filename).parts or member.filename.startswith('/'):
                raise ValueError('Unsafe archive path')
            target = original / name
            # Re-extract verified members: a same-size tampered cache is not trusted.
            with package.open(member) as stream, target.open('wb') as output:
                shutil.copyfileobj(stream, output, 1048576)
    config = {}
    for node in ast.parse((original / 'config.py').read_text()).body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1 or not isinstance(node.targets[0], ast.Name):
            raise ValueError('Unexpected configuration; downloaded code is never executed')
        config[node.targets[0].id] = ast.literal_eval(node.value)
    config.setdefault('use_char_phoneme', False)
    return original, config


def runtime_for(public, inputs):
    files = {'version': '1.31.1'}
    package = ROOT / 'node_modules/onnxruntime-web'
    if json.loads((package / 'package.json').read_text())['version'] != files['version']:
        raise ValueError('Install the exact fixed onnxruntime-web runtime version')
    for ext in ['mjs', 'wasm']:
        name = f'ort-wasm-simd-threaded.{ext}'
        target = public / 'runtime' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(package / 'dist' / name, target)
        files[ext] = {'file': f'runtime/{name}', 'bytes': target.stat().st_size, 'sha256': digest(target)}
    for key, source, name in [('license', 'onnxruntime-LICENSE', 'LICENSE.txt'),
                              ('notices', 'onnxruntime-ThirdPartyNotices.txt', 'ThirdPartyNotices.txt')]:
        target = public / 'runtime' / name
        shutil.copyfile(inputs / source, target)
        files[key] = {'file': f'runtime/{name}', 'bytes': target.stat().st_size, 'sha256': digest(target)}
    return files


def build(args):
    for name, version in DEPENDENCIES.items():
        if importlib.metadata.version(name) != version:
            raise ValueError(f'Install fixed requirements: expected {name}=={version}')
    cache = external(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    archive = external(args.archive) if args.archive else cache / 'G2PWModel-v2-onnx.zip'
    original, config = inputs_for(cache, archive, args.download)
    metadata = metadata_for(original, cache / 'inputs', config)
    quantized = cache / 'g2pw.int8.onnx'
    if args.force or not quantized.exists():
        from onnxruntime.quantization import QuantType, quantize_dynamic
        quantize_dynamic(str(original / 'g2pw.onnx'), str(quantized),
            op_types_to_quantize=['MatMul', 'Gather'], per_channel=False,
            weight_type=QuantType.QInt8, extra_options={'MatMulConstBOnly': True})
    if quantized.stat().st_size != MODEL_BYTES or digest(quantized) != MODEL_SHA:
        raise ValueError('Quantized cache differs from the pinned browser artifact; use --force with fixed requirements')
    public = ROOT / 'public/models/g2pw'
    public.mkdir(parents=True, exist_ok=True)
    meta_info = dump(cache / 'metadata.json', metadata)
    meta_name = f'metadata-{meta_info["sha256"][:12]}.json'
    shutil.copyfile(cache / 'metadata.json', public / meta_name)
    for old_metadata in public.glob('metadata-*.json'):
        if old_metadata.name != meta_name:
            old_metadata.unlink()
    meta_info['file'] = meta_name
    model_sha, shards = digest(quantized), []
    with quantized.open('rb') as stream:
        index = 0
        while block := stream.read(SHARD_BYTES):
            path = public / f'g2pw-int8-{model_sha[:12]}-{index:03}.bin'
            path.write_bytes(block)
            shards.append({'file': path.name, 'bytes': len(block), 'sha256': hashlib.sha256(block).hexdigest()})
            index += 1
    manifest = {'schemaVersion': 1, 'provider': 'g2pw', 'version': VERSION,
        'metadata': meta_info, 'model': {'bytes': quantized.stat().st_size, 'sha256': model_sha, 'shards': shards},
        'runtime': runtime_for(public, cache / 'inputs'), 'license': 'Apache-2.0', 'notice': 'NOTICE.txt'}
    dump(public / 'manifest.json', manifest)
    shutil.copyfile(HERE / 'Apache-2.0.txt', public / 'LICENSE.txt')
    (public / 'NOTICE.txt').write_text('Babble g2pW model resources\nOriginal g2pW: Yi-Chang Chen, Yu-Chuan Chang, Yen-Cheng Chang, Yi-Ren Yeh. Apache-2.0; see LICENSE.txt.\nGoogle Research / google-bert Chinese BERT vocabulary: Apache-2.0.\nModified by Babble: dynamic int8 MatMul/Gather quantization, source alignment and shard packaging.\nONNX Runtime Web: Microsoft Corporation, MIT; see runtime/LICENSE.txt and runtime/ThirdPartyNotices.txt.\nReproducibility sources and hashes: data/g2pw-model.lock.json in downloadable source.\n')
    lock = {'schemaVersion': 1, 'version': VERSION,
        'rawArchive': {'url': URL, 'bytes': BYTES, 'sha256': SHA},
        'upstream': json.loads((HERE / 'sources.json').read_text()),
        'originalModel': {'bytes': (original / 'g2pw.onnx').stat().st_size, 'sha256': digest(original / 'g2pw.onnx')},
        'quantization': {'operators': ['MatMul', 'Gather'], 'weightType': 'QInt8', 'perChannel': False, 'MatMulConstBOnly': True,
            **DEPENDENCIES},
        'deployment': manifest,
        'programs': [{'path': f'tools/g2pw/{name}', 'sha256': digest(HERE / name)} for name in ['prepare.py', 'core.py', 'validate.py']]}
    if args.preprocess:
        source = ROOT / 'the_Tower_of_Babel.txt'
        # Decode bytes directly: CR/LF and source offsets must remain unchanged.
        text = source.read_bytes().decode('utf-8')
        readings, confidences, indices = infer(text, metadata, tokenizer_for(cache / 'inputs'), session_for(quantized),
            lambda count: print(f'Prepared {count} source-aligned polyphonic occurrences', flush=True))
        annotation = {'schemaVersion': 1, 'provider': 'g2pw', 'modelVersion': VERSION, 'modelSha256': model_sha,
            'sourceSha256': digest(source), 'codepoints': len(text), 'readings': readings,
            'confidences': confidences, 'modelIndices': indices}
        dump(ROOT / 'src/data/generated/default-pinyin.json', annotation)
    annotation_path = ROOT / 'src/data/generated/default-pinyin.json'
    annotation = json.loads(annotation_path.read_text()) if annotation_path.exists() else {}
    if annotation.get('sourceSha256') != digest(ROOT / 'the_Tower_of_Babel.txt') or annotation.get('modelSha256') != model_sha:
        raise ValueError('Missing/stale default annotation; pass --preprocess to rebuild it locally')
    lock['defaultAnnotation'] = {'path': 'src/data/generated/default-pinyin.json', 'bytes': annotation_path.stat().st_size,
        'sha256': digest(annotation_path), 'codepoints': annotation['codepoints'],
        'modelOccurrences': len(annotation['modelIndices']), 'annotatedOccurrences': sum(x is not None for x in annotation['readings'])}
    dump(ROOT / 'data/g2pw-model.lock.json', lock)
    print(json.dumps({'modelBytes': manifest['model']['bytes'], 'shards': len(shards), 'metadataBytes': meta_info['bytes'], 'modelSha256': model_sha}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--preprocess', action='store_true')
    build(parser.parse_args())
