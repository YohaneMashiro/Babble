# Component spelling data and generator notice

Adopted: 2026-10-28 (Asia/Dubai). This is an independent component-spelling layer,
separate from the existing four-key Xiaohe dictionary and shape-teaching records.
`OK` followed by two or three component shuangpin codes has six or eight keys.
It does not supply or invent a Mandarin reading for the whole character.

## Source data and retained terms

- Component sequences and explicit component mnemonic readings come from
  [mirtlecn/rime-radical-pinyin](https://github.com/mirtlecn/rime-radical-pinyin/tree/87e73d7182916f3db9dbc0b6a4d18a78a775b298),
  commit `87e73d7182916f3db9dbc0b6a4d18a78a775b298`. The original `radical.yaml`,
  `gen_dict.py`, source README and GPL text are retained byte for byte in
  `tools/component-spelling/inputs/`. The Python program is never executed;
  its `custom_dict` literal is read through the Python AST.
- The source declares GPLv3 and credits kfcd/chaizi (CC BY 3.0), CHISE/ids
  (GPLv2 or later), and Yi Bai/ids (MIT). The original source credits, GPL-3.0,
  chaizi copyright/license statement, full CC BY 3.0 text, and Yi Bai MIT notice
  accompany the input and the source distribution. These terms and credits
  remain applicable to the derived component records; they are not relicensed
  as original MIT data. For the GPLv2-or-later input, redistribution of this
  combined derived layer follows GPLv3 while preserving the original source
  identification and credit.
- Component readings use the existing Unicode Unihan 17.0.0 `kMandarin` and
  `kTGHZ2013` records, with their property provenance retained per component.
  Unicode License v3 and the existing `NOTICE-Unicode.txt` continue to apply.
- Shuangpin code generation invokes the existing independently organized
  Xiaohe sound mapping and product `explainSound`; the existing
  `NOTICE-shuangpin-practice.txt` retains its attribution and MIT notice.
- Four global spelling facts (辶/廴 → VI, 礻/衤 → PP) are independently recorded
  in `tools/component-spelling/config.json` from the public
  [official OK-spelling instructions](https://flypy.cc/help/#/pc).
  No official tutorial, image, or character dictionary is copied into this
  layer. The displayed `zhi` / `pie` are component-spelling conventions;
  they are not asserted to be standard readings of the whole character.

## Transformation and independent comparison

The generator takes only explicit source sequences of two or three scalar
components. It prefers the source's explicit component mnemonic readings when
present, otherwise the fixed modern reading order. It deduplicates equal
component sound codes, enumerates at most 256 combinations per source row,
and retains the first deterministic source witness for each character/code
pair. In this fixed input the observed maximum is 12, with no rows truncated
by that bound. Each witness preserves component labels, selected readings,
sound codes, reading-source IDs and the original source line.

All candidates are generated before the comparison file is opened. Comparison
uses the project-external community mirror
[xhup.ok.dict.yaml](https://github.com/kchen0x/rime-crane/blob/71f3add6a39d58a8e8b35abc7ca9c998d766b274/xhup_dicts/xhup.ok.dict.yaml),
SHA256 `510c6d7ab85b125d37a8b95cd1eb615371234aec353851f052e7a7a5ccf68d4a`.
The mirror labels its origin as official WindInput v1.26.9c. Agreement is a
comparison with that fixed mirror, not official endorsement or independent
proof of the mirror's provenance. Its raw contents are not redistributed or
used to choose decompositions or component readings.

The packed layer retains 112,553 generated candidate pairs for 89,189
characters. Exactly 59,930 pairs for 59,926 characters agree with the comparison
file (`comparisonFlag: 1`). Other pairs have flag 0, meaning **not reference
confirmed**: they may be absent from the reference or use a different spelling.
They remain candidates and must not be graded as official correct answers.
One matching code does not promote a character's other candidate codes.

The generated files are a tuple/dictionary transformation with Unicode
codepoint-based shards. They preserve the independent witnesses and comparison
status. Original sources, program, policy, input and artifact digests are
recorded in `data/component-spelling.lock.json` and
`tools/component-spelling/inputs.lock.json`. Existing canonical datasets and
their original source locks are unchanged.

## Program license

`tools/component-spelling/generate.mjs` and the original loader program
`src/data/component-spelling.ts` are Babble program code explicitly granted
under the root `LICENSE-CODE` MIT license. This includes the loader program
despite the general data-directory exclusion in that license. This grant does not cover
the input data, generated component records, official material, or any other
third-party content. The combined application distribution continues to follow
the root AGPL license and all separately retained source/data terms.
