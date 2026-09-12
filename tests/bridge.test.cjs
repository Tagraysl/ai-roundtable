const test=require('node:test'),assert=require('node:assert/strict');
const {BrowserBridge}=require('../src/bridge.cjs');
test('bridge authenticates, leases exactly once, rejects another tab and cancels',async()=>{
  const b=new BrowserBridge();await b.start();
  const post=(url,body,token=b.token,origin='chrome-extension://test')=>fetch(`http://127.0.0.1:${b.port}${url}`,{method:'POST',headers:{'Content-Type':'application/json','X-Roundtable-Token':token,Origin:origin},body:JSON.stringify(body)});
  try{
    assert.equal((await post('/ping',{},'wrong')).status,401);assert.equal((await post('/ping',{},b.token,'https://evil.example')).status,403);
    const client={clientId:'1',memberId:'claude',url:'https://claude.ai/new'};
    await post('/poll',client);const ac=new AbortController();const promise=b.send({member:{id:'claude',url:'https://claude.ai/new',selectors:{}},prompt:'secret prompt',signal:ac.signal});
    const job=(await (await post('/poll',client)).json()).job;assert.equal(job.prompt,'secret prompt');assert.equal((await (await post('/poll',client)).json()).job,null);
    assert.equal((await post('/result',{id:job.id,clientId:'2',status:'complete',text:'wrong'})).status,409);
    await post('/result',{id:job.id,clientId:'1',status:'complete',text:'correct'});assert.equal((await promise).text,'correct');
    const pending=b.send({member:{id:'claude',url:'https://claude.ai/new'},prompt:'again',signal:ac.signal});ac.abort();await assert.rejects(pending);assert.equal(b.job,null);
  }finally{b.close();}
});
