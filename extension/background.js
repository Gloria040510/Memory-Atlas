const SITE='https://memory-atlas-journal.sweet-pony-8082.chatgpt.site';
let chain=Promise.resolve();
function serial(fn){const result=chain.then(fn);chain=result.catch(()=>{});return result}
async function flush(){
  const tabs=await chrome.tabs.query({url:SITE+'/*'});if(!tabs.length)return {ok:false,error:'已暂存；请打开 Memory Atlas 并允许接收'};
  const state=await chrome.storage.local.get(['pending','synced']),pending=state.pending??{},synced=state.synced??{};
  for(const [id,conversation]of Object.entries(pending)){
    let delivered=false,error='图谱页面暂未准备好';
    for(const tab of tabs){try{const r=await chrome.tabs.sendMessage(tab.id,{type:'DELIVER',conversation});if(r?.ok){delivered=true;break}error=r?.error??error}catch{}}
    if(!delivered)return {ok:false,error};
    delete pending[id];synced[id]=new Date().toISOString();await chrome.storage.local.set({pending,synced});
  }
  return {ok:true};
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  serial(async()=>{
    const isPopup=sender.url===chrome.runtime.getURL('popup.html');
    if(message.type==='STATUS'&&isPopup){const data=await chrome.storage.local.get(['enabled','pending','synced']);return {ok:true,enabled:data.enabled??{},count:Object.keys(data.pending??{}).length,synced:data.synced??{}}}
    if(message.type==='TOGGLE'&&isPopup){
      if(typeof message.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(message.id))throw new Error('请先打开一段已经保存的 ChatGPT 对话');
      const data=await chrome.storage.local.get(['enabled','pending']);const enabled=data.enabled??{},pending=data.pending??{};
      if(message.enabled)enabled[message.id]=true;else{delete enabled[message.id];delete pending[message.id]}
      await chrome.storage.local.set({enabled,pending});return {ok:true};
    }
    if(message.type==='FLUSH'&&(isPopup||sender.url?.startsWith(SITE+'/')))return await flush();
    if(message.type==='CAPTURE'&&sender.tab&&sender.url?.startsWith('https://chatgpt.com/')){
      const c=message.conversation,id=sender.url.match(/\/c\/([a-zA-Z0-9-]+)/)?.[1];
      if(!id||c?.id!==id||!Array.isArray(c.messages)||!c.messages.length||c.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.text!=='string')||JSON.stringify(c).length>2e6)throw new Error('对话内容不完整或超过 2 MB，请使用文件导入');
      const data=await chrome.storage.local.get(['enabled','pending']);if(!data.enabled?.[id])throw new Error('未开启这段对话的采集');
      const pending=data.pending??{};if(!pending[id]&&Object.keys(pending).length>=20)throw new Error('已有 20 段待传对话，请先打开图谱同步');
      pending[id]=c;if(JSON.stringify(pending).length>4e6)throw new Error('待传内容超过 4 MB，请先打开图谱同步');
      await chrome.storage.local.set({pending});const result=await flush();return {ok:true,queued:!result.ok,status:result.error};
    }
    return {ok:false,error:'不支持的操作'};
  }).then(respond,e=>respond({ok:false,error:e.message}));return true;
});
