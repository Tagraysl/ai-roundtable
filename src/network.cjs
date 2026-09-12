class NetworkTools {
 constructor({fetchImpl=fetch,getSearchKey=()=>'',getSearchConfig=()=>({provider:'tavily'})}){this.fetch=fetchImpl;this.getSearchKey=getSearchKey;this.getSearchConfig=getSearchConfig;}
 definitions(){const tool=(name,description,properties,required)=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});return [tool('weather','查询城市当前及未来七天天气。必须提供城市；不确定地点时向用户询问。',{city:{type:'string',description:'城市名称，可用英文拼音，如 Beijing；同名城市加省或国家'}},['city']),...((this.getSearchConfig().provider==='searxng'?this.getSearchConfig().url:this.getSearchKey())?[tool('web_search','搜索互联网资料，返回来源链接及摘要。',{query:{type:'string'}},['query'])]:[])];}
 async json(url,options,signal){const r=await this.fetch(url,{...options,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});if(!r.ok){await r.body?.cancel();throw Error('联网服务返回 HTTP '+r.status);}const reader=r.body.getReader();let text='',size=0;try{const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000){await reader.cancel();throw Error('联网结果过大。');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.releaseLock();}}
 async run(name,args,signal){
  if(name==='weather'){
   if(typeof args.city!=='string'||!args.city.trim()||args.city.length>100)throw Error('请提供明确城市名称。');
   const geo=await this.json('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:args.city,count:'3',language:'zh',format:'json'}),{},signal);
   if(!geo.results?.length)return {error:'未找到城市，请换用英文拼音或补充省份、国家。'};
   const locations=geo.results.map(x=>({name:x.name,country:x.country,region:x.admin1,latitude:x.latitude,longitude:x.longitude}));
   const p=locations[0];if(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))throw Error('天气坐标无效。');
   const url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:p.latitude,longitude:p.longitude,current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'auto',forecast_days:'7'});
   return {source:'Open-Meteo（天气模型估计与预报）',url,fetchedAt:new Date().toISOString(),location:p,otherMatches:locations.slice(1),note:'回答须说明所用地点；若同名地点有歧义，请向用户确认。',data:await this.json(url,{},signal)};
  }
  if(name==='web_search'){
   if(this.getSearchConfig().provider==='searxng'){
    if(typeof args.query!=='string'||!args.query.trim()||args.query.length>500)throw Error('搜索词无效。');
    const base=this.getSearchConfig().url;const url=new URL(base.replace(/\/$/,'')+'/search');url.search=new URLSearchParams({q:args.query,format:'json'}).toString();
    const data=await this.json(url.href,{},signal);
    if(!Array.isArray(data.results))throw Error('该 SearXNG 实例未返回 JSON 搜索结果，请检查是否启用 JSON API。');
    return {source:'SearXNG',fetchedAt:new Date().toISOString(),results:data.results.slice(0,5).map(x=>({title:String(x.title).slice(0,300),url:x.url,content:String(x.content||'').slice(0,1800)}))};
   }
   const key=this.getSearchKey();if(!key)throw Error('网页搜索尚未配置 Tavily 密钥。');
   if(typeof args.query!=='string'||!args.query.trim()||args.query.length>500)throw Error('搜索词无效。');
   const data=await this.json('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({query:args.query,max_results:5,include_answer:false})},signal);
   return {source:'Tavily',fetchedAt:new Date().toISOString(),results:(data.results||[]).slice(0,5).map(x=>({title:String(x.title).slice(0,300),url:x.url,content:String(x.content).slice(0,1800)}))};
  }
  throw Error('不支持的联网工具。');
 }
}
module.exports={NetworkTools};
