import {VERSION,MAX_SAVED,addSaved,byteSize,cleanSourceURL,safeAssetURL,safeFilename,colorInfo,contrastRatio,formatValue,tokenizeCSS,tokensJSON,inferredPaletteCSS,declarationsCSS,makeDocument,codexPrompt,reactComponent} from './lib/core.js';
import {zipFiles} from './lib/zip.js';
import {imageReference,dataURLBlob} from './lib/images.js';

const $=id=>document.getElementById(id);
const state={savedSnapshot:false,target:null,windowId:null,epoch:0,selection:null,scan:null,component:null,reference:null,source:null,pin:null,system:'tokens',saved:[],busy:false};
let port,previewURL=null;
const ui=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
async function rpc(action,fields={}){const r=await chrome.runtime.sendMessage({kind:'lens-panel',action,...fields});if(!r?.ok)throw new Error(r?.error||'The extension did not respond. Reload it from the extensions page.');return r.data;}
function listenPort(){port=chrome.runtime.connect({name:'design-lens-panel'});if(state.target)port.postMessage({tabId:state.target.id,windowId:state.windowId,standalone:new URLSearchParams(location.search).has('sourceWindow')});port.onDisconnect.addListener(()=>{setTimeout(()=>{try{listenPort();}catch{/* Extension update/reload. */}},500);});}
async function run(fn){if(state.busy)return;state.busy=true;document.body.classList.add('busy');try{await fn();}catch(e){status(e.message||String(e),true);}finally{state.busy=false;document.body.classList.remove('busy');}}
const action=(id,fn)=>$(id).addEventListener('click',()=>run(fn));
async function command(command,extra={}){if(state.savedSnapshot){if(['inspect','navigate','component'].includes(command))throw new Error('This is a saved snapshot. Pick a live element before inspecting or capturing again.');if(['pick','scan'].includes(command))clearCapture();}if(!state.target)await connect();const epoch=state.epoch;const value=await rpc('command',{tabId:state.target.id,command,...extra});if(epoch!==state.epoch)throw new Error('The source changed. Retry on the current page.');return value;}
function clearCapture(){state.epoch++;state.savedSnapshot=false;state.selection=null;state.scan=null;state.component=null;state.reference=null;state.source=null;state.pin=null;render();}
async function connect(){
  const t=await rpc('target',{windowId:state.windowId});if(state.savedSnapshot)clearCapture();
  if(t.id!==state.target?.id){clearCapture();state.target=t;}
  port?.postMessage({tabId:t.id,windowId:state.windowId,standalone:new URLSearchParams(location.search).has('sourceWindow')});
  const data=await rpc('command',{tabId:t.id,command:'ping'});
  if(state.source?.documentId&&data.source.documentId!==state.source.documentId)clearCapture();
  state.source=data.source;
  $('source-label').textContent=new URL(data.source.url).host||'Local file';$('source-label').title=data.source.url;
  $('connection-dot').classList.add('connected');status('Connected. Pick an element or scan the page.');
}
function tab(name){for(const el of document.querySelectorAll('[data-tab]')){const on=el.dataset.tab===name;el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;$(el.getAttribute('aria-controls')).hidden=!on;}}
function keyboardTabs(selector,choose){const buttons=[...document.querySelectorAll(selector)];buttons.forEach((b,i)=>{b.addEventListener('click',()=>choose(b));b.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;else if(e.key==='ArrowLeft')next=(i-1+buttons.length)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();choose(buttons[next]);buttons[next].focus();});});}
keyboardTabs('[data-tab]',b=>tab(b.dataset.tab));
keyboardTabs('[data-system]',b=>{state.system=b.dataset.system;for(const n of document.querySelectorAll('[data-system]')){n.setAttribute('aria-selected',String(n===b));n.tabIndex=n===b?0:-1;}renderSystem();});
async function copy(text){if(!text)throw new Error('There is nothing to copy yet.');try{await navigator.clipboard.writeText(text);status('Copied to clipboard.');}catch{tab('export');$('export-output').value=text;$('export-output').focus();$('export-output').select();status('Clipboard access was blocked. The export is selected; press Ctrl+C (Cmd+C on Mac).',true);}}
function download(value,name,type='text/plain'){const blob=value instanceof Blob?value:new Blob([value],{type});const url=URL.createObjectURL(blob),a=ui('a');a.href=url;a.download=safeFilename(name);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);status('Download prepared. Check your browser downloads.');}
function report(){return{schema:'design-lens/report/v1',version:VERSION,capturedAt:new Date().toISOString(),source:state.source,selection:state.selection,component:state.component,scan:state.scan,reference:state.reference,warnings:[...new Set([...(state.selection?.warnings||[]),...(state.component?.warnings||[]),...(state.scan?.warnings||[])])]};}
function hasData(){return!!(state.selection||state.scan||state.component||state.reference);}
function needData(){if(!hasData())throw new Error('Pick an element, scan a page, or add an image reference first.');}
function warnings(id,items){$(id).replaceChildren(...[...new Set(items)].map(w=>ui('p',w,'warning')));}
function copyButton(text,value,cls='property-value'){const b=ui('button',text,cls);b.type='button';b.title='Copy '+value;b.setAttribute('aria-label',/^Copy\b/i.test(text)?text:'Copy '+text);b.addEventListener('click',()=>run(()=>copy(value)));return b;}
function rows(id,properties){const list=$(id);list.replaceChildren();for(const [name,raw]of properties){if(raw==null||raw==='')continue;const r=ui('div',undefined,'property-row');r.append(ui('span',name,'property-name'));const val=String(raw),f=formatValue(name,val),b=copyButton(f.display,val);if((name.includes('color')||name==='fill'||name==='stroke')&&CSS.supports('color',val)){b.textContent=colorInfo(val).hex;b.setAttribute('aria-label','Copy '+b.textContent);const dot=ui('span',undefined,'color-dot');dot.style.backgroundColor=val;dot.setAttribute('aria-hidden','true');b.prepend(dot);}r.append(b);list.append(r);}}
function selected(value){if(value.source.documentId!==state.source?.documentId&&state.source)clearCapture();state.savedSnapshot=false;if(state.scan?.selectedContext&&state.scan.selectedContext!==value.selector){state.scan={...state.scan,tokens:state.scan.tokens.filter(t=>t.scope==='root'),selectedContext:null,warnings:[...state.scan.warnings,'Selected-scope tokens were cleared after changing elements. Scan again to collect tokens for this selection.']};}state.selection=value;state.source=value.source;state.component=null;$('stop').hidden=true;render();tab('inspect');status('Selected '+value.label+'. Click any value to copy it.');}
function renderSelection(){const s=state.selection;$('inspect-empty').hidden=!!s;$('selection-view').hidden=!s;if(!s)return;
  $('selection-kind').textContent=s.kind==='live DOM element'?'Observed':'Image / embed';$('selection-title').textContent=s.label;$('selection-size').textContent=`${s.rect.width.toFixed(2)} × ${s.rect.height.toFixed(2)} px · ${s.pattern.name}`;$('breadcrumbs').textContent=s.ancestors.join(' › ');
  for(const d of ['parent','child','previous','next'])$(d).disabled=!s.navigation[d];warnings('selection-warnings',s.warnings);
  const props=Object.entries(s.styles);
  rows('typography-rows',props.filter(([p,v])=>['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color'].includes(p)||(/^(font-|text-transform|white-space)/.test(p)&&!['normal','none','100%'].includes(v))));
  rows('layout-rows',props.filter(([p,v])=>['display','position','box-sizing','width','height'].includes(p)||(/^(min-|max-|overflow)/.test(p)&&!['none','auto','0px','visible'].includes(v))||(/^(flex|gap|row-gap|column-gap|align|justify)/.test(p)&&s.styles.display.includes('flex'))||(/^(grid|gap|row-gap|column-gap|align|justify)/.test(p)&&s.styles.display.includes('grid'))));
  rows('surface-rows',props.filter(([p])=>/^(background-|border-|box-shadow|opacity|filter|backdrop|outline)/.test(p)));
  rows('motion-rows',props.filter(([p])=>/^(transition|animation|transform|translate|rotate|scale)/.test(p)));
  rows('semantics',[['pattern',s.pattern.name],['evidence',s.pattern.basis],['accessible label',s.accessibility.label||'Not set directly'],['tag',s.tag]]);
  for(const x of ['margin','padding','border']){$(x+'-label').textContent=x+' '+['top','right','bottom','left'].map(side=>s.styles[`${x}-${side}${x==='border'?'-width':''}`]).join(' / ');}
  $('box-content').textContent=`${s.styles.width} × ${s.styles.height}`;
  const contrast=contrastRatio(s.accessibility.foreground,s.accessibility.background);
  $('contrast').textContent=contrast===null?'Contrast: unavailable for these colors/backgrounds. Not a full accessibility audit.':`Solid-color contrast: ${contrast.toFixed(2)}:1. ${contrast>=4.5?'Meets 4.5:1 normal-text AA threshold.':'Below 4.5:1 normal-text AA threshold.'} Estimate, not a full audit.`;
  if(state.pin){const a=state.pin.rect,b=s.documentRect||s.rect;const dx=Math.max(0,a.x-(b.x+b.width),b.x-(a.x+a.width)),dy=Math.max(0,a.y-(b.y+b.height),b.y-(a.y+a.height));$('measurement').textContent=`From ${state.pin.label}: horizontal gap ${dx.toFixed(2)} px; vertical gap ${dy.toFixed(2)} px. Document-coordinate snapshots; layout changes can affect accuracy.`;}else $('measurement').textContent='Pin one element, then select another to compare their positions.';
}
function matches(value){return JSON.stringify(value).toLowerCase().includes($('system-search').value.toLowerCase().trim());}
function renderSystem(){$('system-content').setAttribute('aria-labelledby',state.system+'-system-tab');const scan=state.scan,holder=$('system-content');$('eyedropper').hidden=state.system!=='colors'||!('EyeDropper'in window);
  $('copy-system').textContent={tokens:'Copy tokens CSS',colors:'Copy palette CSS',fonts:'Copy fonts JSON',scale:'Copy scale JSON',assets:'Copy assets JSON'}[state.system];
  if(!scan){holder.replaceChildren(ui('p','Scan the page to collect its design system.','muted'));$('scan-count').textContent='';warnings('scan-warnings',[]);return;}
  $('scan-count').textContent=`${scan.visible} visible elements`;
  warnings('scan-warnings',scan.warnings);holder.replaceChildren();
  if(state.system==='tokens'){
    const tokens=scan.tokens.filter(matches);
    if(!tokens.length)holder.append(ui('p','No matching CSS custom properties found. The site may not expose tokens; its observed colors are available in Colors.','fine'));
    for(const t of tokens){const card=ui('article',undefined,'token-card'),head=ui('div',undefined,'token-heading');head.append(ui('h3',t.name,'token-name'),ui('span',t.scope,'tag'));card.append(head,copyButton(t.resolved,t.resolved,'token-value'));
      if(t.definitions?.length){const d=ui('details');d.append(ui('summary','Declaration candidates (not guaranteed winners)'));for(const def of t.definitions)d.append(ui('p',`${def.selector}: ${def.raw} · ${def.source}${def.condition||''}`));card.append(d);}holder.append(card);}
  }else if(state.system==='colors'){
    holder.append(ui('p','Sorted by computed uses, not pixel coverage. Hover for RGB/HSL; click to copy HEX. Palette names are inferred.','fine'));const grid=ui('div',undefined,'palette');
    for(const c of scan.colors.filter(matches)){const info=colorInfo(c.value),b=copyButton('',info.hex,'color-card');b.title=`${info.hex}\n${info.rgb}\n${info.hsl}`;b.setAttribute('aria-label',`Copy color ${info.hex}, ${c.count} computed uses`);const sw=ui('span',undefined,'color-sample');if(CSS.supports('color',c.value))sw.style.backgroundColor=c.value;const meta=ui('span',info.hex,'color-meta');meta.append(ui('small',c.count+' computed uses'));b.append(sw,meta);grid.append(b);}holder.append(grid);
  }else if(state.system==='fonts'){
    for(const f of scan.fonts.filter(matches)){const c=ui('article',undefined,'font-card');c.append(ui('h3',f.family),ui('p',`Sizes: ${f.sizes.join(', ')} · Weights: ${f.weights.join(', ')}`,'fine'),ui('p','Line heights: '+f.lineHeights.join(', '),'fine'),ui('p',f.note,'fine'),copyButton('Copy font stack',f.family,'button outline small'));holder.append(c);}
    holder.append(ui('p','FontFace availability is not proof of which font rendered each glyph. No font files are fetched or exported.','fine'));
  }else if(state.system==='scale'){
    for(const [name,values]of [['Spacing',scan.spacing],['Corner radii',scan.radii],['Shadows',scan.shadows]]){holder.append(ui('h3',name,'scale-title'));for(const v of values.filter(matches))holder.append(copyButton(`${formatValue(name.toLowerCase(),v.value).display} · ${v.count} uses`,v.value,'token-value'));}
    holder.append(ui('p','Observed repeated values, not proof of the original design scale. Raw measurements are retained.','fine'));
  }else{
    for(const [i,a]of scan.assets.entries()){if(!matches(a))continue;const c=ui('article',undefined,'asset-card');c.append(ui('h3',a.type==='svg'?'Inline SVG':a.type),ui('p',a.url||a.label,'fine'));if(a.url){c.append(copyButton('Copy asset URL',a.url,'button outline small'));const u=safeAssetURL(a.url);if(u?.startsWith('http')){const b=ui('button','Open asset','button outline small');b.addEventListener('click',()=>run(()=>chrome.tabs.create({url:u})));c.append(b);}}else if(a.svg){c.append(copyButton('Copy SVG',a.svg,'button outline small'));const b=ui('button','Save SVG','button outline small');b.addEventListener('click',()=>download(a.svg,`asset-${i+1}.svg`,'image/svg+xml'));c.append(b);}holder.append(c);}
    holder.append(ui('p','Asset files remain at their source URLs. Use only assets you have permission to reuse. Font files are not included.','fine'));
  }
}
function systemExport(){const s=state.scan;if(!s)throw new Error('Scan the page first.');return{tokens:()=>tokenizeCSS(s.tokens)+ (s.tokens.some(t=>t.scope==='selected')?'\n'+tokenizeCSS(s.tokens,'selected'):''),colors:()=>inferredPaletteCSS(s.colors),fonts:()=>JSON.stringify({fonts:s.fonts,fontFaces:s.fontFaces},null,2),scale:()=>JSON.stringify({spacing:s.spacing,radii:s.radii,shadows:s.shadows},null,2),assets:()=>JSON.stringify(s.assets,null,2)}[state.system]();}
function exportValue(){if(!hasData())return'';switch($('export-format').value){case'prompt':return codexPrompt(report(),$('target-stack').value);case'html':return state.component?makeDocument(state.component,$('allow-assets').checked):'';case'css':return state.component?.css|| (state.selection?declarationsCSS(state.selection.styles):'');case'react':return state.component?reactComponent(state.component):'';case'tokens':return state.scan?tokenizeCSS(state.scan.tokens)+'\n'+tokenizeCSS(state.scan.tokens,'selected'):'';case'json':return JSON.stringify(report(),null,2);default:return'';}}
function renderExport(){const c=state.component;$('component-info').textContent=c?`${c.nodes} elements · ${(byteSize(c)/1024).toFixed(0)} KB · ${c.partial?'PARTIAL snapshot':'static snapshot'}`:'Choose an element in Inspect first.';
  $('preview-details').hidden=!c;
  const r=state.reference;$('reference-view').hidden=!r;
  if(r){$('reference-image').src=r.dataURL;$('reference-info').textContent=`${r.width} × ${r.height} px · sampled palette, not original tokens`;$('reference-colors').replaceChildren();for(const col of r.colors){const b=copyButton('',col.value);b.style.backgroundColor=col.value;b.title=col.value+' · about '+col.share+'% of sampled pixels';b.setAttribute('aria-label','Copy sampled color '+col.value);$('reference-colors').append(b);}}
  else $('reference-image').removeAttribute('src');
  $('export-output').value=exportValue();warnings('export-warnings',c?.warnings||[]);
}
let previewComponent=null;
function preview(force=false){if(!force&&state.component===previewComponent)return;if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}previewComponent=null;if(state.component&&$('preview-details').open){previewComponent=state.component;previewURL=URL.createObjectURL(new Blob([makeDocument(state.component,false)],{type:'text/html'}));$('component-preview').src=previewURL;}else if($('component-preview').hasAttribute('src'))$('component-preview').removeAttribute('src');}
$('preview-details').addEventListener('toggle',()=>{if($('preview-details').open)preview(true);});

function render(){renderSelection();renderSystem();renderExport();preview();$('copy-all').disabled=!hasData();}
async function capture(){if(!state.selection)throw new Error('Pick a live element before capturing a component.');const c=await command('component',{options:{includeText:$('include-text').checked}});state.component=c;state.source=c.source;renderExport();preview();tab('export');status(c.partial?'Partial capture. Choose a smaller component for a complete snapshot.':'Component captured. HTML, CSS, TSX and a Codex brief are ready.',c.partial);}
async function takeScreenshot(mode,area=null){if(mode==='element'&&!state.selection)throw new Error('Pick a live element before capturing its image.');if(state.savedSnapshot)throw new Error('This is a saved snapshot. Pick a live element or reconnect before taking another screenshot.');const epoch=state.epoch;const data=await rpc('screenshot',{tabId:state.target?.id,mode,documentId:area?.source.documentId||state.source?.documentId});
  if(epoch!==state.epoch)throw new Error('The source changed before the image was ready.');
  if(area&&JSON.stringify([area.source.viewport,area.source.scroll])!==JSON.stringify([data.source.viewport,data.source.scroll]))throw new Error('The page moved or resized after you selected the area. Select it again while the page is still.');
  if(area&&(area.viewport.width!==data.viewport.width||area.viewport.height!==data.viewport.height))throw new Error('The page size changed. Select the area again.');
  const r=await imageReference(dataURLBlob(data.dataURL),'page-reference',area?.rect||(mode==='element'?data.rect:null),data.viewport);
  if(epoch!==state.epoch)throw new Error('The source changed before the image was ready.');
  if(area&&JSON.stringify([area.source.viewport,area.source.scroll])!==JSON.stringify([data.source.viewport,data.source.scroll]))throw new Error('The page moved or resized after you selected the area. Select it again while the page is still.');r.source=data.source;state.reference=r;state.source=data.source;render();tab('export');status('Image reference captured. Attach its PNG alongside the Codex brief.');}
async function save(){needData();const name=$('save-name').value.trim()||state.selection?.label||state.source?.title||state.reference?.name||'Design reference';const entry={id:crypto.randomUUID(),name,createdAt:new Date().toISOString(),report:report()};
  const stored=await chrome.storage.local.get('captures');const next=addSaved(stored.captures||[],entry);await chrome.storage.local.set({captures:next});state.saved=next;renderLibrary();status('Saved in this browser profile.');}
function renderLibrary(){$('saved-count').textContent=String(state.saved.length);$('library-capacity').textContent=`${state.saved.length}/${MAX_SAVED} · ${(byteSize(state.saved)/1e6).toFixed(1)} MB`;$('library-list').replaceChildren();if(!state.saved.length){$('library-list').append(ui('p','No saved references yet. Pick, scan, or capture an image, then save.','fine'));return;}
  for(const item of state.saved){const c=ui('article',undefined,'saved-card');c.append(ui('h3',item.name),ui('p',new Date(item.createdAt).toLocaleString(),'fine'));const bar=ui('div',undefined,'button-row');
    const load=ui('button','Load','button outline small');load.addEventListener('click',()=>run(async()=>{await rpc('command',{tabId:state.target?.id,command:'cancel'}).catch(()=>{});clearCapture();Object.assign(state,{savedSnapshot:true,source:item.report.source,selection:item.report.selection,scan:item.report.scan,component:item.report.component,reference:item.report.reference});render();tab('export');status('Loaded a saved snapshot. Pick a new live element before capturing or refreshing.');}));
    const exp=ui('button','Export JSON','button outline small');exp.addEventListener('click',()=>download(JSON.stringify(item.report,null,2),safeFilename(item.name)+'.json','application/json'));
    const remove=ui('button','Remove','button outline small');remove.addEventListener('click',()=>run(async()=>{if(!window.confirm(`Remove “${item.name}” from this browser? Export it first to keep a copy.`))return;const stored=await chrome.storage.local.get('captures');state.saved=(stored.captures||[]).filter(x=>x.id!==item.id);await chrome.storage.local.set({captures:state.saved});renderLibrary();status('Saved reference removed.');}));bar.append(load,exp,remove);c.append(bar);$('library-list').append(c);}
}
// All browser operations start from explicit controls or the user's picker action.
action('connect',connect);action('pick',async()=>{await command('pick');$('stop').hidden=false;status('Click an element on the page. Esc cancels.');});
action('stop',async()=>{await command('cancel');$('stop').hidden=true;status('Selection stopped. Normal page interaction restored.');});
action('scan',async()=>{status('Scanning accessible page styles…');state.scan=await command('scan');state.source=state.scan.source;render();tab('system');status(`Scanned ${state.scan.visible} visible elements. Restrictions are listed below.`);});
for(const d of ['parent','child','previous','next'])action(d,async()=>selected(await command('navigate',{direction:d})));
action('refresh',async()=>selected(await command('inspect')));
action('pin-measure',async()=>{if(!state.selection)throw new Error('Select an element first.');state.pin={label:state.selection.label,rect:state.selection.documentRect||state.selection.rect};renderSelection();status('Reference A pinned. Select another element to measure.');});
action('capture-from-inspect',capture);action('capture-component',capture);
action('copy-styles',()=>copy(declarationsCSS(state.selection?.styles)));action('copy-selection',()=>copy(JSON.stringify(state.selection,null,2)));
$('system-search').addEventListener('input',renderSystem);action('copy-system',()=>copy(systemExport()));
action('download-system',async()=>{if(!state.scan)throw new Error('Scan a page first.');const value=state.system==='tokens'?tokensJSON(state.scan.tokens):state.system==='colors'?JSON.stringify(state.scan.colors,null,2):systemExport();download(value,'design-'+state.system+'.json','application/json');});
action('eyedropper',async()=>{try{const picked=await new EyeDropper().open();await copy(picked.sRGBHex);}catch(e){if(e.name==='AbortError')status('Eyedropper cancelled.');else throw e;}});
action('capture-region',async()=>{await command('region');$('stop').hidden=false;status('Drag a rectangle on the page. Esc cancels.');});
action('capture-visible',async()=>{if(!state.target)await connect();await takeScreenshot('visible');});action('capture-element',()=>takeScreenshot('element'));
$('import-image').addEventListener('change',()=>run(async()=>{const file=$('import-image').files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type))throw new Error('Choose PNG, JPEG, WebP, GIF or AVIF.');clearCapture();state.reference=await imageReference(file,file.name);state.source=null;render();status('Image imported locally. No fonts or original tokens were extracted from its pixels.');$('import-image').value='';}));
action('download-image',async()=>{if(!state.reference)throw new Error('Capture an image first.');download(dataURLBlob(state.reference.dataURL),'design-reference.png');});
action('copy-image',async()=>{if(!state.reference)throw new Error('Capture an image first.');if(!window.ClipboardItem)throw new Error('Image clipboard is unavailable. Use Save PNG.');await navigator.clipboard.write([new ClipboardItem({'image/png':dataURLBlob(state.reference.dataURL)})]);status('PNG copied. Paste it with the reconstruction brief.');});
action('clear-image',async()=>{state.reference=null;render();});
for(const id of ['target-stack','export-format','allow-assets'])$(id).addEventListener('change',renderExport);
action('copy-export',()=>copy(exportValue()));action('download-export',async()=>{const value=exportValue();if(!value)throw new Error('Nothing available in this format. Capture a component or scan first.');const kind=$('export-format').value;const name={prompt:'rebuild-brief.md',html:'captured.html',css:'captured.css',react:'CapturedComponent.tsx',tokens:'tokens.css',json:'design-report.json'}[kind];download(value,name);if(kind==='react')download(state.component.css,'captured.css','text/css');});
action('download-bundle',async()=>{needData();const r=report();const files=[{name:'rebuild-brief.md',data:codexPrompt(r,$('target-stack').value)},{name:'design-report.json',data:JSON.stringify(r,null,2)},{name:'READ-ME.txt',data:'Design Lens capture. Read rebuild-brief.md and review private text/asset URLs before sharing. This is a static reconstruction, not original application source. No fonts are bundled. External image URLs may expire. Pair CapturedComponent.tsx with captured.css. Image references must be attached separately when pasting the brief.'}];if(r.component)files.push({name:'captured.html',data:makeDocument(r.component,$('allow-assets').checked)},{name:'captured.css',data:r.component.css},{name:'CapturedComponent.tsx',data:reactComponent(r.component)});if(r.scan)files.push({name:'tokens.css',data:tokenizeCSS(r.scan.tokens)+'\n'+tokenizeCSS(r.scan.tokens,'selected')},{name:'tokens.json',data:tokensJSON(r.scan.tokens)});if(r.reference)files.push({name:'reference.png',data:new Uint8Array(await dataURLBlob(r.reference.dataURL).arrayBuffer())});download(zipFiles(files),'design-capture.zip');});
action('copy-all',async()=>{needData();await copy(codexPrompt(report(),$('target-stack').value));});action('quick-save',save);action('save-current',save);
action('theme',async()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;$('theme').setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' theme');await chrome.storage.local.set({theme});});
action('popout',async()=>{await chrome.windows.create({url:chrome.runtime.getURL('sidepanel.html')+'?sourceWindow='+state.windowId,type:'popup',width:460,height:900});});
action('close',async()=>{if(new URLSearchParams(location.search).has('sourceWindow')){if(state.target)await command('cancel');window.close();return;}$('stop').hidden=true;const result=await rpc('close',{tabId:state.target?.id,windowId:state.windowId});if(!result.closed)status('Inspector stopped. Close this panel with the browser’s side-panel X.');});
chrome.runtime.onMessage.addListener(m=>{
  if(m.kind!=='lens-event')return;
  if(m.event==='active-tab'&&m.windowId===state.windowId&&m.tabId!==state.target?.id){$('stop').hidden=true;$('connection-dot').classList.remove('connected');status('Tab changed. Click the toolbar icon on the new page to connect.');return;}
  if(m.event==='target'&&m.target.windowId===state.windowId){run(connect);return;}
  if(m.tabId!==state.target?.id)return;
  if(m.event==='navigation'||m.event==='tab-removed'){clearCapture();$('connection-dot').classList.remove('connected');$('stop').hidden=true;status('The source page changed. Reconnect to capture its new state.');return;}
  if(m.documentId&&state.source?.documentId&&m.documentId!==state.source.documentId)return;
  if(m.event==='selected')selected(m.data);
  else if(m.event==='region'){ $('stop').hidden=true;run(()=>takeScreenshot('region',m.data));}
  else if(m.event==='stopped'){$('stop').hidden=true;}
  else if(m.event==='notice')status(m.data.message);
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.captures){state.saved=changes.captures.newValue||[];renderLibrary();}});
async function init(){const requested=new URLSearchParams(location.search).get('sourceWindow');const parsed=Number(requested);state.windowId=requested!==null&&Number.isInteger(parsed)&&parsed>=0?parsed:(await chrome.windows.getCurrent()).id;$('popout').hidden=requested!==null;listenPort();const stored=await chrome.storage.local.get(['captures','theme']);state.saved=stored.captures||[];if(['dark','light'].includes(stored.theme))document.documentElement.dataset.theme=stored.theme;$('theme').setAttribute('aria-label','Switch to '+(document.documentElement.dataset.theme==='dark'?'light':'dark')+' theme');render();renderLibrary();await connect().catch(e=>status(e.message,true));}
init().catch(e=>status(e.message,true));
