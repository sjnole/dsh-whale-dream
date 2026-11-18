/** 0.8.47 regression gates for Windows visibility and real companion data, without pretending Windows UI is runnable here. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import vm from 'node:vm';
import {apply as applyHost,companionPaths,companionPublishHostRoster,companionRosterDiagnostics} from '../../lib/dream-host.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const src=(p)=>readFileSync(join(root,p),'utf8');

function makeHost(){
 let handler,release;
 const ctx={get:()=>undefined,effect(fn){const x=fn();if(typeof x==='function')release=x;return x},webServer:{register(def){handler=def.handler;return ()=>{}}}};
 applyHost(ctx);
 const server=createServer((req,res)=>{void handler(req,res)});
 return {server,release:()=>release?.()};
}

test('Windows app uses taskbar-free ToolWindow, remains independent of DSH minimize and obeys DPI work area',()=>{
 const go=src('docs/companion-native-src/main.go');
 for(const required of ['wsExToolWindow','wsPopup|wsClipChildren|wsClipSiblings','showWindow.Call(hwnd, swShowNA)','setProcessDpiAwareness.Call','getDpiForWindow.Call','getMonitorInfo.Call','area.Work','ownHidden']){
  assert.ok(go.includes(required) || required==='area.Work'&&go.includes('info.Work'), required);
 }
 assert.ok(go.includes('shouldHide = iconic == 0 && visible != 0'),'close-to-tray must count as minimized');
 assert.ok(!go.includes('SetWindowLongPtrW(hwnd,GWLP_HWNDPARENT'),'must not own DSH main window');
 assert.ok(existsSync(join(root,'bin/whale-companion-win-x64.exe')));
});

test('real Host session roster keeps working without visible browser and respects privacy',async()=>{
 const home=mkdtempSync(join(tmpdir(),'whale-047-roster-'));
 const prior=process.env.DSH_HOME;process.env.DSH_HOME=home;
 const {server,release}=makeHost();
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}/whale-dream/api`;
 const post=async body=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.ok,true);return (await r.json())};
 try{
  await post({method:'set',patch:{'dsh-whale-dream:companion-enabled':'true','dsh-whale-dream:companion-prefs':JSON.stringify({privacy:true})}});
  companionPublishHostRoster([{sessionId:'session-1',updatedAt:Date.now(),running:true,blank:false,displayTitle:'CONFIDENTIAL-TITLE'},
   {sessionId:'session-2',updatedAt:Date.now()-1000,running:false,blank:false,title:'Secret-2'},
   {sessionId:'subagent-1',updatedAt:Date.now(),running:true,origin:'subagent'}]);
  const out=JSON.parse(readFileSync(companionPaths().state,'utf8'));
  assert.equal(out.offline,false);assert.equal(out.source,'host');assert.equal(out.sessions.length,2);
  assert.equal(out.sessions[0].title,'隐私会话');assert.equal(out.sessions[0].status,'running');
  assert.ok(!JSON.stringify(out).includes('CONFIDENTIAL-TITLE'));
  assert.ok(companionRosterDiagnostics().hostRosterAt>0);
  const diag=await post({method:'companion-diagnostics'});
  assert.equal(diag.value.sessionCount,2);
  // A background-throttled renderer submitting an empty snapshot must NOT erase the Host roster.
  await post({method:'companion-push',snapshot:{sessions:[],theme:'dark'}});
  const after=(await post({method:'companion-state'})).value;
  assert.equal(after.sessions.length,2);
  assert.ok(after.updatedAt>0);
  // Privacy must be enforced by the Host as well, not only by a JS renderer.
  await new Promise(r=>setTimeout(r,520));
  await post({method:'companion-push',snapshot:{sessions:[{id:'session-1',title:'DO_NOT_SERIALIZE_TITLE',status:'running'}]}});
  assert.ok(!readFileSync(companionPaths().state,'utf8').includes('DO_NOT_SERIALIZE_TITLE'));
  await post({method:'set',patch:{'dsh-whale-dream:companion-enabled':'false'}});
  const at=readFileSync(companionPaths().state,'utf8');
  companionPublishHostRoster([{sessionId:'session-3',running:true,blank:false}]);
  assert.equal(readFileSync(companionPaths().state,'utf8'),at,'disabled host must not write');
 }finally{
  server.close();await once(server,'close');release();
  if(prior===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=prior;
  rmSync(home,{recursive:true,force:true});
 }
});

test('client publisher reacts to actual session store, status and cached quota even while minimized',async()=>{
 const client=src('lib/client.js');
 const start=client.indexOf('function installCompanionPublisher(');const stop=client.indexOf('\nfunction OceanSettings(',start);
 assert.ok(start>0&&stop>start);
 const fnSrc=client.slice(start,stop);
 let running=true;const listeners=[];const pushed=[];const intervals=[];const opened=[];
 const mkStore=(initial)=>{let snap=initial;return{
   getSnapshot:()=>snap, subscribe(fn){listeners.push(fn);return()=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}},set(v){snap=v;for(const fn of [...listeners])fn()}
 }};
 const id='uuid-session-47';
 const list=mkStore({ids:[id],byId:{[id]:{id,displayTitle:'测试 · 实时会话',running:true,updatedAt:Date.now(),retainedBy:{mainView:1}}},projectionsBySession:{}});
 const status=mkStore(new Map([[id,{running:true,pendingInteraction:undefined,completionUnread:false,completionFailed:false}]]));
 const directory={store:{getSnapshot:()=>({current:{provider:'codex',model:'model-47'}})}};
 const models={directoryFor:()=>directory};
 const info={subscribe:(fn)=>{listeners.push(fn);return()=>{}},subscribeSession:(identity,fn)=>{assert.equal(identity.sessionId,id);listeners.push(fn);return()=>{}},getSessionSnapshot:()=>({data:{balance:{estimate:false,currency:'USD',data:{total:17}},subscription:{mode:'subscription'},usage:{totals:{session:{amounts:[]},today:{amounts:[]},last30Days:{amounts:[]},allTime:{amounts:[]}}}}})};
 const ctx={get:(name)=>name==='sessions'?{list}:name==='modelDirectories'?models:name==='uiSession.sessionStatus'?status:name==='uiWorkspace'?{openSession:v=>opened.push(v)}:undefined};
 const fakeWin={addEventListener(){},removeEventListener(){}};
 const fakeDoc={hidden:true,body:{hasAttribute:()=>false},documentElement:{}};
 const sandbox={
   window:fakeWin,document:fakeDoc,console,Date,Map,Object,Set,Number,JSON,Array,Promise,
   COMPANION_DEFAULTS:{enabled:true,privacy:false},COMPANION_KEY:'dsh-whale-dream:companion-enabled',COMPANION_OPT_KEY:'dsh-whale-dream:companion-prefs',
   companionPublisher:null,companionPrefRead:()=>({enabled:true}),appearance:{getSnapshot:()=>({themes:[],currentTheme:'none'}),subscribe:()=>()=>{}},
   formatMoney:(n)=>'$'+n,quotaWindows:()=>[{remaining:75}],amountLines:()=>[],inputTokensTotal:()=>1234,
   contextOccupancy:()=>({percent:17}),outputSpeed:()=>21,
   getComputedStyle:()=>({getPropertyValue:()=>''}),
   setTimeout,clearTimeout,setInterval:(fn,delay)=>{intervals.push({fn,delay});return intervals.length},clearInterval:()=>{},
   fetch:async(_url,options)=>{
      const body=JSON.parse(options.body);
      if(body.method==='get')return {ok:true,json:async()=>({ok:true,value:{'dsh-whale-dream:companion-enabled':'true'}})};
      if(body.method==='companion-push'){pushed.push(body.snapshot);return {ok:true,json:async()=>({ok:true})};}
      if(body.method==='companion-command')return {ok:true,json:async()=>({ok:true,value:{action:'open-session',sessionId:id}})};
      return {ok:true,json:async()=>({ok:true})};
    },
 };
 const f=vm.runInNewContext('('+fnSrc+')',sandbox);const publisher=f(ctx,info);
 try{
   await new Promise(r=>setTimeout(r,120));
   assert.ok(pushed.length>0,'first data snapshot must be pushed');
   assert.equal(pushed.at(-1).sessions[0].title,'测试 · 实时会话');
   assert.equal(pushed.at(-1).sessions[0].status,'running');
   assert.equal(pushed.at(-1).quota.subscriptionRemaining,75);
   status.set(new Map([[id,{running:false,pendingInteraction:undefined,completionUnread:true,completionFailed:false}]]));
   list.set({ids:[id],byId:{[id]:{id,displayTitle:'测试 · 实时会话',running:false,updatedAt:Date.now(),retainedBy:{mainView:1}}},projectionsBySession:{}});
   await new Promise(r=>setTimeout(r,1050));
   assert.equal(pushed.at(-1).sessions[0].status,'completed');
   assert.ok(intervals.some(x=>x.delay===1900),'command polling installed');
   await intervals.find(x=>x.delay===1900).fn();
   assert.deepEqual(opened,[id],'open-session cannot be blocked by document.hidden');
 }finally{publisher.dispose()}
});
