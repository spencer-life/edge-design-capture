/* Design Lens content engine. Injected only after an explicit user action.
 * All inspection happens in Chrome's isolated world. No page scripts run here.
 */
(() => {
  'use strict';
  if (globalThis.__designLensInstalled) return;
  globalThis.__designLensInstalled = true;
  const DOCUMENT_ID = crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const LIMITS = { scan: 2400, component: 450, rules: 12000, tokens: 900, assets: 160, bytes: 1200000 };
  const PROPS = [
    'display','position','box-sizing','width','height','min-width','min-height','max-width','max-height',
    'top','right','bottom','left','z-index','float','clear','isolation','overflow','overflow-x','overflow-y',
    'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left',
    'font-family','font-size','font-weight','font-style','font-stretch','font-variant','font-variation-settings','font-feature-settings','line-height','letter-spacing',
    'color','text-align','text-decoration','text-transform','text-indent','text-shadow','white-space','word-break','overflow-wrap',
    'background-color','background-image','background-size','background-position','background-repeat','background-clip',
    'border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-top-style','border-right-style','border-bottom-style','border-left-style',
    'border-top-color','border-right-color','border-bottom-color','border-left-color',
    'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
    'box-shadow','outline','outline-offset','opacity','visibility','filter','backdrop-filter',
    'flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','order','justify-content','align-items','align-self','align-content',
    'gap','row-gap','column-gap','grid-template-columns','grid-template-rows','grid-auto-flow','grid-auto-columns','grid-auto-rows','grid-column','grid-row',
    'transform','transform-origin','translate','rotate','scale','object-fit','object-position','aspect-ratio',
    'transition-property','transition-duration','transition-timing-function','transition-delay',
    'animation-name','animation-duration','animation-timing-function','animation-delay','animation-iteration-count','animation-direction','animation-fill-mode',
    'cursor','pointer-events','user-select','list-style','vertical-align','fill','stroke','stroke-width'
  ];
  const FORBIDDEN = new Set(['SCRIPT','STYLE','LINK','META','BASE','NOSCRIPT','TEMPLATE','IFRAME','OBJECT','EMBED','AUDIO','VIDEO','SOURCE','TRACK']);
  const SAFE_HTML = new Set('div span p section article aside header footer main nav h1 h2 h3 h4 h5 h6 a button ul ol li dl dt dd strong em b i u s small blockquote pre code br hr img picture figure figcaption label input textarea select option form fieldset legend table thead tbody tfoot tr th td caption colgroup col details summary time progress meter address sub sup mark abbr'.split(' '));
  const SAFE_SVG = new Set('svg g path circle ellipse rect line polyline polygon defs linearGradient radialGradient stop clipPath mask pattern symbol use text tspan title desc'.split(' '));
  const SVG_ATTR = new Set('viewBox d x y x1 x2 y1 y2 cx cy r rx ry width height points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity opacity transform xmlns preserveAspectRatio gradientUnits gradientTransform offset stop-color stop-opacity clip-rule clip-path mask patternUnits patternContentUnits patternTransform marker-end marker-start text-anchor dominant-baseline font-size'.split(' '));
  let selected=null,hovered=null,mode=null,host=null,shadow=null,box=null,label=null,timer=null,raf=0,start=null,region=null;
  let captureCount=0;
  const source=()=>{let u=new URL(location.href);u.search='';u.hash='';u.username='';u.password='';return{url:u.href,title:document.title.slice(0,300),viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},documentId:DOCUMENT_ID};};
  const emit=(event,data)=>{ try { chrome.runtime.sendMessage({kind:'lens-content',event,data,documentId:DOCUMENT_ID}).catch(()=>stop(false)); }catch{stop(false);} };
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
  const parent=e=>e?.parentElement || e?.getRootNode()?.host || null;
  const internal=e=>e===host || e?.getRootNode()===shadow;
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
  function describe(e) {
    if(!e)return'';
    let result=e.localName;
    if(e.id)result+='#'+e.id.slice(0,60);
    else if(e.classList?.length)result+='.'+[...e.classList].slice(0,2).join('.').slice(0,100);
    return result;
  }
  function pathFor(e) {
    const result=[];let n=e;
    while(n && result.length<6) {result.unshift(describe(n));n=parent(n);}
    return result.join(' > ');
  }
  function readStyles(e,pseudo=null) {
    const st=getComputedStyle(e,pseudo),out={};
    for(const p of PROPS)out[p]=st.getPropertyValue(p).trim();
    return out;
  }
  function ensureOverlay() {
    if(host?.isConnected)return;
    host=document.createElement('design-lens-overlay');
    for(const [p,v] of Object.entries({position:'fixed',top:'0',left:'0',width:'0',height:'0','z-index':'2147483647','pointer-events':'none'}))host.style.setProperty(p,v,'important');
    shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent=':host{all:initial!important}*{box-sizing:border-box!important}#box{position:fixed;border:2px solid #7966ff;background:rgba(121,102,255,.10);pointer-events:none}#label{position:fixed;max-width:min(540px,90vw);padding:8px 12px;background:#202027;color:#fff;border:1px solid #7966ff;border-radius:6px;font:13px/1.4 system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere;pointer-events:none;box-shadow:0 2px 8px #0005}';
    box=document.createElement('div');box.id='box';label=document.createElement('div');label.id='label';
    shadow.append(style,box,label);document.documentElement.append(host);
  }
  function show(r,text) {
    ensureOverlay();
    Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',display:'block'});
    label.textContent=text;
    Object.assign(label.style,{left:Math.max(8,Math.min(r.x,innerWidth-260))+'px',top:Math.max(8,r.y>48?r.y-40:Math.min(innerHeight-48,r.y+r.height+8))+'px'});
  }
  function eventElement(e) {return e.composedPath().find(n=>n instanceof Element && !internal(n)) || null;}
  function move(e) {
    if(mode==='region'&&start){region={x:Math.min(start.x,e.clientX),y:Math.min(start.y,e.clientY),width:Math.abs(e.clientX-start.x),height:Math.abs(e.clientY-start.y)};show(region,'Release to capture · Esc to cancel');e.preventDefault();return;}
    if(mode!=='pick')return;
    const el=eventElement(e);if(!el||el===document.documentElement)return;hovered=el;
    if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(mode==='pick'&&hovered?.isConnected)show(rect(hovered),describe(hovered)+' · click to select · Esc to cancel');});
  }
  function down(e) {
    if(!mode)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(mode==='region'){start={x:e.clientX,y:e.clientY};region=null;}
  }
  function up(e) {
    if(mode!=='region'||!start)return;
    e.preventDefault();e.stopImmediatePropagation();
    const r=region;
    // Retain a one-shot click blocker after pointerup so links cannot activate.
    document.addEventListener('click',blockClick,{capture:true,once:true});
    setTimeout(()=>document.removeEventListener('click',blockClick,true),400);
    stop(false);
    if(r&&r.width>=4&&r.height>=4)emit('region',{rect:r,viewport:{width:innerWidth,height:innerHeight},source:source()});
    else emit('notice',{message:'Drag a larger rectangle to capture an area.'});
  }
  function blockClick(e){e.preventDefault();e.stopImmediatePropagation();}
  function click(e) {
    if(mode!=='pick')return;
    e.preventDefault();e.stopImmediatePropagation();
    const el=eventElement(e);stop(false);if(el){selected=el;emit('selected',inspect());}
  }
  function key(e) {
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();}
    else if(mode==='pick'&&e.key==='Enter'&&hovered){e.preventDefault();e.stopImmediatePropagation();selected=hovered;stop(false);emit('selected',inspect());}
  }
  function stop(notify=true) {
    mode=null;start=null;region=null;hovered=null;
    clearTimeout(timer);cancelAnimationFrame(raf);raf=0;
    document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);
    host?.remove();host=null;shadow=null;box=null;label=null;
    if(notify)emit('stopped',{});
  }
  function begin(kind) {
    stop(false);mode=kind;
    show({x:0,y:0,width:0,height:0},kind==='pick'?'Point to an element and click · Esc to cancel':'Drag a rectangle · Esc to cancel');
    document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerdown',down,{capture:true,passive:false});document.addEventListener('pointerup',up,{capture:true,passive:false});document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
    timer=setTimeout(()=>stop(),120000);
    return{mode};
  }
  function needSelected(){if(!selected?.isConnected)throw new Error('Select a live element first. The previous element may have been removed by the page.');return selected;}
  function inspect() {
    const e=needSelected(),st=readStyles(e),r=rect(e),warnings=[];
    const kind=e.matches('img,canvas,video,iframe')?'image / embedded reference':'live DOM element';
    if(e.matches('img,canvas,video'))warnings.push('The pixels inside this element are not DOM. Its reported CSS belongs to the container, not the design pictured inside. Use an image capture for reconstruction.');
    if(e.matches('iframe'))warnings.push('Embedded frame contents are not inspected. Open the frame source directly in another tab to inspect it with a separate permission grant.');
    if(e.localName.includes('-'))warnings.push('Custom element: open shadow roots can be inspected; closed shadow roots and application internals are unavailable.');
    const roles={button:'button',a:'link',input:'form control',select:'form control',textarea:'form control',nav:'navigation',dialog:'dialog',table:'table',img:'image'};
    let bg=st['background-color'],bgNode=e,opaque=true;
    while((bg==='rgba(0, 0, 0, 0)'||bg==='transparent')&&parent(bgNode)){bgNode=parent(bgNode);bg=getComputedStyle(bgNode).backgroundColor;}
    let check=e;while(check){const c=getComputedStyle(check);if(c.backgroundImage!=='none'||Number(c.opacity)<1||c.mixBlendMode!=='normal'){opaque=false;break;}check=parent(check);}
    if(!opaque)warnings.push('Text contrast is not evaluated over images, gradients, blend modes or translucent ancestors.');
    const ancestors=[];let a=e;for(let i=0;a&&i<8;i++,a=parent(a))ancestors.unshift(describe(a));
    return {source:source(),documentRect:{...r,x:r.x+scrollX,y:r.y+scrollY},kind,tag:e.localName,selector:pathFor(e),label:describe(e),pattern:{name:e.getAttribute('role')||roles[e.localName]||'container / content',basis:'HTML semantics; not a verified component library'},rect:r,styles:st,ancestors,
      navigation:{parent:!!parent(e),child:!!(e.shadowRoot?.firstElementChild||e.firstElementChild),previous:!!e.previousElementSibling,next:!!e.nextElementSibling},
      accessibility:{role:e.getAttribute('role')||roles[e.localName]||'',label:(e.getAttribute('aria-label')||e.getAttribute('alt')||'').slice(0,200),foreground:st.color,background:opaque?bg:'unknown',note:'Solid-color estimate only; not a full accessibility audit.'},warnings};
  }
  function navigate(direction) {
    const e=needSelected();const n={parent:parent(e),child:e.shadowRoot?.firstElementChild||e.firstElementChild,previous:e.previousElementSibling,next:e.nextElementSibling}[direction];
    if(!n||internal(n))throw new Error('There is no element in that direction.');selected=n;return inspect();
  }
  function allElements(root,limit) {
    const nodes=[],stack=[root];let clipped=false;
    while(stack.length){const el=stack.pop();if(!(el instanceof Element)||internal(el))continue;
      if(nodes.length>=limit){clipped=true;break;}nodes.push(el);
      const children=el.shadowRoot?[...el.children,...el.shadowRoot.children]:[...el.children];
      for(let i=children.length-1;i>=0;i--)stack.push(children[i]);
    }return{nodes,clipped};
  }
  function safeURL(raw,base=location.href) {
    if(!raw||raw.length>250000)return'';
    if(/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/i.test(raw))return raw;
    try{const u=new URL(raw,base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return'';return u.href;}catch{return'';}
  }
  function safeCSS(value) {
    // Computed CSS is parsed by the browser, then screened again for exported URLs.
    if(/(?:expression\s*\(|-moz-binding|javascript:|<\/|[\x00-\x08])/i.test(value))return'';
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,quote,url)=>{const valid=safeURL(url);return valid?'url("'+valid.replace(/["\\\n\r]/g,c=>'\\'+c)+'")':'none';});
  }
  async function tokensFor(e) {
    const names=new Set(),definitions=[],warnings=[];let blocked=0,rulesCount=0;
    const current=e||document.documentElement;
    for(const target of [document.documentElement,current])for(const p of getComputedStyle(target))if(p.startsWith('--'))names.add(p);
    function addStyle(style,selector,origin,condition='') {
      for(const p of style){if(!p.startsWith('--'))continue;names.add(p);
        if(definitions.length<LIMITS.tokens)definitions.push({name:p,raw:style.getPropertyValue(p).trim(),selector:selector.slice(0,260),source:origin,condition});
      }
    }
    const sheets=[...document.styleSheets,...document.adoptedStyleSheets];
    const root=current.getRootNode();if(root instanceof ShadowRoot)sheets.push(...root.styleSheets,...root.adoptedStyleSheets);
    const seen=new Set();
    function walk(sheet,condition='') {
      if(seen.has(sheet))return;seen.add(sheet);
      let rules;try{rules=sheet.cssRules;}catch{blocked++;return;}
      const origin=sheet.href?sourceURL(sheet.href):'inline / constructed stylesheet';
      function visit(list,cond) {
        for(const rule of list){if(++rulesCount>LIMITS.rules)return;
          if(rule.type===CSSRule.MEDIA_RULE){if(matchMedia(rule.conditionText).matches)visit(rule.cssRules,cond+' @media '+rule.conditionText);continue;}
          if(rule.type===CSSRule.SUPPORTS_RULE){if(CSS.supports(rule.conditionText))visit(rule.cssRules,cond+' @supports '+rule.conditionText);continue;}
          if(rule.type===CSSRule.IMPORT_RULE){if(!rule.media?.mediaText||matchMedia(rule.media.mediaText).matches)walk(rule.styleSheet,cond);continue;}
          if(rule.style&&rule.selectorText)addStyle(rule.style,rule.selectorText,origin,cond);
          if(rule.cssRules)visit(rule.cssRules,cond);
        }
      }visit(rules,condition);
    }
    for(const sheet of sheets)walk(sheet);
    for(const target of [document.documentElement,current])if(target.style)addStyle(target.style,'element.style', 'inline declaration');
    const result=[];
    for(const [scope,target]of [['root',document.documentElement],...(current!==document.documentElement?[['selected',current]]:[])]){
      const st=getComputedStyle(target);
      for(const name of [...names].sort().slice(0,LIMITS.tokens)){
        const value=st.getPropertyValue(name).trim();if(!value)continue;
        const defs=definitions.filter(d=>d.name===name).slice(0,5);
        result.push({name,resolved:value,scope,definitions:defs});
      }
    }
    if(blocked)warnings.push(`${blocked} stylesheet(s) could not be read (usually cross-origin restrictions). Computed element styles are still available.`);
    if(rulesCount>LIMITS.rules||names.size>LIMITS.tokens)warnings.push('CSS rule/token scan reached its safety limit; token results are partial.');
    warnings.push('Tokens describe the current theme and viewport. Container queries, cascade-layer provenance and inactive theme overrides are not resolved back to their winning source rule.');
    return{tokens:result,blockedStylesheets:blocked,warnings};
  }
  function sourceURL(u){try{const url=new URL(u,location.href);url.search='';url.hash='';url.username='';url.password='';return url.href;}catch{return'';}}
  function assetsFor(nodes) {
    const out=[],seen=new Set();
    function add(asset){const key=asset.url||asset.svg;if(!key||seen.has(key)||out.length>=LIMITS.assets)return;seen.add(key);out.push(asset);}
    for(const e of nodes){
      if(e instanceof HTMLImageElement)add({type:'image',url:safeURL(e.currentSrc||e.src),alt:e.alt.slice(0,200),width:e.naturalWidth,height:e.naturalHeight});
      if(e.localName==='svg') {const svg=cleanSVG(e);if(svg)add({type:'svg',svg,label:(e.getAttribute('aria-label')||'Inline SVG').slice(0,100)});}
      const bg=getComputedStyle(e).backgroundImage;for(const match of bg.matchAll(/url\(\s*['"]?(.*?)['"]?\s*\)/g))add({type:'background',url:safeURL(match[1])});
    }return out;
  }
  function cleanSVG(root) {
    let count=0;const ids=new Map();
    for(const e of [root,...root.querySelectorAll('[id]')].slice(0,450))if(e.id)ids.set(e.id,'dl-svg-'+ids.size);
    function visit(e){if(++count>450||!SAFE_SVG.has(e.localName))return'';
      let attrs='';for(const a of e.attributes){if(a.name==='id'&&ids.has(a.value)){attrs+=' id="'+ids.get(a.value)+'"';continue;}
        if((a.name==='href'||a.name==='xlink:href')&&a.value.startsWith('#')&&ids.has(a.value.slice(1))){attrs+=' href="#'+ids.get(a.value.slice(1))+'"';continue;}
        if(!SVG_ATTR.has(a.name))continue;
        let v=a.value;if(/url\(/i.test(v)){v=v.replace(/url\(['"]?#([^)'"\s]+)['"]?\)/g,(_,id)=>ids.has(id)?'url(#'+ids.get(id)+')':'none');if(/url\((?!#)/.test(v))continue;}
        if(/javascript:|<\//i.test(v))continue;attrs+=' '+a.name+'="'+esc(v)+'"';
      }
      if(e===root&&!e.hasAttribute('xmlns'))attrs+=' xmlns="http://www.w3.org/2000/svg"';
      const children=[...e.childNodes].map(n=>n.nodeType===Node.TEXT_NODE?esc(n.textContent.slice(0,2000)):n.nodeType===Node.ELEMENT_NODE?visit(n):'').join('');
      return'<'+e.localName+attrs+'>'+children+'</'+e.localName+'>';
    }return visit(root);
  }
  async function scan() {
    const {nodes,clipped}=allElements(document.documentElement,LIMITS.scan),colors=new Map(),fonts=new Map(),spacing=new Map(),radii=new Map(),shadows=new Map();
    let visibleCount=0;
    for(let i=0;i<nodes.length;i++){
      const el=nodes[i];if(FORBIDDEN.has(el.tagName)||!visible(el))continue;visibleCount++;
      const st=getComputedStyle(el);
      for(const p of ['color','background-color','border-top-color','border-right-color','border-bottom-color','border-left-color','fill','stroke']){
        if(p.startsWith('border')&&(st.getPropertyValue(p.replace('color','style'))==='none'||st.getPropertyValue(p.replace('color','width'))==='0px'))continue;
        if((p==='fill'||p==='stroke')&&!(el instanceof SVGElement))continue;
        const v=st.getPropertyValue(p);if(!v||v==='none'||v==='transparent'||v==='rgba(0, 0, 0, 0)')continue;
        const entry=colors.get(v)||{value:v,count:0,uses:[]};entry.count++;if(!entry.uses.includes(p))entry.uses.push(p);colors.set(v,entry);
      }
      if([...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())){
        const family=st.fontFamily,entry=fonts.get(family)||{family,count:0,sizes:new Set(),weights:new Set(),lineHeights:new Set(),note:'Computed font stack; individual rendered glyph font is not determined.'};entry.count++;entry.sizes.add(st.fontSize);entry.weights.add(st.fontWeight);entry.lineHeights.add(st.lineHeight);fonts.set(family,entry);
      }
      for(const p of ['padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','gap']){const v=st.getPropertyValue(p);if(v!=='0px'&&v!=='normal')spacing.set(v,(spacing.get(v)||0)+1);}
      if(st.borderTopLeftRadius!=='0px')radii.set(st.borderTopLeftRadius,(radii.get(st.borderTopLeftRadius)||0)+1);
      if(st.boxShadow!=='none')shadows.set(st.boxShadow,(shadows.get(st.boxShadow)||0)+1);
      if(i%150===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    const tokenData=await tokensFor(selected?.isConnected?selected:null);
    const frequencies=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,32).map(([value,count])=>({value,count}));
    const warnings=[...tokenData.warnings];if(clipped)warnings.push(`Page scan was limited to ${LIMITS.scan} elements to avoid freezing the page.`);
    if(document.querySelector('iframe'))warnings.push('Embedded frames were not traversed. Open the frame page directly to inspect it.');
    return{source:source(),selectedContext:selected?.isConnected?pathFor(selected):null,scanned:nodes.length,visible:visibleCount,partial:clipped,colors:[...colors.values()].sort((a,b)=>b.count-a.count).slice(0,160),fonts:[...fonts.values()].sort((a,b)=>b.count-a.count).map(f=>({...f,sizes:[...f.sizes],weights:[...f.weights],lineHeights:[...f.lineHeights]})),fontFaces:[...document.fonts].slice(0,80).map(f=>({family:f.family,weight:f.weight,style:f.style,status:f.status})),tokens:tokenData.tokens,blockedStylesheets:tokenData.blockedStylesheets,spacing:frequencies(spacing),radii:frequencies(radii),shadows:frequencies(shadows),assets:assetsFor(nodes),warnings};
  }
  function captureComponent(options={}) {
    const root=needSelected(),rules=[],warnings=[
      'Static current-state reconstruction, not original source. Scripts, application state, event handlers, form values, and embedded documents are excluded.',
      'Computed sizes are viewport-specific. Breakpoints, interactive states and keyframe definitions are not recovered.',
      'Fonts are referenced by name only. External assets require access/permission and may expire. Live text can contain private information; review before sharing.'
    ];
    const prefix='dl-'+DOCUMENT_ID.replaceAll('-','').slice(0,8)+'-'+(++captureCount);
    let count=0,textCount=0,textClipped=false;const classMap=new Map(),idMap=new Map();
    const traversed=allElements(root,LIMITS.component);
    for(const e of traversed.nodes){classMap.set(e,prefix+'-n'+classMap.size);if(e.id)idMap.set(e.id,prefix+'-id'+idMap.size);}
    const jsxAttr=n=>({'class':'className','for':'htmlFor','tabindex':'tabIndex','colspan':'colSpan','rowspan':'rowSpan','readonly':'readOnly','maxlength':'maxLength','autofocus':'autoFocus','datetime':'dateTime','viewbox':'viewBox','xlink:href':'href'}[n]||((n.startsWith('aria-')||n.startsWith('data-'))?n:n.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())));
    const voidTags=new Set(['img','input','br','hr','col']);
    function visit(node,jsx=false){
      if(node.nodeType===Node.TEXT_NODE){const s=node.textContent;if(!s.trim())return'';textCount+=s.length;if(textCount>90000){textClipped=true;return'';}return options.includeText===false?'[Text]':jsx?'{'+JSON.stringify(s)+'}':esc(s);}
      if(!(node instanceof Element)||internal(node)||FORBIDDEN.has(node.tagName)||!classMap.has(node))return'';
      if(count++>LIMITS.component)return'';
      if(!(node instanceof SVGElement) && (node.hidden || getComputedStyle(node).display==='none' || getComputedStyle(node).visibility==='hidden'))return'';
      let tag=node.localName;const isSVG=node instanceof SVGElement;
      if(isSVG&&!SAFE_SVG.has(tag))return'';
      if(!isSVG&&!SAFE_HTML.has(tag))tag='div';
      if(['input','textarea','select','option','canvas'].includes(node.localName)){
        const placeholder=node.localName==='canvas'?'[Canvas: use screenshot capture]':node.getAttribute('placeholder')||'[Form control]';
        return jsx?`<span className="${classMap.get(node)}">{${JSON.stringify(placeholder)}}</span>`:`<span class="${classMap.get(node)}">${esc(placeholder)}</span>`;
      }
      // Forms become non-submittable sections; links cannot navigate accidentally.
      if(tag==='form')tag='section';
      const attrs=new Map([['class',classMap.get(node)]]);
      if(idMap.has(node.id))attrs.set('id',idMap.get(node.id));
      for(const attr of node.attributes){
        const n=attr.name,v=attr.value;
        if(n.startsWith('on')||['style','class','id','value','checked','selected','name','action','formaction','srcdoc','contenteditable'].includes(n))continue;
        if(n==='href'||n==='xlink:href'){if(isSVG&&v.startsWith('#')&&idMap.has(v.slice(1)))attrs.set('href','#'+idMap.get(v.slice(1)));continue;}
        if(n==='src'){const u=safeURL(node.currentSrc||v);if(tag==='img'&&u)attrs.set(n,u);continue;}
        if(n==='srcset'||n==='sizes')continue;
        if(n==='aria-labelledby'||n==='aria-describedby'||n==='for'){const ids=v.split(/\s+/).map(id=>idMap.get(id)).filter(Boolean);if(ids.length)attrs.set(n,ids.join(' '));continue;}
        if(n.startsWith('aria-')||['alt','title','role','width','height','colspan','rowspan','scope','type','datetime'].includes(n)||(isSVG&&SVG_ATTR.has(n))){
          let safe=v;if(/url\(/.test(safe)){safe=safe.replace(/url\(['"]?#([^)'"\s]+)['"]?\)/g,(_,id)=>idMap.has(id)?'url(#'+idMap.get(id)+')':'none');if(/url\((?!#)/.test(safe))continue;}
          if(/javascript:|<\//i.test(safe))continue;attrs.set(n,safe.slice(0,16000));
        }
      }
      if(tag==='button')attrs.set('type','button');
      if(tag==='img'){if(!attrs.has('alt'))attrs.set('alt','');attrs.set('referrerpolicy','no-referrer');}
      if(tag==='svg'&&!attrs.has('xmlns'))attrs.set('xmlns','http://www.w3.org/2000/svg');
      const attributes=[...attrs].map(([n,v])=>jsx?` ${n==='referrerpolicy'?'referrerPolicy':jsxAttr(n)}={${JSON.stringify(v)}}`:` ${n}="${esc(v)}"`).join('');
      const children=node.shadowRoot?[...node.shadowRoot.childNodes]:[...node.childNodes];
      // Expand assigned nodes in open shadow slots instead of exporting broken slots.
      let content=children.map(n=>{if(n instanceof HTMLSlotElement){const assigned=n.assignedNodes({flatten:true});return (assigned.length?assigned:[...n.childNodes]).map(c=>visit(c,jsx)).join('');}return visit(n,jsx);}).join('');
      if(voidTags.has(tag))return`<${tag}${attributes}${jsx?' />':'>'}`;
      return`<${tag}${attributes}>${content}</${tag}>`;
    }
    const rootWidth=rect(root).width;
    const safeComponentCSS=v=>{if(/url\(.*?#/i.test(v))return v.replace(/url\(\s*['"]?[^)"']*#([^)"'\s]+)['"]?\s*\)/gi,(_,id)=>idMap.has(id)?'url(#'+idMap.get(id)+')':'none');return safeCSS(v);};
    for(const e of traversed.nodes){if(FORBIDDEN.has(e.tagName))continue;
      const st=readStyles(e),pairs=[];
      for(const [p,v] of Object.entries(st)){const safe=safeComponentCSS(v);if(safe)pairs.push('  '+p+': '+safe+';');}
      // Pseudo-elements are reconstructed when the browser exposes their content.
      rules.push('.'+classMap.get(e)+' {\n'+pairs.join('\n')+'\n}');
      for(const pseudo of ['::before','::after']){const ps=getComputedStyle(e,pseudo);if(ps.content&&ps.content!=='none'&&ps.content!=='normal'){
        const values=readStyles(e,pseudo);const content=safeCSS(ps.content);if(content)rules.push('.'+classMap.get(e)+pseudo+' {\n  content: '+content+';\n'+Object.entries(values).filter(([p])=>!p.startsWith('animation-')).map(([p,v])=>[p,safeCSS(v)]).filter(([,v])=>v).map(([p,v])=>'  '+p+': '+v+';').join('\n')+'\n}');
      }}
    }
    count=0;textCount=0;const html=visit(root,false);count=0;textCount=0;const jsx=visit(root,true);
    const css='/* Design Lens: computed styles, current viewport; generated selectors.\n * Rework fixed dimensions, responsive layout and behavior before production. */\n'+rules.join('\n\n')+'\n';
    if(textClipped)warnings.push('Text was truncated at the safety limit; this is a partial capture.');
    if(traversed.clipped)warnings.push(`Component exceeds ${LIMITS.component} elements; this is a partial capture. Select a smaller component.`);
    if(traversed.nodes.some(e=>e.shadowRoot))warnings.push('Open shadow DOM was flattened. Slotting and encapsulation may need manual adjustment.');
    if(new TextEncoder().encode(html+jsx+css).length>LIMITS.bytes)throw new Error('Component export is too large. Select a smaller section. No partial file was saved.');
    return{namespace:prefix,html,jsx,css,nodes:traversed.nodes.length,partial:traversed.clipped||textClipped,source:source(),rootWidth,includeText:options.includeText!==false,warnings};
  }
  async function dispatch(message) {
    switch(message.command){
      case'ping':return{ready:true,source:source()};
      case'pick':return begin('pick');
      case'region':return begin('region');
      case'cancel':stop();return{stopped:true};
      case'inspect':return inspect();
      case'navigate':return navigate(message.direction);
      case'scan':return scan();
      case'tokens':return tokensFor(selected?.isConnected?selected:null);
      case'component':return captureComponent(message.options);
      case'geometry':{stop(false);const e=message.selected?needSelected():null;return{rect:e?rect(e):null,viewport:{width:innerWidth,height:innerHeight},source:source()};}
      default:throw new Error('Unknown inspector command.');
    }
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id || message?.kind!=='lens-command')return false;
    Promise.resolve().then(()=>dispatch(message)).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:String(error.message||error)}));return true;
  });
  window.addEventListener('pagehide',()=>stop(false),{once:true});
})();
