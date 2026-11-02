#!/usr/bin/env python3
"""Extract only the pinned MIT Xiaohe sound mapping; no TypeScript execution.

Use --source /path/to/schemes.ts for an offline rebuild and --check to verify
the checked-in output. The upstream v/ve spelling is retained for ü/üe.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ID = "shuangpin-practice-xiaohe-4927919"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Use a local, checksum-verified schemes.ts")
    parser.add_argument("--output", type=Path, default=ROOT / "src/data/generated/sound-mapping.json")
    parser.add_argument("--check", action="store_true", help="Verify checked-in output without writing")
    args = parser.parse_args()
    lock = json.loads((ROOT / "data/sources.lock.json").read_text(encoding="utf-8"))
    source = next(item for item in lock["sources"] if item["id"] == SOURCE_ID)
    artifact = source["artifacts"]["mapping"]
    if args.source is not None:
        payload = args.source.read_bytes()
    else:
        request = Request(artifact["url"], headers={"User-Agent": "xiaohe-learn-data-import/1"})
        with urlopen(request, timeout=60) as response:
            payload = response.read()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != artifact["sha256"]:
        raise ValueError(f"Source SHA-256 mismatch: expected {artifact['sha256']}, got {actual}")
    source_text = payload.decode("utf-8")
    match = re.search(r"const xiaohe: ShuangpinScheme = \{(.*?)\n\};", source_text, re.S)
    if match is None:
        raise ValueError("Pinned source's Xiaohe mapping block was not found")
    result = {}
    for field, expected_count in (("initials", 23), ("finals", 32), ("zeroInitials", 12)):
        block = re.search(rf"\b{field}: \{{(.*?)\n  \}}", match[1], re.S)
        if block is None:
            raise ValueError(f"Missing mapping block: {field}")
        pairs = re.findall(r'([a-z]+): "([a-z]+)"', block[1])
        if len(pairs) != expected_count or len(dict(pairs)) != expected_count:
            raise ValueError(f"Unexpected {field} count: {len(pairs)}")
        result[field] = dict(pairs)
    output = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    expected = source.get("generated", {}).get("sha256")
    if expected and hashlib.sha256(output).hexdigest() != expected:
        raise ValueError("Generated sound mapping checksum differs from the lock")
    if args.check:
        if not args.output.is_file() or args.output.read_bytes() != output:
            raise ValueError(f"Generated data differs from {args.output}")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(output)
    print(f"{'Verified' if args.check else 'Wrote'} Xiaohe sound mapping: {args.output}")


if __name__ == "__main__":
    main()
