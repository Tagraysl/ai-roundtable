import {getDocument,GlobalWorkerOptions} from '../../third-party/pdfjs/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('../../third-party/pdfjs/pdf.worker.mjs',import.meta.url).href;
const MAX_TEXT=20000,MAX_XML=16000000;
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('不支持包含自定义实体的 XML。');const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('文件中的 XML 已损坏。');return d;}
const all=(d,n)=>Array.from(d.getElementsByTagNameNS('*',n));
const words=d=>all(d,'t').map(n=>n.textContent).join('');
function pageNumbers(spec,total){const nums=new Set();for(const part of String(spec||'1-5').split(/[,，]/)){if(!/^\s*\d+(\s*-\s*\d+)?\s*$/.test(part))throw Error('PDF 页码请填写 1-5 或 1,3,6-8。');const [a,b=a]=part.split('-').map(Number);if(a<1||b<a||b-a>11)throw Error('单次最多选择 12 页 PDF。');for(let i=a;i<=b;i++)if(i<=total)nums.add(i);}if(!nums.size||nums.size>12)throw Error('PDF 页码无效或超过 12 页。');return [...nums].sort((a,b)=>a-b);}
async function visual(blob){const bitmap=await createImageBitmap(blob);if(bitmap.width*bitmap.height>50000000){bitmap.close();throw Error('图片像素过大，请缩小到 5000 万像素以内。');}const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return {data:canvas.toDataURL('image/jpeg',.88),width:canvas.width,height:canvas.height};}
async function parse({bytes,name,pages}){
 const ext=name.split('.').pop().toLowerCase(),buffer=new Uint8Array(bytes),warnings=[],images=[];let text='',details='';
 if(['png','jpg','jpeg','webp','bmp','gif'].includes(ext)){images.push(await visual(new Blob([buffer])));details='图像副本 · 最长边 1600 像素';if(ext==='gif')warnings.push('GIF 仅导入一帧，不分析动画。');}
 else if(ext==='pdf'){
  const base=new URL('../../third-party/pdfjs/',import.meta.url).href;
  const task=getDocument({data:buffer,isEvalSupported:false,enableXfa:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useSystemFonts:true});
  let doc;try{doc=await task.promise;const selected=pageNumbers(pages,doc.numPages);details=`PDF 共 ${doc.numPages} 页；本次仅选 ${selected.join(',')} 页`;
   for(const number of selected){const page=await doc.getPage(number),content=await page.getTextContent();const value=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('');text+=`\n[第 ${number} 页]\n${value}`;if(!value.trim())warnings.push(`第 ${number} 页无文字层（扫描页或空白页）；本机未进行 OCR。`);const v=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.6,1400/Math.max(v.width,v.height))}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;images.push({data:canvas.toDataURL('image/jpeg',.85),page:number,width:canvas.width,height:canvas.height});page.cleanup();}
  }catch(e){if(e.name==='PasswordException')throw Error('PDF 有密码，请先解密后上传。');throw e;}finally{await task.destroy();}
  warnings.push('只发送所选页；提取文字不保留完整布局、图表语义或公式排版。');
 }
 else if(['docx','xlsx','pptx'].includes(ext)){
  const zip=await JSZip.loadAsync(buffer);const read=async key=>{const entry=zip.file(key);if(!entry)return '';if(entry._data?.uncompressedSize>MAX_XML)throw Error('文档内单个内容块过大。');const value=await entry.async('string');if(value.length>MAX_XML)throw Error('解压后的文档内容过大。');return value;};
  if(ext==='docx'){const source=await read('word/document.xml');if(!source)throw Error('不是有效的 Word DOCX。');text=all(xml(source),'p').map(p=>words(p)).join('\n');details='Word 正文与表格文字';warnings.push('不含嵌入图片、批注、页眉页脚及公式的完整语义。');}
  if(ext==='pptx'){const names=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));if(!names.length)throw Error('不是有效的 PowerPoint PPTX。');for(const [i,key]of names.slice(0,100).entries()){text+=`\n[幻灯片 ${i+1}]\n`+all(xml(await read(key)),'p').map(p=>words(p)).join('\n');if(text.length>MAX_TEXT)break;}details=`PPT 共 ${names.length} 张幻灯片 · 文字提取`;warnings.push('不含图片、动画和备注；提取长度上限 20,000 字符。');}
  if(ext==='xlsx'){
   const wb=await read('xl/workbook.xml');if(!wb)throw Error('不是有效的 Excel XLSX。');const sharedSource=await read('xl/sharedStrings.xml'),shared=sharedSource?all(xml(sharedSource),'si').map(words):[];
   const relSource=await read('xl/_rels/workbook.xml.rels'),rels=relSource?all(xml(relSource),'Relationship'):[];
   const sheets=all(xml(wb),'sheet');for(const sheet of sheets.slice(0,30)){const rid=sheet.getAttribute('r:id'),rel=rels.find(r=>r.getAttribute('Id')===rid);if(!rel||rel.getAttribute('TargetMode')==='External')continue;const target=rel.getAttribute('Target');const key=new URL(target,'https://local/xl/workbook.xml').pathname.slice(1);const source=await read(key);if(!source)continue;text+=`\n[工作表 ${sheet.getAttribute('name')}]\n`;for(const row of all(xml(source),'row')){text+=all(row,'c').map(c=>{const v=all(c,'v')[0]?.textContent||'',t=c.getAttribute('t'),f=all(c,'f')[0]?.textContent;const value=t==='s'?shared[Number(v)]||'':t==='inlineStr'?words(c):v;return `${c.getAttribute('r')}: ${f?'公式='+f+'；缓存值=':''}${value}`;}).join(' | ')+'\n';if(text.length>MAX_TEXT)break;}if(text.length>MAX_TEXT)break;}details=`Excel 共 ${sheets.length} 个工作表 · 单元格文字/缓存值`;warnings.push('不重新计算公式，缓存值可能过期；日期可能显示为序列号，不含图表和图片。');
  }
 }
 else {text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);details='UTF-8 文本';if(text.includes('\0'))throw Error('文件不是可读文本。');}
 if(text.length>MAX_TEXT){warnings.push(`内容共至少 ${text.length} 字符，仅保留前 ${MAX_TEXT} 字符。请在预览中核对节选。`);text=text.slice(0,MAX_TEXT);}
 return {text,details,warnings,images};
}
window.fileParser.receive(async data=>{try{window.fileParser.finish({ok:true,result:await parse(data)});}catch(e){window.fileParser.finish({ok:false,error:e.message||String(e)});}});
