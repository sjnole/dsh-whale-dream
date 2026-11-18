/* Whale Dream 0.8.45 — compositor-first startup playback.
 * DSH Host early-index injection and client fallback share this source verbatim.
 * Compositor-timed branding, dual H.264 theme assets and low-FPS WebP fallback.
 * Avoids synchronous forced layout and limits startup telemetry to passive
 * observers. Heavy background Canvas engines are gated in the client bundle.
 */
(function (win, doc) {
  'use strict';
  if (win.__WHALE_DREAM_STARTUP__) return;

  var KEY = 'dsh-whale-dream:startup-enabled';
  var SEEN = 'dsh-whale-dream:startup-seen';
  var NS = 'http://www.w3.org/2000/svg';
  var TIMING = {
    icon: 350,       // single original whale SVG materialises in the centre
    name: 1090,      // icon drifts left, "鲸梦" settles beside it
    phrase1: 1750,   // 探索: hold long enough to read
    phrase2: 2470,   // 未至: the phrase grows, it does not swap rapidly
    phrase3: 3300,   // 之境: the complete message becomes readable
    fade: 6600,      // keep the brand visible through the 5.7s breach animation
    duration: 7000
  };
  var boot = win.__WD_SPLASH_BOOT__ || null;
  // Native H.264 playback can use video decode/compositor hardware.
  var WHALE_ASSET = 'plugins/dsh-whale-dream/assets/whale-glyph-startup-00fd90a10cd5.mp4';
  var WHALE_LIGHT_ASSET = 'plugins/dsh-whale-dream/assets/whale-glyph-light-cdc6dd72a4f0.mp4';
  var WHALE_FALLBACK = 'plugins/dsh-whale-dream/assets/whale-glyph-fallback-f1243389174d.webp';
  var state = {
    overlay: null, style: null, observer: null, timers: [],
    enabled: true, started: 0, removed: false, closing: false, whale: null,
    themeLight: false, mediaLight: false, lastTheme: '', metrics: null, perfObserver: null
  };

  var css = [
    '.wd-startup-screen{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;',
    'background-color:var(--wd-startup-base,#0b0d12);background-image:var(--wd-startup-gradient,none);',
    'background-position:center;background-size:cover;background-repeat:no-repeat;',
    'color:var(--wd-startup-ink,#f4f6fa);isolation:isolate;contain:layout style paint;',
    'opacity:1;transition:opacity .29s cubic-bezier(.4,0,1,1)}',
    '.wd-startup-screen.wd-startup-exit{opacity:0;pointer-events:none}',
    '.wd-startup-brand{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;',
    'gap:clamp(10px,1.05vw,17px);max-width:calc(100vw - 32px);',
    'color:inherit;white-space:nowrap;--wd-intro-offset:calc(50% - 1.15em);',
    'transform:translate3d(var(--wd-intro-offset),0,0);',
    'animation:wd-brand-center .76s cubic-bezier(.16,1,.3,1) 1.09s both;',
    'font:600 clamp(20px,2.25vw,35px)/1.3 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
    'letter-spacing:.02em;text-shadow:var(--wd-startup-shadow,none)}',
    '.wd-startup-brand.wd-brand-settled{transform:translate3d(0,0,0)}',
    '.wd-startup-whale{position:absolute;z-index:1;display:block;left:50%;top:60%;',
    'width:min(112vw,178vh,2080px);height:auto;max-width:none;aspect-ratio:16/9;',
    'transform:translate3d(-50%,-50%,0);pointer-events:none;',
    'opacity:var(--wd-whale-opacity,.82);filter:var(--wd-whale-filter,none);',
    'mix-blend-mode:var(--wd-whale-blend,screen);backface-visibility:hidden;',
    'object-fit:contain;user-select:none;-webkit-user-drag:none}',
    '.wd-startup-icon{display:block;flex:none;width:2.30em;height:1.70em;overflow:visible;',
    'opacity:0;transform:translate3d(0,9px,0) scale(.92);',
    'animation:wd-logo-enter .69s cubic-bezier(.16,1,.3,1) .35s both}',
    '.wd-startup-icon.wd-in{opacity:1;transform:none}',
    '.wd-startup-title{display:flex;align-items:baseline;min-width:0;gap:clamp(8px,.8vw,13px)}',
    '.wd-startup-name{flex:none;font-weight:680;opacity:0;transform:translate3d(0,10px,0);',
    'animation:wd-name-enter .56s cubic-bezier(.16,1,.3,1) 1.09s both}',
    '.wd-startup-name.wd-in{opacity:1;transform:none}',
    '.wd-startup-phrase{display:inline-flex;align-items:baseline;white-space:nowrap;',
    'width:6em;flex:none;font-weight:490;letter-spacing:.025em}',
    '.wd-startup-piece{display:inline-flex;white-space:nowrap;overflow:hidden;',
    'vertical-align:baseline;padding:.14em 0 .12em;margin:-.14em 0 -.12em}',
    '.wd-startup-letter{display:inline-block;opacity:0;transform:translate3d(0,105%,0);',
    'animation:wd-letter-enter .55s cubic-bezier(.18,.82,.28,1) var(--wd-letter-delay,1750ms) both}',
    '.wd-startup-piece.wd-in .wd-startup-letter{opacity:1;transform:translate3d(0,0,0)}',
    // Only compositor-friendly opacity / transform animation; never animate filter or text-shadow.
    '@keyframes wd-brand-center{from{transform:translate3d(var(--wd-intro-offset,0px),0,0)}',
    'to{transform:translate3d(0,0,0)}}',
    '@keyframes wd-logo-enter{from{opacity:0;transform:translate3d(0,9px,0) scale(.92)}',
    'to{opacity:1;transform:translate3d(0,0,0) scale(1)}}',
    '@keyframes wd-name-enter{from{opacity:0;transform:translate3d(0,10px,0)}',
    'to{opacity:1;transform:translate3d(0,0,0)}}',
    '@keyframes wd-letter-enter{from{opacity:0;transform:translate3d(0,105%,0)}',
    'to{opacity:1;transform:translate3d(0,0,0)}}',
    '.wd-startup-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;',
    'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    '@media(max-width:620px){.wd-startup-brand{font-size:clamp(15px,3.8vw,22px);gap:7px}',
    '.wd-startup-brand{--wd-intro-offset:calc(50% - 33px)}',
    '.wd-startup-icon{width:66px;height:49px}',
    '.wd-startup-title{gap:6px}.wd-startup-phrase{letter-spacing:0}}',
    '@media(max-height:520px){.wd-startup-whale{width:min(112vw,178vh,2080px)}}',
    '@media(prefers-reduced-motion:reduce){.wd-startup-screen{transition-duration:.13s}',
    '.wd-startup-brand,.wd-startup-icon,.wd-startup-name,.wd-startup-letter{animation:none!important;',
    'transform:none!important;opacity:1!important}}'
  ].join('');

  function now() {
    try { return win.performance.now(); } catch (_) { return Date.now(); }
  }
  function reduceMotion() {
    try { return !!win.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }
  function storedEnabled() {
    // Host owns the persisted setting. localStorage is only for early fallback.
    if (boot && typeof boot.enabled === 'boolean') return boot.enabled;
    try { var raw = win.localStorage.getItem(KEY); if (raw !== null) return !/^(?:0|false|off)$/i.test(raw); }
    catch (_) {}
    return true;
  }
  function seen() {
    try { return win.sessionStorage.getItem(SEEN) === '1'; } catch (_) { return false; }
  }
  function markSeen() {
    try { win.sessionStorage.setItem(SEEN, '1'); } catch (_) {}
  }

  // Approximate the dominant centre color of a user-defined CSS gradient.
  // This is only a contrast hint; the actual background stays the user's own CSS.
  function parseColor(token) {
    var str = String(token).trim(), m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(str);
    if (m) {
      var hex = m[1];
      if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
      return [0,2,4].map(function(i){return parseInt(hex.slice(i,i+2),16);});
    }
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(str);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
  }
  function colorsOfGradient(gradient) {
    var matches = String(gradient || '').match(/#[\da-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || [];
    return matches.map(parseColor).filter(function(c){return c && c.every(Number.isFinite);});
  }
  function luminance(rgb) {
    return rgb ? (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255 : 0;
  }
  function themeStyle() {
    var gradient = boot && typeof boot.gradient === 'string' &&
      /^(?:linear|radial|conic)-gradient\(/i.test(boot.gradient) &&
      !/[<>;]/.test(boot.gradient) && !/url\(/i.test(boot.gradient) ? boot.gradient : '';
    var baseLight = boot && typeof boot.light === 'boolean' ? boot.light : false;
    var schemeLight = null;
    if (!boot || typeof boot.light !== 'boolean') {
      try {
        if (doc.body && doc.body.hasAttribute('data-ds-dark-theme')) schemeLight = false;
        else if (doc.body && doc.body.hasAttribute('data-ds-light-theme')) schemeLight = true;
        else if (doc.body) {
          var scheme = win.getComputedStyle(doc.body).colorScheme || '';
          if (/^dark/.test(scheme)) schemeLight = false;
          else if (/^light/.test(scheme)) schemeLight = true;
        }
      } catch (_) {}
    }
    var colors = colorsOfGradient(gradient);
    var light;
    if (colors.length) {
      // The middle stops control the brand's central reading area best.
      var start = Math.floor((colors.length-1)/2), end = Math.ceil((colors.length-1)/2);
      var mid = [0,1,2].map(function(i){return (colors[start][i]+colors[end][i])/2;});
      light = luminance(mid) >= .54;
    } else light = boot && typeof boot.light === 'boolean' ? baseLight : (schemeLight === null ? false : schemeLight);
    return {
      base: light ? '#f8f8f5' : '#0b0d12',
      ink: light ? '#151b24' : '#f3f6fb',
      eye: light ? '#f8f8f5' : '#0b0d12',
      shadow: light ? '0 0 10px rgba(255,255,255,.80),0 1px 3px rgba(255,255,255,.72)' : '0 0 11px rgba(10,11,17,.67),0 1px 3px rgba(0,0,0,.83)',
      glow: light ? 'rgba(16,26,43,.22)' : 'rgba(230,242,255,.42)',
      gradient: gradient || 'none'
    };
  }
  function applyTheme() {
    if (!state.overlay) return;
    var theme = themeStyle();
    var light = theme.base === '#f8f8f5';
    state.themeLight = light;
    // The first theme application chooses the matching pre-encoded media
    // before any filter is painted (avoid double inversion on light screens).
    if (!state.whale && state.lastTheme === '') state.mediaLight = light;
    // Pre-encoded light/dark assets avoid a full-frame per-video CSS inversion
    // on normal startup. Invert only when the theme changes in mid-playback.
    var invert = light !== state.mediaLight;
    var fingerprint = [theme.base,theme.gradient,invert].join('|');
    if (state.lastTheme === fingerprint) return;
    state.lastTheme = fingerprint;
    state.overlay.style.cssText =
      '--wd-startup-base:'+theme.base+';'+
      '--wd-startup-ink:'+theme.ink+';'+
      '--wd-startup-eye:'+theme.eye+';'+
      '--wd-startup-shadow:'+theme.shadow+';'+
      '--wd-startup-glow:'+theme.glow+';'+
      '--wd-startup-gradient:'+theme.gradient+';'+
      '--wd-whale-filter:'+(invert?'invert(1)':'none')+';'+
      '--wd-whale-blend:'+(light?'multiply':'screen')+';'+
      '--wd-whale-opacity:'+(light?'.70':'.82')+';';
  }

  // Passive one-shot video and long-task telemetry, no animation-frame polling.
  // Inspect via window.__WHALE_DREAM_STARTUP__.getMetrics() after a startup.
  function mediaLabel(value) {
    var url=String(value||'');
    return url.indexOf('data:')===0 ? '[inline preview resource]' : url.slice(0,256);
  }
  function markMetric(key) {
    if (state.metrics && state.started) state.metrics[key] = Math.round(now() - state.started);
  }
  function monitorStartup() {
    state.metrics = {
      version:'0.8.45', mode:'h264-dual-theme-css',
      startedAt:Math.round(now()), resource:'', theme:'',
      firstFrameMs:null, videoPlayingMs:null, loadMs:null,
      longTasks:0, blockedMs:0, maxLongTaskMs:0,
      videoFrames:0, droppedVideoFrames:0, effectiveFps:null,
      transferBytes:null, cacheHint:null, totalMs:null
    };
    try {
      if (!win.PerformanceObserver || !win.PerformanceObserver.supportedEntryTypes ||
          win.PerformanceObserver.supportedEntryTypes.indexOf('longtask') === -1) return;
      state.perfObserver = new win.PerformanceObserver(function(list) {
        if (!state.metrics) return;
        list.getEntries().forEach(function(entry) {
          if (entry.startTime < state.started || state.removed) return;
          state.metrics.longTasks++;
          state.metrics.blockedMs += Math.round(entry.duration);
          state.metrics.maxLongTaskMs = Math.max(state.metrics.maxLongTaskMs,Math.round(entry.duration));
        });
      });
      state.perfObserver.observe({entryTypes:['longtask']});
    } catch (_) { state.perfObserver = null; }
  }
  function finishMetrics() {
    if (!state.metrics) return;
    var data = state.metrics;
    data.totalMs = Math.round(now() - state.started);
    if (state.whale && state.whale.video) {
      try {
        var v = state.whale.video;
        var q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : null;
        if (q) {
          data.videoFrames=q.totalVideoFrames || 0;
          data.droppedVideoFrames=q.droppedVideoFrames || 0;
          if (data.videoFrames && v.currentTime > 0) data.effectiveFps=Math.round(
            (data.videoFrames-data.droppedVideoFrames)/v.currentTime*10)/10;
        }
      } catch (_) {}
    }
    try {
      var asset=data.resource;
      var perf = asset && win.performance.getEntriesByName(new URL(asset,doc.baseURI).href,'resource');
      if (perf && perf.length) {
        var r=perf[perf.length-1];
        data.transferBytes=r.transferSize;
        data.cacheHint=r.transferSize === 0 && r.decodedBodySize > 0 ? 'memory-or-disk-cache' : 'network-or-unknown';
      }
    } catch (_) {}
    try { doc.dispatchEvent(new CustomEvent('whale-dream:startup-metrics',{detail:{...data}})); } catch (_) {}
  }

  // The 5.7s source timeline is resampled offline to a single 24fps H.264 file.
  // No per-frame JS animation, WebP decoding or canvas redraws on the normal path.
  function attachStartupPixelWhale(overlay) {
    var darkAsset = boot && typeof boot.assetUrl === 'string' && boot.assetUrl ? boot.assetUrl : WHALE_ASSET;
    var lightAsset = boot && typeof boot.lightAssetUrl === 'string' && boot.lightAssetUrl ? boot.lightAssetUrl : WHALE_LIGHT_ASSET;
    var fallbackAsset = boot && typeof boot.fallbackAssetUrl === 'string' && boot.fallbackAssetUrl ? boot.fallbackAssetUrl : WHALE_FALLBACK;
    var staticAsset = boot && typeof boot.staticAssetUrl === 'string' && boot.staticAssetUrl ? boot.staticAssetUrl : WHALE_ASSET;
    var staticLightAsset = boot && typeof boot.staticLightAssetUrl === 'string' && boot.staticLightAssetUrl ? boot.staticLightAssetUrl : WHALE_LIGHT_ASSET;
    var staticFallback = boot && typeof boot.staticFallbackAssetUrl === 'string' && boot.staticFallbackAssetUrl ? boot.staticFallbackAssetUrl : WHALE_FALLBACK;
    state.mediaLight = state.themeLight;
    var asset = state.mediaLight ? lightAsset : darkAsset;
    // DSH Desktop's dsh-app:// index may not proxy Host API routes; preserve
    // its stable plugin-asset mapping without an avoidable first 404.
    var desktopAssets = false;
    try {desktopAssets = /^(?:dsh-app:|file:)$/i.test(win.location.protocol);}catch(_){}
    if (desktopAssets && asset.indexOf('/whale-dream/api/startup/')===0)
      asset = state.mediaLight ? staticLightAsset : staticAsset;
    if (desktopAssets && fallbackAsset.indexOf('/whale-dream/api/startup/')===0)
      fallbackAsset = staticFallback;
    var video = element('video','wd-startup-whale');
    var fallback = null;
    var disposed = false, failed = false, usingFallback = false;
    var timeout = null, frameId = null, triedStatic = false, triedFallbackStatic = false;
    if (state.metrics) { state.metrics.resource=mediaLabel(asset);state.metrics.theme=state.mediaLight?'light':'dark'; }
    video.setAttribute('aria-hidden','true');
    video.setAttribute('playsinline','');
    video.setAttribute('webkit-playsinline','');
    video.setAttribute('muted','');
    video.setAttribute('preload','auto');
    video.setAttribute('disablepictureinpicture','');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disableRemotePlayback = true;
    video.loop = false;
    video.controls = false;
    overlay.insertBefore(video,overlay.firstChild);
    function failToImage() {
      if (disposed || usingFallback) return;
      // DSH Desktop may ship a different media URL mapping. Retry the existing
      // plugin asset route once before engaging the CPU-decoded WebP fallback.
      if(!triedStatic && asset.indexOf('/whale-dream/api/startup/') === 0){
        triedStatic = true;
        asset = state.mediaLight ? staticLightAsset : staticAsset;
        if(state.metrics)state.metrics.resource=mediaLabel(asset);
        try {
          video.src=asset;
          var retry=video.play();
          if(retry && retry.catch)retry.catch(function(){if(!disposed)failToImage();});
          if(timeout!==null)win.clearTimeout(timeout);
          timeout=win.setTimeout(function(){if(!disposed && video.readyState<2)failToImage();},1800);
          return;
        } catch(_) { /* fall through to low-FPS WebP */ }
      }
      usingFallback = true;
      if (timeout !== null) {win.clearTimeout(timeout); timeout=null;}
      video.onplaying = video.onerror = video.onloadeddata = null;
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');video.load();video.remove();
      // Low-FPS / 640x360 fallback keeps the whale animated while bounding CPU.
      var img = element('img','wd-startup-whale');
      img.setAttribute('aria-hidden','true'); img.setAttribute('alt','');
      img.setAttribute('decoding','async');img.setAttribute('loading','eager');
      img.draggable = false;
      img.onload = function() {if(!disposed)overlay.dataset.wdWhale='fallback-low-fps-webp';};
      img.onerror = function() {
        if(disposed)return;
        if(!triedFallbackStatic && fallbackAsset !== staticFallback){
          triedFallbackStatic=true;
          img.src=staticFallback;
          if(state.metrics)state.metrics.resource=mediaLabel(staticFallback);
          return;
        }
        failed=true;overlay.dataset.wdWhale='fallback-missing';img.remove();
      };
      fallback=img;
      state.mediaLight = false; // fallback is encoded with a dark matte
      applyTheme();
      overlay.insertBefore(img,overlay.firstChild);
      img.src=fallbackAsset;
      if(state.metrics)state.metrics.resource=mediaLabel(fallbackAsset);
    }
    video.onloadeddata = function() {if(!disposed)markMetric('loadMs');};
    video.onplaying = function() {
      if(disposed)return;
      overlay.dataset.wdWhale='native-video';
      markMetric('videoPlayingMs');
      if(timeout!==null){win.clearTimeout(timeout); timeout=null;}
      if (typeof video.requestVideoFrameCallback === 'function') {
        frameId=video.requestVideoFrameCallback(function(){
          frameId=null;if(!disposed)markMetric('firstFrameMs');
        });
      } else markMetric('firstFrameMs');
    };
    video.onerror = failToImage;
    if (!video.canPlayType || !video.canPlayType('video/mp4')) failToImage();
    else {
      video.src=asset;
      try {
        var playing=video.play();
        if (playing && typeof playing.catch === 'function') playing.catch(function(){
          // Chromium sometimes rejects autoplay before the first ready event.
          // One retry on canplay avoids accidentally loading the larger fallback.
          if(disposed || usingFallback)return;
          if(video.readyState>=2){
            try {var retry=video.play();if(retry && retry.catch)retry.catch(failToImage);}catch(_){failToImage();}
          } else { video.addEventListener('canplay',function(){
            if(disposed || usingFallback)return;
            try {var again=video.play();if(again && again.catch)again.catch(failToImage);}catch(_){failToImage();}
          },{once:true}); }
        });
      } catch (_) {failToImage();}
      timeout=win.setTimeout(function() {
        if(!disposed && !usingFallback && video.readyState<2)failToImage();
      },2200);
    }
    return {
      get failed(){return failed;},
      get loading(){return !disposed && !usingFallback && video.readyState<2;},
      video:video,
      dispose:function() {
        disposed=true;
        if(timeout!==null){win.clearTimeout(timeout);timeout=null;}
        if(frameId!==null && video.cancelVideoFrameCallback)try{video.cancelVideoFrameCallback(frameId);}catch(_){}
        video.onplaying=video.onerror=video.onloadeddata=null;
        try{video.pause();}catch(_){}
        video.removeAttribute('src');video.remove();
        if(fallback){fallback.onload=fallback.onerror=null;fallback.removeAttribute('src');fallback.remove();fallback=null;}
      }
    };
  }
function svgElement(tag, attrs) {
    var el = doc.createElementNS(NS, tag);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  }
  function makeWhaleIcon() {
    // Exact FISH_LOGO_PATH from DSH new-conversation HeroFish fallback.
    // Source: packages/client/ui-primitives/src/FishLogo.tsx
    // The geometry is unchanged; only the SVG fill inherits currentColor.
    // No added eye, mask, circle, border, rectangle or container background.
    var svg = svgElement('svg', {
      class: 'wd-startup-icon', viewBox: '0 0 23.16 17.04',
      'preserveAspectRatio': 'xMidYMid meet',
      'aria-hidden': 'true', focusable: 'false'
    });
    svg.appendChild(svgElement('path', {
      d: "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z",
      fill: 'currentColor'
    }));
    return svg;
  }
  function element(tag, cls, text) {
    var el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function makeStage(letters, startMs) {
    var group = element('span', 'wd-startup-piece');
    Array.from(letters).forEach(function(char, i) {
      var cell = element('span', 'wd-startup-letter', char);
      cell.style.setProperty('--wd-letter-delay', (startMs + i * 82) + 'ms');
      group.appendChild(cell);
    });
    return group;
  }
  function buildBrand() {
    var brand = element('div', 'wd-startup-brand');
    brand.setAttribute('role', 'img');
    brand.setAttribute('aria-label', '鲸梦 探索未至之境');
    var icon = makeWhaleIcon();
    var title = element('div', 'wd-startup-title');
    title.setAttribute('aria-hidden', 'true');
    var name = element('span', 'wd-startup-name', '鲸梦');
    var phrase = element('span', 'wd-startup-phrase');
    var steps = [makeStage('探索', TIMING.phrase1), makeStage('未至', TIMING.phrase2), makeStage('之境', TIMING.phrase3)];
    steps.forEach(function(step){ phrase.appendChild(step); });
    title.appendChild(name);
    title.appendChild(phrase);
    brand.appendChild(icon);
    brand.appendChild(title);
    return { brand:brand, icon:icon, name:name, pieces:steps };
  }
  function later(ms, handler) {
    var id = win.setTimeout(function(){
      state.timers = state.timers.filter(function(other){return other !== id;});
      if (!state.removed && state.overlay && !state.closing) handler();
    }, ms);
    state.timers.push(id);
  }
  function clearTimers() {
    state.timers.forEach(function(id){win.clearTimeout(id);});
    state.timers = [];
  }
  function cleanup() {
    if (state.removed) return;
    state.removed = true;
    clearTimers();
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    finishMetrics();
    if (state.perfObserver) { state.perfObserver.disconnect(); state.perfObserver=null; }
    if (state.whale) { state.whale.dispose(); state.whale = null; }
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('visibilitychange', onVisibility, true);
    if (state.overlay && state.overlay.parentNode) state.overlay.parentNode.removeChild(state.overlay);
    if (state.style && state.style.parentNode) state.style.parentNode.removeChild(state.style);
    state.overlay = null;
    state.style = null;
    state.closing = false;
    try { doc.dispatchEvent(new CustomEvent('whale-dream:startup-complete')); } catch (_) {}
  }
  function dismiss() {
    if (state.removed || !state.overlay || state.closing) return;
    markSeen();
    state.closing = true;
    clearTimers();
    state.overlay.classList.add('wd-startup-exit');
    var ms = reduceMotion() ? 130 : 290;
    state.timers.push(win.setTimeout(cleanup, ms));
  }
  function onKey(event) {
    if (event.key === 'Escape' || event.key === 'Esc') dismiss();
  }
  function onVisibility() {
    if (doc.visibilityState === 'hidden') cleanup();
  }
  function start(force) {
    if (state.overlay && !state.removed) return true;
    if (!force && (!storedEnabled() || seen())) return false;
    if (!doc.body) return false;
    state.removed = false;
    state.closing = false;
    state.started = now();
    state.lastTheme = '';
    monitorStartup();
    var style = element('style');
    style.dataset.wdStartupStyle = 'brand';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
    state.style = style;
    var overlay = element('div', 'wd-startup-screen');
    overlay.dataset.wdStartupCurtain = '1';
    var view = buildBrand();
    overlay.appendChild(view.brand);
    overlay.addEventListener('click', function(ev){ if (ev.target === overlay) dismiss(); });
    doc.body.appendChild(overlay);
    state.overlay = overlay;
    // Compositor-only calc(50% - half logo width); no startup layout flush.
    applyTheme();
    state.whale = reduceMotion() ? null : attachStartupPixelWhale(overlay);
    markSeen();
    if (win.MutationObserver) {
      state.observer = new win.MutationObserver(applyTheme);
      state.observer.observe(doc.body, { attributes:true,
        attributeFilter:['data-ds-dark-theme','data-ds-light-theme'] });
    }
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('visibilitychange', onVisibility, true);
    if (reduceMotion()) {
      later(1300, dismiss);
    } else {
      // Logo / name / three-stage phrase are CSS compositor-timed. Main-thread
      // setTimeout callbacks no longer gate each animation stage during DSH boot.
      later(5170, function(){ if (state.whale && state.whale.failed) dismiss(); });
      later(TIMING.fade, dismiss);
    }
    // Hard fail-open: even throttled timers cannot permanently block DSH.
    later(TIMING.duration + 1650, cleanup);
    return true;
  }
  function setEnabled(next) {
    state.enabled = !!next;
    if (boot && typeof boot === 'object') boot.enabled = state.enabled;
    try { win.localStorage.setItem(KEY, state.enabled ? 'true' : 'false'); } catch (_) {}
    if (!state.enabled && state.overlay) dismiss();
    // Enabling during an existing conversation does not interrupt the user;
    // the next application launch gets the brand reveal.
  }

  state.enabled = storedEnabled();
  win.__WHALE_DREAM_STARTUP__ = {
    start: start,
    skip: dismiss,
    setEnabled: setEnabled,
    get active() { return !!state.overlay && !state.removed; },
    get enabled() { return state.enabled; },
    get elapsed() { return state.started ? Math.max(0, now() - state.started) : 0; },
    get rows() { return 0; },
    get renderMode() { return 'h264-dual-theme-css-idle-gated'; },
    getMetrics: function(){return state.metrics ? JSON.parse(JSON.stringify(state.metrics)) : null;} 
  };
  if (doc.body) start(false);
  else if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function(){start(false);}, {once:true});
})(window,document);
