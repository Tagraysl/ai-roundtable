const test=require('node:test'),assert=require('node:assert/strict');
const {TerminalAdapter}=require('../src/adapters/terminal.cjs');
test('local executor runs in approved workspace and refuses missing opt-in',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'roundtable-exec-'));try{const a=new TerminalAdapter({cwd:process.cwd(),timeout:5000}),member={executable:process.execPath,args:['-e',"process.stdin.resume();process.stdin.on('end',()=>{require('fs').writeFileSync('result.txt','done');process.stdout.write(process.cwd());});"],executionCapable:true};const r=await a.send({member,prompt:'test',execute:true,workspace:cwd,signal:new AbortController().signal});assert.equal(r.text,cwd);assert.equal(fs.readFileSync(path.join(cwd,'result.txt'),'utf8'),'done');await assert.rejects(()=>a.send({member:{...member,executionCapable:false},prompt:'test',execute:true,workspace:cwd,signal:new AbortController().signal}),/启用执行/);}finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
test('terminal accepts stdin and reads stdout without shell interpolation',async()=>{
  const a=new TerminalAdapter({cwd:process.cwd(),timeout:5000});
  const r=await a.send({member:{executable:process.execPath,args:['-e',"let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write('answer: '+s));"]},prompt:'你好 $() & |',signal:new AbortController().signal});
  assert.equal(r.text,'answer: 你好 $() & |\n');
});
