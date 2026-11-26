/** Whale Dream profile preferences. Shares the existing host persistence bridge. */
export const PROFILE_KEY = 'dsh-whale-dream:profile:v1';
export const PROFILE_DEFAULTS = Object.freeze({schemaVersion:1,enabled:true,themeId:'humpback',motion:'auto',backgroundX:50,backgroundZoom:1,displayName:'',avatar:''});

function safeAvatar(value){
  if(typeof value!=='string'||value.length>1500000)return '';
  const match=/^data:image\/(png|jpeg|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(value);
  if(!match||match[2].length<16)return '';
  try{
    const head=globalThis.atob(match[2].slice(0,32));
    const valid=match[1]==='png'?head.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?head.startsWith('\xff\xd8\xff'):head.startsWith('RIFF')&&head.slice(8,12)==='WEBP';
    return valid?value:'';
  }catch{return '';}
}

export function normalizeProfile(input, ids) {
  let raw=input;
  if (typeof raw==='string') {try{raw=JSON.parse(raw);}catch{raw={};}}
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) raw={};
  const themes=ids instanceof Set?ids:new Set(ids||['humpback']);
  const number=(v,lo,hi,fallback)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
  const avatar=safeAvatar(raw.avatar);
  return {
    schemaVersion:1,
    enabled:typeof raw.enabled==='boolean'?raw.enabled:true,
    themeId:themes.has(raw.themeId)?raw.themeId:(themes.has('humpback')?'humpback':[...themes][0]||''),
    motion:['auto','lite','off'].includes(raw.motion)?raw.motion:'auto',
    backgroundX:number(raw.backgroundX,0,100,50),
    backgroundZoom:number(raw.backgroundZoom,1,1.8,1),
    displayName:typeof raw.displayName==='string'?Array.from(raw.displayName.replace(/[\x00-\x1f\x7f]/g,'').trim()).slice(0,40).join(''):'',
    avatar
  };
}

export function createProfileStore({storage,catalog}) {
  if (!storage || typeof storage.save!=='function') throw new TypeError('Profile storage bridge is required.');
  const ids=new Set(catalog.themes.map(t=>t.id));
  let value=normalizeProfile(null,ids);
  try{value=normalizeProfile(storage.peek(PROFILE_KEY),ids);}catch{}
  let disposed=false,dirty=false,revision=0,pending=0,chain=Promise.resolve();
  let snapshot={value,ready:false,status:'loading',error:null,revision};
  const listeners=new Set();
  const publish=patch=>{
    if(disposed)return;
    snapshot={...snapshot,...patch,value,revision};
    for(const listener of [...listeners]){try{listener();}catch{}}
  };
  const adopt=raw=>{
    if(disposed||pending||dirty||raw==null)return;
    const next=normalizeProfile(raw,ids);
    if(JSON.stringify(next)!==JSON.stringify(value)){value=next;revision++;publish({});}
  };
  const release=storage.subscribe?.(PROFILE_KEY,(raw,info)=>{
    if(info?.source==='local'||info?.source==='factory')return;
    adopt(raw);
  },{immediate:false})||(()=>{});
  const ready=(async()=>{
    try {
      await storage.ready;
      const raw=await storage.load(PROFILE_KEY);
      adopt(raw);
      const status=storage.getStatus?.();
      publish({ready:true,status:status?.hostReachable===false?'local-only':'ready',error:status?.hostReachable===false?'暂时无法读取 DSH 设置，正在使用当前窗口的资料。':null});
    }catch{
      publish({ready:true,status:'local-only',error:'暂时无法读取 DSH 设置，正在使用当前窗口的资料。'});
    }
    return snapshot;
  })();
  function commit(next) {
    if(disposed)return Promise.reject(new Error('Profile store is disposed.'));
    value=normalizeProfile(next,ids);
    dirty=true;
    const own=++revision, encoded=JSON.stringify(value);
    pending++;
    publish({status:'saving',error:null});
    const operation=chain.then(async()=>{
      await ready;
      if(disposed){pending--;return snapshot;}
      try {
        await storage.save(PROFILE_KEY,encoded);
        if(own===revision){dirty=false;publish({status:'saved',error:null});}
      }catch {
        if(own===revision)publish({status:'local-only',error:'当前窗口已应用，写入 DSH 失败。请点击“重试保存”；跨窗口或重启后可能无法保留。'});
      }finally{pending--;}
      return snapshot;
    });
    chain=operation.catch(()=>{});
    return operation;
  }
  return {
    ready,getSnapshot:()=>snapshot,
    readProfile:()=>value,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    commit,retry:()=>commit(value),
    refresh(){publish({});},
    dispose(){disposed=true;release();listeners.clear();}
  };
}
