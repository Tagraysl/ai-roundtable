async function readSSE(response, onEvent) {
  const reader=response.body.getReader(), decoder=new TextDecoder(); let buf='';
  try {
    while(true) {
      const {done,value}=await reader.read();
      buf += done ? decoder.decode() : decoder.decode(value,{stream:true});
      let i;
      while((i=buf.indexOf('\n'))>=0) { const line=buf.slice(0,i).replace(/\r$/,''); buf=buf.slice(i+1); if(line.startsWith('data:') && onEvent(line.slice(5).trim())===false) return; }
      if(done) { if(buf.startsWith('data:')) onEvent(buf.slice(5).trim()); break; }
    }
  } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
}
module.exports={readSSE};
