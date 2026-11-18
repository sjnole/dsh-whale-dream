/** 0.8.43 startup performance hotfix: structural and Host delivery regression. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, injectStartup, readStartupBoot, bootScript, paintCss } from '../../lib/startup/host.mjs';
const pkg=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read=p=>readFileSync(join(pkg,p),'utf8');
const boot=read('lib/startup/boot.js'), client=read('lib/client.js');
const info=JSON.parse(read('package.json'));
const originalFishPath=read('assets/hero-fish-startup.svg').match(/<path d="([^"]+)"/)[1];
const asset='whale-glyph-startup-36bbc859efa8.webp';
const assetBytes=readFileSync(join(pkg,'lib/assets',asset));
const base={enabled:true,light:false,skin:'nebula',gradient:'linear-gradient(110deg,#11111d,#272639)'};
const template='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
test('version, export and asset packaging',()=>{
 assert.equal(info.version,'0.8.43'); assert.equal(info.name,'dsh-whale-dream');
 assert.equal(info.exports['./assets/*'],'./lib/assets/*');
 assert.ok(info.files.includes('lib'));
 assert.equal(assetBytes.toString('ascii',0,4),'RIFF');
 assert.equal(assetBytes.toString('ascii',8,12),'WEBP');
 assert.ok(assetBytes.length<2_000_000 && assetBytes.length>100_000);
});
test('no runtime canvas, requestAnimationFrame, or heavy font generation on startup',()=>{
 assert.doesNotMatch(boot,/\.getContext\s*\(|\.drawImage\s*\(|\.fillText\s*\(|\.requestAnimationFrame\s*\(/);
 assert.doesNotMatch(boot,/data:image\/webp;base64/);
 assert.ok(boot.includes("var whale = element('img', 'wd-startup-whale')"));
 assert.ok(boot.includes("whale.setAttribute('decoding', 'async')"));
 assert.ok(boot.includes('animated-webp-no-canvas'));
});
test('same original FishLogo path, eye cut-out and viewBox',()=>{
 assert.ok(boot.includes(JSON.stringify(originalFishPath)));
 assert.ok(boot.includes("viewBox: '0 0 23.16 17.04'"));
 assert.ok(boot.includes("fill: 'currentColor'"));
 assert.ok(!boot.includes("svgElement('mask'") && !boot.includes("svgElement('circle'"));
});
test('brand is centered on both axes, animated whale enlarged as a back layer',()=>{
 assert.ok(boot.includes('display:grid;place-items:center'));
 assert.ok(boot.includes('translate3d(var(--wd-intro-offset,0px),0,0)'));
 assert.ok(boot.includes('.wd-startup-brand.wd-brand-settled{transform:translate3d(0,0,0)}'));
 assert.ok(!boot.includes('-28vh'));
 assert.ok(boot.includes('width:min(90vw,144vh,1600px)'));
 assert.ok(boot.includes('left:50%;top:57%'));
 assert.ok(boot.includes('z-index:1;display:block'));
 assert.ok(boot.includes('z-index:2;display:flex'));
});
test('logo reveal precedes name and progressive three-stage text, retains original phrase',()=>{
 for(const text of ['icon: 350','name: 1090','phrase1: 1750','phrase2: 2470','phrase3: 3300',"makeStage('探索', 0)","makeStage('未至', 2)","makeStage('之境', 4)"])
  assert.ok(boot.includes(text),text);
 assert.ok(boot.includes('鲸梦×探索未至之境'));
});
test('Host startup script stops duplicating large atlas base64',()=>{
 const text=bootScript(base,boot);
 assert.ok(text.length<30_000,`size=${text.length}`);
 assert.ok(text.includes('assetUrl'));
 assert.ok(text.includes(asset));
 assert.ok(!text.includes('atlasDataUri'));
 assert.ok(!text.includes('data:image/webp;base64'));
});
test('Host web and Desktop structured startup, no duplicate or disabled injection',()=>{
 const html=injectStartup(template,base,boot);
 assert.equal((html.match(/data-wd-startup="boot"/g)||[]).length,1);
 assert.equal(injectStartup(html,base,boot),html);
 assert.ok(indexRows(base,boot).length===2);
 assert.ok(indexRows(base,boot)[1].text.includes(asset));
 const disabled=injectStartup(template,{...base,enabled:false},boot);
 assert.ok(disabled.includes('data-wd-startup="config"'));
 assert.ok(!disabled.includes('data-wd-startup="boot"'));
 assert.match(paintCss(base),/data-dsh-boot/);
});
test('asset load failure and ESC leave the brand and DSH usable',()=>{
 for(const text of ["whale.onerror = function()", "overlay.dataset.wdWhale = 'fallback'",'whale.remove();',"event.key === 'Escape'",'later(TIMING.fade, dismiss)','later(TIMING.duration + 1650, cleanup)','whale.onload = whale.onerror = null','win.sessionStorage.setItem(SEEN'])
  assert.ok(boot.includes(text),text);
});
test('host-client startup fallback is byte-for-byte identical',()=>{
 const start=client.indexOf('/* Whale Dream 0.8.43 — centered brand');
 const end=client.indexOf('})(window,document);',start)+'})(window,document);'.length;
 assert.ok(start>=0);
 assert.equal(client.slice(start,end),boot.trim());
});
test('unchanged behavior modules are still installed',()=>{
 for(const f of ['lib/index.js','lib/dream-host.js','lib/info/index.js','lib/info/accounting.js','lib/startup/atlas.mjs'])assert.ok(read(f).length>100);
 assert.ok(client.includes('sj-reasoning-ring')||client.includes('sj-ring')||client.includes('reasoning-ring'));
});
for(const skin of ['abyss','aurora','nebula','ember','midnight','ivory','mist','rose']){
 test(`preset theme ${skin} survives cold launch`,()=>{
  const home=mkdtempSync(join(tmpdir(),'wd-0843-'+skin+'-'));
  writeFileSync(join(home,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const cfg=readStartupBoot(home);
  assert.equal(cfg.skin,skin);
  assert.equal(cfg.light,['ivory','mist','rose'].includes(skin));
  assert.match(cfg.gradient,/gradient\(/);
 });
}
