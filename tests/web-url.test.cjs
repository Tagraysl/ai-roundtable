const {test}=require('node:test'),assert=require('node:assert/strict'),{validateMember}=require('../src/core.cjs');
test('web URL preserves copied parameters and hash routes; API URL remains a base',()=>{
 const web={id:'web',name:'Web',kind:'web',webMode:'manual',url:'https://chatglm.cn/main/alltoolsdetail?t=1789110447563&lang=zh#chat'};
 assert.equal(validateMember(web).url,web.url);
 assert.throws(()=>validateMember({...web,url:'https://user:password@example.com/chat'}));
 assert.throws(()=>validateMember({...web,url:'javascript:alert(1)'}));
 assert.throws(()=>validateMember({...web,kind:'api',baseUrl:web.url,model:'m',format:'openai'}));
 assert.throws(()=>validateMember({...web,webMode:'automation'}),/允许/);
});
