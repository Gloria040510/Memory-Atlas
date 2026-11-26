(()=>{
  let last='',running=false,enabled={},timer;
  chrome.storage.local.get('enabled').then(s=>enabled=s.enabled??{});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.enabled){enabled=changes.enabled.newValue??{};last='';schedule()}});
  function schedule(){clearTimeout(timer);timer=setTimeout(capture,2200)}
  async function capture(){
    const id=location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/)?.[1];
    if(!id||!enabled[id]||running||document.querySelector('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="停止生成"]'))return;
    const nodes=[...document.querySelectorAll('[data-message-author-role]')];
    const messages=nodes.map((node,index)=>({id:node.dataset.messageId??node.closest('[data-message-id]')?.dataset.messageId??'visible-'+index,role:node.dataset.messageAuthorRole,text:(node.querySelector('.markdown')??node).innerText?.trim()??''})).filter(m=>['user','assistant'].includes(m.role)&&m.text);
    if(!messages.length)return;
    const signature=id+JSON.stringify(messages);if(signature===last)return;
    running=true;
    try{
      const firstSeenKey='firstSeen-'+id,saved=await chrome.storage.local.get(firstSeenKey);const date=saved[firstSeenKey]??new Date().toISOString();
      if(!saved[firstSeenKey])await chrome.storage.local.set({[firstSeenKey]:date});
      const conversation={id,title:document.title.replace(/\s*[-–|]\s*ChatGPT$/,'')||messages[0].text.slice(0,54),date,messages,source:'live'};
      const response=await chrome.runtime.sendMessage({type:'CAPTURE',conversation});
      if(response?.ok)last=signature;
      await chrome.storage.local.set({captureStatus:{time:new Date().toISOString(),id,text:response?.ok?(response.queued?'已暂存，等待图谱接收':'已同步'):response?.error??'采集失败'}});
    }catch{}finally{running=false}
  }
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  setInterval(capture,7000);schedule();
})();
