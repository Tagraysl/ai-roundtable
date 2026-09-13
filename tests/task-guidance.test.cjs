const test=require('node:test'),assert=require('node:assert/strict'),{WorkflowRunner}=require('../src/workflow.cjs');
test('a question without attachments reaches the first reviewer and later reviewers receive the actual answer',async()=>{
 const graph={id:'question',version:1,name:'question',roles:{},nodes:[{id:'i',type:'input',title:'Task'},{id:'a',type:'ai',title:'Review',instruction:'检查提供的资料',binding:'a'},{id:'b',type:'ai',title:'Check answer',binding:'b'},{id:'o',type:'output',title:'Output'}],edges:[['i','a'],['a','b'],['b','o']]};const prompts=[];
 const runner=new WorkflowRunner({send:async p=>{prompts.push(p.prompt);return {text:'Need a defined year and salary scope'};},confirm:async()=>{},persist:()=>{},emit:()=>{}});
 await runner.run(graph,[{id:'a',name:'A',kind:'api'},{id:'b',name:'B',kind:'api'}],{task:'What is the average salary for engineering graduates?',materials:''});
 assert.match(prompts[0],/What is the average salary/);assert.match(prompts[0],/缺少附件不等于没有任务/);assert.match(prompts[0],/当前直接上游没有 AI/);assert.match(prompts[0],/禁止编造数据/);assert.match(prompts[1],/Need a defined year/);assert.match(prompts[1],/逐项评估已有内容/);assert.match(prompts[1],/结论、依据与来源、可靠性、未解决事项/);assert.doesNotMatch(prompts[0],/你是最终输出前的交付节点/);
});
