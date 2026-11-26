import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
let esbuild;
try {esbuild=await import('esbuild');}
catch(error){if(process.env.WD_ESBUILD_MODULE)esbuild=await import(process.env.WD_ESBUILD_MODULE);else throw error;}
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
let base=await readFile(join(root,'lib/client-base.js'),'utf8');
const anchor='  setSettingsComponent(Settings);\n  apply(ctx);';
if(base.split(anchor).length!==2)throw Error('Client integration anchor is missing or ambiguous.');
base=base.replace(anchor,anchor+'\n  let profileRuntime;\n  try { profileRuntime = WDProfile.installProfile(ctx, import_react, { storage }); }\n  catch (error) { console.error("[whale-dream] profile integration failed:", error); }\n  try { if (typeof window === "object" && window.__WD_PROFILE__) window.__WD_PROFILE__.Select = Select; }\n  catch (error) { console.error("[whale-dream] select bridge failed:", error); }');
base=base.replace('    profilesController.dispose();','    profileRuntime?.dispose();\n    profilesController.dispose();');
base=base.replace(/var version = "\d+\.\d+\.\d+";/,'var version = '+JSON.stringify(pkg.version)+';');
base=base.replace('return { version, ocean: activeBackground?.diagnostics?.() ?? null };','return { version, ocean: activeBackground?.diagnostics?.() ?? null, profile: window.__WD_PROFILE_DIAGNOSTICS__?.() ?? null };');
const compiled=await esbuild.build({entryPoints:[join(root,'lib/profile/client-runtime.js')],bundle:true,format:'iife',globalName:'WDProfile',platform:'browser',target:['chrome110','safari16.4'],write:false,legalComments:'inline',minify:false});
const code='/* Whale Dream profile integration '+pkg.version+' — rebuild with npm run build. */\n'+compiled.outputFiles[0].text+'\n'+base;
await writeFile(join(root,'lib/client.js'),code);
console.log('Built dsh-whale-dream '+pkg.version+' with 38 profile themes.');
