#!/usr/bin/env python3
"""Rebuild the audited subset. Network-free; the reference stays outside the repo.

AGPL-3.0-only. The Rust encoder is OverflowCat's libre-flypy with a
provenance-only modification; see LICENSE, UPSTREAM-README.md, and trace.patch.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unicodedata


TOOL = Path(__file__).resolve().parent
PROJECT = TOOL.parents[1]
LOCK_PATH = PROJECT / "data/shape-sources.lock.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_use(value: str) -> bool:
    return any(unicodedata.category(char) == "Co" for char in value)


def assemble(trace_file: Path, reference_path: Path, lock: dict) -> dict:
    # This file is only read. No original reference strings are included in
    # the output: all accepted fields come from the licensed generator trace.
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    release = Counter(
        (TOOL / "inputs/release-output-1.2.0.txt")
        .read_text(encoding="utf-8").splitlines()
    )
    characters: dict[str, dict] = {}
    rejected: Counter[str] = Counter()
    rows = trace_file.read_text(encoding="utf-8").splitlines()
    generated: Counter[str] = Counter()
    root_counts: Counter[str] = Counter()
    root_warnings: Counter[str] = Counter()
    accepted_rows = 0

    for line in rows:
        char, code, first, last, first_path, last_path, ids_tree = line.split("\t")
        generated[f"{char}\t{code}"] += 1
        root_counts.update((first, last))
        if private_use(first + last):
            root_warnings["privateUseRootRows"] += 1
            rejected["private-use-root"] += 1
            continue
        if "?" in first + last or "\ufffd" in first + last:
            root_warnings["questionOrReplacementRootRows"] += 1
            rejected["question-or-replacement-root"] += 1
            continue
        if len(first) != 1 or len(last) != 1 or not re.fullmatch("[a-z]{4}", code):
            rejected["malformed-trace"] += 1
            continue
        if f"{char}\t{code}" not in release:
            rejected["not-in-published-release"] += 1
            continue
        other = reference.get(char)
        if not other:
            rejected["no-research-reference-character"] += 1
            continue
        if code not in re.findall("[a-z]{4}", other["1"]):
            rejected["full-code-disagreement"] += 1
            continue
        if other["2"].split() != [first, last]:
            rejected["root-disagreement"] += 1
            continue
        accepted_rows += 1
        item = characters.setdefault(char, {
            "codes": [],
            "firstRoot": first,
            "lastRoot": last,
            "firstRootPath": list(first_path),
            "lastRootPath": list(last_path),
            "idsTree": ids_tree,
        })
        # Multiple pronunciation rows can produce the same four-letter code.
        if code not in item["codes"]:
            item["codes"].append(code)

    for item in characters.values():
        item["codes"].sort()
    characters = dict(sorted(characters.items()))
    stats = {
        "generatedRows": len(rows),
        "publishedReleaseRows": sum(release.values()),
        "generatedUniqueRecordsNotInRelease": len(generated - release),
        "publishedUniqueRecordsNotGenerated": len(release - generated),
        "acceptedRowsBeforeDeduplication": accepted_rows,
        "acceptedCharacters": len(characters),
        "acceptedUniqueCodes": sum(len(item["codes"]) for item in characters.values()),
        "excludedRowsByFirstReason": dict(sorted(rejected.items())),
        "rootAudit": {
            "rawUniqueRoots": len(root_counts),
            "privateUseRootRows": root_warnings["privateUseRootRows"],
            "questionOrReplacementRootRows": root_warnings["questionOrReplacementRootRows"],
            "acceptedPrivateUseRootRows": 0,
            "acceptedQuestionOrReplacementRootRows": 0,
            "policy": "Exclude private-use, question-mark, and replacement roots; never substitute a glyph.",
        },
    }
    expected = lock["expected"]
    for name in ("acceptedCharacters", "acceptedUniqueCodes", "generatedRows"):
        if stats[name] != expected[name]:
            raise ValueError(f"Unexpected {name}: {stats[name]} != {expected[name]}")

    return {
        "metadata": {
            "id": "libre-flypy-strict-trace-subset-v1",
            "version": "1.0.0",
            "auditedAt": "2026-10-25",
            "source": "OverflowCat/libre-flypy 1.2.0, provenance-preserving audit build",
            "sourceUrl": lock["generator"]["url"],
            "sourceCommit": lock["generator"]["commit"],
            "fullCodeLicense": "CC0-1.0, as declared by upstream for its published code table",
            "traceLicense": "AGPL-3.0-only; conservatively distributed as derivative material",
            "inputLicenses": ["MIT: Yi Bai IDS", "MIT: mozillazg pinyin-data", "Unicode data terms"],
            "licenseNotice": "data/NOTICE-shape-traces.md",
            "sourceLock": "data/shape-sources.lock.json",
            "selection": "Exact intersection of published release code, actual encoder root trace, and research-reference code/root pair. No generated substitute codes, reverse root lookup, or root aliases.",
            "idsTreeFormat": "Upstream Debug tree string; not a canonical IDS serialization or a full teaching decomposition.",
            "reference": {
                "url": lock["researchReference"]["url"],
                "sha256": lock["researchReference"]["sha256"],
                "use": "Research validation only; original reference data is not redistributed.",
            },
            "statistics": stats,
            "limitations": [
                "A validated subset, not the complete official dictionary.",
                "Code/root agreement does not validate every pronunciation or establish a preferred reading.",
                "Paths preserve the encoder's recursive lookup provenance, not a lesson about stroke order.",
                "Large components such as 彡 are excluded when they do not exactly match the reference root 丿; no aliases are invented.",
            ],
        },
        "characters": characters,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", required=True, type=Path,
                        help="Local research-only ixdata JSON path; never copied into the project")
    parser.add_argument("--output", type=Path,
                        default=PROJECT / "src/data/generated/shape-traces.json")
    parser.add_argument("--check", action="store_true",
                        help="Verify the checked-in artifact instead of overwriting it")
    args = parser.parse_args()
    reference = args.reference.resolve()
    if PROJECT == reference or PROJECT in reference.parents:
        raise ValueError("The research reference must remain outside the project.")
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    if sha256(reference) != lock["researchReference"]["sha256"]:
        raise ValueError("Reference checksum mismatch; a changed reference requires a fresh audit.")
    for relative, expected in lock["files"].items():
        if sha256(TOOL / relative) != expected:
            raise ValueError(f"Locked input/source checksum mismatch: {relative}")
    with tempfile.TemporaryDirectory(prefix="xiaohe-shape-audit-") as temp:
        stage = Path(temp)
        shutil.copytree(TOOL / "src", stage / "src")
        for relative in ("my_ids.txt", "my_pinyin.txt"):
            shutil.copyfile(TOOL / relative, stage / relative)
        for source, dest in (("ids_lv2.txt", "ids/ids_lv2.txt"),
                             ("pinyin.txt", "pinyin-data/pinyin.txt")):
            target = stage / dest
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(TOOL / "inputs" / source, target)
        binary = stage / "libre-flypy-trace"
        subprocess.run(["rustc", "--edition=2021", "-O", "src/main.rs", "-o", str(binary)],
                       cwd=stage, check=True)
        subprocess.run([str(binary)], cwd=stage, check=True)
        result = assemble(stage / "trace-output.tsv", reference, lock)
    output = json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != output:
            raise ValueError("Generated subset does not match the checked-in artifact.")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(json.dumps(result["metadata"]["statistics"], ensure_ascii=False, indent=2))
    print(f"{'Verified' if args.check else 'Wrote'} {args.output}")


if __name__ == "__main__":
    main()
