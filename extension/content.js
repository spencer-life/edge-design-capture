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
    if(mode==='region'&&start){region={x:Math.min(stayÛŸ-¢G§²ÚîÆ­yÝ½Õ¹ÐôÀ±Ñ•áÑ±¥ÁÁ•õ™…±Í”í½¹ÍÐ±…ÍÍ5…Àõ¹•Ü5…À ¤±¥‘5…Àõ¹•Ü5…À ¤ì(€€€½¹ÍÐÑÉ…Ù•ÉÍ•õ…±±±•µ•¹ÑÌ¡É½½Ð±1%5%QL¹½µÁ½¹•¹Ð¤ì(€€€™½È¡½¹ÍÐ”½˜ÑÉ…Ù•ÉÍ•¹¹½‘•Ì¥í±…ÍÍ5…À¹Í•Ð¡”±ÁÉ•™¥à¬œµ¸œ­±…ÍÍ5…À¹Í¥é”¤í¥˜¡”¹¥¥¥‘5…À¹Í•Ð¡”¹¥±ÁÉ•™¥à¬œµ¥œ­¥‘5…À¹Í¥é”¤íô(€€€½¹ÍÐ©ÍáÑÑÈõ¸ôø¡ì±…ÍÌœè±…ÍÍ9…µ”œ°™½Èœè¡Ñµ±½Èœ°Ñ…‰¥¹‘•àœèÑ…‰%¹‘•àœ°½±ÍÁ…¸œè½±MÁ…¸œ°É½ÝÍÁ…¸œèÉ½ÝMÁ…¸œ°É•…‘½¹±äœèÉ•…‘=¹±äœ°µ…á±•¹Ñ œèµ…á1•¹Ñ œ°…ÕÑ½™½ÕÌœè…ÕÑ½½ÕÌœ°‘…Ñ•Ñ¥µ”œè‘…Ñ•Q¥µ”œ°Ù¥•Ý‰½àœèÙ¥•Ý	½àœ°á±¥¹¬é¡É•˜œè¡É•˜õm¹uñð ¡¸¹ÍÑ…ÉÑÍ]¥Ñ  …É¥„´œ¥ññ¸¹ÍÑ…ÉÑÍ]¥Ñ  ‘…Ñ„´œ¤¤ý¸é¸¹É•Á±…” ¼´¡m„µét¤½œ°¡|±Œ¤ôùŒ¹Ñ½UÁÁ•É…Í” ¤¤¤¤ì(€€€½¹ÍÐÙ½¥‘Q…Ìõ¹•ÜM•Ð¡l¥µœœ°¥¹ÁÕÐœ°‰Èœ°¡Èœ°½°t¤ì(€€€™Õ¹Ñ¥½¸Ù¥Í¥Ð¡¹½‘”±©Íàõ™…±Í”¥ì(€€€€€¥˜¡¹½‘”¹¹½‘•QåÁ”ôôõ9½‘”¹QaQ}9=¥í½¹ÍÐÌõ¹½‘”¹Ñ•áÑ½¹Ñ•¹Ðí¥˜ …Ì¹ÑÉ¥´ ¤¥É•ÑÕÉ¸œœíÑ•áÑ½Õ¹Ð¬õÌ¹±•¹Ñ í¥˜¡Ñ•áÑ½Õ¹ÐøäÀÀÀÀ¥íÑ•áÑ±¥ÁÁ•õÑÉÕ”íÉ•ÑÕÉ¸œœíõÉ•ÑÕÉ¸½ÁÑ¥½¹Ì¹¥¹±Õ‘•Q•áÐôôõ™…±Í”ümQ•áÑtœé©Íàüìœ­)M=8¹ÍÑÉ¥¹¥™ä¡Ì¤¬ôœé•ÍŒ¡Ì¤íô(€€€€€¥˜ „¡¹½‘”¥¹ÍÑ…¹•½˜±•µ•¹Ð¥ññ¥¹Ñ•É¹…°¡¹½‘”¥ññ=I	%8¹¡…Ì¡¹½‘”¹Ñ…9…µ”¥ñð…±…ÍÍ5…À¹¡…Ì¡¹½‘”¤¥É•ÑÕÉ¸œœì(€€€€€¥˜¡½Õ¹Ð¬¬ù1%5%QL¹½µÁ½¹•¹Ð¥É•ÑÕÉ¸œœì(€€€€€¥˜ „¡¹½‘”¥¹ÍÑ…¹•½˜MY±•µ•¹Ð¤€˜˜€¡¹½‘”¹¡¥‘‘•¸ñð•Ñ½µÁÕÑ•‘MÑå±”¡¹½‘”¤¹‘¥ÍÁ±…äôôô¹½¹”œñð•Ñ½µÁÕÑ•‘MÑå±”¡¹½‘”¤¹Ù¥Í¥‰¥±¥Ñäôôô¡¥‘‘•¸œ¤¥É•ÑÕÉ¸œœì(€€€€€±•ÐÑ…œõ¹½‘”¹±½…±9…µ”í½¹ÍÐ¥ÍMYõ¹½‘”¥¹ÍÑ…¹•½˜MY±•µ•¹Ðì(€€€€€¥˜¡¥ÍMY˜˜…M}MY¹¡…Ì¡Ñ…œ¤¥É•ÑÕÉ¸œœì(€€€€€¥˜ …¥ÍMY˜˜…M}!Q50¹¡…Ì¡Ñ…œ¤¥Ñ…œô‘¥Øœì(€€€€€¥˜¡l¥¹ÁÕÐœ°Ñ•áÑ…É•„œ°Í•±•Ðœ°½ÁÑ¥½¸œ°…¹Ù…Ìt¹¥¹±Õ‘•Ì¡¹½‘”¹±½…±9…µ”¤¥ì(€€€€€€€½¹ÍÐÁ±…•¡½±‘•Èõ¹½‘”¹±½…±9…µ”ôôô…¹Ù…Ìœüm…¹Ù…ÌèÕÍ”ÍÉ••¹Í¡½Ð…ÁÑÕÉ•tœé¹½‘”¹•ÑÑÑÉ¥‰ÕÑ” Á±…•¡½±‘•Èœ¥ñðm½É´½¹ÑÉ½±tœì(€€€€€€€É•ÑÕÉ¸©Íàý€ñÍÁ…¸±…ÍÍ9…µ”ôˆ‘í±…ÍÍ5…À¹•Ð¡¹½‘”¥ôˆùì‘í)M=8¹ÍÑÉ¥¹¥™ä¡Á±…•¡½±‘•È¥õôð½ÍÁ…¸ù€é€ñÍÁ…¸±…ÍÌôˆ‘í±…ÍÍ5…À¹•Ð¡¹½‘”¥ôˆø‘í•ÍŒ¡Á±…•¡½±‘•È¥ôð½ÍÁ…¸ù€ì(€€€€€ô(€€€€€€¼¼½ÉµÌ‰•½µ”¹½¸µÍÕ‰µ¥ÑÑ…‰±”Í•Ñ¥½¹Ìì±¥¹­Ì…¹¹½Ð¹…Ù¥…Ñ”…¥‘•¹Ñ…±±ä¸(€€€€€¥˜¡Ñ…œôôô™½É´œ¥Ñ…œôÍ•Ñ¥½¸œì(€€€€€½¹ÍÐ…ÑÑÉÌõ¹•Ü5…À¡ml±…ÍÌœ±±…ÍÍ5…À¹•Ð¡¹½‘”¥ut¤ì(€€€€€¥˜¡¥‘5…À¹¡…Ì¡¹½‘”¹¥¤¥…ÑÑÉÌ¹Í•Ð ¥œ±¥‘5…À¹•Ð¡¹½‘”¹¥¤¤ì(€€€€€™½È¡½¹ÍÐ…ÑÑÈ½˜¹½‘”¹…ÑÑÉ¥‰ÕÑ•Ì¥ì(€€€€€€€½¹ÍÐ¸õ…ÑÑÈ¹¹…µ”±Øõ…ÑÑÈ¹Ù…±Õ”ì(€€€€€€€¥˜¡¸¹ÍÑ…ÉÑÍ]¥Ñ  ½¸œ¥ññlÍÑå±”œ°±…ÍÌœ°¥œ°Ù…±Õ”œ°¡•­•œ°Í•±•Ñ•œ°¹…µ”œ°…Ñ¥½¸œ°™½Éµ…Ñ¥½¸œ°ÍÉ‘½Œœ°½¹Ñ•¹Ñ•‘¥Ñ…‰±”t¹¥¹±Õ‘•Ì¡¸¤¥½¹Ñ¥¹Õ”ì(€€€€€€€¥˜¡¸ôôô¡É•˜ññ¸ôôôá±¥¹¬é¡É•˜œ¥í¥˜¡¥ÍMY˜™Ø¹ÍÑ…ÉÑÍ]¥Ñ  œŒœ¤˜™¥‘5…À¹¡…Ì¡Ø¹Í±¥” Ä¤¤¥…ÑÑÉÌ¹Í•Ð ¡É•˜œ°œŒœ­¥‘5…À¹•Ð¡Ø¹Í±¥” Ä¤¤¤í½¹Ñ¥¹Õ”íô(€€€€€€€¥˜¡¸ôôôÍÉŒœ¥í½¹ÍÐÔõÍ…™•UI0¡¹½‘”¹ÕÉÉ•¹ÑMÉññØ¤í¥˜¡Ñ…œôôô¥µœœ˜™Ô¥…ÑÑÉÌ¹Í•Ð¡¸±Ô¤í½¹Ñ¥¹Õ”íô(€€€€€€€¥˜¡¸ôôôÍÉÍ•Ðññ¸ôôôÍ¥é•Ìœ¥½¹Ñ¥¹Õ”ì(€€€€€€€¥˜¡¸ôôô…É¥„µ±…‰•±±•‘‰äññ¸ôôô…É¥„µ‘•ÍÉ¥‰•‘‰äññ¸ôôô™½Èœ¥í½¹ÍÐ¥‘ÌõØ¹ÍÁ±¥Ð ½qÌ¬¼¤¹µ…À¡¥ôù¥‘5…À¹•Ð¡¥¤¤¹™¥±Ñ•È¡	½½±•…¸¤í¥˜¡¥‘Ì¹±•¹Ñ ¥…ÑÑÉÌ¹Í•Ð¡¸±¥‘Ì¹©½¥¸ œ€œ¤¤í½¹Ñ¥¹Õ”íô(€€€€€€€¥˜¡¸¹ÍÑ…ÉÑÍ]¥Ñ  …É¥„´œ¥ññl…±Ðœ°Ñ¥Ñ±”œ°É½±”œ°Ý¥‘Ñ œ°¡•¥¡Ðœ°½±ÍÁ…¸œ°É½ÝÍÁ…¸œ°Í½Á”œ°ÑåÁ”œ°‘…Ñ•Ñ¥µ”t¹¥¹±Õ‘•Ì¡¸¥ñð¡¥ÍMY˜™MY}QQH¹¡…Ì¡¸¤¤¥ì(€€€€€€€€€±•ÐÍ…™”õØí¥˜ ½ÕÉ±p ¼¹Ñ•ÍÐ¡Í…™”¤¥íÍ…™”õÍ…™”¹É•Á±…” ½ÕÉ±p¡lœ‰tüŒ¡mx¤œ‰qÍt¬¥lœ‰týp¤½œ°¡|±¥¤ôù¥‘5…À¹¡…Ì¡¥¤üÕÉ° Œœ­¥‘5…À¹•Ð¡¥¤¬œ¤œè¹½¹”œ¤í¥˜ ½ÕÉ±p  ü„Œ¤¼¹Ñ•ÍÐ¡Í…™”¤¥½¹Ñ¥¹Õ”íô(€€€€€€€€€¥˜ ½©…Ù…ÍÉ¥ÁÐéðñp¼½¤¹Ñ•ÍÐ¡Í…™”¤¥½¹Ñ¥¹Õ”í…ÑÑÉÌ¹Í•Ð¡¸±Í…™”¹Í±¥” À°ÄØÀÀÀ¤¤ì(€€€€€€€ô(€€€€€ô(€€€€€¥˜¡Ñ…œôôô‰ÕÑÑ½¸œ¥…ÑÑÉÌ¹Í•Ð ÑåÁ”œ°‰ÕÑÑ½¸œ¤ì(€€€€€¥˜¡Ñ…œôôô¥µœœ¥í¥˜ ……ÑÑÉÌ¹¡…Ì …±Ðœ¤¥…ÑÑÉÌ¹Í•Ð …±Ðœ°œœ¤í…ÑÑÉÌ¹Í•Ð É•™•ÉÉ•ÉÁ½±¥äœ°¹¼µÉ•™•ÉÉ•Èœ¤íô(€€€€€¥˜¡Ñ…œôôôÍÙœœ˜˜……ÑÑÉÌ¹¡…Ì áµ±¹Ìœ¤¥…ÑÑÉÌ¹Í•Ð áµ±¹Ìœ°¡ÑÑÀè¼½ÝÝÜ¹ÜÌ¹½Éœ¼ÈÀÀÀ½ÍÙœœ¤ì(€€€€€½¹ÍÐ…ÑÑÉ¥‰ÕÑ•Ìõl¸¸¹…ÑÑÉÍt¹µ…À ¡m¸±Ùt¤ôù©Íàý€€‘í¸ôôôÉ•™•ÉÉ•ÉÁ½±¥äœüÉ•™•ÉÉ•ÉA½±¥äœé©ÍáÑÑÈ¡¸¥ôõì‘í)M=8¹ÍÑÉ¥¹¥™ä¡Ø¥õõ€é€€‘í¹ôôˆ‘í•ÍŒ¡Ø¥ô‰€¤¹©½¥¸ œœ¤ì(€€€€€½¹ÍÐ¡¥±‘É•¸õ¹½‘”¹Í¡…‘½ÝI½½Ðýl¸¸¹¹½‘”¹Í¡…‘½ÝI½½Ð¹¡¥±‘9½‘•Ítél¸¸¹¹½‘”¹¡¥±‘9½‘•Ítì(€€€€€€¼¼áÁ…¹…ÍÍ¥¹•¹½‘•Ì¥¸½Á•¸Í¡…‘½ÜÍ±½ÑÌ¥¹ÍÑ•…½˜•áÁ½ÉÑ¥¹œ‰É½­•¸Í±½ÑÌ¸(€€€€€±•Ð½¹Ñ•¹Ðõ¡¥±‘É•¸¹µ…À¡¸ôùí¥˜¡¸¥¹ÍÑ…¹•½˜!Q51M±½Ñ±•µ•¹Ð¥í½¹ÍÐ…ÍÍ¥¹•õ¸¹…ÍÍ¥¹•‘9½‘•Ì¡í™±…ÑÑ•¸éÑÉÕ•ô¤íÉ•ÑÕÉ¸€¡…ÍÍ¥¹•¹±•¹Ñ ý…ÍÍ¥¹•él¸¸¹¸¹¡¥±‘9½‘•Ít¤¹µ…À¡ŒôùÙ¥Í¥Ð¡Œ±©Íà¤¤¹©½¥¸ œœ¤íõÉ•ÑÕÉ¸Ù¥Í¥Ð¡¸±©Íà¤íô¤¹©½¥¸ œœ¤ì(€€€€€¥˜¡Ù½¥‘Q…Ì¹¡…Ì¡Ñ…œ¤¥É•ÑÕÉ¹€ð‘íÑ…ô‘í…ÑÑÉ¥‰ÕÑ•Íô‘í©Íàüœ€¼øœèœøõ€ì(€€€€€É•ÑÕÉ¹€ð‘íÑ…ô‘í…ÑÑÉ¥‰ÕÑ•Íôø‘í½¹Ñ•¹Ñôð¼‘íÑ…ôù€ì(€€€ô(€€€½¹ÍÐÉ½½Ñ]¥‘Ñ õÉ•Ð¡É½½Ð¤¹Ý¥‘Ñ ì(€€€½¹ÍÐÍ…™•½µÁ½¹•¹ÑMLõØôùí¥˜ ½ÕÉ±p ¸¨üŒ½¤¹Ñ•ÍÐ¡Ø¤¥É•ÑÕÉ¸Ø¹É•Á±…” ½ÕÉ±p¡qÌ©lœ‰týmx¤ˆt¨Œ¡mx¤ˆqÍt¬¥lœ‰týqÌ©p¤½¤°¡|±¥¤ôù¥‘5…À¹¡…Ì¡¥¤üÕÉ° Œœ­¥‘5…À¹•Ð¡¥¤¬œ¤œè¹½¹”œ¤íÉ•ÑÕÉ¸Í…™•ML¡Ø¤íôì(€€€™½È¡½¹ÍÐ”½˜ÑÉ…Ù•ÉÍ•¹¹½‘•Ì¥í¥˜¡=I	%8¹¡…Ì¡”¹Ñ…9…µ”¤¥½¹Ñ¥¹Õ”ì(€€€€€½¹ÍÐÍÐõÉ•…‘MÑå±•Ì¡”¤±Á…¥ÉÌõmtì(€€€€€™½È¡½¹ÍÐmÀ±Ùt½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡ÍÐ¤¥í½¹ÍÐÍ…™”õÍ…™•½µÁ½¹•¹ÑML¡Ø¤í¥˜¡Í…™”¥Á…¥ÉÌ¹ÁÕÍ  œ€€œ­À¬œè€œ­Í…™”¬œìœ¤íô(€€€€€€¼¼AÍ•Õ‘¼µ•±•µ•¹ÑÌ…É”É•½¹ÍÑÉÕÑ•Ý¡•¸Ñ¡”‰É½ÝÍ•È•áÁ½Í•ÌÑ¡•¥È½¹Ñ•¹Ð¸(€€€€€ÉÕ±•Ì¹ÁÕÍ  œ¸œ­±…ÍÍ5…À¹•Ð¡”¤¬œíq¸œ­Á…¥ÉÌ¹©½¥¸ q¸œ¤¬q¹ôœ¤ì(€€€€€™½È¡½¹ÍÐÁÍ•Õ‘¼½˜lœèé‰•™½É”œ°œèé…™Ñ•Èt¥í½¹ÍÐÁÌõ•Ñ½µÁÕÑ•‘MÑå±”¡”±ÁÍ•Õ‘¼¤í¥˜¡ÁÌ¹½¹Ñ•¹Ð˜™ÁÌ¹½¹Ñ•¹Ð„ôô¹½¹”œ˜™ÁÌ¹½¹Ñ•¹Ð„ôô¹½Éµ…°œ¥ì(€€€€€€€½¹ÍÐÙ…±Õ•ÌõÉ•…‘MÑå±•Ì¡”±ÁÍ•Õ‘¼¤í½¹ÍÐ½¹Ñ•¹ÐõÍ…™•ML¡ÁÌ¹½¹Ñ•¹Ð¤í¥˜¡½¹Ñ•¹Ð¥ÉÕ±•Ì¹ÁÕÍ  œ¸œ­±…ÍÍ5…À¹•Ð¡”¤­ÁÍ•Õ‘¼¬œíq¸€½¹Ñ•¹Ðè€œ­½¹Ñ•¹Ð¬œíq¸œ­=‰©•Ð¹•¹ÑÉ¥•Ì¡Ù…±Õ•Ì¤¹™¥±Ñ•È ¡mÁt¤ôø…À¹ÍÑ…ÉÑÍ]¥Ñ  …¹¥µ…Ñ¥½¸´œ¤¤¹µ…À ¡mÀ±Ùt¤ôùmÀ±Í…™•ML¡Ø¥t¤¹™¥±Ñ•È ¡l±Ùt¤ôùØ¤¹µ…À ¡mÀ±Ùt¤ôøœ€€œ­À¬œè€œ­Ø¬œìœ¤¹©½¥¸ q¸œ¤¬q¹ôœ¤ì(€€€€€õô(€€€ô(€€€½Õ¹ÐôÀíÑ•áÑ½Õ¹ÐôÀí½¹ÍÐ¡Ñµ°õÙ¥Í¥Ð¡É½½Ð±™…±Í”¤í½Õ¹ÐôÀíÑ•áÑ½Õ¹ÐôÀí½¹ÍÐ©ÍàõÙ¥Í¥Ð¡É½½Ð±ÑÉÕ”¤ì(€€€½¹ÍÐÍÌôœ¼¨•Í¥¸1•¹Ìè½µÁÕÑ•ÍÑå±•Ì°ÕÉÉ•¹ÐÙ¥•ÝÁ½ÉÐì•¹•É…Ñ•Í•±•Ñ½ÉÌ¹q¸€¨I•Ý½É¬™¥á•‘¥µ•¹Í¥½¹Ì°É•ÍÁ½¹Í¥Ù”±…å½ÕÐ…¹‰•¡…Ù¥½È‰•™½É”ÁÉ½‘ÕÑ¥½¸¸€¨½q¸œ­ÉÕ±•Ì¹©½¥¸ q¹q¸œ¤¬q¸œì(€€€¥˜¡Ñ•áÑ±¥ÁÁ•¥Ý…É¹¥¹Ì¹ÁÕÍ  Q•áÐÝ…ÌÑÉÕ¹…Ñ•…ÐÑ¡”Í…™•Ñä±¥µ¥ÐìÑ¡¥Ì¥Ì„Á…ÉÑ¥…°…ÁÑÕÉ”¸œ¤ì(€€€¥˜¡ÑÉ…Ù•ÉÍ•¹±¥ÁÁ•¥Ý…É¹¥¹Ì¹ÁÕÍ ¡½µÁ½¹•¹Ð•á••‘Ì€‘í1%5%QL¹½µÁ½¹•¹Ñô•±•µ•¹ÑÌìÑ¡¥Ì¥Ì„Á…ÉÑ¥…°…ÁÑÕÉ”¸M•±•Ð„Íµ…±±•È½µÁ½¹•¹Ð¹€¤ì(€€€¥˜¡ÑÉ…Ù•ÉÍ•¹¹½‘•Ì¹Í½µ”¡”ôù”¹Í¡…‘½ÝI½½Ð¤¥Ý…É¹¥¹Ì¹ÁÕÍ  =Á•¸Í¡…‘½Ü=4Ý…Ì™±…ÑÑ•¹•¸M±½ÑÑ¥¹œ…¹•¹…ÁÍÕ±…Ñ¥½¸µ…ä¹••µ…¹Õ…°…‘©ÕÍÑµ•¹Ð¸œ¤ì(€€€¥˜¡¹•ÜQ•áÑ¹½‘•È ¤¹•¹½‘”¡¡Ñµ°­©Íà­ÍÌ¤¹±•¹Ñ ù1%5%QL¹‰åÑ•Ì¥Ñ¡É½Ü¹•ÜÉÉ½È ½µÁ½¹•¹Ð•áÁ½ÉÐ¥ÌÑ½¼±…É”¸M•±•Ð„Íµ…±±•ÈÍ•Ñ¥½¸¸9¼Á…ÉÑ¥…°™¥±”Ý…ÌÍ…Ù•¸œ¤ì(€€€É•ÑÕÉ¹í¹…µ•ÍÁ…”éÁÉ•™¥à±¡Ñµ°±©Íà±ÍÌ±¹½‘•ÌéÑÉ…Ù•ÉÍ•¹¹½‘•Ì¹±•¹Ñ ±Á…ÉÑ¥…°éÑÉ…Ù•ÉÍ•¹±¥ÁÁ•‘ññÑ•áÑ±¥ÁÁ•±Í½ÕÉ”éÍ½ÕÉ” ¤±É½½Ñ]¥‘Ñ ±¥¹±Õ‘•Q•áÐé½ÁÑ¥½¹Ì¹¥¹±Õ‘•Q•áÐ„ôõ™…±Í”±Ý…É¹¥¹Íôì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸‘¥ÍÁ…Ñ ¡µ•ÍÍ…”¤ì(€€€ÍÝ¥Ñ ¡µ•ÍÍ…”¹½µµ…¹¥ì(€€€€€…Í”Á¥¹œœéÉ•ÑÕÉ¹íÉ•…‘äéÑÉÕ”±Í½ÕÉ”éÍ½ÕÉ” ¥ôì(€€€€€…Í”Á¥¬œéÉ•ÑÕÉ¸‰•¥¸ Á¥¬œ¤ì(€€€€€…Í”É•¥½¸œéÉ•ÑÕÉ¸‰•¥¸ É•¥½¸œ¤ì(€€€€€…Í”…¹•°œéÍÑ½À ¤íÉ•ÑÕÉ¹íÍÑ½ÁÁ•éÑÉÕ•ôì(€€€€€…Í”¥¹ÍÁ•ÐœéÉ•ÑÕÉ¸¥¹ÍÁ•Ð ¤ì(€€€€€…Í”¹…Ù¥…Ñ”œéÉ•ÑÕÉ¸¹…Ù¥…Ñ”¡µ•ÍÍ…”¹‘¥É•Ñ¥½¸¤ì(€€€€€…Í”Í…¸œéÉ•ÑÕÉ¸Í…¸ ¤ì(€€€€€…Í”Ñ½­•¹ÌœéÉ•ÑÕÉ¸Ñ½­•¹Í½È¡Í•±•Ñ•ü¹¥Í½¹¹•Ñ•ýÍ•±•Ñ•é¹Õ±°¤ì(€€€€€…Í”½µÁ½¹•¹ÐœéÉ•ÑÕÉ¸…ÁÑÕÉ•½µÁ½¹•¹Ð¡µ•ÍÍ…”¹½ÁÑ¥½¹Ì¤ì(€€€€€…Í”•½µ•ÑÉäœéíÍÑ½À¡™…±Í”¤í½¹ÍÐ”õµ•ÍÍ…”¹Í•±•Ñ•ý¹••‘M•±•Ñ• ¤é¹Õ±°íÉ•ÑÕÉ¹íÉ•Ðé”ýÉ•Ð¡”¤é¹Õ±°±Ù¥•ÝÁ½ÉÐéíÝ¥‘Ñ é¥¹¹•É]¥‘Ñ ±¡•¥¡Ðé¥¹¹•É!•¥¡Ñô±Í½ÕÉ”éÍ½ÕÉ” ¥ôíô(€€€€€‘•™…Õ±ÐéÑ¡É½Ü¹•ÜÉÉ½È U¹­¹½Ý¸¥¹ÍÁ•Ñ½È½µµ…¹¸œ¤ì(€€€ô(€ô(€¡É½µ”¹ÉÕ¹Ñ¥µ”¹½¹5•ÍÍ…”¹…‘‘1¥ÍÑ•¹•È ¡µ•ÍÍ…”±Í•¹‘•È±É•ÍÁ½¹¤ôùì(€€€¥˜¡Í•¹‘•È¹¥„ôõ¡É½µ”¹ÉÕ¹Ñ¥µ”¹¥ñðµ•ÍÍ…”ü¹­¥¹„ôô±•¹Ìµ½µµ…¹œ¥É•ÑÕÉ¸™…±Í”ì(€€€AÉ½µ¥Í”¹É•Í½±Ù” ¤¹Ñ¡•¸  ¤ôù‘¥ÍÁ…Ñ ¡µ•ÍÍ…”¤¤¹Ñ¡•¸¡‘…Ñ„ôùÉ•ÍÁ½¹¡í½¬éÑÉÕ”±‘…Ñ…ô¤±•ÉÉ½ÈôùÉ•ÍÁ½¹¡í½¬é™…±Í”±•ÉÉ½ÈéMÑÉ¥¹œ¡•ÉÉ½È¹µ•ÍÍ…•ññ•ÉÉ½È¥ô¤¤íÉ•ÑÕÉ¸ÑÉÕ”ì(€ô¤ì(€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È Á…•¡¥‘”œ° ¤ôùÍÑ½À¡™…±Í”¤±í½¹”éÑÉÕ•ô¤ì)ô¤ ¤ì(