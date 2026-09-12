const {randomUUID}=require('node:crypto');
function quickTasks(store){let items=store.read('quick-tasks',null);if(!Array.isArray(items)){items=[{id:randomUUID(),name:'讨论一个方案',content:'请讨论这个方案的优缺点，分别提出独立意见，再回应其他成员的观点。'},{id:randomUUID(),name:'一起审阅论文',content:'请审阅我添加的论文资料，检查论证、证据和表达。明确区分已有结果与待验证假设。'}];store.write('quick-tasks',items);}return {
 list:()=>structuredClone(items),
 save(raw){if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>60||typeof raw.content!=='string'||!raw.content.trim()||raw.content.length>8000)throw Error('请填写任务名称（最多60字）与内容（最多8000字）。');const old=items.find(t=>t.id===raw.id);if(raw.id&&!old)throw Error('任务已删除，请重新选择。');if(!old&&items.length>=100)throw Error('最多保存100个常用任务。');const next={id:old?.id||randomUUID(),name:raw.name.trim(),content:raw.content};const updated=old?items.map(t=>t.id===old.id?next:t):[...items,next];store.write('quick-tasks',updated);items=updated;return next;},
 remove(id){if(!items.some(t=>t.id===id))throw Error('任务不存在。');const next=items.filter(t=>t.id!==id);store.write('quick-tasks',next);items=next;store.write('quick-tasks',next);}
};}module.exports={quickTasks};
