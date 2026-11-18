/** Whale Dream startup bootstrap for DSH's index injection pipeline.
 * A startup splash is presentation only: no permissions, audio, file reads
 * from the browser or changes to chat state. It shares whale-dream.json.
 *
 * Two delivery paths exist and they are not interchangeable:
 *  - `webServer.tapIndex` string transforms run only for indexes the Host
 *    itself serves. The Desktop app never asks the Host for its index: it
 *    serves `dsh-app://app/index.html` from the packaged frontend and then
 *    pulls structured rows from the Host through `dshDesktopBoot.ready()`.
 *  - structured `webserver/index-inject` rows travel on both paths, so the
 *    curtain must be contributed as rows to reach the Desktop window before
 *    its client entry mounts.
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const bootFile=resolve(dirname(fileURLToPath(import.meta.url)),'../../lib/startup/boot.js');
// Read the 28KB bootstrap once; desktop/Host index hooks reuse the same bytes.
const BOOT_SOURCE=readFileSync(bootFile,'utf8');
const PREF_KEY='dsh-whale-dream:startup-enabled';
// Built-in Dream Skin gradients are mirrored from this distribution's
// client palette definitions. They allow the first startup frame to inherit
// all eight preset appearances before the client/React theme mounts.
const PRESET_BOOT_GRADIENTS=Object.freeze({
  "abyss": "radial-gradient(1180px 720px at 76% -14%, rgba(143, 131, 224, 0.32), transparent 64%), radial-gradient(900px 620px at 6% 108%, rgba(48, 138, 179, 0.2), transparent 60%), radial-gradient(1500px 950px at 50% 32%, rgba(34, 36, 41, 0.55), transparent 74%), radial-gradient(1400px 1000px at 50% 54%, transparent 44%, rgba(2, 2, 3, 0.42) 100%), linear-gradient(163deg, #15171b 0%, #0d0f13 55%, #121418 100%)",
  "aurora": "radial-gradient(1180px 720px at 76% -14%, rgba(0, 166, 175, 0.32), transparent 64%), radial-gradient(900px 620px at 6% 108%, rgba(86, 132, 179, 0.2), transparent 60%), radial-gradient(1500px 950px at 50% 32%, rgba(32, 38, 39, 0.55), transparent 74%), radial-gradient(1400px 1000px at 50% 54%, transparent 44%, rgba(1, 3, 3, 0.42) 100%), linear-gradient(163deg, #13191a 0%, #0c1111 55%, #101516 100%)",
  "nebula": "radial-gradient(1180px 720px at 76% -14%, rgba(160, 125, 218, 0.32), transparent 64%), radial-gradient(900px 620px at 6% 108%, rgba(93, 128, 191, 0.2), transparent 60%), radial-gradient(1500px 950px at 50% 32%, rgba(36, 34, 40, 0.55), transparent 74%), radial-gradient(1400px 1000px at 50% 54%, transparent 44%, rgba(2, 2, 3, 0.42) 100%), linear-gradient(163deg, #17161b 0%, #0f0e12 55%, #141217 100%)",
  "ember": "radial-gradient(1180px 720px at 76% -14%, rgba(210, 118, 75, 0.32), transparent 64%), radial-gradient(900px 620px at 6% 108%, rgba(179, 103, 104, 0.2), transparent 60%), radial-gradient(1500px 950px at 50% 32%, rgba(39, 34, 30, 0.55), transparent 74%), radial-gradient(1400px 1000px at 50% 54%, transparent 44%, rgba(3, 2, 1, 0.42) 100%), linear-gradient(163deg, #1a1612 0%, #110e0b 55%, #16120f 100%)",
  "midnight": "radial-gradient(1180px 720px at 76% -14%, rgba(121, 141, 219, 0.32), transparent 64%), radial-gradient(900px 620px at 6% 108%, rgba(84, 132, 181, 0.2), transparent 60%), radial-gradient(1500px 950px at 50% 32%, rgba(27, 28, 29, 0.55), transparent 74%), radial-gradient(1400px 1000px at 50% 54%, transparent 44%, rgba(0, 0, 0, 0.42) 100%), linear-gradient(163deg, #0f0f10 0%, #080809 55%, #0c0c0d 100%)",
  "ivory": "radial-gradient(1120px 680px at 78% -12%, rgba(153, 193, 243, 0.3), transparent 62%), radial-gradient(860px 580px at 8% 106%, rgba(232, 184, 167, 0.22), transparent 58%), radial-gradient(1400px 900px at 50% 30%, rgba(255, 255, 255, 0.62), transparent 74%), radial-gradient(1300px 950px at 50% 56%, transparent 46%, rgba(228, 225, 217, 0.4) 100%), linear-gradient(168deg, #f5f2e9 0%, #f0ece4 55%, #f4f0e8 100%)",
  "mist": "radial-gradient(1120px 680px at 78% -12%, rgba(147, 195, 241, 0.3), transparent 62%), radial-gradient(860px 580px at 8% 106%, rgba(150, 209, 209, 0.22), transparent 58%), radial-gradient(1400px 900px at 50% 30%, rgba(255, 255, 255, 0.62), transparent 74%), radial-gradient(1300px 950px at 50% 56%, transparent 46%, rgba(212, 222, 229, 0.4) 100%), linear-gradient(168deg, #e5eff6 0%, #e0e9f1 55%, #e3edf5 100%)",
  "rose": "radial-gradient(1120px 680px at 78% -12%, rgba(226, 169, 211, 0.3), transparent 62%), radial-gradient(860px 580px at 8% 106%, rgba(215, 183, 222, 0.22), transparent 58%), radial-gradient(1400px 900px at 50% 30%, rgba(255, 255, 255, 0.62), transparent 74%), radial-gradient(1300px 950px at 50% 56%, transparent 46%, rgba(233, 221, 222, 0.4) 100%), linear-gradient(168deg, #faeeef 0%, #f5e8e9 55%, #f9eced 100%)"
});

// Large inline wallpaper data can make whale-dream.json several MB. The
// index-inject and tapIndex hooks may run for the same boot: reuse an
// unchanged parsed snapshot instead of synchronously parsing it twice.
let startupCache=null;

export const inject=['webServer'];

export function readStartupBoot(home=process.env.DSH_HOME||join(homedir(),'.dsh')) {
  const defaults={enabled:true,skin:'nebula',gradient:null};
  const file=join(home,'whale-dream.json');
  let signature='missing', state={};
  try {const st=statSync(file);signature=[st.size,st.mtimeMs,st.ctimeMs].join(':');} catch{}
  if(startupCache && startupCache.file===file && startupCache.signature===signature) return {...startupCache.value};
  try {const raw=JSON.parse(readFileSync(file,'utf8')); if(raw&&typeof raw==='object'&&!Array.isArray(raw))state=raw;} catch{}
  const val=state[PREF_KEY];
  const enabled=val==null?true:!['0','false','off'].includes(String(val).toLowerCase());
  const skin=typeof state['dsh-dream-skin:skin']==='string'?state['dsh-dream-skin:skin'].slice(0,40):defaults.skin;
  const kind=state['dsh-dream-skin:wallpaper-kind'];
  const input=state['dsh-dream-skin:wallpaper-gradient'];
  const userGradient=kind==='gradient' && typeof input==='string' && input.length<6000 &&
    /^(?:linear|radial|conic)-gradient\(/i.test(input.trim()) && !/[<>;]/.test(input) && !/url\(/i.test(input) ? input : null;
  const gradient=userGradient || PRESET_BOOT_GRADIENTS[skin] || null;
  // Mist and Rose are also light themes; the earlier hotfix omitted both.
  const light=/^(ivory|mist|rose|clear|powder|paper|light)/i.test(skin);
  const value={enabled,skin,gradient,light,hasSavedSkin:typeof state['dsh-dream-skin:skin']==='string'};
  startupCache={file,signature,value};
  return {...value};
}
/** Canvas colour for the shell's own first paint, before any script runs.
 * `--dsh-boot-bg` is the variable the Desktop boot kernel paints its card with
 * (`background:var(--dsw-alias-bg-base, var(--dsh-boot-bg, Canvas))`). The theme
 * plugin contributes its own style row from `ui-theme.preference`, so a dark
 * skin under a light preference would paint a white card; setting the variable
 * here — our row lands after theirs — makes the shell's first frame match the
 * skin even before the preference is bridged. */
export function paintCss(boot) {
  const background=boot.light?'#f8f8f5':'#0b0d12';
  const scheme=boot.light?'light':'dark';
  // The theme plugin's own style row declares the same variables on `body`, so
  // ours has to declare them there too — a `:root`-only override would lose to
  // the nearer element for everything inside `body`.
  return `html,body{background-color:${background};color-scheme:${scheme};--dsh-boot-bg:${background}}[data-dsh-boot]{--dsw-alias-bg-base:${background}!important;--dsh-boot-bg:${background}!important;background-color:${background}!important}body > span[style*="--dsw-specific-sidebar-fill"]{--dsw-specific-sidebar-fill:rgba(0,0,0,0)!important}html[data-windows-titlebar] div:has(> [data-shell-overlay])::before{background:transparent!important}`;
}
/** The bootstrap script text: config global plus the curtain source. */
export function bootScript(boot, script=BOOT_SOURCE) {
  const safe=JSON.stringify({...boot, assetUrl:'/whale-dream/api/startup/whale-glyph-startup-00fd90a10cd5.mp4', lightAssetUrl:'/whale-dream/api/startup/whale-glyph-light-cdc6dd72a4f0.mp4', fallbackAssetUrl:'/whale-dream/api/startup/whale-glyph-fallback-f1243389174d.webp', staticAssetUrl:'plugins/dsh-whale-dream/assets/whale-glyph-startup-00fd90a10cd5.mp4', staticLightAssetUrl:'plugins/dsh-whale-dream/assets/whale-glyph-light-cdc6dd72a4f0.mp4', staticFallbackAssetUrl:'plugins/dsh-whale-dream/assets/whale-glyph-fallback-f1243389174d.webp'}).replace(/</g,'\\u003c').replace(/\u2028|\u2029/g,'');
  return `window.__WD_SPLASH_BOOT__=${safe};\n${script.replace(/<\/script/gi,'<\\/script')}`;
}
/** Structured rows for the index injection table (served and Desktop form). */
export function indexRows(boot=readStartupBoot(), script) {
  if (!boot.enabled) return [{kind:'style',text:paintCss(boot)},{kind:'script',placement:'body',text:'window.__WD_SPLASH_BOOT__='+JSON.stringify(boot).replace(/</g,'\\u003c')+';'}];
  return [
    {kind:'style', text:paintCss(boot)},
    {kind:'script', placement:'body', text:bootScript(boot, script)},
  ];
}
export function injectStartup(html,boot=readStartupBoot(),script=BOOT_SOURCE) {
  // Match the marker we actually inject, not loose substrings: the desktop index
  // ships the client bundle inline, and that bundle contains the words
  // `wd-startup-screen` / `__WHALE_DREAM_STARTUP__`, so the old guard skipped
  // injection there and the curtain only appeared once the plugins had loaded
  // (the "Loading plugins…" flash).
  if(typeof html!=='string'||(html.includes('data-wd-startup="boot"') || html.includes('data-wd-startup="config"'))) return html;
  if (!boot.enabled) {
    const body=/<body\b[^>]*>/i.exec(html);
    if(!body)return html;
    const cfg='<style data-wd-startup="paint">'+paintCss(boot)+'</style><script data-wd-startup="config">window.__WD_SPLASH_BOOT__='+JSON.stringify(boot).replace(/</g,'\\u003c')+';</script>';
    return html.slice(0,body.index+body[0].length)+cfg+html.slice(body.index+body[0].length);
  }
  const body=/<body\b[^>]*>/i.exec(html);if(!body)return html;
  const load=`<style data-wd-startup="paint">${paintCss(boot)}</style><script data-wd-startup="boot">${bootScript(boot,script)}</script>`;
  return html.slice(0,body.index+body[0].length)+load+html.slice(body.index+body[0].length);
}
export function apply(ctx) {
  let webServer;
  try {webServer=typeof ctx.get==='function'?ctx.get('webServer'):ctx.webServer;} catch{}
  if(!webServer)return;
  const cleanups=[];
  // Structured rows: the only path that also reaches the Desktop window.
  if(typeof webServer.on==='function' && typeof ctx.effect==='function'){
    ctx.effect(()=>{
      const handler=(table)=>{ try { for(const row of indexRows()) table.push(row); } catch(error) { console.error('[whale-dream] startup rows failed', error); } };
      webServer.on('webserver/index-inject',handler);
      return ()=>{ if(typeof webServer.off==='function')webServer.off('webserver/index-inject',handler); };
    },'whale-dream: startup index rows');
  }
  // String transform: keeps Host-served indexes byte-identical to the rows form.
  if(typeof webServer.tapIndex==='function'){
    const dispose=webServer.tapIndex(html=>injectStartup(html));
    if(typeof dispose==='function' && typeof ctx.effect==='function')ctx.effect(()=>dispose,'whale-dream: startup index hook');
    else if(typeof dispose==='function')cleanups.push(dispose);
  }
  return ()=>{for(const fn of cleanups)fn();};
}
