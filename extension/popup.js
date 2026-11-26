let id,active=false;
async function update(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  id=tab?.url?.startsWith('https://chatgpt.com/')?tab.url.match(/\/c\/([a-zA-Z0-9-]+)/)?.[1]:null;
  const state=await chrome.runtime.sendMessage({type:'STATUS'});active=!!state.enabled?.[id];
  const toggle=document.querySelector('#toggle');toggle.disabled=!id;toggle.textContent=id?(active?'暂停当前对话并清除待传':'开启当前对话'):'请打开一段 ChatGPT 对话';
  const {captureStatus}=await chrome.storage.local.get('captureStatus');
  document.querySelector('#status').textContent=state.count?state.count+' 段对话等待同步':state.synced?.[id]?'已同步：'+new Date(state.synced[id]).toLocaleTimeString():active?'采集中，回答完成后自动同步':'采集未开启';
  if(captureStatus?.id===id&&active)document.querySelector('#status').textContent+=' · '+captureStatus.text;
}
document.querySelector('#toggle').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'TOGGLE',id,enabled:!active});if(r.ok)await update();else document.querySelector('#status').textContent=r.error};
document.querySelector('#flush').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'FLUSH'});await update();if(!r.ok)document.querySelector('#status').textContent=r.error};
update().catch(e=>document.querySelector('#status').textContent=e.message);
