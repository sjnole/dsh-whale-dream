/** Only bundled-runtime smoke tests. The original project sources and its test suite
 * were not present in the user's 0.8.34 TGZ. No assertion here implies DSH EXE validation. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {indexRows, injectStartup, readStartupBoot, paintCss} from '../../lib/startup/host.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bootText=readFileSync(join(root,'lib/startup/boot.js'),'utf8');
const clientText=readFileSync(join(root,'lib/client.js'),'utf8');
const packageInfo=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const minimal='<!doctype html><html><head></head><body><main id="root"></main></body></html>';
const dark={enabled:true,light:false,skin:'nebula',gradient:'linear-gradient(90deg,#12121c,#232037)'};
const off={...dark,enabled:false};

test('Version and plugin identity preserved',()=>{
  assert.equal(packageInfo.version,'0.8.35');assert.equal(packageInfo.name,'dsh-whale-dream');
});
test('No old frame-solving code or full-screen sheen in startup runtime',()=>{
  assert.ok(!bootText.includes('const DURATION = 11600'));
  assert.ok(!bootText.includes('var maskRows ='));
  assert.ok(!bootText.includes('wd-startup-sheen'));
  assert.ok(!bootText.includes('filter:blur('));
});
test('Enabled startup: exactly one Host script and one Host style',()=>{
  let rows=indexRows(dark,bootText);assert.deepEqual(rows.map(r=>r.kind),['style','script']);
  assert.ok(rows[1].text.includes('WHALE_DREAM_STARTUP'));
});
test('Disabled startup: only tiny config script, not the player',()=>{
  const rows=indexRows(off,bootText);
  assert.deepEqual(rows.map(r=>r.kind),['style','script']);
  assert.ok(!rows[1].text.includes('wd-startup-screen'));
  const text=injectStartup(minimal,off,bootText);
  assert.ok(text.includes('data-wd-startup="config"'));
  assert.ok(!text.includes('data-wd-startup="boot"'));
  assert.ok(!text.includes('data-wd-startup-curtain'));
});
test('Enabled startup string index injection is idempotent',()=>{
  const once=injectStartup(minimal,dark,bootText);
  assert.equal(injectStartup(once,dark,bootText),once);
  assert.ok(once.includes('data-wd-startup="boot"'));
});
test('Disabled startup string index injection is idempotent',()=>{
  const once=injectStartup(minimal,off,bootText);
  assert.equal(injectStartup(once,off,bootText),once);
});
test('Host config disables startup even when browser has older localStorage',()=>{
  assert.ok(bootText.includes("if (boot && typeof boot.enabled === 'boolean') return boot.enabled;"));
});
test('Host persisted switch and wallpaper gradient survive',()=>{
  const home=mkdtempSync(join(tmpdir(),'whale-0835-'));
  writeFileSync(join(home,'whale-dream.json'),JSON.stringify({
    'dsh-whale-dream:startup-enabled':'false',
    'dsh-dream-skin:skin':'ivory',
    'dsh-dream-skin:wallpaper-kind':'gradient',
    'dsh-dream-skin:wallpaper-gradient':'linear-gradient(160deg,#ffffff,#d8deed)'
  }));
  const data=readStartupBoot(home);
  assert.equal(data.enabled,false);assert.equal(data.light,true);assert.ok(data.gradient?.startsWith('linear-gradient('));
});
test('Reject unsafe HTML and URL from persisted gradient',()=>{
  const home=mkdtempSync(join(tmpdir(),'whale-0835-'));
  writeFileSync(join(home,'whale-dream.json'),JSON.stringify({'dsh-dream-skin:wallpaper-kind':'gradient','dsh-dream-skin:wallpaper-gradient':'linear-gradient(red,url(https://x))'}));
  assert.equal(readStartupBoot(home).gradient,null);
});
test('Windows native caption CSS probe receives transparent color',()=>{
  const css=paintCss(dark);
  assert.match(css,/body > span\[style\*=/);
  assert.match(css,/rgba\(0,0,0,0\)/);
  assert.match(clientText,/--dsw-specific-sidebar-fill: rgba\(0,0,0,0\) !important;/);
  assert.match(clientText,/background: transparent !important;/);
});
test('Loading plugin boot page background is themed without replacing the host UI',()=>{
  const css=paintCss(dark);
  assert.ok(css.includes('[data-dsh-boot]'));
  assert.ok(css.includes('#0b0d12'));
  assert.ok(!css.includes('display:none'));
});
test('Legacy core modules are still distributed',()=>{
  assert.ok(clientText.includes('whale-dream'));
  assert.ok(clientText.includes('whale-dream:startup'));
  assert.ok(readFileSync(join(root,'lib/info/index.js'),'utf8').length>20000);
  assert.ok(readFileSync(join(root,'lib/dream-host.js'),'utf8').length>1000);
});

test('Startup config cache invalidates when persisted file changes',()=>{
  const home=mkdtempSync(join(tmpdir(),'whale-0835-cache-'));
  const file=join(home,'whale-dream.json');
  writeFileSync(file,JSON.stringify({'dsh-whale-dream:startup-enabled':'false'}));
  assert.equal(readStartupBoot(home).enabled,false);
  writeFileSync(file,JSON.stringify({'dsh-whale-dream:startup-enabled':'true','dsh-dream-skin:skin':'ivory'}));
  const updated=readStartupBoot(home);
  assert.equal(updated.enabled,true);
  assert.equal(updated.light,true);
});
