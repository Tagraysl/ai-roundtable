const {setTimeout:delay}=require('node:timers/promises');
function transient(error){return [408,429,500,502,503,504].includes(error.status)||/ERR_CONNECTION_(CLOSED|RESET)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ERR_NAME_NOT_RESOLVED|fetch failed|network error|连接提前结束/i.test(error.message+' '+(error.cause?.code||''));}
function httpError(response){const e=Error(`API 返回 HTTP ${response.status}。请检查地址、模型、额度和密钥。`);e.status=response.status;const value=response.headers.get('retry-after');e.retryAfter=value?(Number.isFinite(Number(value))?Number(value)*1000:Date.parse(value)-Date.now()):0;return e;}
async function recover(operation,{signal,onStatus=()=>{},canRetry=()=>true,delays=[1000,3000],sleep=delay}={}){
 for(let attempt=0;;attempt++){signal?.throwIfAborted();try{return await operation();}catch(e){if(signal?.aborted)throw signal.reason;if(e.recoveryHandled)throw e;const retryable=transient(e),allowed=canRetry();if(!retryable||!allowed||attempt>=delays.length){e.recoveryHandled=true;if(retryable&&!allowed)e.message+="。已保留部分回答，本次未自动重发，可手动重试";if(retryable){e.message+=(attempt?`（已重试 ${attempt} 次）`:'')+'。连接中断或服务暂不可用，请检查网络/代理及服务商状态后重试。';}throw e;}const ms=Math.max(delays[attempt],Math.min(30000,Math.max(0,e.retryAfter||0)));onStatus(`连接暂时失败，${Math.ceil(ms/1000)} 秒后重试（${attempt+1}/${delays.length}）…`);await sleep(ms,undefined,{signal});signal?.throwIfAborted();onStatus(`正在重新连接（${attempt+1}/${delays.length}）…`);}
 }
}
module.exports={recover,httpError,transient};

