(()=>{
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||message.type!=='DELIVER')return;
    const requestId=crypto.randomUUID();
    const listener=e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='ATLAS_CAPTURE_RESULT'||e.data.requestId!==requestId)return;clearTimeout(timer);window.removeEventListener('message',listener);respond({ok:e.data.ok,error:e.data.error})};
    const timer=setTimeout(()=>{window.removeEventListener('message',listener);respond({ok:false,error:'接收超时，请确认已打开图谱并允许接收'})},45000);
    window.addEventListener('message',listener);window.postMessage({type:'ATLAS_CAPTURE',requestId,conversation:message.conversation},location.origin);return true;
  });
  function flush(){chrome.runtime.sendMessage({type:'FLUSH'}).catch(()=>{})}
  setInterval(flush,12000);setTimeout(flush,2000);
})();
