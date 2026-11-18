/** Whale Dream 0.8.44 — CPU-friendly startup performance + visual contracts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, injectStartup, readStartupBoot, bootScript, paintCss } from '../../lib/startup/host.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read=f=>readFileSync(join(root,f),'utf8');
const boot=read('lib/startup/boot.js'), client=read('lib/client.js');
const info=JSON.parse(read('package.json'));
const video='whale-glyph-startup-00fd90a10cd5.mp4';
const fallback='whale-glyph-startup-36bbc859efa8.webp';
const mp4=readFileSync(join(root,'lib/assets',video));
const webp=readFileSync(join(root,'lib/assets',fallback));
const fishPath=read('assets/hero-fish-startup.svg').match(/<path d="([^"]+)"/)[1];
const base={enabled:true,light:false,skin:'nebula',gradient:'linear-gradient(110deg,#11111d,#272639)'};
const html='<!doctype html><html><head></head><body><main id="root"></main></body></html>';

test('new package version, native video asset and explicit fallback are packed',()=>{
 assert.equal(info.version,'0.8.44');assert.equal(info.name,'dsh-whale-dream');
 assert.equal(info.exports['./assets/*'],'./lib/assets/*');
 assert.ok(mp4.length<500_000&&mp4.length>100_000);
 assert.equal(mp4.toString('ascii',4,8),'ftyp');
 assert.equal(webp.toString('ascii',0,4),'RIFF');
});
test('startup contains no frame callbacks, Canvas, or continuous JS frame decode',()=>{
 assert.doesNotMatch(boot,/\.requestAnimationFrame\s*\(|\.getContext\s*\(|\.drawImage\s*\(|\.fillText\s*\(/);
 assert.ok(boot.includes("element('video', 'wd-startup-whale')"));
 assert.ok(boot.includes('video.muted = true'));
 assert.ok(boot.includes('video.playsInline = true'));
 assert.ok(boot.includes('video.preload')||boot.includes("'preload', 'auto'"));
 assert.ok(boot.includes("get renderMode() { return 'h264-compositor-css-timeline'; }"));
});
test('H.264 main path is native video; failures fall back to existing pixel whale WebP',()=>{
 assert.ok(boot.includes(video)&&boot.includes(fallback));
 assert.ok(boot.includes('video.canPlayType('));
 assert.ok(boot.includes('video.play()'));
 assert.ok(boot.includes('played.catch(failToImage)'));
 assert.ok(boot.includes("overlay.dataset.wdWhale = 'native-video'"));
 assert.ok(boot.includes("overlay.dataset.wdWhale = 'fallback-webp'"));
 assert.ok(boot.includes("overlay.dataset.wdWhale = 'fallback-missing'"));
});
test('logo and headline phases are CSS compositor-timed instead of setTimeout',()=>{
 for (const token of ['@keyframes wd-logo-enter','@keyframes wd-name-enter','@keyframes wd-letter-enter','@keyframes wd-brand-center','var(--wd-letter-delay,1750ms)','1.09s both',' .35s both','makeStage(\'探索\', TIMING.phrase1)','makeStage(\'未至\', TIMING.phrase2)','makeStage(\'之境\', TIMING.phrase3)'])
  assert.ok(boot.includes(token),token);
 assert.doesNotMatch(boot,/later\(TIMING\.(icon|name|phrase1|phrase2|phrase3|signature)/);
 assert.doesNotMatch(boot,/@keyframes wd-signature/);
 assert.doesNotMatch(boot,/wd-brand-signature/);
 assert.doesNotMatch(boot,/requestIdleCallback/);
});
test('brand remains centered and whale scales ~24% with same underlying 16:9 asset',()=>{
 assert.ok(boot.includes('display:grid;place-items:center'));
 assert.ok(boot.includes('width:min(112vw,178vh,2080px)'));
 assert.ok(boot.includes('left:50%;top:60%'));
 assert.ok(boot.includes('aspect-ratio:16/9'));
 assert.ok(boot.includes('z-index:1;display:block'));
 assert.ok(boot.includes('z-index:2;display:flex'));
 assert.ok(boot.includes('translate3d(var(--wd-intro-offset,0px),0,0)'));
});
test('original FishLogo path remains; removes × symbol without deleting six-character slogan',()=>{
 assert.ok(boot.includes(JSON.stringify(fishPath)));
 assert.ok(boot.includes("viewBox: '0 0 23.16 17.04'"));
 assert.ok(boot.includes("brand.setAttribute('aria-label', '鲸梦 探索未至之境')"));
 for (const word of ["makeStage('探索'","makeStage('未至'","makeStage('之境'"])assert.ok(boot.includes(word));
 assert.ok(!boot.includes('×'));
 assert.ok(!boot.includes('wd-startup-separator'));
});
test('theme-aware screen/multiply video blending, no animated filter shadows',()=>{
 assert.ok(boot.includes("'invert(1)' : 'none'"));
 assert.ok(boot.includes("'multiply' : 'screen'"));
 assert.ok(boot.includes("--wd-whale-opacity"));
 assert.doesNotMatch(boot,/@keyframes[^\n]*filter:/);
 assert.ok(!boot.includes("attributeFilter:['data-ds-dark-theme','data-ds-light-theme','style']"));
});
test('Host early-index delivers video and fallback URLs and does not inject atlas or duplicates',()=>{
 const script=bootScript(base,boot);
 assert.ok(script.length<32_000);
 assert.ok(script.includes(video)&&script.includes(fallback));
 assert.ok(!script.includes('atlasDataUri'));
 const out=injectStartup(html,base,boot);
 assert.equal((out.match(/data-wd-startup="boot"/g)||[]).length,1);
 assert.equal(injectStartup(out,base,boot),out);
 assert.equal(indexRows(base,boot).length,2);
 assert.ok(indexRows(base,boot)[1].text.includes(video));
 const disabled=injectStartup(html,{...base,enabled:false},boot);
 assert.ok(disabled.includes('data-wd-startup="config"'));
 assert.ok(!disabled.includes('data-wd-startup="boot"'));
 assert.match(paintCss(base),/data-dsh-boot/);
});
test('Escape, disabled, media failure, reduced motion and hard deadline stay safe',()=>{
 for (const token of ["event.key === 'Escape'", 'markSeen()','video.onerror = failToImage',
  'later(TIMING.fade, dismiss)','later(TIMING.duration + 1650, cleanup)',
  "if (reduceMotion()) {\n      later(1300, dismiss);",'video.pause();', 'fallback.remove();'])
  assert.ok(boot.includes(token),token);
});
test('Host code and client fallback startup IIFE stay byte-for-byte matched',()=>{
 const start=client.indexOf('/* Whale Dream 0.8.44 — compositor-first startup playback.');
 const end=client.indexOf('})(window,document);',start)+'})(window,document);'.length;
 assert.ok(start>=0);assert.equal(client.slice(start,end),boot.trim());
});
test('non-startup modules unaffected',()=>{
 for(const f of ['lib/index.js','lib/dream-host.js','lib/info/index.js','lib/info/accounting.js','lib/startup/atlas.mjs'])assert.ok(read(f).length>100);
 assert.ok(client.includes('sj-reasoning-ring')||client.includes('sj-ring')||client.includes('reasoning-ring'));
});
for(const skin of ['abyss','aurora','nebula','ember','midnight','ivory','mist','rose']){
 test(`original preset theme ${skin} inherits into early startup`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'wd-0844-'+skin+'-'));
  writeFileSync(join(dir,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const data=readStartupBoot(dir);assert.equal(data.skin,skin);
  assert.equal(data.light,['ivory','mist','rose'].includes(skin));
  assert.match(data.gradient,/gradient\(/);
 });
}
