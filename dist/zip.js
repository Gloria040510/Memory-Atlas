// Read only text conversation entries; never materialize attachments or file paths.
const MAX=80*1024*1024;
export async function readZip(file) {
  if(file.size>512*1024*1024)throw new Error('ZIP 超过 512 MB，请先解压，再导入 conversations JSON 文件。');
  const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer),dec=new TextDecoder();
  let e=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){e=p;break}
  if(e<0)throw new Error('无法识别 ZIP，请先解压后导入。');
  let p=v.getUint32(e+16,true), entries=[],total=0;
  const count=v.getUint16(e+10,true);
  for(let i=0;i<count;i++){
    if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 目录损坏。');
    const nameLength=v.getUint16(p+28,true),name=dec.decode(bytes.subarray(p+46,p+46+nameLength));
    if(/(?:^|\/)conversations(?:[-_]?\d+)?\.json$/i.test(name)||/(?:^|\/)chat\.html$/i.test(name))entries.push({name,flags:v.getUint16(p+8,true),method:v.getUint16(p+10,true),size:v.getUint32(p+24,true),compressed:v.getUint32(p+20,true),offset:v.getUint32(p+42,true)});
    p+=46+nameLength+v.getUint16(p+30,true)+v.getUint16(p+32,true);
  }
  if(entries.some(e=>/\.json$/i.test(e.name)))entries=entries.filter(e=>/\.json$/i.test(e.name));
  if(!entries.length)throw new Error('ZIP 中没有找到 conversations.json 或 chat.html。');
  const result=[];
  for(const e of entries){
    if(e.flags&1)throw new Error('不支持加密 ZIP，请先解压。');
    total+=e.size;if(total>MAX)throw new Error('对话文字超过 80 MB，请分批导入解压后的 JSON。');
    const o=e.offset;if(o+30>bytes.length||v.getUint32(o,true)!==0x04034b50)throw new Error('ZIP 文件损坏。');
    const start=o+30+v.getUint16(o+26,true)+v.getUint16(o+28,true);
    if(start+e.compressed>bytes.length)throw new Error('ZIP 文件不完整。');
    const blob=new Blob([bytes.subarray(start,start+e.compressed)]);
    let stream=blob.stream();
    if(e.method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));else if(e.method!==0)throw new Error('ZIP 压缩格式不受支持，请先解压。');
    const reader=stream.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>e.size||size>MAX){await reader.cancel();throw new Error('ZIP 解压大小超出限制。')}chunks.push(value)}
    if(size!==e.size)throw new Error('ZIP 数据大小校验失败。');
    result.push({name:e.name,text:await new Blob(chunks).text()});
  }
  return result;
}
