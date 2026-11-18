/** Whale Dream 0.8.41 — original logo + atlas-driven PixelWhale startup integration. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, injectStartup, readStartupBoot, paintCss, bootScript } from '../../lib/startup/host.mjs';
import { readOfficialWhaleAtlas, officialWhaleAtlasDataUrl } from '../../lib/startup/atlas.mjs';
const pkg=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const boot=readFileSync(join(pkg,'lib/startup/boot.js'),'utf8');
const client=readFileSync(join(pkg,'lib/client.js'),'utf8');
const logo=readFileSync(join(pkg,'assets/hero-fish-startup.svg'),'utf8');
const heroPath=logo.match(/<path d="([^"]+)"/)[1];
const manifest=JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));
const initial='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const on={enabled:true,skin:'nebula',light:false,gradient:'linear-gradient(135deg,#11111b,#24243a)'};
const off={...on,enabled:false};

test('version and identity reflect an upgrade, with unchanged integration name',()=>{
 assert.equal(manifest.version,'0.8.41');assert.equal(manifest.name,'dsh-whale-dream');
 assert.ok(manifest.files.includes('lib'));
});
test('original FishLogo path and viewBox are still intact',()=>{
 assert.ok(heroPath.startsWith('M22.9168 1.43018'));
 assert.ok(heroPath.endsWith('15.1415 9.79893Z'));
 assert.ok(boot.includes(JSON.stringify(heroPath)));
 assert.ok(boot.includes("viewBox: '0 0 23.16 17.04'"));
 assert.ok(boot.includes("fill: 'currentColor'"));
 for(const forbidden of ["svgElement('rect'","svgElement('circle'","svgElement('mask'","wd-whale-eye-cutout"])
   assert.ok(!boot.includes(forbidden),forbidden);
});
test('brand retains the complete phrase with multiplication sign and original grouped reveal',()=>{
 for(const phrase of ['鲸梦×探索未至之境', "var separator = element('span', 'wd-startup-separator', '×')", "makeStage('探索', 0)", "makeStage('未至', 2)", "makeStage('之境', 4)"])
   assert.ok(boot.includes(phrase),phrase);
 assert.ok(!boot.includes('预览版'));
});
test('official atlas geometry, frame rate, duration, code fill and sprite channels remain',()=>{
 for(const text of ['width: 192, height: 108, columns: 12, frames: 137', 'frameRate: 24, rippleDurationMs: 5700', 'activeOpacity: 0.65, fontSize: 7', 'art.phrases', "source.height !== A.height * Math.ceil(A.frames / A.columns)", 'pixels[src + 1]', 'pixels[offset] / 255', "ctx.globalCompositeOperation = 'destination-in'"])
   assert.ok(boot.includes(text),text);
});
test('automatic playback is inside the startup, with original logo and canvas separate',()=>{
 for(const text of ["className", "var canvas = element('canvas', 'wd-startup-whale')", "state.whale = reduceMotion() ? null : attachStartupPixelWhale(overlay)", "overlay.insertBefore(canvas, overlay.firstChild)", "brand.setAttribute('aria-label', '鲸梦×探索未至之境')"])
   assert.ok(boot.includes(text),text);
 assert.ok(boot.includes('sceneWidth = Math.min(officialWidth, height * 0.64'));
 assert.ok(boot.includes('top = height * 0.32'));
 assert.ok(boot.includes('opacity:.18;filter:grayscale(1)'));
});
test('startup lifecycle includes Esc, click-to-skip, reduced-motion, frame and resize cleanup',()=>{
 for(const text of ['if (reduceMotion())', "event.key === 'Escape'", "if (ev.target === overlay) dismiss()", "state.whale.dispose()", 'win.cancelAnimationFrame(frameId)', 'win.removeEventListener(\'resize\'', 'image.onload = image.onerror = null', 'later(TIMING.duration + 1650, cleanup)', 'whale-dream:startup-complete'])
   assert.ok(boot.includes(text),text);
 assert.ok(!boot.includes('即将进入首页'));
});
test('official atlas may be located explicitly and is sent into boot as a data URL',()=>{
 const folder=mkdtempSync(join(tmpdir(),'wd-atlas-'));
 const path=join(folder,'breach-atlas.webp');
 const fake=Buffer.alloc(128,0);fake.write('RIFF',0,'ascii');fake.write('WEBP',8,'ascii');
 writeFileSync(path,fake);
 process.env.DSH_WHALE_ATLAS=path;
 try{
  assert.deepEqual(readOfficialWhaleAtlas(),fake);
  assert.ok(officialWhaleAtlasDataUrl().startsWith('data:image/webp;base64,') );
  const text=bootScript(on,boot);
  assert.ok(text.includes('atlasDataUri'));
  assert.ok(text.includes(fake.toString('base64')));
 } finally {delete process.env.DSH_WHALE_ATLAS;}
});
test('Web index injection and Desktop structured rows both include enabled startup',()=>{
 const page=injectStartup(initial,on,boot);
 assert.equal(injectStartup(page,on,boot),page);
 assert.equal((page.match(/data-wd-startup="boot"/g)||[]).length,1);
 assert.ok(page.includes('atlasDataUri'));
 assert.equal(indexRows(on,boot).length,2);
 assert.ok(indexRows(on,boot)[1].text.includes('attachStartupPixelWhale'));
 const disabled=injectStartup(initial,off,boot);
 assert.ok(disabled.includes('data-wd-startup="config"'));
 assert.ok(!disabled.includes('data-wd-startup="boot"'));
});
test('original 8 theme palettes and custom gradients are retained',()=>{
 for(const skin of ['abyss','aurora','nebula','ember','midnight','ivory','mist','rose']) {
  const h=mkdtempSync(join(tmpdir(),'wd41-'+skin+'-'));
  writeFileSync(join(h,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const b=readStartupBoot(h);assert.equal(b.skin,skin);assert.match(b.gradient,/gradient\(/);
  assert.equal(b.light,['ivory','mist','rose'].includes(skin));
 }
 const h=mkdtempSync(join(tmpdir(),'wd41-custom-'));
 const gradient='linear-gradient(120deg,#f9f5f0,#dbe5ee)';
 writeFileSync(join(h,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:wallpaper-kind':'gradient','dsh-dream-skin:wallpaper-gradient':gradient}));
 assert.equal(readStartupBoot(h).gradient,gradient);
});
test('Host and client fallback startup script are exactly the same',()=>{
 const begin=client.indexOf('/* Whale Dream 0.8.41 — original FishLogo brand plus official PixelWhale startup.');
 const end=client.indexOf('})(window,document);',begin)+'})(window,document);'.length;
 assert.ok(begin>0);
 assert.equal(client.slice(begin,end),boot.trim());
});
test('original theme, SJ ring, info bar, host entry are still packaged',()=>{
 assert.ok(client.includes('--dsw-specific-sidebar-fill: rgba(0,0,0,0) !important;'));
 assert.match(paintCss(on),/data-dsh-boot/);
 for(const file of ['lib/index.js','lib/dream-host.js','lib/info/index.js','lib/info/accounting.js'])
  assert.ok(readFileSync(join(pkg,file),'utf8').length>100);
 assert.ok(client.includes('sj-reasoning-ring')||client.includes('sj-ring')||client.includes('reasoning-ring'));
});
