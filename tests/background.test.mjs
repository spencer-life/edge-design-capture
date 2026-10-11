import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function setup({url='https://example.com/',active=1,respond=true}={}){
 const listeners={},calls=[],event=name=>({addListener(fn){listeners[name]=fn;}});
 const tab={id:1,windowId:2,url,title:'Example'};
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onInstalled:event('installed'),onStartup:event('startup'),onConnect:event('connect'),onMessage:event('message'),sendMessage:async()=>{}},sidePanel:{setPanelBehavior:async()=>{},close:async()=>{calls.push('close');}},action:{onClicked:event('action')},tabs:{query:async()=>[{...tab,id:active}],get:async()=>tab,onRemoved:event('removed'),onUpdated:event('updated'),onActivated:event('activated'),sendMessage:async(id,msg)=>{calls.push(msg.command);if(!respond)throw Error('denied');return{ok:true,data:{source:{documentId:'d'},viewport:{width:100,height:100}}};},captureVisibleTab:async()=>{calls.push('screenshot');return'data:image/png;base64,AAAA';}},scripting:{executeScript:async()=>{calls.push('inject');if(!respond)throw Error('blocked');}}};
 vm.runInNewContext(source,{chrome,console,URL,Set,Date,Number,String,Error,setTimeout:(fn)=>setTimeout(fn,0)});
 const sender={id:'test',url:'chrome-extension://test/sidepanel.html'};
 const request=(fields,who=sender)=>new Promise(resolve=>{const async=listeners.message({kind:'lens-panel',...fields},who,resolve);if(!async)resolve(null);});
 return{calls,listeners,request,chrome};
}
test('background rejects requests from page-content senders',async()=>{const x=setup();assert.match((await x.request({action:'target',windowId:2},{id:'test',url:'https://example.com'})).error,/Only the Design Lens/);});
test('background ignores messages from other extensions',async()=>{const x=setup();assert.equal(await x.request({action:'target'},{id:'other'}),null);});
test('target resolver uses active tab only, not a remembered unrelated tab',async()=>{const x=setup({url:'chrome://settings'});assert.match((await x.request({action:'target',windowId:2})).error,/normal website/);});
test('injection failure reports permission guidance',async()=>{const x=setup({respond:false});assert.match((await x.request({action:'command',command:'pick',tabId:1})).error,/toolbar icon/);assert.ok(x.calls.includes('inject'));});
test('unknown command never reaches the content script',async()=>{const x=setup();assert.match((await x.request({action:'command',command:'readCookies',tabId:1})).error,/Invalid/);assert.equal(x.calls.length,0);});
test('background command round trip returns real content response',async()=>{const x=setup();const r=await x.request({action:'command',command:'inspect',tabId:1});assert.equal(r.ok,true);assert.equal(r.data.source.documentId,'d');assert.deepEqual(x.calls,['ping','inspect']);});
test('screenshots reject inactive source tab',async()=>{const x=setup({active:3});assert.match((await x.request({action:'screenshot',tabId:1})).error,/Switch back/);assert.ok(!x.calls.includes('screenshot'));});
test('screenshots reject stale document identity',async()=>{const x=setup();assert.match((await x.request({action:'screenshot',tabId:1,documentId:'old'})).error,/page changed/);assert.ok(!x.calls.includes('screenshot'));});
test('screenshot happy path checks identity before capture',async()=>{const x=setup();const r=await x.request({action:'screenshot',tabId:1,documentId:'d'});assert.equal(r.ok,true);assert.ok(x.calls.includes('screenshot'));});
test('close cancels picking before closing panel',async()=>{const x=setup();assert.equal((await x.request({action:'close',tabId:1,windowId:2})).data.closed,true);assert.deepEqual(x.calls,['cancel','close']);});

test('source movement during screenshot is rejected',async()=>{const x=setup();x.chrome.tabs.captureVisibleTab=async()=>{x.chrome.tabs.sendMessage=async()=>({ok:true,data:{source:{documentId:'d',scroll:{x:0,y:20}}}});return'data:image/png;base64,AAAA';};const r=await x.request({action:'screenshot',tabId:1,documentId:'d'});assert.match(r.error,/moved or resized/);});
