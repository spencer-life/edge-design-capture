import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual([...manifest.permissions].sort(),['activeTab','clipboardWrite','scripting','sidePanel','storage'].sort());
for(const key of ['host_permissions','content_scripts','externally_connectable','web_accessible_resources'])assert.ok(!manifest[key],`${key} unexpectedly expands access`);
assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
assert.ok(!manifest.content_security_policy.extension_pages.includes("script-src 'self' 'unsafe"));
for(const file of [manifest.background.service_worker,manifest.side_panel.default_path,...Object.values(manifest.icons)])assert.ok(fs.existsSync(path.join(root,'extension',file)),`Missing ${file}`);
let count=0;
for(const file of [...walk(path.join(root,'extension')),...walk(path.join(root,'scripts')),...walk(path.join(root,'tests'))]){
 if(/\.(m?js)$/.test(file)){execFileSync(process.execPath,['--check',file]);count++;}
 if(file.endsWith('.py'))execFileSync('python3',['-c','import ast,sys;ast.parse(open(sys.argv[1]).read())',file]);
 if(file.includes(path.sep+'extension'+path.sep)){
   assert.ok(!/\.(woff2?|ttf|otf)$/i.test(file),'Font files must not be distributed');
   if(file.endsWith('.js')){const s=fs.readFileSync(file,'utf8');for(const pattern of [/\beval\s*\(/,/new Function\s*\(/,/\.innerHTML\s*=/,/insertAdjacentHTML\s*\(/,/\bfetch\s*\(/,/XMLHttpRequest/,/document\.cookie/,/chrome\.cookies/])assert.ok(!pattern.test(s),`Unexpected unsafe/network operation ${pattern} in ${file}`);}
 }
}
const html=fs.readFileSync(path.join(root,'extension/sidepanel.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate DOM IDs');
for(const [,id]of html.matchAll(/\b(?:for|aria-controls|aria-labelledby)="([^"]+)"/g))for(const part of id.split(' '))assert.ok(ids.includes(part),`Missing control/label ${part}`);
assert.ok(!/\son\w+=/i.test(html),'No inline event handlers');
console.log(`PASS: ${count} JavaScript syntax checks; Python syntax, MV3 manifest, asset paths, DOM IDs, CSP, permissions and static safety checks.`);
console.log('Static checks are not a substitute for a security review or native browser tests.');
