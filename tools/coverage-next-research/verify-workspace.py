#!/usr/bin/env python3
"""Research-stage scope verification, not acceptance of a later product build."""
from pathlib import Path
import argparse
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline', type=Path, default=root / 'dist/source/babble-source.tgz')
args = parser.parse_args()
assert hashlib.sha256(args.baseline.read_bytes()).hexdigest() == 'b754cb1b91e56e5178130c74fbd12c7c9731e83213b65f5c730b9e729d0ac9ef'
members = set()
with tarfile.open(args.baseline) as archive:
    for member in archive.getmembers():
        if not member.isfile():
            continue
        members.add(member.name)
        assert (root / member.name).read_bytes() == archive.extractfile(member).read(), member.name
prefix = 'tools/coverage-next-research/'
lock = json.loads((root / prefix / 'programs.lock.json').read_text())
allowed = {prefix + row['path'] for row in lock['programs']}
allowed |= {prefix + name for name in ['README.md', 'programs.lock.json', 'experiment-results.json', 'check-snapshots.mjs', 'verify-workspace.py']}
added = set()
for directory in ['src', 'data', 'tests', 'tools', 'scripts']:
    for path in (root / directory).rglob('*'):
        if not path.is_file() or '__pycache__' in path.parts:
            continue
        relative = path.relative_to(root).as_posix()
        if relative not in members:
            added.add(relative)
assert added == allowed, (sorted(added - allowed), sorted(allowed - added))
assert hashlib.sha256((root / 'dist/assets/index-C31KOCG5.js').read_bytes()).hexdigest() == '3455bd16b21c1ae62dc9d5e9b4a4cc4397973182765f6c4097942a5f6cdfa65d'
print(json.dumps({'priorFilesByteIdentical': len(members), 'addedResearchFilesOnly': len(added), 'productionBuildUnchanged': True}))
