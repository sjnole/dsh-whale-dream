# Whale Dream 0.8.53 native companion validation

- Baseline: the complete 0.8.52 release, preserving all DSH main UI/splash/info assets.
- GUI code: Win32 native 3-state canvas (112x112 / 510x100 / 640x536), embedded 2x PNG visuals, double-buffered cached GDI. No WebView2/Edge process and no local companion web server at runtime.
- Interaction: hover circle -> capsule; click capsule -> queue; queue tabs, wheel, drag, session selection, draft creation; bounded 220ms transitions at 25ms timer, low-motion bypass.
- Performance: draw on WM_PAINT only; data file changes post UI message; dynamic images and font handles cached; offscreen HBITMAP reused across intermediate sizes; resource destruction on WM_DESTROY.
- Security: the Host still owns the session list/usage source and filters privacy/unknown data; no forged balance or cost.
- Validation: Windows x64 cross compilation, JS syntax and current npm tests 16/16 PASS, 8 sha256 frozen files identical to 0.8.52 baseline.
- Caveat: native Windows GUI itself was not run in this Linux environment. Real Windows 11 window positioning, DPI, animation FPS/latency and memory are unverified; requires user Windows QA.
