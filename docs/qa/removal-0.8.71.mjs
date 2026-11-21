/** Preserve Whale Dream core and keep the legacy WebView2 companion removed. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {apply as applyHost} from '../../lib/dream-host.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const file=(path)=>readFileSync(join(root,path),'utf8');
const manifest=JSON.parse(file('package.json'));
const client=file('lib/client.js');
const host=file('lib/dream-host.js');
const entry=file('lib/index.js');
const paths=['bin/whale-companion-win-x64.exe','lib/companion/native-host.mjs','lib/companion/webview2-loader.mjs','docs/companion-native-src/main.go','docs/companion-native-src/native.html','assets/companion-ds-title-mark.svg'];

test('Whale Dream version and package entry remain valid',()=>{
  assert.equal(manifest.name,'dsh-whale-dream');
  assert.equal(manifest.version,'1.0.0');
  assert.equal(manifest.main,'lib/index.js');
  assert.equal(manifest.exports['./client'],'./lib/client.js');
  assert.ok(manifest.files.includes('lib'));
});

test('old executable, bridge, WebView2 loader and native views stay removed',()=>{
  for (const path of paths) assert.ok(!existsSync(join(root,path)),path);
  assert.ok(!manifest.files.includes('bin'));
  assert.ok(!entry.includes('nativeCompanion'));
  assert.ok(!entry.includes("./companion/"));
  for (const file of ['native/whale-companion-win-x64.exe', 'native/WhaleCompanion.cs']) assert.ok(!existsSync(join(root,file)),file);
  assert.ok(existsSync(join(root,'native/windows-x64/daozai.exe')));
});

test('legacy companion UI, timers and snapshot publisher stay removed',()=>{
  for(const text of ['WhaleCompanionSettings','wd-companion-config',
     'installCompanionPublisher','companionPublisher','COMPANION_KEY','COMPANION_CSS',
     'companionSheet','companionTimer']) assert.ok(!client.includes(text),text);
  assert.match(client,/className: "wd-primary-nav wd-segment"/);
  assert.match(client,/section === "themes"/);
  assert.match(client,/section === "appearance"/);
  assert.match(client,/section === "info"/);
});

test('no native companion Host endpoints, preference watcher or file-based queue remains',()=>{
  for(const text of ['companionPublishHostRoster','companionPaths','companionPushAt',
    'companion-push','companion-state','companion-command',
    'companion-native-status','companion-diagnostics','COMPANION_KEY'])
    assert.ok(!host.includes(text),text);
});

test('other Whale Dream features and appearance companions remain',()=>{
  for(const path of ['lib/info/index.js','lib/startup/boot.js','lib/startup/host.mjs',
     'lib/startup/atlas.mjs','lib/assets/whale-glyph-startup-00fd90a10cd5.mp4',
     'assets/whale-brand-icon.svg','assets/hero-fish-startup.svg'])
    assert.ok(existsSync(join(root,path)),path);
  assert.ok(client.includes('drawCompanionScene'),'do not remove the separate dynamic appearance category');
  assert.ok(client.includes('getCompanionState'),'mechanical companions within the appearance renderer must remain');
  assert.ok(client.includes('applyRing('),'reasoning ring is preserved');
  assert.ok(client.includes('applyInfo('),'information bar is preserved');
});

test('Host persistence GET/SET still works, but deleted companion API methods return 404', async()=>{
  const tmp=mkdtempSync(join(tmpdir(),'wd-remove-071-'));
  const prev=process.env.DSH_HOME;
  process.env.DSH_HOME=tmp;
  let route,release;
  const ctx={get:()=>undefined,effect(fn){const result=fn();if(typeof result==='function')release=result;return result;},
    webServer:{register({handler}){route=handler;return()=>{}}}};
  const server=createServer((req,res)=>{void route(req,res)});
  try {
    applyHost(ctx);
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${server.address().port}/whale-dream/api`;
    const post=async payload=>{
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      return {code:response.status, body:await response.json()};
    };
    const set=await post({method:'set',patch:{'dsh-dream-skin:skin':'nebula'}});
    assert.equal(set.code,200);
    const get=await post({method:'get'});
    assert.equal(get.code,200);assert.equal(get.body.value['dsh-dream-skin:skin'],'nebula');
    const companion = await post({method:'companion-get'});
    assert.deepEqual(companion.body, {ok:true,value:{supported:false,enabled:false,autoCollapse:true,reducedMotion:false,showDetails:true,topPosition:0,shape:'pill',collapsedDisplay:'amount',completionSound:true,completionFlash:true,ready:false,error:''}});
    assert.equal((await post({method:'companion-set',enabled:true})).code,409);
    for(const method of ['companion-push','companion-clear','companion-state','companion-command','companion-diagnostics','companion-native-status']){
      const r=await post({method});assert.equal(r.code,404,method);assert.equal(r.body.error.code,'not-found',method);
    }
  } finally {
    if (server.listening) {server.close();await once(server,'close');}
    release?.();
    if(prev===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=prev;
    rmSync(tmp,{recursive:true,force:true});
  }
});
