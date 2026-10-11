"""Native extension integration test. Run in a normal, unmanaged test browser.
Linux: xvfb-run -a -s '-screen 0 1800x1200x24' python3 tests/native.py
Requires Playwright's Chromium and xdotool. Never changes enterprise policies.
"""
import asyncio,base64,functools,http.server,json,os,shutil,subprocess,tempfile,threading,zipfile,io
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
RESULTS=[]
def passed(name):RESULTS.append(name);print('PASS native:',name,flush=True)
async def main():
    if not shutil.which('xdotool'):raise RuntimeError('Native Linux tests need xdotool. No keyboard/API permission grants are simulated.')
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'tests/fixtures'))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler);threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    async with async_playwright() as p, asyncio.timeout(150):
        with tempfile.TemporaryDirectory() as profile:
            options={'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {'channel':'chromium'}
            ctx=await p.chromium.launch_persistent_context(profile,headless=False,ignore_default_args=['--disable-extensions'],args=['--no-sandbox',f'--disable-extensions-except={ROOT}/extension',f'--load-extension={ROOT}/extension','--window-size=1400,1100'],no_viewport=True,accept_downloads=True,**options)
            try:
                worker=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker',timeout=15000)
                ext=worker.url.rsplit('/',1)[0];page=ctx.pages[0];await page.goto(url);await page.bring_to_front()
                # Real keyboard action grants activeTab. Do not add host permissions to tests.
                windows=subprocess.check_output(['xdotool','search','--onlyvisible','--class','chromium'],text=True).strip().splitlines()
                subprocess.run(['xdotool','windowfocus','--sync',windows[-1]],check=True)
                subprocess.run(['xdotool','key','--clearmodifiers','alt+shift+d'],check=True)
                await page.wait_for_timeout(1300)
                tabs=await worker.evaluate('chrome.tabs.query({})');target=next((t for t in tabs if t.get('url','').startswith(url)),None)
                assert target,'Toolbar shortcut did not grant activeTab to the fixture.'
                passed('real toolbar keyboard action grants activeTab')
                session=await ctx.new_cdp_session(page);targets=await session.send('Target.getTargets')
                assert any(x.get('url')==ext+'/sidepanel.html' for x in targets['targetInfos']),targets
                passed('native browser side panel opens with the shipped manifest')
                # The same UI also supports a separate window, which Playwright can drive.
                async with ctx.expect_page() as opened:
                    await worker.evaluate('(u)=>chrome.windows.create({url:u,type:"popup",width:480,height:1000})',ext+'/sidepanel.html?sourceWindow='+str(target['windowId']))
                panel=await opened.value;await panel.wait_for_load_state();await panel.wait_for_function("document.getElementById('status').textContent.includes('Connected')")
                errors=[];panel.on('pageerror',lambda e:errors.append(str(e)))
                passed('standalone panel connects using real browser messaging and isolated content script')
                async def click(selector):await panel.locator(selector).click();await panel.wait_for_function("!document.body.classList.contains('busy')")
                async def choose(selector,position=None):
                    await page.locator(selector).scroll_into_view_if_needed();await click('#pick');await page.locator(selector).click(**({'position':position}if position else{}));await panel.wait_for_timeout(100)
                await choose('#demo-button');assert await page.evaluate('window.clicked||0')==0
                assert 'demo-button' in await panel.locator('#selection-title').inner_text();passed('native isolated picker does not activate page buttons')
                await click('#parent');await click('#capture-from-inspect');await panel.locator('#export-format').select_option('json')
                result=json.loads(await panel.locator('#export-output').input_value());assert '$24,680' in result['component']['html'];assert 'onclick' not in result['component']['html'];passed('native component capture and export round trip')
                await panel.locator('#preview-details summary').click()
                preview=panel.frame_locator('#component-preview')
                await preview.locator('article').wait_for()
                assert await preview.locator('article').evaluate('(e)=>getComputedStyle(e).paddingTop')=='24px'
                assert await preview.locator('script').count()==0
                passed('sandboxed component preview renders captured CSS without page scripts')
                await click('#scan');await click('#copy-system');assert 'Copied to clipboard' in await panel.locator('#status').inner_text();passed('scan and native clipboard-write operation succeed')
                await click('#export-tab');await click('#capture-element');assert not await panel.locator('#reference-view').is_hidden();passed('native captureVisibleTab produces a cropped PNG')
                async with panel.expect_download() as downloaded:await click('#download-bundle')
                dl=await downloaded.value;path=OUT/'native-capture.zip';await dl.save_as(path)
                with zipfile.ZipFile(path)as archive:
                    assert archive.testzip() is None
                    for name in ['captured.html','captured.css','CapturedComponent.tsx','rebuild-brief.md','design-report.json','reference.png','tokens.css']:assert name in archive.namelist()
                passed('native ZIP download contains all expected valid exports')
                await click('#library-tab');await panel.locator('#save-name').fill('Native card');await click('#save-current');assert await panel.locator('#saved-count').inner_text()=='1';passed('real chrome.storage.local persistence')
                await click('#inspect-tab');await click('#pick');await page.keyboard.press('Escape');assert await page.locator('design-lens-overlay').count()==0;await page.locator('#demo-button').click();assert await page.evaluate('window.clicked')==1;passed('Escape restores normal interaction in native content script')
                # Optional external audit tooling is development-only, never packaged.
                axe=Path(os.environ.get('AXE_PATH',str(ROOT/'node_modules/axe-core/axe.min.js')))
                if not axe.exists():raise RuntimeError('Native acceptance requires AXE_PATH pointing to axe-core. It is not bundled into the extension.')
                await panel.add_script_tag(content=axe.read_text())
                audits=[]
                for theme in ['dark','light']:
                    await panel.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
                    for tab in ['inspect','system','export','library']:
                        await click('#'+tab+'-tab')
                        audit=await panel.evaluate("async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa']}})")
                        audits.append({'theme':theme,'tab':tab,'violations':audit['violations'],'incomplete':audit['incomplete']})
                        assert not audit['violations'],json.dumps({'theme':theme,'tab':tab,'violations':audit['violations']})
                (OUT/'axe-native.json').write_text(json.dumps(audits,indent=2));passed('axe audit: four tabs in both themes, zero reported violations')
                await panel.screenshot(path=str(OUT/'native-panel.png'))
                assert not errors,errors
                (OUT/'native-results.json').write_text(json.dumps({'mode':'real unpacked extension in Chromium','browser':ctx.browser.version if ctx.browser else 'persistent Chromium','extension':ext,'passed':len(RESULTS),'tests':RESULTS},indent=2))
            finally:
                (OUT/'native-progress.json').write_text(json.dumps({'passed':len(RESULTS),'tests':RESULTS},indent=2))
                await ctx.close()
    server.shutdown()
if __name__=='__main__':asyncio.run(main())
