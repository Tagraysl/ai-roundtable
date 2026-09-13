const presets=require('./ui/provider-catalog.json');
const signature=m=>JSON.stringify([m.kind,m.baseUrl||'',m.format||'',m.executable||'']);
function company(m){if(m.kind==='codex')return 'OpenAI · Codex';if(m.kind==='api'){const p=Object.values(presets).find(p=>{try{return new URL(p.base).hostname===new URL(m.baseUrl).hostname;}catch{return false;}});if(p)return p.name.replace(/官方 API|（国内）/g,'').trim();}return m.name;}
function modelCatalog(store,getMembers){let data=store.read('model-catalog',{});return {
 list(){return getMembers().filter(m=>m.kind!=='terminal'&&!(m.kind==='web'&&m.webMode==='automation')).map(m=>({memberId:m.id,apiParent:m.apiParent,baseUrl:m.baseUrl||'',format:m.format||'',name:m.name,company:company(m),kind:m.kind,models:m.kind==='web'?[]:[...new Set([m.model,...(data[m.id]?.signature===signature(m)?data[m.id].models:[])].filter(Boolean))]}));},
 save(id,models){const m=getMembers().find(m=>m.id===id);if(!m||!['api','codex'].includes(m.kind))throw Error('请选择 API 或已支持的本地智能体。');if(!Array.isArray(models)||models.length>500||models.some(x=>typeof x!=='string'||!x.trim()||x.length>200||/[\r\n\x00]/.test(x)))throw Error('模型列表无效：最多500项，每项最多200字符。');data={...data,[id]:{signature:signature(m),models:[...new Set(models.map(x=>x.trim()))]}};store.write('model-catalog',data);return this.list();}
};}module.exports={modelCatalog};
