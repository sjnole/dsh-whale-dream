/** Profile integration for DSH's native settings slots and account launcher. */
import catalog from './catalog.json' with {type:'json'};
import {createProfileStore} from './state.js';
import {createMediaRuntime,mediaStyles} from './media-runtime.js';
import {mountAccountAdapter} from './account-adapter.js';
import {createProfileSettings,profileStyles,readOceanAppearanceId,prepareAvatar} from './settings-view.js';

const THEME_IDS=new Set(catalog.themes.map(item=>item.id));
const COMMUNITY_IDENTITY_KEY='dsh-whale-dream:community:identity:v1';
const COMMUNITY_AUTH_KEY='dsh-whale-dream:community:auth:v1';

const installed=new WeakMap();
export function installProfile(ctx,React,{storage,document:doc=globalThis.document,window:win=globalThis.window}={}) {
  if(installed.has(ctx))return installed.get(ctx);
  if(!ctx?.slots?.inject||!ctx?.slots?.register||!React?.createElement||!doc?.head)return {dispose(){},getDiagnostics:()=>({available:false})};
  let disposed=false;
  const store=createProfileStore({storage,catalog});
  const media=createMediaRuntime({catalog,document:doc,window:win});
  const sheet=doc.createElement('style');sheet.dataset.wdpProfile='1';sheet.textContent=mediaStyles+'\n'+profileStyles;doc.head.appendChild(sheet);
  // 星球身份优先：登录后昵称/头像同步到账户卡；未登录时回落到 DSH 原生身份。
  const readCommunityIdentity=()=>{
    let authed=false;
    try{authed=!!win.localStorage?.getItem(COMMUNITY_AUTH_KEY);}catch{}
    if(!authed){
      // 已退出星球时清掉上次同步的缓存，避免其他页签继续显示星球身份。
      try{win.localStorage?.removeItem(COMMUNITY_IDENTITY_KEY);}catch{}
      return {nickname:'',avatarUrl:''};
    }
    let value=null;
    try{value=win.__WD_COMMUNITY_IDENTITY__||null;}catch{}
    if(!value||typeof value!=='object'){
      try{const raw=win.localStorage?.getItem(COMMUNITY_IDENTITY_KEY);value=raw?JSON.parse(raw):null;}catch{}
    }
    if(!value||typeof value!=='object')return {nickname:'',avatarUrl:''};
    return {
      nickname:typeof value.nickname==='string'?value.nickname.trim():'',
      avatarUrl:typeof value.avatarUrl==='string'?value.avatarUrl:'',
    };
  };
  // 「外观与动态」页的选择只写在 ocean 配置里；账户卡直接读它，保证与资料页 Hero 一致。
  const readProfile=()=>{
    const profile=store.readProfile();
    const id=readOceanAppearanceId();
    const next=id&&THEME_IDS.has(id)?{...profile,themeId:id}:{...profile};
    const community=readCommunityIdentity();
    // 账户卡只跟随星球身份；未登录时不使用皮肤自身的昵称/头像，保持 DSH 原生显示。
    next.displayName=community.nickname;
    next.avatar=community.avatarUrl;
    return next;
  };
  const adapter=mountAccountAdapter({
    ctx,document:doc,window:win,
    createScene:media.createScene,createFrame:media.createFrame,assetUrl:media.assetUrl,
    readProfile,subscribe:store.subscribe,onIdentityChange:()=>store.refresh()
  });
  const onCommunityIdentity=()=>{try{adapter.refresh?.();}catch{}};
  try{win.addEventListener?.('wd-community-identity-change',onCommunityIdentity);}catch{}
  const Settings=createProfileSettings(React,{store,media,catalog,adapter,ctx});
  const removeSlot=ctx.slots.inject('settings.section',()=>ctx.slots.register({
    name:'settings.section',id:'whale-profile',order:9,label:()=> '用量统计',
  },Settings));
  // ocean 变化不会触发 profile store 的订阅，这里做一次轻量比对后让账户卡重绘。
  let lastOceanId=readOceanAppearanceId();
  const syncAppearance=()=>{
    if(disposed)return;
    // 窗口隐藏时不做轮询，回到前台由 visibilitychange 立即补一次。
    if(doc.visibilityState==='hidden')return;
    const id=readOceanAppearanceId();
    if(id===lastOceanId)return;
    lastOceanId=id;
    if(!id||!THEME_IDS.has(id))return;
    const value=store.getSnapshot()?.value;
    if(!value||value.enabled===true){store.refresh();return;}
    // 用户重新选择了套装：把「配套外观」重新启用，账户卡恢复装饰。
    try{store.commit({...value,themeId:id,enabled:true})?.catch?.(()=>{});}catch{}
  };
  let appearanceOff=null;
  try{appearanceOff=ctx.on?.('theme/change',syncAppearance);}catch{}
  const appearanceTimer=setInterval(syncAppearance,2000);
  const onAppearanceVisible=()=>{ if(doc.visibilityState==='visible')syncAppearance(); };
  try{doc.addEventListener?.('visibilitychange',onAppearanceVisible);}catch{}
  const runtime={
    store,media,adapter,syncAppearance,
    getDiagnostics:()=>({available:!disposed,media:media.getDiagnostics(),account:adapter.getStatus?.(),preferences:store.getSnapshot().status,themeCount:catalog.themes.length,appearance:lastOceanId}),
    dispose(){
      if(disposed)return;disposed=true;
      try{if(typeof appearanceOff==='function')appearanceOff();}catch{}
      try{win.removeEventListener?.('wd-community-identity-change',onCommunityIdentity);}catch{}
      clearInterval(appearanceTimer);
      try{doc.removeEventListener?.('visibilitychange',onAppearanceVisible);}catch{}
      removeSlot?.();adapter.dispose();media.dispose();store.dispose();sheet.remove();installed.delete(ctx);
    }
  };
  installed.set(ctx,runtime);
  win.__WD_PROFILE_DIAGNOSTICS__=runtime.getDiagnostics;
  // 供「鲸梦主题 → 当前使用」卡片复用身份编辑与头像框/背景渲染。
  win.__WD_PROFILE__={
    store,media,adapter,catalog,prepareAvatar,
    assetUrl:media.assetUrl,
    readOceanAppearanceId,
  };
  ctx.effect?.(()=>()=>{
    runtime.dispose();
    if(win.__WD_PROFILE_DIAGNOSTICS__===runtime.getDiagnostics)delete win.__WD_PROFILE_DIAGNOSTICS__;
    if(win.__WD_PROFILE__)delete win.__WD_PROFILE__;
  },'whale-dream: profile media and account decoration');
  return runtime;
}
