import { cluster, profileSession } from './analysis.js';
import { hash } from './importers.js';
export const VERSION = 1;
export function periodRange(archive, period, now = new Date()) {
  const dated = archive.sessions.filter(s => s.date).sort((a,b)=>a.date.localeCompare(b.date));
  if (period === 'all') return {sessions:archive.sessions,start:dated.length?new Date(dated[0].date):null,end:dated.length?new Date(dated.at(-1).date):null};
  let start, end;
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y,m]=period.split('-').map(Number);
    start=new Date(y,m-1,1); end=new Date(y,m,0,23,59,59,999);
  } else {
    end=new Date(now);end.setHours(23,59,59,999);start=new Date(end);start.setDate(start.getDate()-(Number(period)-1));start.setHours(0,0,0,0);
  }
  return {sessions:dated.filter(s=>Date.parse(s.date)>=+start&&Date.parse(s.date)<=+end),start,end};
}
export function monthsFor(archive) {
  return [...new Set(archive.sessions.filter(s=>s.date).map(s=>{const d=new Date(s.date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}))].sort().reverse();
}
export function searchable(session, query) {
  const corpus=[session.title,...(session.turns??[]).map(t=>t.text),...(session.profile?.keywords??[]).map(k=>k[0])].join(' ').normalize('NFKC').toLocaleLowerCase();
  return query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).every(w=>corpus.includes(w));
}
export function extractTakeaways(session, limit=2) {
  const terms=session.profile?.keywords?.slice(0,18)??[];
  const sentences=(session.turns??[]).filter(t=>t.role==='assistant').flatMap((t,ti)=>t.text.split(/(?<=[。！？.!?])\s*|\n+/).map((text,i)=>({text:text.trim(),order:ti*10000+i}))).filter(s=>s.text.length>=18&&s.text.length<500);
  const seen=new Set();
  return sentences.filter(s=>{if(seen.has(s.text))return false;seen.add(s.text);return true}).map(s=>({...s,score:terms.reduce((a,[k,w])=>a+(s.text.toLowerCase().includes(k.toLowerCase())?Math.log(1+w):0),0)/Math.sqrt(s.text.length)})).sort((a,b)=>b.score-a.score).slice(0,limit).sort((a,b)=>a.order-b.order).map(s=>s.text);
}
export function rebuild(archive,sessions) {return {...archive,sessions:[...sessions].sort((a,b)=>(a.date??'').localeCompare(b.date??'')||a.id.localeCompare(b.id)),...cluster(sessions)}}
export function editSession(archive,id,{title,date}) {
  if(!title.trim())throw new Error('请填写对话标题。');
  if(date && !Number.isFinite(Date.parse(date)))throw new Error('日期格式不正确。');
  return rebuild(archive,archive.sessions.map(s=>{if(s.id!==id)return s;const overrides={title:title.trim(),date:date||null};return {...(s.turns?profileSession({...s,...overrides},true):{...s,...overrides}),overrides}}));
}
export function trashSession(archive,id) {
  const row=archive.sessions.find(s=>s.id===id);if(!row)return archive;
  return rebuild({...archive,trash:[...(archive.trash??[]),{...row,deletedAt:new Date().toISOString()}]},archive.sessions.filter(s=>s.id!==id));
}
export function restoreSession(archive,id) {
  const row=archive.trash?.find(s=>s.id===id);if(!row)return archive;
  const {deletedAt,...session}=row;
  return rebuild({...archive,trash:archive.trash.filter(s=>s.id!==id)},[...archive.sessions.filter(s=>s.id!==id),session]);
}
export function scheduleReview(previous={},rating,now=new Date()) {
  const reps=(previous.reps??0)+(rating==='again'?0:1);
  const interval=rating==='again'?1:rating==='hard'?Math.max(1,Math.round((previous.interval??1)*1.2)):previous.reps?Math.min(180,Math.max(3,Math.round((previous.interval??1)*2.4))):3;
  const due=new Date(now);due.setDate(due.getDate()+interval);
  return {...previous,reps,interval,due:due.toISOString(),lastReviewed:now.toISOString(),rating};
}
export function backup(archive) {return JSON.stringify({format:'memory-atlas',version:VERSION,exportedAt:new Date().toISOString(),archive},null,2)}
export function validateBackup(text) {
  let file;try{file=JSON.parse(text)}catch{throw new Error('备份不是有效的 JSON 文件。')}
  if(file.format!=='memory-atlas'||file.version!==VERSION||!file.archive||!Array.isArray(file.archive.sessions))throw new Error('请选择 Memory Atlas 导出的 v1 备份。');
  const a=file.archive;const seen=new Set();
  for(const s of [...a.sessions,...(a.trash??[])]) {
    if(!s||typeof s.id!=='string'||!s.id||typeof s.title!=='string'||typeof s.fingerprint!=='string'||(s.date!==null&&!Number.isFinite(Date.parse(s.date)))||!s.profile)throw new Error('备份中的对话数据不完整。');
    for(const k of ['keywords','entities','questions','loops','closed','signals'])if(!Array.isArray(s.profile[k]))throw new Error('备份的知识索引不完整。');
    for(const [term,weight] of s.profile.keywords)if(typeof term!=='string'||!Number.isFinite(weight))throw new Error('备份的关键词格式不正确。');
    for(const k of ['entities','questions','loops','closed'])for(const n of s.profile[k])if(typeof n.label!=='string')throw new Error('备份的节点格式不正确。');
    if(s.turns && (!Array.isArray(s.turns)||s.turns.some(t=>!['user','assistant'].includes(t.role)||typeof t.text!=='string')))throw new Error('备份的原文格式不正确。');
  }
  for(const s of a.sessions){if(seen.has(s.id))throw new Error('备份存在重复会话编号。');seen.add(s.id)}
  for(const k of ['edits','notes','cards','reflections'])if(a[k]&& (Array.isArray(a[k])||typeof a[k]!=='object'))throw new Error('备份的编辑数据格式不正确。');
  for(const n of Object.values(a.notes??{}))if(typeof n!=='string')throw new Error('备份笔记格式不正确。');
  for(const n of Object.values(a.reflections??{}))if(typeof n!=='string')throw new Error('备份复盘格式不正确。');
  for(const n of Object.values(a.cards??{}))if(!n||typeof n.label!=='string'||!Array.isArray(n.refs)||n.refs.some(x=>typeof x!=='string')||!Number.isFinite(Date.parse(n.due)))throw new Error('备份复习卡格式不正确。');
  return rebuild({...a,revision:undefined},a.sessions);
}
export function mergeLive(existing,row) {
  if(!existing?.turns)return row;
  const turns=existing.turns.map(t=>({...t}));
  for(const t of row.turns){const i=turns.findIndex(p=>t.id&&p.id===t.id||p.role===t.role&&p.text===t.text);if(i>=0)turns[i]={...turns[i],...t};else turns.push(t)}
  return {...row,date:existing.date??row.date,turns,fingerprint:hash(turns.map(t=>t.role+'\n'+t.text).join('\n'))};
}
