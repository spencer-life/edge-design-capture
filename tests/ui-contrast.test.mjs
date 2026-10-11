import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contrastRatio} from '../extension/lib/core.js';
const css=fs.readFileSync(new URL('../extension/sidepanel.css',import.meta.url),'utf8');
const variables=selector=>Object.fromEntries([...css.match(selector)[1].matchAll(/--([\w-]+):(#[\da-f]+)/gi)].map(m=>[m[1],m[2]]));
const dark=variables(/:root\{([^}]+)\}/),light={...dark,...variables(/:root\[data-theme=light\]\{([^}]+)\}/)};
test('outlined controls meet 3:1 against both panel surfaces in both themes',()=>{for(const theme of [dark,light])for(const surface of ['bg','surface'])assert.ok(contrastRatio(theme['control-line'],theme[surface])>=3);});
test('colored action labels meet 4.5:1 in normal and hover states',()=>{for(const color of [dark.blue,dark.green,dark.violet,dark['violet-hover'],'#3069d5','#208054'])assert.ok(contrastRatio('#FFFFFF',color)>=4.5,`Low-contrast action: ${color}`);});
