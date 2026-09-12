const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Attachments,attachmentNote}=require('../src/attachments.cjs');const {ApiAdapter}=require('../src/adapters/api.cjs');const {WorkflowRunner}=require('../src/workflow.cjs');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'roundtable-attachments-'));const a=new Attachments({store:{read:()=>({items:{},scopes:{}})},root});fs.mkdirSync(path.join(root,'image'));fs.writeFileSync(path.join(root,'image','page.jpg'),Buffer.from([255,216,255,217]));a.registry.items.image={id:'image',attachmentId:'image',name:'scan.pdf',text:'snapshot',details:'selected page',warnings:[],source:'source.pdf',images:[{file:'page.jpg',mime:'image/jpeg',page:3}]};return a;}
test('only vision-enabled APIs and Codex receive image files; other members get an explicit limitation',()=>{
 const a=setup(),file=a.public(a.registry.items.image);const text=a.prepare({member:{kind:'api'},prompt:'question',attachments:[file]});assert.equal(text.images.length,0);assert.match(text.prompt,/没有收到图像/);
 const image=a.prepare({member:{kind:'api',vision:true},prompt:'question',attachments:[file]});assert.equal(image.images.length,1);
 const codex=a.prepare({member:{kind:'codex'},prompt:'question',attachments:[file]});assert.equal(codex.images.length,1);
 const manual=a.prepare({member:{kind:'web'},prompt:'question',attachments:[file]});assert.equal(manual.manualFiles.length,1);assert.match(manual.prompt,/原文件需用户在网页另行上传/);
 assert.match(attachmentNote({kind:'api'},[file]),/selected page/);
});
test('attachment text snapshots and visual limits are enforced',()=>{
 const a=setup(),file=a.public(a.registry.items.image);a.registry.items.image.text='changed later';assert.match(a.prepare({member:{kind:'codex'},prompt:'q',attachments:[file]}).prompt,/snapshot/);
 assert.throws(()=>a.prepare({member:{kind:'codex'},prompt:'q',attachments:Array(13).fill(file)}),/12/);
 assert.throws(()=>a.prepare({member:{kind:'api'},prompt:'x'.repeat(60000),attachments:[file]}),/60,000/);
 assert.throws(()=>a.preview('unknown',0));assert.throws(()=>a.scope('../../private'));
});
test('OpenAI and Anthropic image request formats contain actual bytes',async()=>{
 const a=setup(),img=a.prepare({member:{kind:'codex'},prompt:'q',attachments:[a.public(a.registry.items.image)]}).images[0];
 for(const format of ['openai','anthropic']){let request;const adapter=new ApiAdapter({getKey:()=>'',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify(format==='anthropic'?{content:[{type:'text',text:'ok'}]}:{choices:[{message:{content:'ok'}}]}),{headers:{'Content-Type':'application/json'}});}});
 await adapter.send({member:{id:'m',baseUrl:'http://localhost',model:'test',format,vision:true},prompt:'question',images:[img],signal:new AbortController().signal});const image=request.messages[0].content[1];if(format==='anthropic'){assert.equal(image.source.media_type,'image/jpeg');assert.equal(image.source.data,'/9j/2Q==');}else assert.equal(image.image_url.url,'data:image/jpeg;base64,/9j/2Q==');}
});
test('workflow passes attachment snapshots to every AI node and rejects resume after attachment changes',async()=>{
 const graph={id:'g',version:1,name:'test',roles:{},nodes:[{id:'i',type:'input',title:'input'},{id:'a',type:'ai',title:'a',binding:'a'},{id:'b',type:'ai',title:'b',binding:'b'},{id:'o',type:'output',title:'out'}],edges:[['i','a'],['i','b'],['a','o'],['b','o']]},members=[{id:'a',kind:'api'},{id:'b',kind:'api'}],received=[];
 const runner=new WorkflowRunner({send:async p=>{received.push(p.attachments);return{text:'ok'};},persist:()=>{},emit:()=>{},confirm:async()=>{}});const attachments=[{id:'x',text:'source'}];const r=await runner.run(graph,members,{task:'goal',attachments});assert.equal(received.length,2);assert.deepEqual(received[1],attachments);
 await assert.rejects(runner.run(graph,members,{task:'goal',attachments:[],previous:r,from:'a'}),/附件已变化/);assert.equal(runner.active,null);
});
