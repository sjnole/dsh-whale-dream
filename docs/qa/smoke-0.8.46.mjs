/** Whale Dream 0.8.45 performance+startup contract, including a real HTTP media roundtrip. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {bootScript,indexRows,injectStartup,readStartupBoot} from '../../lib/startup/host.mjs';
import {apply as applyHost} from '../../lib/dream-host.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=x=>readFileSync(join(root,x),'utf8');
const boot=read('lib/startup/boot.js');
const client=read('lib/client.js');
const host=read('lib/startup/host.mjs');
const serverSrc=read('lib/dream-host.js');
const meta=JSON.parse(read('package.json'));
const videos=['whale-glyph-startup-00fd90a10cd5.mp4','whale-glyph-light-cdc6dd72a4f0.mp4'];
const fallback='whale-glyph-fallback-f1243389174d.webp';
const clip=n=>readFileSync(join(root,'lib/assets',n));
const html='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const config={enabled:true,skin:'nebula',light:false,gradient:'radial-gradient(circle,#111,#222)'};

test('package and version are consistent',()=>{
 assert.equal(meta.version,'0.8.46'); assert.equal(meta.name,'dsh-whale-dream');
 assert.equal(meta.exports['./assets/*'],'./lib/assets/*');
 assert.ok(meta.files.includes('lib'));
});
test('three hashed assets exist, compressed fallback, native video faststart',()=>{
 for(const f of videos){const b=clip(f);assert.ok(b.length<500000);assert.equal(b.toString('ascii',4,8),'ftyp');
  assert.ok(b.indexOf(Buffer.from('moov'))<b.indexOf(Buffer.from('mdat'))); }
 const b=clip(fallback);assert.ok(b.length<450000);assert.equal(b.toString('ascii',0,4),'RIFF');
});
test('startup has no per-frame canvas, JS animation loop, or forced layout reads',()=>{
 for(const expr of [/\.requestAnimationFrame\s*\(/,/\.getContext\s*\(/,/\.drawImage\s*\(/,/\.getBoundingClientRect\s*\(/])assert.doesNotMatch(boot,expr);
 assert.match(boot,/--wd-intro-offset:calc\(50% - 1\.15em\)/);
 assert.match(boot,/--wd-intro-offset:calc\(50% - 33px\)/);
 assert.match(boot,/\bPerformanceObserver\b/);
 assert.match(boot,/getVideoPlaybackQuality/);
 assert.match(boot,/getMetrics:/);
});
test('brand timing, logo geometry, centered layout and larger whale remain intact',()=>{
 for(const token of ['display:grid;place-items:center','left:50%;top:60%','width:min(112vw,178vh,2080px)','@keyframes wd-logo-enter','@keyframes wd-name-enter','@keyframes wd-letter-enter','makeStage(\'探索\', TIMING.phrase1)','makeStage(\'未至\', TIMING.phrase2)','makeStage(\'之境\', TIMING.phrase3)'])assert.ok(boot.includes(token),token);
 assert.ok(!boot.includes('wd-startup-separator'));
 assert.ok(boot.includes("brand.setAttribute('aria-label', '鲸梦 探索未至之境')"));
 assert.ok(!boot.includes('×'));
 const fish=read('assets/hero-fish-startup.svg').match(/<path d="([^"]+)"/)[1];
 assert.ok(boot.includes(JSON.stringify(fish)));
});
test('media path chooses dual-color H264 and low-FPS animated fallback',()=>{
 for(const f of [...videos,fallback])assert.ok(boot.includes(f),f);
 assert.ok(boot.includes('state.mediaLight = state.themeLight'));
 assert.ok(boot.includes("'multiply':'screen'"));
 assert.ok(boot.includes("(invert?'invert(1)':'none')"));
 assert.ok(boot.includes("overlay.dataset.wdWhale='fallback-low-fps-webp'"));
 assert.ok(boot.includes('video.requestVideoFrameCallback'));
 assert.ok(boot.includes('video.canPlayType'));
 assert.ok(boot.includes('video.play()'));
});
test('media failure gracefully retries plugin asset static route then WebP',()=>{
 for(const name of ['staticAssetUrl','staticLightAssetUrl','staticFallbackAssetUrl'])assert.ok(boot.includes(name));
 assert.ok(boot.includes('triedStatic = true'));
 assert.ok(boot.includes('triedFallbackStatic=true'));
 assert.ok(boot.includes("overlay.dataset.wdWhale='fallback-missing'"));
 assert.ok(boot.includes('video.pause()'));
 assert.ok(boot.includes('video.cancelVideoFrameCallback'));
});
test('passive telemetry counts long tasks and native decoded/dropped video frames',()=>{
 for(const word of ['longTasks:0','blockedMs:0','maxLongTaskMs:0','firstFrameMs:null','transferBytes:null','cacheHint:null','whale-dream:startup-metrics'])assert.ok(boot.includes(word));
 assert.doesNotMatch(boot,/setInterval\s*\(/);
});
test('client heavy Canvas/mutation observers deferred until overlay removed',()=>{
 const a=client.indexOf('function mountBackgrounds(getSettings) {');const b=client.indexOf('// src/settings/daily-random.mjs',a);
 const bg=client.slice(a,b);
 for(const word of ['const startupGate','function enableBackgrounds()','whale-dream:startup-complete','resumeFromSplash','if (window.__WHALE_DREAM_STARTUP__?.active) return','document.head.append(style)','observer.observe(document.body'])assert.ok(bg.includes(word),word);
 assert.ok(bg.indexOf('document.head.append(style)')>bg.indexOf('function enableBackgrounds()'));
 assert.ok(bg.indexOf('observer.observe(document.body')>bg.indexOf('function enableBackgrounds()'));
 assert.ok(client.includes('let heroTitle = null, heroDisposed = false'));
});
test('settings toggle scans only relevant appearance subtree and delays unnecessary GET',()=>{
 assert.ok(client.includes('function relevantChange(records)'));
 assert.ok(client.includes("target.closest?.('.wd-appearance-home')"));
 assert.ok(client.includes('if(!loadedHost){loadedHost=true;void readHost();}'));
});
test('host boot script shared in memory, service media cache and correct config',()=>{
 assert.ok(host.includes('const BOOT_SOURCE=readFileSync(bootFile'));
 assert.ok(host.includes('script=BOOT_SOURCE'));
 const script=bootScript(config);
 for(const f of [...videos,fallback])assert.ok(script.includes(f),f);
 assert.ok(script.includes('/whale-dream/api/startup/'));
 const injected=injectStartup(html,config);
 assert.equal((injected.match(/data-wd-startup="boot"/g)||[]).length,1);
 assert.equal(injectStartup(injected,config),injected);
 assert.equal(indexRows(config).length,2);
 assert.ok(!injectStartup(html,{...config,enabled:false}).includes('data-wd-startup="boot"'));
});
test('Host serves only whitelisted, immutable byte-range content with trust fence',async()=>{
 let handle;
 const ctx={get:()=>undefined,effect(fn){return fn();},webServer:{register(route){handle=route.handler;return()=>{};}}};
 applyHost(ctx);
 assert.equal(typeof handle,'function');
 const server=createServer((req,res)=>handle(req,res));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}/whale-dream/api/startup/`;
 try{
  const f=videos[0];
  let r=await fetch(base+f);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/immutable/);
  assert.equal(r.headers.get('content-type'),'video/mp4');
  assert.equal(Number(r.headers.get('content-length')),clip(f).length);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(clip(f)));
  const etag=r.headers.get('etag');
  r=await fetch(base+f,{headers:{'Range':'bytes=0-15'}});
  assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,16);assert.match(r.headers.get('content-range'),/^bytes 0-15\//);
  r=await fetch(base+f,{headers:{'If-None-Match':etag}});assert.equal(r.status,304);
  r=await fetch(base+f,{headers:{'Range':'bytes=99999999-99999999'}});assert.equal(r.status,416);
  r=await fetch(base+'../package.json');assert.notEqual(r.status,200);
  r=await fetch(base+f,{headers:{Origin:'https://not-authorized.test'}});assert.equal(r.status,403);
  r=await fetch(base+fallback);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');
  assert.equal((await r.arrayBuffer()).byteLength,clip(fallback).length);
 }finally{server.close(); await once(server,'close');}
});
for(const skin of ['abyss','aurora','nebula','ember','midnight','ivory','mist','rose']){
 test(`original ${skin} inherits into the early curtain`,()=>{
  const home=mkdtempSync(join(tmpdir(),'wd-0845-'+skin+'-'));
  writeFileSync(join(home,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const cfg=readStartupBoot(home);
  assert.equal(cfg.skin,skin);
  assert.equal(cfg.light,['ivory','mist','rose'].includes(skin));
  assert.match(cfg.gradient,/gradient\(/);
 });
}
test('boot IIFE is identical in early injection and client fallback',()=>{
 const a=client.indexOf('/* Whale Dream 0.8.45');const b=client.indexOf('})(window,document);',a)+'})(window,document);'.length;
 assert.equal(client.slice(a,b),boot.trim());
});
test('non-startup modules and feature symbols remain',()=>{
 for(const f of ['lib/index.js','lib/info/index.js','lib/info/accounting.js','lib/startup/atlas.mjs'])assert.ok(read(f).length>100);
 for(const s of ['applyRing(ctx','applyInfo(ctx','createProfilesController','mountHeroTitle','createSettingsController','sj-reasoning-ring'])assert.ok(client.includes(s),s);
 assert.ok(serverSrc.includes('FolderImage'));
});
test('background idle resume and reasoning ring observers wait for curtain',()=>{
 const a=client.indexOf('function mountBackgrounds(getSettings) {');
 const b=client.indexOf('// src/settings/daily-random.mjs',a);
 const bg=client.slice(a,b);
 assert.ok(bg.includes('requestIdleCallback(enableBackgrounds,{timeout:420})'));
 assert.ok(bg.includes('cancelIdleCallback(resumeTimer)'));
 const r=client.indexOf('function applyRing(ctx, options = {}) {');
 const e=client.indexOf('// src/settings/PaletteEditor.tsx',r);
 const ring=client.slice(r,e);
 assert.ok(ring.includes('function activateRing()'));
 assert.ok(ring.includes('if (window.__WHALE_DREAM_STARTUP__?.active) return;'));
 assert.ok(ring.includes("document.addEventListener('whale-dream:startup-complete',onRingStartupComplete"));
 assert.ok(ring.indexOf('observer.observe(document.body') > ring.indexOf('function activateRing()'));
 assert.ok(ring.includes('setTimeout(activateRing,110)'));
});
