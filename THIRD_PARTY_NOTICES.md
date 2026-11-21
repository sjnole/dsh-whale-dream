# Sources and retained terms

Whale Dream is a custom integration, not an official update from DSH, Dream Skin, ASCII Whales, SJ, or dsh-bottom-info-bar.

| Component | Pinned source | Terms |
| --- | --- | --- |
| xiaotang-daozai 0.6.66 | https://github.com/Renly1994/xiaotang-daozai / `08250c583dfda4fe3643af9e27cc93221b4170e9` | MIT. The Windows island renderer, capsule animation and page interaction are adapted for Whale Dream's session view. See `licenses/xiaotang-daozai-LICENSE` and `licenses/xiaotang-daozai-NOTICES.txt`. |
| pulldown-cmark 0.13.4 and unicase 2.10.0 | https://crates.io/crates/pulldown-cmark/0.13.4 and https://crates.io/crates/unicase/2.10.0 | Markdown parsing in the Windows live window. Pulldown-cmark uses MIT and unicase offers MIT or Apache-2.0. See `licenses/pulldown-cmark-LICENSE`, `licenses/unicase-LICENSE-MIT` and `licenses/unicase-LICENSE-APACHE`. |
| DeepSeek Harness desktop icons | Installed `@deepseek-ai/dsh-web-frontend` build, exports `FISH_LOGO_PATH` / `FISH_LOGO_VIEWBOX` and `IconNewChatOutlineRegular` | The source SVG paths are rendered at their original aspect ratios in the live window. See `licenses/deepseek-harness-LICENSE`. |
| dsh-ascii-whales 0.1.6 | https://github.com/Chael-Chael/dsh-ascii-whales / `fdcc976f7d66245b7e0c3d5f81018c5a109d56a6` | MIT for the original DSH integration only; see licenses/dsh-ascii-whales-LICENSE. |
| dsh-dream-skin 11.7.0 | https://gitcode.com/LLLAAAAA/dsh-dream-skin.git / `50fbbcb9b73712e76adf7601c68cae4484390ab1` | MIT; see licenses/dsh-dream-skin-LICENSE. npm archive integrity and original source hashes are retained in src/dream/vendor/PROVENANCE.json in the source distribution. |
| dsh-sj-reasoning-ring 0.1.4 | Supplied source ZIP; SHA-256 `55632d1c6235612e7a57ea3aec378e736fc58142f2a53c543caa5d1412f3e4db`. Per-file hashes in `vendor/sj-reasoning-ring/SOURCE.json`. | MIT; copyright (c) 2026 dsh-codex-effort-slider contributors and (c) 2026 SJ. Full terms: `vendor/sj-reasoning-ring/LICENSE`. |
| DeepSeek Harness official PixelWhale (startup reuse, 2026) | https://github.com/deepseek-ai/deepseek-harness / packages/client/ui-brand-official/src/client/home-whale/{renderer.ts,code-fill.ts,artwork.ts,PixelWhale.tsx}, assets/breach-atlas.webp | MIT; source adaptation included in lib/startup/boot.js, 0.8.42 uses an offline-character-rendered animated WebP derivative of the PixelWhale atlas embedded in the user-provided 0.8.41 installer. The derivative is bundled to eliminate startup-frame redraw. DSH source code is MIT (licenses/deepseek-harness-LICENSE), but the visual atlas also traces to a third-party demonstration: **do not assume public redistribution rights for the artwork** without checking the original asset's separate license. |
| dsh-startup-screen 1.3.0 (integration reference) | https://github.com/6shenhonghong9/dsh-startup-screen | MIT; Copyright (c) 2026 沈宏宏. Startup mechanism was studied, but its six authorization scenes, video/audio assets and settings UI are not embedded. See licenses/dsh-startup-screen-LICENSE. |
| dsh-bottom-info-bar 1.26.0 account and ledger core | https://github.com/songoao25/dsh-bottom-info-bar / `684beceac85120824d82c713b83e0e3e77a0eb3f`; per-file SHA-256 hashes in `vendor/bottom-info-bar/SOURCE.json`. | MIT; copyright (c) 2026 songoao25. Full terms retained below and in `vendor/bottom-info-bar/LICENSE`. |
| SJ embedded Lucide / Feather-derived icon paths | Original `src/icons.json` retained from SJ 0.1.4. | Lucide ISC and applicable Feather MIT terms, with full copyright and permission text in `vendor/sj-reasoning-ring/THIRD_PARTY_NOTICES.md`. |
| ascii-sharks | https://github.com/stackedlol/ascii-sharks / `c521e24a787e6d4cc460d4cf2b9815f25e4fe453` | Upstream authorship and terms retained. The snapshot had no separate LICENSE; no blanket MIT claim is made. |
| ascii-kanji-sharks | https://github.com/michikusa404/ascii-kanji-sharks / `7153916aebba0f34ce2d46904ad192188cdc6ceb` | MIT; full terms at vendor/ascii-kanji-sharks/LICENSE. |
| Geist Mono subset | https://github.com/vercel/geist-font / `742b08235ce818c6c464c1323087ea38a1241ff1` | SIL OFL 1.1; assets/fonts/OFL-Geist.txt. |
| Source Han Serif subset | https://github.com/adobe-fonts/source-han-serif / `7889f11bf31170b5d092a083b357c8c8130f89e0` | SIL OFL 1.1; assets/fonts/OFL-SourceHanSerif.txt. |
| DSH QA structure and CSS | https://github.com/deepseek-ai/deepseek-harness / tag `dsh-v0.2.2-rc.3`, commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced` | Source distribution only; full upstream MIT terms and CSS hashes retained under qa/. |

The original ASCII Whales notices are preserved without omission in
`licenses/dsh-ascii-whales-NOTICES.md`; that document is part of this package.
It also identifies the font subset names and other research acknowledgements.

## Integration changes

- Preserved Dream Skin's original readable runtime and adapted its module
  factory at build time. Moved the persistence endpoint and state file to
  Whale Dream, added a shared serialized preference bridge, and renamed the
  single settings section. No runtime source evaluation is used.
- Retained the whale world, geometry and renderers; extended engine lifecycle
  with capped rendering, input pauses and background-only interaction.
- Replaced the whale mounting/material adapter for the exact DSH conversation
  contract, with separate history intensity and a canvas-only reading mask.
- Added a compact settings shell, original-gradient actions, shared complete
  profile controls, preference migration, tests and a source-based fixture.
- Extended the ocean to eight selectable species and adapted species-specific
  motion. The settings cards use static frames from the actual production
  geometry and ASCII/Hanzi/Kanji renderers, not a separate illustration set.
- Added validated multi-stop gradients and fifteen semantic palette roles,
  including opaque ring-surface colors, without relicensing upstream artwork.
- Added built-in theme presets, complete custom visual profiles and an interval-based
  same-category scheduler. Profiles carry only visual preferences; they do not store or
  change provider, model, reasoning-effort or team selection.
- Embedded SJ 0.1.4's real production component, unchanged Core/Placement source,
  and its original icon data. The adapter changes the embedded instance id,
  theme-token mapping, preferences and owned slot lifecycle. It preserves the
  original model/session contracts and interaction rules, adds duplicate
  detection, and reads legacy settings without writing them back.
- Browser preview bundles React/React DOM 18.3.1 for its test adapter only;
  the installable plugin uses the host's React. MIT notices are preserved in
  the preview build and qa/licenses/ in the source distribution.

## SJ source relationship

The preserved SJ 0.1.4 source and notices identify its basis as
[dsh-codex-effort-slider](https://github.com/Microqian2th/dsh-codex-effort-slider)
1.1.5, pinned commit `fd1b78a73322c9686301e4ba9da0db85d60559ae`.
Both the upstream contributor copyright and SJ's copyright are retained in the
source and full MIT license. The integrated client is generated from the
preserved production source by `src/ring/build-runtime.mjs`; SJ preview fake
models and its optional separate preview runtime are not used in production.

Whale Dream's own HTML preview uses an explicitly simulated Host and its own
React/ReactDOM preview bundle. It is not an installed DSH instance and does not
turn preview data into production model defaults. Source-derived DSH fixture
styles remain under their upstream MIT terms in `qa/native-LICENSE.txt`.

## Original category scenes in 0.4.0

The five new land/flying animal scenes, five plant scenes and five game-inspired
ambient scenes in `src/appearance/` are original Canvas drawing and animation
code created for this integration. Game names and genre references describe the
requested visual concepts; no game sprites, logos, music or packaged game assets
are embedded. The existing eight marine renderers retain their upstream terms.
Default themes now apply only theme preferences; complete custom profiles and
category-based calendar rotation use the same preserved preference identities.

## Original character and interaction work in 0.5.0

The character-cell rasterization in `src/appearance/glyphs.mjs`, the continuous
animal routes and rooted plant placement, and the per-category transient pixel
click marks are original integration code. The fifteen non-marine scenes use
the shared character pipeline; the eight marine scenes retain their original
renderers and terms. Click marks use locally authored SVG pixel geometry and
do not embed game sprites, remote assets or upstream recording-only overlays.

The settings shell now separates theme editing from appearance and motion,
shares complete-profile saving, removes the extension/maintenance page, and
uses the host's icon slot with one compatibility fallback. These changes do
not alter the retained licenses or relicense any upstream source or artwork.

## Information module in 0.8.5

Acknowledgement: thank you to [@songoao25](https://github.com/songoao25),
author of [dsh-bottom-info-bar](https://github.com/songoao25/dsh-bottom-info-bar).

Whale Dream supplies its own information-bar frontend, composer layout,
field selection and ordering, and unified settings. The host account adapters
and asynchronous ledger core are derived from the fixed MIT source snapshot
of dsh-bottom-info-bar 1.26.0, commit
`684beceac85120824d82c713b83e0e3e77a0eb3f`.

Original source files remain unchanged under `vendor/bottom-info-bar/src/`;
`vendor/bottom-info-bar/SOURCE.json` records each file's SHA-256. The build
verifies these hashes before adapting the runtime. It supplies an independent
Whale Dream endpoint and ledger directory, removes the standalone updater,
remote author pricing fetch and original frontend/native UI, and adds bounded
currency-separated summaries and lifecycle cleanup. The frontend refactoring
does not replace or remove the backend's original copyright and permission.

The generated runtime retains `lib/info/LICENSE.bottom-info-bar` and
`lib/info/SOURCE.bottom-info-bar.json`. The complete original MIT text follows.

### dsh-bottom-info-bar retained MIT License

MIT License

Copyright (c) 2026 songoao25

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Information display and DeepSeek schedule in 0.8.6

Whale Dream supplies the compact information chips, ratio graphics, currency-separated cost chart, and the shared DeepSeek pricing-schedule adapter. The immutable bottom-info-bar source snapshot remains unchanged; all changes are in Whale Dream's adapters and frontend.

The pricing schedule was checked on 2026-11-15 against the [official DeepSeek pricing page](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/). Holiday data uses the fixed 2026 calendar and the [official 2027 State Council notice reproduced by the Ministry of Human Resources and Social Security](https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml). This describes a reference billing schedule, not observed server load. Exact source links and coverage are included with the schedule module. Unknown holiday coverage is surfaced instead of asserting an unsupported price period.

## New Whale Dream glyph startup (0.8.8)

Whale Dream startup is a new character-matrix animation based on user-provided artwork. No original voice lines, film sounds, images, or authorization screens are imported from dsh-startup-screen. The host index hook was studied with attribution. The startup-enabled preference is kept in the existing whale-dream.json map.
