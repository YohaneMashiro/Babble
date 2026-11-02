"""CPU preparation adapted from GitYCC/g2pW (Apache-2.0).

Original authors: Yi-Chang Chen, Yu-Chuan Chang, Yen-Cheng Chang, Yi-Ren Yeh.
The original text is never normalized in place; predictions retain source indices.
"""
from pathlib import Path
import hashlib
import json
import re

VERSION = 'g2pw-v2-int8-matmul-gather-v1'


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(4194304), b''):
            h.update(block)
    return h.hexdigest()


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    path.write_bytes(data)
    return {'file': path.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def metadata_for(original, inputs, config):
    import onnx
    poly = [line.split('\t') for line in (original / 'POLYPHONIC_CHARS.txt').read_text().strip().splitlines()]
    mono = dict(line.split('\t') for line in (original / 'MONOPHONIC_CHARS.txt').read_text().strip().splitlines())
    pair_labels = [f'{char} {phone}' if config['use_char_phoneme'] else phone for char, phone in poly]
    labels = sorted(set(pair_labels))
    label_ids = {label: i for i, label in enumerate(labels)}
    char2phonemes = {}
    for (char, _), label in zip(poly, pair_labels):
        char2phonemes.setdefault(char, []).append(label_ids[label])
    model = onnx.load(original / 'g2pw.onnx', load_external_data=False)
    types = {onnx.TensorProto.INT64: 'int64', onnx.TensorProto.FLOAT: 'float32'}
    input_types = {v.name: types[v.type.tensor_type.elem_type] for v in model.graph.input}
    output_name = model.graph.output[0].name
    del model
    # BertTokenizer.load_vocab uses file lines and rstrip('\n'). str.splitlines()
    # also splits vocabulary tokens U+2028/U+2029 and silently shifts later IDs.
    with (inputs / 'bert-vocab.txt').open(encoding='utf-8') as stream:
        vocab = [line.rstrip('\n') for line in stream]
    return {'schemaVersion': 1, 'provider': 'g2pw', 'version': VERSION,
        'config': {'windowSize': config['window_size'], 'useMask': config['use_mask'],
                   'useCharPhoneme': config['use_char_phoneme'], 'maxLength': 512},
        'tokenizer': {'doLowerCase': False, 'stripAccents': False, 'tokenizeChineseChars': True, 'cleanText': True},
        'vocab': vocab,
        'labels': labels, 'chars': sorted(char2phonemes), 'char2phonemes': char2phonemes,
        'monophonic': mono,
        'charBopomofo': json.loads((inputs / 'char_bopomofo_dict.json').read_text()),
        'bopomofoToPinyin': json.loads((inputs / 'bopomofo_to_pinyin_wo_tune_dict.json').read_text()),
        'simplifiedToTraditional': dict(line.split('\t') for line in (inputs / 'bert-base-chinese_s2t_dict.txt').read_text().strip().splitlines()),
        'inputTypes': input_types, 'outputName': output_name}


def tokenizer_for(inputs):
    from transformers import BertTokenizer
    return BertTokenizer(vocab_file=str(inputs / 'bert-vocab.txt'), do_lower_case=False, strip_accents=False)


def wordize(text):
    words, spans, cursor = [], [], 0
    while cursor < len(text):
        spaces = re.match(r' +', text[cursor:])
        if spaces:
            cursor += len(spaces.group())
            continue
        english = re.match(r'[a-zA-Z0-9]+', text[cursor:])
        word = english.group() if english else text[cursor]
        words.append(word)
        spans.append((cursor, cursor + len(word)))
        cursor += len(word)
    return words, spans


def prepare_sample(text, query, metadata, tokenizer):
    import numpy as np
    radius = metadata['config']['windowSize'] // 2
    start, end = max(0, query - radius), min(len(text), query + radius)
    window = text[start:end]
    # Upstream lowercases windows. Preserve target position for expanding İ etc.
    local_query = len(window[:query - start].lower())
    window = window.lower()
    words, spans = wordize(window)
    tokens, text_to_token = [], [None] * len(window)
    for word, (begin, finish) in zip(words, spans):
        pieces = tokenizer.tokenize(word)
        if not pieces or pieces == ['[UNK]']:
            pieces, mapped = ['[UNK]'], [(begin, finish)]
        else:
            mapped, at = [], begin
            for piece in pieces:
                size = len(piece.removeprefix('##'))
                mapped.append((at, at + size))
                at += size
        for piece, (begin, finish) in zip(pieces, mapped):
            for offset in range(begin, finish):
                text_to_token[offset] = len(tokens)
            tokens.append(piece)
    if text_to_token[local_query] is None or len(tokens) + 2 > metadata['config']['maxLength']:
        raise ValueError('Invalid target token mapping; refusing to shift the source index')
    encoded = tokenizer.convert_tokens_to_ids(['[CLS]', *tokens, '[SEP]'])
    char = window[local_query]
    allowed = metadata['char2phonemes'][char]
    mask = [int(i in allowed) for i in range(len(metadata['labels']))] if metadata['config']['useMask'] else [1] * len(metadata['labels'])
    return {'input_ids': np.asarray([encoded], dtype=np.int64),
        'token_type_ids': np.zeros((1, len(encoded)), dtype=np.int64),
        'attention_mask': np.ones((1, len(encoded)), dtype=np.int64),
        'phoneme_mask': np.asarray([mask], dtype=np.float32),
        'char_ids': np.asarray([metadata['chars'].index(char)], dtype=np.int64),
        'position_ids': np.asarray([text_to_token[local_query] + 1], dtype=np.int64)}


def to_pinyin(phoneme, metadata):
    if metadata['config']['useCharPhoneme']:
        phoneme = phoneme.split(' ', 1)[1]
    tone = phoneme[-1]
    base = metadata['bopomofoToPinyin'].get(phoneme[:-1])
    return base + tone if base and tone in '12345' else None


def session_for(path):
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    options.intra_op_num_threads, options.inter_op_num_threads = 2, 1
    return ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])


def infer(text, metadata, tokenizer, session, progress=None):
    import numpy as np
    translated = ''.join(metadata['simplifiedToTraditional'].get(c, c) for c in text)
    if len(translated) != len(text):
        raise ValueError('S2T mapping changed source length')
    readings, confidences, model_indices = [None] * len(text), [None] * len(text), []
    for i, char in enumerate(translated):
        if char in metadata['char2phonemes']:
            sample = prepare_sample(translated, i, metadata, tokenizer)
            probs = session.run([metadata['outputName']], sample)[0][0]
            if not np.isfinite(probs).all():
                raise ValueError('Non-finite model output')
            label = int(np.argmax(probs))
            readings[i], confidences[i] = to_pinyin(metadata['labels'][label], metadata), float(probs[label])
            model_indices.append(i)
            if progress and len(model_indices) % 100 == 0:
                progress(len(model_indices))
        elif char in metadata['monophonic']:
            readings[i] = to_pinyin(metadata['monophonic'][char], metadata)
        elif char in metadata['charBopomofo']:
            readings[i] = to_pinyin(metadata['charBopomofo'][char][0], metadata)
    return readings, confidences, model_indices
