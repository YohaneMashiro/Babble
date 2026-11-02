# Lossless runtime representations

`src/data/generated/runtime-readings.json`, `runtime-shape-traces.json` and
`runtime-shape-expansion.json` are reversible representations of the adjacent
canonical JSON files. They add no readings, roots, codes or teaching claims.
The complete metadata, reading provenance, frequency presence, shape paths,
trees, source IDs and notes are retained. Canonical JSON and all prior notices,
input files, generators and source locks remain distributed in the source archive.

The reading derivative retains Unicode-3.0 and `data/NOTICE-Unicode.txt`.
The shape trace derivative retains AGPL-3.0-only and the separately identified
input and published-code terms in `data/NOTICE-shape-traces.md`.
The expansion derivative retains AGPL-3.0-only and all input attribution and
terms in `data/NOTICE-shape-expansion.md`. These representations are not new
data sources or a relicensing of any input.

The original codec program `src/data/runtime-codec.ts`, packing program
`scripts/pack-runtime-data.mjs` and tests are MIT-licensed under LICENSE-CODE.
This explicit codec grant covers program code only, not the generated datasets.

`data/runtime-data.lock.json` records canonical hashes, frozen upstream lock
hashes, generator/codec/notice hashes and derived hashes/counts. Run
`npm run generate:runtime` after an intentional codec or generator change;
`npm run check:runtime` and the production build verify without writing.
Neither command updates canonical data or any source lock. Changed upstream
locks or canonical data are rejected even in generation mode. Adopting a new
canonical dataset requires a separate source/provenance review and an explicit
reviewed update of the packer's pinned source-lock hashes; this tool has no
relock, force, download or source-acceptance option.
