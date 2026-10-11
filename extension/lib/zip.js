/** Small STORE-only ZIP writer. UTF-8 filenames; no external dependencies. */
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
export function zipFiles(files){
  const enc=new TextEncoder(),chunks=[],directory=[];let offset=0,total=0;
  if(!files.length||files.length>64)throw new Error('ZIP needs between 1 and 64 files.');
  for(const {name,data}of files){
    if(!/^[\w.-]+$/.test(name)||name==='.'||name==='..')throw new Error('Unsafe ZIP filename.');
    const filename=enc.encode(name),bytes=typeof data==='string'?enc.encode(data):data;
    if(!(bytes instanceof Uint8Array))throw new Error('Invalid ZIP file bytes.');
    total+=bytes.length;if(total>16_000_000)throw new Error('Export exceeds 16 MB. Export a smaller capture.');
    const crc=crc32(bytes),header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);
    const center=new Uint8Array(46+filename.length),c=new DataView(center.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);center.set(filename,46);
    chunks.push(header,bytes);directory.push(center);offset+=header.length+bytes.length;
  }
  const size=directory.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end],{type:'application/zip'});
}
