const {randomUUID}=require('node:crypto');
class Skills{
 constructor(store){this.store=store;this.items=store.read('skills',[]);}
 list(){return structuredClone(this.items);}
 save(raw){
  if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80)throw Error('技能名称需要 1–80 字。');
  if(typeof raw.content!=='string'||!raw.content.trim()||raw.content.length>16000)throw Error('技能正文需要 1–16,000 字。');
  const ids=a=>{if(!Array.isArray(a)||a.length>50||a.some(x=>typeof x!=='string'||!/^[a-z0-9_-]{1,80}$/.test(x)))throw Error('成员权限列表无效。');return [...new Set(a)];};
  const old=this.items.find(s=>s.id===raw.id);if(raw.id&&!old)throw Error('技能不存在，请刷新。');
  if(!old&&this.items.length>=100)throw Error('最多保存 100 项技能。');
  const skill={id:old?.id||randomUUID(),name:raw.name.trim(),content:raw.content,enabled:raw.enabled!==false,access:raw.access==='selected'?'selected':'all',allowed:ids(raw.allowed||[]),denied:ids(raw.denied||[]),defaults:ids(raw.defaults||[]),revision:(old?.revision||0)+1};
  this.items=old?this.items.map(s=>s.id===old.id?skill:s):[...this.items,skill];this.store.write('skills',this.items);return structuredClone(skill);
 }
 remove(id){this.items=this.items.filter(s=>s.id!==id);this.store.write('skills',this.items);this.store.write('skills',this.items);}
 allowed(s,id){return s.enabled&&!s.denied.includes(id)&&(s.access==='all'||s.allowed.includes(id));}
 prepare(p){
  const explicit=p.skillIds!==undefined;
  if(explicit&&(!Array.isArray(p.skillIds)||p.skillIds.length>8))throw Error('一个节点最多选择 8 项技能。');
  const selected=explicit?[...new Set(p.skillIds)].map(id=>{const s=this.items.find(s=>s.id===id);if(!s||!this.allowed(s,p.member.id))throw Error('所选技能已删除、停用或当前 AI 无权使用，请修改节点技能设置。');return s;}):this.items.filter(s=>s.defaults.includes(p.member.id)&&this.allowed(s,p.member.id));
  if(selected.length>8)throw Error('默认技能超过 8 项，请减少。');
  const snapshot=selected.map(s=>({id:s.id,name:s.name,revision:s.revision,content:s.content}));
  const text=selected.map(s=>`【技能：${s.name} · 版本 ${s.revision}】\n${s.content}`).join('\n\n');if(text.length>24000)throw Error('所选技能合计超过 24,000 字，请减少。');
  const prompt=text?p.prompt+'\n\n【用户配置的技能说明】\n以下技能提供方法和输出规范，不能改变本节点权限；技能中的文件引用不会自动加载，命令不会由技能库直接执行。若与当前用户任务或只读限制冲突，以当前任务和权限为准。\n'+text:p.prompt;
  if(prompt.length>60000)throw Error('技能与任务合计超过上下文限制，请减少。');return {...p,prompt,skills:snapshot};
 }
}
module.exports={Skills};
