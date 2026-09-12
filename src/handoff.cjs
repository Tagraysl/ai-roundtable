const {buildPrompt}=require('./core.cjs');
const {roomContext}=require('./room-workflows.cjs');
function candidates(room,runs){const owned=new Set((room.materials||[]).map(a=>a.attachmentId));return [...new Map(runs.filter(r=>r.roomId===room.id).flatMap(r=>r.attachments||[]).filter(a=>a.attachmentId&&!owned.has(a.attachmentId)).map(a=>[a.attachmentId,a])).values()];}
function preview(room,member,runs){const source=room;room=require('./conversation-context.cjs').view(room);const text=room.workflowId?roomContext(room):buildPrompt(room,member||{name:'下一位 AI',role:''},'discussion',1).text;return {text,files:(room.materials||[]).filter(a=>a.attachmentId).map(a=>({id:a.attachmentId,name:a.name,details:a.details})),available:candidates(source,runs).map(a=>({id:a.attachmentId,name:a.name})),workspace:room.workflowWorkspace||'',complete:room.messages.filter(m=>m.status==='complete').length};}
module.exports={candidates,preview};
