# Shape trace data notices

`src/data/generated/shape-traces.json` contains a strictly audited subset derived from OverflowCat's libre-flypy 1.2.0 encoder. It is not an official Flypy dictionary. The dataset includes only records whose published full code and actual traced roots agree with a research reference. Root identity is retained from the encoder's real lookup paths, never inferred by reversing a code.

## Copyright and licensing

**Encoder and trace material:** Copyright (C) 2023 OverflowCat, <https://overflow.cat/>. Source: <https://github.com/OverflowCat/libre-flypy>, commit `0eddd3eafc1ad68b3b55f0565c10b7b92b104d51`. The encoder is under GNU Affero General Public License version 3. The original license, README, all encoder source and an exact patch are supplied in `tools/libre-flypy-audit`. The modification adds actual root/path recording, without changing encoding decisions. The trace is conservatively distributed under AGPL-3.0 as derivative material; **no CC0 claim is made for this additional trace output**.

**Published full codes:** The upstream README separately dedicates its built code table to the public domain via [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The exact [published 1.2.0 table](https://github.com/OverflowCat/libre-flypy/releases/download/1.2.0/output.txt) is retained under `tools/libre-flypy-audit/inputs/release-output-1.2.0.txt`. Its SHA256 and the pinned license declaration are in `data/shape-sources.lock.json`. This output declaration does not relicense the AGPL generator, derivative trace, or MIT/Unicode inputs.

**IDS input:** Copyright (c) 2021 Yi Bai. [yi-bai/ids](https://github.com/yi-bai/ids), commit `2f9ad2de309c56a83555ca7474473ce1fa1b8ee4`, MIT License. The selected `ids_lv2.txt` and original full MIT notice are supplied in the tool's `inputs/ids_lv2.txt` and `inputs/IDS-LICENSE`.

**Pinyin input:** Copyright (c) 2016 mozillazg. [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data), commit `2fe1f86e2bbed2e230d6e947aa393f8ee37342f4`, MIT License. The selected `pinyin.txt` and original full MIT notice are supplied in the tool's `inputs/pinyin.txt` and `inputs/PINYIN-LICENSE`. Its upstream README identifies the Unihan source as Unicode 15.0.0. Unicode's current permission notice is included as `inputs/UNICODE-LICENSE`; see [Unicode data terms](https://www.unicode.org/license.txt). MIT attribution and Unicode data terms are retained in addition to the upstream output dedication.

**Audit modifications and wrapper:** The provenance recording modification, rebuild script and this trace distribution are made available under AGPL-3.0. Original application files may retain their separate MIT license. Distribute the combined application conservatively under the applicable AGPL obligations with complete corresponding source, notices, modifications and build instructions, including a visible source-code offer to users interacting with it over a network.

## Research reference and accuracy

The [official Flypy lookup page](https://flypy.cc/ix/) loads a public JSON reference. No redistribution permission for that reference was established, so **the original reference file is not included in this repository or build**. Reproduction accepts a temporary local path outside this project and never fetches or copies that file. All accepted character/code/root/path/tree fields originate from licensed upstream artifacts. The reference is used solely to reject disagreeing records. Its URL and checksum are recorded for audit reproducibility.

The generated subset contains 6,596 characters and 7,014 unique full codes, before an application independently matches licensed readings. This is an audited subset, not full official coverage. Exact code/root agreement does not certify a preferred pronunciation or a complete decomposition. No missing code, reading, root alias, or component is invented. Private-use, question-mark, and replacement roots are rejected rather than substituted; this build contains zero such root rows.

The complete deterministic exclusion counts and limitations are in `shape-traces.json` metadata. The input/source lock is independent of other datasets at `data/shape-sources.lock.json`. Reproduction instructions and all modified AGPL tool source are supplied in `tools/libre-flypy-audit/README.md`.
