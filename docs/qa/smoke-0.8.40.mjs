/** Whale Dream 0.8.40 — exact DSH EmptyHero brand mark targeted tests. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, injectStartup, readStartupBoot, paintCss } from '../../lib/startup/host.mjs';
const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const boot = readFileSync(join(pkg,'lib/startup/boot.js'),'utf8');
const client = readFileSync(join(pkg,'lib/client.js'),'utf8');
const asset = readFileSync(join(pkg,'assets/hero-fish-startup.svg'),'utf8');
const oldPluginIcon = readFileSync(join(pkg,'icon.svg'),'utf8');
const heroPath = asset.match(/<path d="([^"]+)"/)[1];
const manifest = JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));
const initial = '<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const on={enabled:true,skin:'nebula',light:false,gradient:'linear-gradient(135deg,#11111b,#24243a)'};
const off={...on,enabled:false};

test('version and package identity',()=>{assert.equal(manifest.version,'0.8.40');assert.equal(manifest.name,'dsh-whale-dream');});
test('original DSH new-conversation FishLogo path and 23.16x17.04 viewBox embedded intact',()=>{
 assert.ok(heroPath.startsWith('M22.9168 1.43018'));
 assert.ok(heroPath.endsWith('15.1415 9.79893Z'));
 assert.ok(heroPath.length>3300);
 assert.ok(boot.includes(JSON.stringify(heroPath)));
 assert.ok(boot.includes("viewBox: '0 0 23.16 17.04'"));
});
test('the eye remains the original path negative space — no synthetic circle or mask',()=>{
 assert.equal((asset.match(/<path /g)||[]).length,1);
 assert.ok(asset.includes('fill="currentColor"'));
 for (const x of ['<circle','<rect','<mask','<ellipse','<image']) assert.ok(!asset.includes(x),x);
 for (const x of ["svgElement('rect'", "svgElement('circle'", "svgElement('mask'",'wd-whale-eye-cutout']) assert.ok(!boot.includes(x),x);
 assert.ok(boot.includes("fill: 'currentColor'"));
});
test('does not use old 1391x1024 logo in startup',()=>{
 assert.ok(!boot.includes("viewBox: '0 0 1391 1024'"));
 assert.ok(!boot.includes('M1333.7444332203'));
 assert.ok(oldPluginIcon.includes('viewBox="0 0 1391 1024"')); // separate plugin icon intentionally retained
});
test('single exact final brand title, no multiplication mark',()=>{
 assert.ok(boot.includes('鲸梦 探索未至之境'));
 assert.ok(!boot.includes('鲸梦×'));
 assert.ok(!boot.includes('鲸梦 ×'));
});
test('only approved incremental text fragments',()=>{
 for(const x of ["makeStage('探索', 0)","makeStage('未至', 2)","makeStage('之境', 4)"])assert.ok(boot.includes(x),x);
});
test('slower 5.55s sequence and final hold are retained',()=>{
 for (const [k,ms] of Object.entries({icon:350,name:1090,phrase1:1750,phrase2:2470,phrase3:3300,signature:4100,fade:5170,duration:5550}))
  assert.ok(boot.includes(`${k}: ${ms}`),k);
});
test('no video or whale rig in startup; performance remains minimal',()=>{
 for (const bad of ['requestAnimationFrame','getContext(','motion/react','HTMLVideoElement','<canvas'])assert.ok(!boot.includes(bad),bad);
});
test('startup settings: host-disabled, idempotent, fallback order correct',()=>{
 const page=injectStartup(initial,on,boot);
 assert.equal(injectStartup(page,on,boot),page);
 assert.equal((page.match(/data-wd-startup="boot"/g)||[]).length,1);
 assert.equal(indexRows(off,boot).length,2);
 const disabled=injectStartup(initial,off,boot);
 assert.ok(disabled.includes('data-wd-startup="config"'));
 assert.ok(!disabled.includes('data-wd-startup="boot"'));
 assert.ok(boot.includes("if (boot && typeof boot.enabled === 'boolean') return boot.enabled;"));
});
test('all eight built-in themes return initial gradients',()=>{
 for(const skin of ['abyss','aurora','nebula','ember','midnight','ivory','mist','rose']){
  const h=mkdtempSync(join(tmpdir(),'wd40-'+skin+'-'));
  writeFileSync(join(h,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const b=readStartupBoot(h);assert.equal(b.skin,skin);assert.match(b.gradient,/gradient\(/);
  assert.equal(b.light,['ivory','mist','rose'].includes(skin));
 }
});
test('custom gradient settings are still respected',()=>{
 const h=mkdtempSync(join(tmpdir(),'wd40-custom-'));
 const wanted='linear-gradient(120deg,#f9f5f0,#dbe5ee)';
 writeFileSync(join(h,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:wallpaper-kind':'gradient','dsh-dream-skin:wallpaper-gradient':wanted}));
 assert.equal(readStartupBoot(h).gradient,wanted);
});
test('startup icon and title share exact theme currentColor',()=>{
 for(const s of ["fill: 'currentColor'",'color:inherit',"props.setProperty('--wd-startup-ink', theme.ink)"])assert.ok(boot.includes(s));
});
test('reduced motion, Escape and fail-open behavior remain',()=>{
 for(const s of ['if (reduceMotion())',"event.key === 'Escape'",'later(1300, dismiss)','later(TIMING.duration + 1450, cleanup)',"win.setTimeout",'whale-dream:startup-complete'])assert.ok(boot.includes(s),s);
});
test('Host startup paint and Windows titlebar color sync retained',()=>{
 const css=paintCss(on);assert.match(css,/data-dsh-boot/);assert.match(css,/rgba\(0,0,0,0\)/);
 assert.ok(client.includes('--dsw-specific-sidebar-fill: rgba(0,0,0,0) !important;'));
});
test('client fallback and Host injection share exact startup script',()=>{
 assert.equal(client.split(boot.trim()).length,2);
 const begin=client.indexOf('/* Whale Dream 0.8.40 — DSH new-conversation FishLogo SVG.');
 const end=client.indexOf('})(window,document);',begin)+'})(window,document);'.length;
 assert.equal(client.slice(begin,end),boot.trim());
});
test('original 0.8.39 appearance, SJ ring, information bar modules still included',()=>{
 for(const file of ['lib/index.js','lib/dream-host.js','lib/info/index.js','lib/info/accounting.js'])assert.ok(readFileSync(join(pkg,file),'utf8').length>100);
 assert.ok(client.includes('sj-reasoning-ring')||client.includes('sj-ring')||client.includes('reasoning-ring'));
});
test('SVG is a transparent foreground mark, not the screenshot red annotation',()=>{
 assert.ok(!asset.includes('#ff0000'));
 assert.ok(!asset.includes('<rect'));
 assert.ok(!asset.includes('background'));
});
