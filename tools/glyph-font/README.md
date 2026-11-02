# Jigmo glyph fallback

The author distributes Jigmo 2025-09-12 under CC0 at <https://kamichikoichi.github.io/jigmo/>. The fixed ZIP contains three TTFs, its complete CC0 license, README and contributor thanks. The locally measured 64-digit SHA-256 is pinned in `data/glyph-font.lock.json`; it is a byte pin, not a claim of upstream signature verification. Original TTFs and the ZIP stay outside the project and product archive.

Create an external Python environment using `requirements.txt`, then run:

```sh
python tools/glyph-font/generate.py --source-zip /absolute/cache/Jigmo-20250912.zip
node tools/glyph-font/check.mjs
```

Generation requires the exact FontTools/Brotli versions. It verifies the original ZIP, retains the supplied notices byte-for-byte, extracts only CJK default glyphs and selected radicals/strokes, checks that every selected source glyph has an outline, and generates WOFF2 chunks in 1,024-codepoint regions. Each chunk retains its exact `cmap` set; timestamp recalculation is disabled. Manifest ranges, byte sizes and SHA-256 hashes are locked. No IVS coverage is claimed. To check a checkout or build, Node is sufficient; `check.mjs` verifies supplied bytes and range accounting without Python or network access.

Plane ownership follows the upstream design: Jigmo supplies BMP/SMP, Jigmo2 SIP, and Jigmo3 TIP. Supplementary example glyphs in the BMP font must not create partial chunks that overwrite another font's chunk. Duplicate chunk IDs/files are rejected. For a same-source/toolchain rebuild, `--reuse-verified-lock /absolute/previous.lock.json` can retain unchanged existing chunks after checking their prior byte digest and exact requested `cmap`; missing, changed, duplicate or incomplete chunks are regenerated from the original source.

The runtime requests only chunks needed for currently displayed rare glyphs, up to four concurrent requests, from the current origin. It verifies bytes before registering `FontFace` with exact Unicode ranges. Ordinary BMP learning keeps its system-font startup path. Completed chunks are cached; failed requests can be retried without changing accepted input or reading/code selections. The active character, visible article page, Inspector results and disclosed components are separate loading scopes. A missing font glyph is identified by its Unicode codepoint and is independent from whether a typing code exists.

Jigmo uses its supplied default GlyphWiki forms. It is display support, not a proof of Chinese regional glyph conventions, stroke order or Xiaohe roots. The fixed source covers Unicode 17 CJK (including Extension J); Unicode 18 completeness, IVS, PUA and unencoded glyphs are outside this fallback's claim.
