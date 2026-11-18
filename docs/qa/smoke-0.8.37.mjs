/** Whale Dream 0.8.37 — targeted distribution-package smoke tests. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexRows, injectStartup, readStartupBoot, paintCss} from '../../lib/startup/host.mjs';
const pkg=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const boot=readFileSync(join(pkg,'lib/startup/boot.js'),'utf8');
const client=readFileSync(join(pkg,'lib/client.js'),'utf8');
const icon=readFileSync(join(pkg,'assets/whale-brand-icon.svg'),'utf8');
const path=icon.match(/<path d="([^"]+)"/)[1];
const manifest=JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));
const initial='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const on={enabled:true,skin:'nebula',light:false,gradient:'linear-gradient(135deg,#11111b,#24243a)'};
const off={...on,enabled:false};

test('version and package identity',()=>{ assert.equal(manifest.version,'0.8.37');assert.equal(manifest.name,'dsh-whale-dream'); });
test('the supplied Whale SVG path is incorporated unchanged',()=>{assert.equal(path.length,4861);assert.ok(boot.includes(JSON.stringify(path)));assert.ok(boot.includes("viewBox: '0 0 1391 1024'"));});
test('only one SVG path, no frame, old hand-drawn body or watermark',()=>{
 assert.ok(boot.includes("fill: 'currentColor'"));
 assert.ok(!boot.includes("svgElement('rect'"));
 assert.ok(!boot.includes("svgElement('circle'"));
 assert.ok(!boot.includes('background:rgba(0,0,0,.3)'));
 assert.ok(!boot.includes('data:image/png;base64'));
});
test('exact final brand name without multiplication separator',()=>{
 assert.ok(boot.includes('鲸梦 探索未至之境'));
 assert.ok(!boot.includes('鲸梦×'));
 assert.ok(!boot.includes('鲸梦 ×'));
});
test('title adds only the original requested segments and single final stage',()=>{
 assert.ok(boot.includes("makeStage('探索', 0)"));
 assert.ok(boot.includes("makeStage('未至', 2)"));
 assert.ok(boot.includes("makeStage('之境', 4)"));
 assert.ok(!boot.includes('loop:true'));
});
test('slowed timeline, >= 1 second final reading',()=>{
 const want={icon:350,name:1090,phrase1:1750,phrase2:2470,phrase3:3300,signature:4100,fade:5170,duration:5550};
 for(const [k,ms] of Object.entries(want)) assert.match(boot,new RegExp(`${k}: ${ms}\\b`));
 assert.ok(want.fade-(want.phrase3+550)>=1000);
});
test('one-time memory mark without heavy particles, canvas or media',()=>{
 assert.ok(boot.includes('wd-brand-signature'));
 assert.ok(boot.includes('animation:wd-signature-letter .65s ease-in-out 1 both'));
 assert.ok(!boot.includes('requestAnimationFrame'));
 assert.ok(!boot.includes('getContext('));
 assert.ok(!boot.includes('motion/react'));
 assert.ok(!boot.includes('HTMLVideoElement'));
});
test('early Host injection is idempotent',()=>{
 const page=injectStartup(initial,on,boot);
 assert.equal(injectStartup(page,on,boot),page);
 assert.equal((page.match(/data-wd-startup="boot"/g)||[]).length,1);
});
test('Host disabled boot sends only paint and config',()=>{
 const rows=indexRows(off,boot);
 assert.equal(rows.length,2);
 assert.ok(!rows[1].text.includes('wd-startup-screen'));
 const page=injectStartup(initial,off,boot);
 assert.ok(page.includes('data-wd-startup="config"'));
 assert.ok(!page.includes('data-wd-startup="boot"'));
});
test('Host setting overrides stale localStorage startup toggle',()=>{
 assert.ok(boot.includes("if (boot && typeof boot.enabled === 'boolean') return boot.enabled;"));
});
test('eight shipped theme gradients available in earliest startup phase',()=>{
 const ids=['abyss','aurora','nebula','ember','midnight','ivory','mist','rose'];
 for (const skin of ids) {
  const home=mkdtempSync(join(tmpdir(),`wd-0837-${skin}-`));
  writeFileSync(join(home,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':skin}));
  const b=readStartupBoot(home);
  assert.equal(b.skin,skin);
  assert.match(b.gradient,/gradient\(/);
  assert.equal(b.light,['ivory','mist','rose'].includes(skin),skin);
 }
});
test('custom gradient must override preset',()=>{
 const home=mkdtempSync(join(tmpdir(),'wd-0837-custom-'));
 const requested='linear-gradient(120deg,#f9f5f0,#dbe5ee)';
 writeFileSync(join(home,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:skin':'nebula','dsh-dream-skin:wallpaper-kind':'gradient','dsh-dream-skin:wallpaper-gradient':requested}));
 assert.equal(readStartupBoot(home).gradient,requested);
});
test('Host startup enabled config preserved and cache respects file changes',()=>{
 const home=mkdtempSync(join(tmpdir(),'wd-0837-toggle-'));
 const f=join(home,'whale-dream.json');
 writeFileSync(f,JSON.stringify({'dsh-whale-dream:startup-enabled':false}));
 assert.equal(readStartupBoot(home).enabled,false);
 writeFileSync(f,JSON.stringify({'dsh-whale-dream:startup-enabled':true,'some-extra-key':'test'}));
 assert.equal(readStartupBoot(home).enabled,true);
});
test('gradient colors of SVG and text always share one inherited currentColor',()=>{
 assert.ok(boot.includes('color:inherit'));
 assert.ok(boot.includes("fill: 'currentColor'"));
 assert.ok(boot.includes("props.setProperty('--wd-startup-ink', theme.ink)"));
});
test('reduced-motion displays final wording and supports Esc',()=>{
 assert.ok(boot.includes('if (reduceMotion())'));
 assert.ok(boot.includes("event.key === 'Escape'"));
 assert.ok(boot.includes('animation:none!important'));
 assert.ok(boot.includes('later(1300, dismiss)'));
});
test('both lifecycle paths, fail-open and cleanup remain',()=>{
 for(const value of ['win.setTimeout','clearTimers()','state.observer.disconnect()', 'whale-dream:startup-complete', 'later(TIMING.duration + 1450, cleanup)', 'setEnabled(next)']) assert.ok(boot.includes(value),value);
});
test('Host loading CSS and Windows caption probe remain functional',()=>{
 const css=paintCss(on);
 assert.match(css,/data-dsh-boot/);
 assert.match(css,/rgba\(0,0,0,0\)/);
 assert.ok(client.includes('--dsw-specific-sidebar-fill: rgba(0,0,0,0) !important;'));
});
test('Host and client fallback embed byte-identical brand script',()=>{
 assert.ok(client.includes(boot.trim()));
 const begin=client.indexOf('/* Whale Dream 0.8.37 — slow brand reveal.');
 const end=client.indexOf('})(window,document);',begin)+'})(window,document);'.length;
 assert.equal(client.slice(begin,end),boot.trim());
});
test('other shipped modules retained',()=>{
 for (const file of ['lib/index.js','lib/dream-host.js','lib/info/index.js','lib/info/accounting.js']) assert.ok(readFileSync(join(pkg,file),'utf8').length>100);
 assert.ok(client.includes('sj-reasoning-ring')||client.includes('sj-ring')||client.includes('reasoning-ring'));
});
