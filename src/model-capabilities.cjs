// Exact endpoint/model matches only. A provider name alone proves no capability.
function capability(member){let host;try{host=new URL(member.baseUrl).hostname;}catch{return {status:'unknown'};}
 if(host==='api.deepseek.com'&&['deepseek-flash','deepseek-v4-flash-vision-exp'].includes(member.model)&&['openai','anthropic'].includes(member.format))return {status:'supported',source:'https://api-docs.deepseek.com/guides/vision/',checked:'2026-09-13'};
 return {status:'unknown'};
}
module.exports={capability};
