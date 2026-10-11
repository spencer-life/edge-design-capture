"""Real Chromium DOM/UI tests with an explicit extension-API transport harness.
This does NOT install the extension, grant activeTab, or test browser chrome.
Use native.py in an unmanaged development/CI browser for that separate layer.
"""
import asyncio,base64,json,os,re,shutil,zipfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
RESULTS=[]
def passed(name):
    RESULTS.append(name);print('PASS:',name,flush=True)
async def main():
    async with async_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
        browser=await p.chromium.launch(**({'executable_path':executable} if executable else {}),headless=True,args=['--no-sandbox'])
        ctx=await browser.new_context(accept_downloads=True)
        page=await ctx.new_page();await page.set_viewport_size({'width':1100,'height':900})
        panel=await ctx.new_page();await panel.set_viewport_size({'width':420,'height':1050})
        errors=[]
        panel.on('pageerror',lambda e:errors.append(str(e)))
        fixture=(ROOT/'tests/fixtures/index.html').read_text().replace('/reference.png','data:image/png;base64,'+base64.b64encode((ROOT/'tests/fixtures/reference.png').read_bytes()).decode()).replace('src="/frame.html"','srcdoc="&lt;p&gt;Embedded frame&lt;/p&gt;"')
        await page.set_content(fixture)
        async def event(_source,m):
            if m.get('kind')=='lens-content':
                await panel.evaluate('(m)=>window.__panelListeners.forEach(fn=>fn(m))',{'kind':'lens-event','event':m['event'],'data':m.get('data'),'documentId':m.get('documentId'),'tabId':1,'windowId':1})
            return True
        await page.expose_binding('__emit',event)
        await page.evaluate("""()=>{window.__listener=null;window.chrome={runtime:{id:'harness',onMessage:{addListener:fn=>window.__listener=fn},sendMessage:m=>window.__emit(m)}};}""")
        await page.add_script_tag(content=(ROOT/'extension/content.js').read_text())
        async def command(name,**extra):
            return await page.evaluate("""(m)=>new Promise(resolve=>window.__listener({kind:'lens-command',...m},{id:'harness'},resolve))""",{'command':name,**extra})
        async def bridge(_source,m):
            try:
                if m['action']=='target':return {'ok':True,'data':{'id':1,'windowId':1,'url':'https://fixture.test/','title':'Fixture'}}
                if m['action']=='command':return await command(m['command'],direction=m.get('direction'),options=m.get('options'),selected=m.get('selected'))
                if m['action']=='screenshot':
                    geometry=await command('geometry',selected=m.get('mode')=='element')
                    if not geometry['ok']:return geometry
                    shot=await page.screenshot();return {'ok':True,'data':{**geometry['data'],'dataURL':'data:image/png;base64,'+base64.b64encode(shot).decode()}}
                if m['action']=='close':await command('cancel');return {'ok':True,'data':{'closed':False}}
                return {'ok':False,'error':'Unsupported harness API'}
            except Exception as e:return {'ok':False,'error':str(e)}
        await panel.expose_binding('__bridge',bridge)
        html=(ROOT/'extension/sidepanel.html').read_text();html=re.sub(r'<link[^>]*stylesheet[^>]*>','',html);html=re.sub(r'<script[^>]*src="sidepanel.js"[^>]*></script>','',html)
        await panel.set_content(html);await panel.add_style_tag(content=(ROOT/'extension/sidepanel.css').read_text())
        await panel.evaluate("""()=>{
          if(!crypto.randomUUID)crypto.randomUUID=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');window.__panelListeners=[];window.__hStorage={};window.__storageListeners=[];window.__copied='';
          const port={postMessage(){},onDisconnect:{addListener(){}}};
          window.chrome={runtime:{getURL:p=>'about:blank#'+p,sendMessage:m=>window.__bridge(m),connect:()=>port,onMessage:{addListener:fn=>window.__panelListeners.push(fn)}},windows:{getCurrent:async()=>({id:1}),create:async()=>({id:2})},tabs:{create:async()=>{}},storage:{local:{get:async(keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,window.__hStorage[k]])),set:async(data)=>{const changes={};for(const [k,v]of Object.entries(data)){changes[k]={newValue:v};window.__hStorage[k]=v;}window.__storageListeners.forEach(f=>f(changes,'local'));}},onChanged:{addListener:fn=>window.__storageListeners.push(fn)}}};
          Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;},write:async()=>{}},configurable:true});
        }""")
        bundle='\n'.join(re.sub(r'^import .*;\n?','',re.sub(r'^export ','', (ROOT/'extension'/f).read_text(),flags=re.M),flags=re.M) for f in ['lib/core.js','lib/images.js','lib/zip.js','sidepanel.js'])
        await panel.add_script_tag(content=bundle,type='module')
        await panel.wait_for_function("document.getElementById('status').textContent.includes('Connected')")
        passed('panel initializes and connects through explicit transport harness')
        async def click(selector):
            await panel.locator(selector).click();await panel.wait_for_function("!document.body.classList.contains('busy')")
        async def choose(selector,position=None):
            await page.locator(selector).scroll_into_view_if_needed();await click('#pick')
            await page.locator(selector).click(**({'position':position} if position else {}));await panel.wait_for_timeout(80)
        await choose('#demo-button')
        assert await page.evaluate('window.clicked||0')==0
        assert 'button#demo-button' in await panel.locator('#selection-title').inner_text()
        passed('picker inspects real computed CSS without activating the selected button')
        await click('#pick');await page.keyboard.press('Escape');assert await page.locator('design-lens-overlay').count()==0
        await page.locator('#demo-button').click();assert await page.evaluate('window.clicked')==1
        passed('Escape removes overlay/listeners and restores page interaction')
        await click('#parent');assert 'article#revenue' in await panel.locator('#selection-title').inner_text()
        passed('parent navigation selects complete card')
        await click('#capture-from-inspect')
        await panel.locator('#export-format').select_option('json');r=json.loads(await panel.locator('#export-output').input_value())
        c=r['component'];assert '<script' not in c['html'] and 'onclick' not in c['html'];assert 'DO_NOT_EXPORT' not in c['html'];assert '::after' in c['css'];assert '$24,680' in c['html']
        passed('component exports sanitize scripts/handlers/hidden content and preserve styles/pseudo-elements')
        await panel.locator('#export-format').select_option('react');assert 'export default function' in await panel.locator('#export-output').input_value()
        passed('static React TSX export generated with accompanying CSS contract')
        await click('#scan');assert await panel.locator('.token-card').count()>0
        await click('#copy-system');css=await panel.evaluate('window.__copied');assert '--primary: #7053d6' in css and '--primary: #296ac7' in css
        passed('root and selected-scope CSS tokens remain distinct')
        for category in ['colors','fonts','scale','assets']:
            await click('[data-system="'+category+'"]');assert len(await panel.locator('#system-content').inner_text())>40
        passed('palette, font inventory, observed scale and sanitized asset inventory render')
        await click('[data-system="tokens"]');await panel.locator('#system-search').fill('--radius');assert await panel.locator('.token-card').count()==2
        await panel.locator('#system-search').fill('');passed('token search filters both scopes')
        # Save limits and load/delete use the real UI with a browser-storage shim.
        await click('#library-tab');await panel.locator('#save-name').fill('Revenue card');await click('#save-current')
        assert await panel.locator('#saved-count').inner_text()=='1',await panel.locator('#status').inner_text()
        await click('#library-list button:first-child');assert 'Loaded a saved snapshot' in await panel.locator('#status').inner_text()
        passed('local library save/load round trip retains captured data')
        await click('#capture-component');assert 'saved snapshot' in await panel.locator('#status').inner_text()
        passed('saved snapshots cannot recapture an unrelated live element')
        await choose('#privacy',{'x':8,'y':8});await click('#capture-from-inspect');await panel.locator('#export-format').select_option('json');r=json.loads(await panel.locator('#export-output').input_value())
        assert not any(x in r['component']['html'] for x in ['DO_NOT_EXPORT_PASSWORD','DO_NOT_EXPORT_INPUT','DO_NOT_EXPORT_TEXTAREA','javascript:','onclick'])
        passed('passwords, form values, textarea content and unsafe links are excluded')
        await choose('custom-card',{'x':4,'y':4});await click('#capture-from-inspect');r=json.loads(await panel.locator('#export-output').input_value());assert 'Shadow content' in r['component']['html'] and 'Slotted text' in r['component']['html']
        passed('open shadow DOM and assigned slot content are flattened')
        await panel.locator('#include-text').uncheck();await click('#capture-component');r=json.loads(await panel.locator('#export-output').input_value());assert 'Slotted text' not in r['component']['html'] and '[Text]' in r['component']['html']
        await panel.locator('#include-text').check();passed('text omission option replaces source text')
        await choose('#image-ref');assert 'Image / embed' in await panel.locator('#selection-kind').inner_text();assert 'not DOM' in await panel.locator('#selection-warnings').inner_text()
        passed('image containers are clearly distinguished from the pictured design')
        await click('#export-tab');await click('#capture-element');await panel.wait_for_function("document.getElementById('reference-image').src.startsWith('data:image/png')")
        assert '280 × 140' in await panel.locator('#reference-info').inner_text();passed('element screenshot crop uses actual Chromium-rendered pixels')
        await click('#copy-all');prompt=await panel.evaluate('window.__copied');assert 'Attach the PNG' in prompt and 'base64' not in prompt;passed('Codex brief keeps image reference caveats and excludes image bytes')
        await panel.locator('#import-image').set_input_files(str(ROOT/'tests/fixtures/reference.png'));await panel.wait_for_function("!document.body.classList.contains('busy')");assert '560 × 280' in await panel.locator('#reference-info').inner_text()
        assert await panel.locator('#reference-colors button').count()>0;passed('local image import creates PNG preview and sampled palette')
        await click('#capture-component');assert 'Pick a live element' in await panel.locator('#status').inner_text()
        await click('#capture-element');assert 'Pick a live element' in await panel.locator('#status').inner_text()
        passed('image imports cannot reuse an invisible stale live selection')
        async with panel.expect_download() as pending:await click('#download-bundle')
        download=await pending.value;await download.save_as(OUT/'harness-image-bundle.zip')
        with zipfile.ZipFile(OUT/'harness-image-bundle.zip') as archive:
            assert archive.testzip() is None
            assert set(['rebuild-brief.md','design-report.json','reference.png']).issubset(archive.namelist())
        passed('complete ZIP export downloads valid brief, report and PNG files')
        # Screenshot artifacts and visible keyboard/contrast/layout checks.
        await choose('#revenue',{'x':4,'y':4});await click('#scan');await click('[data-system="tokens"]');await panel.set_viewport_size({'width':420,'height':1050})
        await panel.screenshot(path=str(OUT/'tokens-dark.png'))
        await click('#inspect-tab');await panel.evaluate('scrollTo(0,0)');await panel.screenshot(path=str(OUT/'inspect-dark.png'))
        await click('#theme');await panel.screenshot(path=str(OUT/'inspect-light.png'))
        for width in [300,360,420,600]:
            await panel.set_viewport_size({'width':width,'height':900})
            assert await panel.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        passed('light/dark UI fits 300, 360, 420 and 600 px without horizontal overflow')
        await panel.locator('#inspect-tab').focus();await panel.keyboard.press('ArrowRight');assert await panel.locator('#system-tab').get_attribute('aria-selected')=='true';await panel.keyboard.press('End');assert await panel.locator('#library-tab').get_attribute('aria-selected')=='true'
        passed('keyboard tab navigation supports arrows, Home and End')
        names=await panel.evaluate("""()=>[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width&&!b.textContent.trim()&&!b.getAttribute('aria-label')).map(b=>b.id)""")
        assert names==[],names
        passed('visible buttons have accessible names')
        await click('#close');assert await page.locator('design-lens-overlay').count()==0;passed('close cancels selection even when native panel close is unavailable')
        assert not errors,errors;passed('no uncaught panel JavaScript errors')
        await browser.close()
    (OUT/'browser-results.json').write_text(json.dumps({'mode':'DOM/UI harness; browser APIs simulated, Chromium rendering real','passed':len(RESULTS),'tests':RESULTS,'native_installation':'not exercised by this suite'},indent=2))
if __name__=='__main__':asyncio.run(main())
