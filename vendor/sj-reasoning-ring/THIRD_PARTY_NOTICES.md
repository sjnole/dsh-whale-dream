# Third-party notices

## dsh-codex-effort-slider

SJ 推理圆环 is a derivative of dsh-codex-effort-slider. The upstream work
informed and supplies portions of the DSH integration and reasoning-control
implementation. This fork uses its own package identity and UI.

- Upstream: https://github.com/Microqian2th/dsh-codex-effort-slider
- Upstream version: 1.1.5
- Pinned upstream commit: fd1b78a73322c9686301e4ba9da0db85d60559ae
- Copyright (c) 2026 dsh-codex-effort-slider contributors
- License: MIT; the complete permission and disclaimer text is retained in LICENSE.

New work in this package is Copyright (c) 2026 SJ.

## Lucide icons and Feather-derived icons

The package embeds SVG path data for these Lucide icons in src/icons.json:
ArrowLeftRight, ChevronUp, ChevronLeft, Search, Check, Info, X, LoaderCircle,
RotateCcw and Settings2. Their path data is compiled into the browser artifact;
production use does not install or fetch a separate icon package.

The complete license text supplied with the source icon package follows.

~~~text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

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
~~~

## Host-provided React and ReactDOM

The production client obtains React and ReactDOM from DSH's shared browser
module table. Their implementations are not included in the production TGZ.
The DSH distribution supplies its own dependency licenses.

## Optional offline preview runtime

The complete ZIP may contain preview/vendor.js with a separate React 19.3.1
and ReactDOM development runtime. It is used only by the offline preview,
does not replace DSH's React, and is excluded from the production TGZ.
When this runtime is distributed, preview/LICENSES.txt contains the complete
licenses for its bundled dependencies. The packaging script refuses to include
preview/vendor.js in a ZIP without that companion notice file.

The preview simulates Host data to exercise the same production component.
Its presence is not evidence of installation or validation in a user's DSH.
