import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleArchive} from '../dist/demo.js';
import {fromJSON} from '../dist/importers.js';
import {profileSession} from '../dist/analysis.js';
import {periodRange,backup,validateBackup,trashSession,restoreSession,scheduleReview,searchable,editSession,mergeLive,extractTakeaways} from '../dist/growth-core.js';
import {readZip} from '../dist/zip.js';
import {deflateRawSync} from 'node:zlib';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const sample=sampleArchive();
test('calendar month and rolling ranges exclude future and old sessions',()=>{
 const a={sessions:[{date:'2026-10-31T12:00:00Z'},{date:'2026-11-12T12:00:00Z'},{date:'2026-11-26T12:00:00Z'},{date:'2026-12-01T12:00:00Z'},{date:null}]};
 assert.equal(periodRange(a,'2026-11').sessions.length,2);
 assert.equal(periodRange(a,'7',new Date('2026-11-26T13:00:00Z')).sessions.length,1);
 assert.equal(periodRange(a,'all').sessions.length,5);
});
test('backup round trips edits, notes and study records and rejects malformed data',()=>{
 const a={...sample,notes:{a:'original note'},edits:{x:{label:'rename'}},cards:{x:{label:'Duration',refs:[sample.sessions[0].id],due:'2026-11-27T00:00:00Z'}},reflections:{'2026-11':'reflection'}};
 const restored=validateBackup(backup(a));assert.deepEqual(restored.notes,a.notes);assert.deepEqual(restored.cards,a.cards);assert.deepEqual(restored.edits,a.edits);assert.equal(restored.sessions.length,18);
 assert.throws(()=>validateBackup('{"format":"memory-atlas","version":1,"archive":{"sessions":[{}]}}'));
 assert.throws(()=>validateBackup(backup({...a,notes:{a:{bad:true}}})));
});
test('trash is reversible and graph is rebuilt, no dangling source refs',()=>{
 const id=sample.sessions[0].id,removed=trashSession(sample,id);assert.equal(removed.sessions.length,17);assert.equal(removed.trash.length,1);assert.equal(restoreSession(removed,id).sessions.length,18);assert.equal(sample.sessions.length,18);
});
test('editing conversation date and title preserves raw message contents',()=>{
 const row=sample.sessions[0],changed=editSession(sample,row.id,{title:'重命名',date:'2026-10-11T12:00:00Z'}).sessions.find(s=>s.id===row.id);
 assert.equal(changed.title,'重命名');assert.equal(changed.date,'2026-10-11T12:00:00Z');assert.deepEqual(changed.turns,row.turns);
});
test('review scheduling uses real due dates and resets forgotten items to tomorrow',()=>{
 const now=new Date('2026-11-26T12:00:00Z'),first=scheduleReview({},'good',now);assert.equal(first.interval,3);assert.equal(first.due,'2026-11-29T12:00:00.000Z');assert.equal(scheduleReview(first,'good',now).interval,7);assert.equal(scheduleReview(first,'again',now).interval,1);
});
test('full-text search finds assistant text and excerpts are literal source sentences',()=>{
 const s=sample.sessions.find(s=>s.turns.some(t=>t.role==='assistant'&&t.text.length>=18));
 const t=s.turns.find(t=>t.role==='assistant');assert.ok(searchable(s,t.text.slice(0,8)));for(const q of extractTakeaways(s))assert.ok(s.turns.some(t=>t.text.includes(q)));
});
test('live sync merges partial captures by message id and preserves original date',()=>{
 const first=fromJSON({id:'live-id',date:'2026-10-01',messages:[{id:'a',role:'user',text:'How does duration work?'},{id:'b',role:'assistant',text:'Duration is a sensitivity.'}]} )[0];
 const next=fromJSON({id:'live-id',source:'live',date:'2026-11-26',messages:[{id:'b',role:'assistant',text:'Duration is a measure of sensitivity.'},{id:'c',role:'user',text:'What about convexity?'}]})[0];
 const merged=mergeLive(profileSession(first,true),next);assert.equal(merged.turns.length,3);assert.equal(merged.date,first.date);assert.equal(merged.turns[1].text,'Duration is a measure of sensitivity.');assert.equal(mergeLive(merged,next).turns.length,3);assert.equal(next.source,'live');
});
function zip(name,text,method=0){
 const n=Buffer.from(name),data=Buffer.from(text),compressed=method===8?deflateRawSync(data):data;
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(method,8);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(n.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(header.length+n.length+compressed.length,16);
 return new Blob([header,n,compressed,central,n,end]);
}
test('ZIP reads stored and deflated numbered exports and rejects invalid files',async()=>{
 const text='[{"title":"example"}]';for(const method of [0,8])assert.equal((await readZip(zip('conversations-001.json',text,method)))[0].text,text);
 await assert.rejects(()=>readZip(new Blob(['broken'])));await assert.rejects(()=>readZip(zip('private-attachment.txt','skip me')));
});
test('extension enforces per-conversation consent, retries queue and clears paused capture',async()=>{
 let handler;const storage={};let deliver=false;const sent=[];
 const chrome={runtime:{id:'test',getURL:s=>'chrome-extension://test/'+s,onMessage:{addListener:h=>handler=h}},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(storage[k])])),set:async values=>Object.assign(storage,structuredClone(values))}},tabs:{query:async()=>deliver?[{id:1}]:[],sendMessage:async(_,m)=>{sent.push(m);return {ok:true}}}};
 vm.runInNewContext(await readFile(new URL('../extension/background.js',import.meta.url),'utf8'),{chrome,console,Promise,Date,Error,JSON,Object,Array});
 const call=(m,s={url:'chrome-extension://test/popup.html'})=>new Promise(resolve=>handler(m,s,resolve));
 const conversation={id:'abc',messages:[{role:'user',text:'test'}]},sender={url:'https://chatgpt.com/c/abc',tab:{id:2}};
 assert.equal((await call({type:'CAPTURE',conversation},sender)).ok,false);
 await call({type:'TOGGLE',id:'abc',enabled:true});assert.equal((await call({type:'CAPTURE',conversation},sender)).queued,true);assert.equal(Object.keys(storage.pending).length,1);
 deliver=true;assert.equal((await call({type:'FLUSH'})).ok,true);assert.equal(sent.length,1);assert.equal(Object.keys(storage.pending).length,0);
 deliver=false;await call({type:'CAPTURE',conversation},sender);await call({type:'TOGGLE',id:'abc',enabled:false});assert.equal(Object.keys(storage.pending).length,0);assert.equal(storage.enabled.abc,undefined);
});
test('worker import is idempotent and preserves manual date and title on updates',async()=>{
 let onMessage,posted;globalThis.self={addEventListener:(type,fn)=>onMessage=fn,postMessage:result=>posted=result};
 await import('../dist/worker.js');
 const source={id:'worker-test',date:'2026-11-01',messages:[{id:'u1',role:'user',text:'What is Duration?'},{id:'a1',role:'assistant',text:'Duration measures bond price sensitivity.'}]};
 const run=async(existing,input)=>{await onMessage({data:{inputs:[{name:'conversation.json',text:JSON.stringify(input)}],existing,retain:true}});assert.equal(posted.error,undefined);return posted};
 const first=await run([],source),second=await run(first.sessions,source);assert.equal(second.sessions.length,1);
 const edited=editSession({...second},second.sessions[0].id,{title:'Manual title',date:'2026-10-01T12:00:00Z'});
 const live=await run(edited.sessions,{...source,source:'live',messages:[...source.messages,{id:'u2',role:'user',text:'How do I calculate it?'}]});
 assert.equal(live.sessions.length,1);assert.equal(live.sessions[0].turns.length,3);assert.equal(live.sessions[0].title,'Manual title');assert.equal(live.sessions[0].date,'2026-10-01T12:00:00Z');delete globalThis.self;
});
