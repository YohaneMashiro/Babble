# Jigmo glyph display data

Author/distributor: 上地宏一 (Koichi Kamichi), with the many GlyphWiki contributors credited by the upstream project. Source: [Jigmo primary distribution](https://kamichikoichi.github.io/jigmo/), release 2025-09-12. License: **CC0 1.0 Universal**. The supplied complete legal text, upstream README and contributor acknowledgements are retained unchanged in `tools/glyph-font/inputs/{LICENSE,README,THANKS}.txt`.

The measured source ZIP is 35,559,738 bytes, SHA-256 `5744c7386d129475d87607ca66d043c8793c65448adeaedc921b6931890e5d0b`. Individual original TTF hashes and the exact FontTools/Brotli toolchain are recorded in `data/glyph-font.lock.json`. The ZIP and original full TTFs are build inputs outside the checkout; no full font is fetched by the website.

Modifications: extract the fixed default CJK glyphs and selected radical/stroke characters; subset in 1,024-codepoint chunks; remove unrelated glyph/layout material; encode WOFF2; keep precise character ranges and original source notices. The generated outlines in `src/assets/glyph-font/*.woff2` remain **CC0-1.0**. Original generator, loader, hooks and UI code are MIT under `LICENSE-CODE`; that program license does not relicense the font data.

The website loads its own checked font chunks only when rare glyphs are displayed. The supplied Jigmo/GlyphWiki default form does not certify a Chinese regional form, Xiaohe root selection, pronunciation or code. The source's Unicode 17 coverage includes Extension J; this product does not claim complete Unicode 18 font coverage, IVS, PUA or unencoded-character support.
