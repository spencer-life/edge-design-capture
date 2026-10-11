/* Browser API boundary. No page data is stored automatically or sent off-device. */
const COMMANDS = new Set(['ping','pick','region','cancel','inspect','navigate','scan','tokens','component','geometry']);
const panelPorts = new Set();
let lastScreenshot=0;

async function configure(){
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
}
chrome.runtime.onInstalled.addListener(()=>configure().catch(console.error));
chrome.runtime.onStartup.addListener(()=>configure().catch(console.error));
configure().catch(console.error);

async function targetForWindow(windowId) {
  const tabs=await chrome.tabs.query({active:true,windowId});
  const tab=tabs[0];
  if(tab && /^(https?|file):/.test(tab.url||''))return{id:tab.id,windowId:tab.windowId,title:tab.title||'',url:tab.url};
  throw new Error('Open a normal website, then click the Design Lens toolbar icon to grant access to that tab. Browser settings and extension stores are restricted.');
}
chrome.action.onClicked.addListener(tab=>{
  if(Number.isInteger(tab.id) && Number.isInteger(tab.windowId) && /^(https?|file):/.test(tab.url||'')){
    const target={id:tab.id,windowId:tab.windowId,title:tab.title||'',url:tab.url};
    chrome.runtime.sendMessage({kind:'lens-event',event:'target',target}).catch(()=>{});
  }
});
chrome.tabs.onActivated.addListener(({tabId,windowId})=>{
  for(const entry of panelPorts)if(entry.windowId===windowId&&entry.tabId&&entry.tabId!==tabId)chrome.tabs.sendMessage(entry.tabId,{kind:'lens-command',command:'cancel'},{frameId:0}).catch(()=>{});
  chrome.runtime.sendMessage({kind:'lens-event',event:'active-tab',tabId,windowId}).catch(()=>{});
});
chrome.tabs.onRemoved.addListener((tabId)=>{
  chrome.runtime.sendMessage({kind:'lens-event',event:'tab-removed',tabId}).catch(()=>{});
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==='loading')chrome.runtime.sendMessage({kind:'lens-event',event:'navigation',tabId}).catch(()=>{});
});
chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='design-lens-panel'||port.sender?.id!==chrome.runtime.id)return;
  const entry={port,tabId:null,windowId:null,standalone:false};panelPorts.add(entry);
  port.onMessage.addListener(m=>{if(Number.isInteger(m.tabId)){entry.tabId=m.tabId;entry.windowId=m.windowId;entry.standalone=!!m.standalone;}});
  port.onDisconnect.addListener(()=>{
    panelPorts.delete(entry);
    if(entry.tabId && ![...panelPorts].some(p=>p.tabId===entry.tabId)){
      chrome.tabs.sendMessage(entry.tabId,{kind:'lens-command',command:'cancel'},{frameId:0}).catch(()=>{});
    }
  });
});

chrome.sidePanel.onClosed?.addListener(({windowId})=>{for(const entry of panelPorts)if(entry.windowId===windowId&&!entry.standalone&&entry.tabId)chrome.tabs.sendMessage(entry.tabId,{kind:'lens-command',command:'cancel'},{frameId:0}).catch(()=>{});});

async function pageCommand(tabId, command, extra={}) {
  if(!Number.isInteger(tabId)||!COMMANDS.has(command))throw new Error('Invalid inspector request.');
  const tab=await chrome.tabs.get(tabId);
  if(!/^(https?|file):/.test(tab.url||''))throw new Error('This tab is restricted or access has not been granted. Click Design Lens in the toolbar while the website is active.');
  if(command!=='cancel'){const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==tabId)throw new Error('The source tab is no longer active. Switch back, or click the toolbar icon on the new tab and reconnect.');}
  let pong;
  try{pong=await chrome.tabs.sendMessage(tabId,{kind:'lens-command',command:'ping'},{frameId:0});}catch{/* Inject only into the selected top frame. */}
  if(!pong?.ok){
    try{await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['content.js'],world:'ISOLATED'});}catch{
      throw new Error('Cannot access this page. Click the Design Lens toolbar icon on this tab and retry. File pages need “Allow access to file URLs”; browser/store pages cannot be inspected.');
    }
  }
  const response=await chrome.tabs.sendMessage(tabId,{kind:'lens-command',command,...extra},{frameId:0});
  if(!response?.ok)throw new Error(response?.error||'The page did not respond. Reload it and reconnect.');
  return response.data;
}
async function screenshot(tabId, mode, expectedDocumentId) {
  const tab=await chrome.tabs.get(tabId);
  const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});
  if(active?.id!==tabId)throw new Error('Switch back to the source website before taking a screenshot. This prevents capturing the wrong tab.');
  let geometry=await pageCommand(tabId,'geometry',{selected:mode==='element'});
  if(expectedDocumentId&&geometry.source.documentId!==expectedDocumentId)throw new Error('The page changed before capture. Select the area again.');
  await new Promise(resolve=>setTimeout(resolve,Math.max(100,650-(Date.now()-lastScreenshot))));
  // Recheck after the delay so a tab switch cannot silently capture a different page.
  const [now]=await chrome.tabs.query({active:true,windowId:tab.windowId});
  if(now?.id!==tabId)throw new Error('The active tab changed; screenshot cancelled.');
  const check=await pageCommand(tabId,'ping');
  if(check.source.documentId!==geometry.source.documentId)throw new Error('The page navigated; screenshot cancelled.');
  geometry=await pageCommand(tabId,'geometry',{selected:mode==='element'});
  if(geometry.source.documentId!==check.source.documentId)throw new Error('The document changed; screenshot cancelled.');
  const dataURL=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});lastScreenshot=Date.now();
  const after=await pageCommand(tabId,'ping');
  if(JSON.stringify([after.source.documentId,after.source.viewport,after.source.scroll])!==JSON.stringify([geometry.source.documentId,geometry.source.viewport,geometry.source.scroll]))throw new Error('The page moved or resized during capture. Keep it still and try again.');
  return{dataURL,...geometry};
}
async function handle(message,sender){
  if(message.kind==='lens-content'){
    if(!sender.tab?.id||sender.frameId!==0)return null;
    chrome.runtime.sendMessage({kind:'lens-event',event:message.event,data:message.data,documentId:message.documentId,tabId:sender.tab.id,windowId:sender.tab.windowId}).catch(()=>{});
    return true;
  }
  if(!sender.url?.startsWith(chrome.runtime.getURL('sidepanel.html')))throw new Error('Only the Design Lens interface can issue browser commands.');
  switch(message.action){
    case'target':return targetForWindow(message.windowId);
    case'command':return pageCommand(message.tabId,message.command,{direction:message.direction,options:message.options,selected:message.selected});
    case'screenshot':return screenshot(message.tabId,message.mode,message.documentId);
    case'close':{
      if(message.tabId)await chrome.tabs.sendMessage(message.tabId,{kind:'lens-command',command:'cancel'},{frameId:0}).catch(()=>{});
      if(chrome.sidePanel.close){await chrome.sidePanel.close({windowId:message.windowId});return{closed:true};}
      return{closed:false};
    }
    default:throw new Error('Unknown Design Lens request.');
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||!['lens-panel','lens-content'].includes(message?.kind))return false;
  handle(message,sender).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:String(error.message||error)}));return true;
});
