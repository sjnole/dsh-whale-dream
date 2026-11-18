/** Whale Dream 0.8.36 — release-targeted brand startup smoke tests.
 * This is a compiled-distribution hotfix, not the original TS project suite.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexRows,injectStartup,readStartupBoot,paintCss} from '../../lib/startup/host.mjs';
const pkg=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const boot=readFileSync(join(pkg,'lib/startup/boot.js'),'utf8');
const client=readFileSync(join(pkg,'lib/client.js'),'utf8');
const manifest=JSON.parse(readFileSync(join(pkg,'package.json'),'utf8'));
const empty='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const on={enabled:true,skin:'nebula',light:false,gradient:'linear-gradient(135deg,#11111b,#24243a)'};
const off={...on,enabled:false};

test('version 0.8.36 and plugin identifier retained',()=>{
 assert.equal(manifest.version,'0.8.36'); assert.equal(manifest.name,'dsh-whale-dream');
});
test('startup has no whale rig, Canvas or React/motion dependencies',()=>{
 assert.ok(!boot.includes('requestAnimationFrame'));
 assert.ok(!boot.includes('getContext('));
 assert.ok(!boot.includes('whalePose('));
 assert.ok(!boot.includes('data:image/png;base64'));
 assert.ok(!boot.includes('motion/react'));
});
test('exact title and brand contains no multiplication-sign separator',()=>{
 assert.ok(boot.includes("element('span', 'wd-startup-name', '鲸梦')"));
 assert.ok(boot.includes("makeStage('探索'), makeStage('未至'), makeStage('之境')"));
 assert.ok(boot.includes('鲸梦 探索未至之境'));
 assert.ok(!boot.includes('鲸梦 × 探索未至之境'));
 assert.ok(!boot.includes('鲸梦×探索未至之境'));
});
test('startup whale Icon is an SVG with no background rectangle',()=>{
 assert.ok(boot.includes('createElementNS(NS, tag)'));
 assert.ok(boot.includes("fill: 'currentColor'"));
 assert.ok(!boot.includes("svgElement('rect'"));
 assert.ok(!boot.includes('background:rgba(0,0,0,.3)'));
});
test('single increasing masked text and fixed horizontal phrase allocation',()=>{
 assert.ok(boot.includes("'width:6em;flex:none"));
 assert.ok(boot.includes("white-space:nowrap;overflow:hidden;"));
 assert.ok(boot.includes('transition-delay:var(--wd-letter-delay,0ms)'));
});
test('title timeline reveals Icon, name then three staged text pieces',()=>{
 for(const [name,ms] of [['icon',300],['name',600],['phrase1',940],['phrase2',1340],['phrase3',1740],['fade',2710],['duration',3000]]) {
  assert.match(boot,new RegExp(`${name}: ${ms}`));
 }
 assert.ok(boot.includes('later(TIMING.fade, dismiss)'));
});
test('Host index injection contains one boot and is idempotent',()=>{
 const once=injectStartup(empty,on,boot);
 assert.equal(injectStartup(once,on,boot),once);
 assert.equal((once.match(/data-wd-startup="boot"/g)||[]).length,1);
});
test('Disabled Host sends no startup script',()=>{
 const rows=indexRows(off,boot);
 assert.equal(rows.length,2);
 assert.ok(!rows[1].text.includes('wd-startup-screen'));
 const output=injectStartup(empty,off,boot);
 assert.ok(output.includes('data-wd-startup="config"'));
 assert.ok(!output.includes('data-wd-startup="boot"'));
});
test('Host enabled config overrules stale local browser preference',()=>{
 assert.ok(boot.includes("if (boot && typeof boot.enabled === 'boolean') return boot.enabled;"));
});
test('Existing persisted gradient and default skin remain readable',()=>{
 const home=mkdtempSync(join(tmpdir(),'wd-0836-'));
 writeFileSync(join(home,'whale-dream.json'),JSON.stringify({
  'dsh-whale-dream:startup-enabled':'false',
  'dsh-dream-skin:skin':'ivory',
  'dsh-dream-skin:wallpaper-kind':'gradient',
  'dsh-dream-skin:wallpaper-gradient':'linear-gradient(120deg,#f9f5f0,#dbe5ee)'
 }));
 const x=readStartupBoot(home);
 assert.equal(x.enabled,false);assert.equal(x.light,true);assert.ok(x.gradient.startsWith('linear-gradient('));
});
test('Brand listens for Esc and releases observers and timers',()=>{
 assert.ok(boot.includes("event.key === 'Escape'"));
 assert.ok(boot.includes('state.observer.disconnect()'));
 assert.ok(boot.includes('clearTimers()'));
 assert.ok(boot.includes('whale-dream:startup-complete'));
});
test('Reduced-motion renders final title without staged transition',()=>{
 assert.ok(boot.includes('if (reduceMotion())'));
 assert.ok(boot.includes('view.pieces.forEach(function(p){p.classList.add(\'wd-in\');});'));
 assert.ok(boot.includes('@media(prefers-reduced-motion:reduce)'));
});
test('Custom gradient changes glyph color without extra overlay backing',()=>{
 assert.ok(boot.includes("'background-color:var(--wd-startup-base"));
 assert.ok(boot.includes('colorsOfGradient(gradient)'));
 assert.ok(boot.includes("ink: light ? '#151b24' : '#f3f6fb'"));
});
test('Early Host loader and Windows caption color probes preserved',()=>{
 const css=paintCss(on);
 assert.match(css,/data-dsh-boot/);
 assert.match(css,/rgba\(0,0,0,0\)/);
 assert.ok(client.includes('--dsw-specific-sidebar-fill: rgba(0,0,0,0) !important;'));
});
test('Host early-startup bundle and client fallback embed same startup source',()=>{
 assert.ok(client.includes(boot.trim()));
 const embedded=client.slice(client.indexOf('/* Whale Dream 0.8.36 — startup brand reveal.'),client.indexOf('})(window,document);',client.indexOf('/* Whale Dream 0.8.36 — startup brand reveal.'))+'})(window,document);'.length);
 assert.equal(embedded,boot.trim());
});
test('Legacy theme, ring, information modules are present',()=>{
 for(const name of ['lib/info/index.js','lib/index.js','lib/dream-host.js']) {
  assert.ok(readFileSync(join(pkg,name),'utf8').length>100,name);
 }
 assert.ok(client.includes('whale-dream'));
 assert.ok(client.includes('whale-dream:startup'));
});
