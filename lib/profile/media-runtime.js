/** Browser media lifecycle: only visible selected scenes decode; no animation RAF loop. */
export function createMediaRuntime({catalog,document:doc=globalThis.document,window:win=globalThis.window,onError=()=>{}}) {
  const themes=new Map(catalog.themes.map(t=>[t.id,t]));
  const base='/whale-dream/api/profile/'+encodeURIComponent(catalog.version)+'/';
  const groups=new Set();
  let disposed=false,timer=null,transparentVideo=null,startupActive=!!win.__WHALE_DREAM_STARTUP__?.active;
  const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const epoch=win.performance?.now?.()||Date.now();
  const now=()=>win.performance?.now?.()||Date.now();
  const phase=()=>((now()-epoch)/1000)%8;
  const desktopAssets=/^(?:dsh-app:|file:)$/i.test(win.location?.protocol||'');
  const assetUrl=(id,file)=>{
    const files=themes.get(id)?.files;
    if(!files||!Object.hasOwn(files,file))return '';
    const relative=encodeURIComponent(id)+'/'+encodeURIComponent(file);
    return desktopAssets?'plugins/dsh-whale-dream/assets/profile/'+relative+'?v='+encodeURIComponent(catalog.version):base+relative;
  };
  const listen=(target,name,fn,options)=>{target?.addEventListener?.(name,fn,options);return()=>target?.removeEventListener?.(name,fn,options);};
  const releases=[];
  const observer=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(entries=>{
    for(const e of entries){const group=[...groups].find(g=>g.container===e.target);if(group){group.visible=e.isIntersecting&&e.intersectionRatio>0;group.reconcile();}}
  },{threshold:0.01}):null;
  function changed(){for(const group of groups)group.reconcile();updateTimer();}
  function updateTimer(){
    const active=[...groups].some(g=>g.active);
    if(active&&!timer)timer=win.setInterval(tick,3000);
    if(!active&&timer){win.clearInterval(timer);timer=null;}
  }
  function tick(){
    for(const group of groups){
      if(!group.active)continue;
      for(const layer of group.layers){
        const v=layer.video;if(!v||v.paused||v.readyState<2)continue;
        const target=phase(),distance=Math.abs(v.currentTime-target);
        if(distance>0.45&&distance<7.55){try{v.currentTime=target;}catch{}}
        if(group.options.motion==='auto'&&group.options.size!=='compact'&&!group.autoCompact){
          const q=v.getVideoPlaybackQuality?.();
          if(q&&q.totalVideoFrames>96&&q.droppedVideoFrames/q.totalVideoFrames>0.12){group.autoCompact=true;group.rebuild();break;}
        }
      }
    }
  }
  releases.push(listen(doc,'visibilitychange',changed),listen(win,'pageshow',changed));
  if(reduced?.addEventListener)releases.push(listen(reduced,'change',changed));
  else if(reduced?.addListener){reduced.addListener(changed);releases.push(()=>reduced.removeListener(changed));}
  releases.push(listen(doc,'whale-dream:startup-complete',()=>{startupActive=false;changed();}));

  function create(container,initial,kind) {
    if(disposed)throw new Error('Profile media runtime is disposed.');
    const group={container,kind,options:{motion:'auto',size:'full',backgroundX:50,backgroundZoom:1,showSubject:true,...initial},visible:!observer,active:false,dead:false,autoCompact:false,layers:[],unloadTimer:null,signature:''};
    if(!themes.has(group.options.themeId))group.options.themeId=catalog.themes[0]?.id||'';
    container.classList.add('wdp-media-root');
    container.dataset.wdpMedia=kind;
    function imageLayer(file,role) {
      const img=doc.createElement('img');img.className='wdp-media-still wdp-media-'+role;img.alt='';img.draggable=false;img.decoding='async';
      img.src=assetUrl(group.options.themeId,file);container.appendChild(img);return img;
    }
    function dropVideo(layer) {
      const v=layer.video;if(!v)return;
      layer.token++;
      for(const off of layer.releases)off();layer.releases=[];
      try{v.pause();v.removeAttribute('src');v.load();}catch{}
      v.remove();layer.video=null;layer.playing=false;
    }
    function poster(layer) {
      if(layer.animated){layer.image.src=assetUrl(group.options.themeId,layer.posterFile);layer.animated=false;}
      layer.image.style.visibility='visible';
      if(layer.video)layer.video.style.opacity='0';
    }
    function failed(layer,reason) {
      dropVideo(layer);layer.failed=true;poster(layer);
      container.dataset.wdpFallback=reason;
      if(group.kind==='frame'&&group.active&&assetUrl(group.options.themeId,'frame-small.webp')){
        layer.image.src=assetUrl(group.options.themeId,'frame-small.webp');layer.animated=true;
      }
      onError({themeId:group.options.themeId,layer:layer.role,reason});
    }
    function ensureVideo(layer) {
      if(layer.failed){
        if(group.kind==='frame'&&!layer.animated&&group.active){layer.image.src=assetUrl(group.options.themeId,'frame-small.webp');layer.animated=true;}
        return;
      }
      if(layer.transparent&&transparentVideo===false){failed(layer,'透明视频不可用，已使用备用图');return;}
      if(!layer.video){
        const v=doc.createElement('video');layer.video=v;layer.token++;
        const token=layer.token;
        v.className='wdp-media-video wdp-media-'+layer.role;v.setAttribute('aria-hidden','true');v.setAttribute('playsinline','');v.setAttribute('muted','');
        v.muted=true;v.defaultMuted=true;v.playsInline=true;v.loop=true;v.preload='none';v.tabIndex=-1;v.disablePictureInPicture=true;v.style.opacity='0';
        const current=()=>!group.dead&&layer.video===v&&token===layer.token;
        const reveal=()=>{
          if(!current()||!group.active)return;
          if(layer.transparent&&transparentVideo==null&&v.readyState>=2){
            try{
              const canvas=doc.createElement('canvas');canvas.width=2;canvas.height=2;const c=canvas.getContext('2d',{willReadFrequently:true});
              if(c){c.clearRect(0,0,2,2);c.drawImage(v,0,0,2,2,0,0,2,2);transparentVideo=c.getImageData(0,0,1,1).data[3]<200;}
            }catch{}
          }
          if(layer.transparent&&transparentVideo===false){failed(layer,'透明视频不可用，已使用备用图');return;}
          v.style.opacity='1';layer.image.style.visibility='hidden';layer.playing=true;
          delete container.dataset.wdpFallback;
        };
        layer.releases=[listen(v,'loadedmetadata',()=>{if(!current())return;try{v.currentTime=phase();}catch{}}),listen(v,'playing',reveal),listen(v,'seeked',reveal),listen(v,'error',()=>{if(current())failed(layer,'素材加载失败，已使用静态封面');})];
        container.appendChild(v);v.src=assetUrl(group.options.themeId,layer.videoFile);
      }
      const v=layer.video, token=layer.token;
      if(v.paused){
        let result;
        try{result=v.play();}catch{poster(layer);container.dataset.wdpFallback='浏览器暂停了自动播放';return;}
        result?.catch?.(()=>{
          if(group.dead||!group.active||layer.video!==v||layer.token!==token)return;
          poster(layer);container.dataset.wdpFallback='浏览器暂停了自动播放';
        });
      }
    }
    function applyPosition(){
      const x=Number.isFinite(group.options.backgroundX)?Math.max(0,Math.min(100,group.options.backgroundX)):50;
      const zoom=Number.isFinite(group.options.backgroundZoom)?Math.max(1,Math.min(1.8,group.options.backgroundZoom)):1;
      container.style.setProperty('--wdp-bg-x',x+'%');container.style.setProperty('--wdp-bg-zoom',String(zoom));
      container.dataset.wdpSize=group.options.size;
      container.dataset.wdpSubject=group.options.showSubject===false?'hidden':'visible';
    }
    group.rebuild=()=>{
      if(group.dead)return;
      if(group.unloadTimer){win.clearTimeout(group.unloadTimer);group.unloadTimer=null;}
      for(const layer of group.layers){dropVideo(layer);layer.image.remove();}
      group.layers=[];
      const compact=group.options.size==='compact'||group.options.motion==='lite'||group.autoCompact;
      group.signature=group.options.themeId+'|'+compact;
      container.dataset.wdpQuality=compact?'compact':'full';
      const definitions=kind==='frame'?[['frame','frame-still.png','frame-compact.webm',true]]:[['environment','environment.jpg','environment-compact.mp4',false],['subject','subject-still.png','subject-compact.webm',true]];
      for(const [role,posterFile,videoFile,transparent] of definitions){
        const image=imageLayer(posterFile,role);
        group.layers.push({role,posterFile,videoFile,transparent,image,video:null,releases:[],token:0,failed:false,playing:false,animated:false});
      }
      applyPosition();group.reconcile();
    };
    group.reconcile=()=>{
      if(group.dead)return;
      group.active=container.isConnected&&group.visible&&doc.visibilityState!=='hidden'&&!reduced?.matches&&!startupActive&&group.options.motion!=='off'&&group.options.enabled!==false;
      if(group.active&&group.unloadTimer){win.clearTimeout(group.unloadTimer);group.unloadTimer=null;}
      for(const layer of group.layers){
        const show=layer.role!=='subject'||group.options.showSubject!==false;
        if(group.active&&show)ensureVideo(layer);
        else{try{layer.video?.pause();}catch{}poster(layer);layer.playing=false;}
      }
      if(!group.active&&!group.unloadTimer)group.unloadTimer=win.setTimeout(()=>{group.unloadTimer=null;for(const layer of group.layers)dropVideo(layer);},1200);
      updateTimer();
    };
    groups.add(group);
    if(observer)observer.observe(container);
    group.rebuild();
    return {
      update(patch){
        if(group.dead)return;
        const previous=group.options.themeId;group.options={...group.options,...patch};
        if(!themes.has(group.options.themeId))group.options.themeId=catalog.themes[0].id;
        if(previous!==group.options.themeId)group.autoCompact=false;
        const compact=group.options.size==='compact'||group.options.motion==='lite'||group.autoCompact;
        if(group.signature!==group.options.themeId+'|'+compact)group.rebuild();else{applyPosition();group.reconcile();}
      },
      dispose(){
        if(group.dead)return;group.dead=true;
        observer?.unobserve(container);
        if(group.unloadTimer)win.clearTimeout(group.unloadTimer);
        for(const layer of group.layers){dropVideo(layer);layer.image.remove();}
        group.layers=[];groups.delete(group);updateTimer();
        container.classList.remove('wdp-media-root');delete container.dataset.wdpMedia;
      }
    };
  }
  return {
    assetUrl,
    createScene:(container,options)=>create(container,options,'scene'),
    createFrame:(container,options)=>create(container,options,'frame'),
    getDiagnostics:()=>({groups:groups.size,activeGroups:[...groups].filter(g=>g.active).length,videoElements:[...groups].reduce((n,g)=>n+g.layers.filter(l=>l.video).length,0),playing:[...groups].reduce((n,g)=>n+g.layers.filter(l=>l.video&&!l.video.paused).length,0),monitoring:!!timer,reducedMotion:!!reduced?.matches,transparentVideo}),
    refresh:changed,
    dispose(){if(disposed)return;disposed=true;observer?.disconnect();for(const g of [...groups]){g.dead=true;if(g.unloadTimer)win.clearTimeout(g.unloadTimer);for(const l of g.layers){for(const off of l.releases)off();try{l.video?.pause();l.video?.removeAttribute('src');l.video?.load();}catch{}l.video?.remove();l.image.remove();}groups.delete(g);}if(timer)win.clearInterval(timer);timer=null;for(const off of releases)off();}
  };
}

export const mediaStyles=`
.wdp-media-root{position:absolute;inset:0;pointer-events:none;overflow:hidden;isolation:isolate}
.wdp-media-still,.wdp-media-video{display:block;position:absolute;pointer-events:none;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
.wdp-media-environment{inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--wdp-bg-x,50%) 50%;transform:scale(var(--wdp-bg-zoom,1));transform-origin:var(--wdp-bg-x,50%) 50%;z-index:0}
.wdp-media-subject{right:5%;top:0;width:48%;height:100%;object-fit:contain;object-position:center;z-index:1}
.wdp-media-frame{inset:0;width:100%;height:100%;object-fit:contain;z-index:2}
.wdp-media-root[data-wdp-media=frame]{overflow:visible}
.wdp-media-root[data-wdp-subject=hidden] .wdp-media-subject{display:none}
.wdp-media-root[data-wdp-size=compact] .wdp-media-subject{right:2%;width:46%;max-width:220px}
@media(prefers-reduced-motion:reduce){.wdp-media-video{display:none!important}}
`;
