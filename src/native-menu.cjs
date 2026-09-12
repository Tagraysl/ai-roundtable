function install({Menu,app,window,language}){
 const en=language==='en',label=(zh,english)=>en?english:zh;
 const role=(name,zh,english)=>({role:name,label:label(zh,english)});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
 {label:label('文件','File'),submenu:[role('close','关闭窗口','Close window'),role('quit','退出','Quit')]},
 {label:label('编辑','Edit'),submenu:[role('undo','撤销','Undo'),role('redo','重做','Redo'),{type:'separator'},role('cut','剪切','Cut'),role('copy','复制','Copy'),role('paste','粘贴','Paste'),role('selectAll','全选','Select all')]},
 {label:label('视图','View'),submenu:[role('resetZoom','实际大小','Actual size'),role('zoomIn','放大界面','Zoom in'),role('zoomOut','缩小界面','Zoom out'),{type:'separator'},role('togglefullscreen','切换全屏','Toggle full screen')]},
 {label:label('窗口','Window'),submenu:[role('minimize','最小化','Minimize'),role('zoom','缩放窗口','Zoom window')]}
 ]));
 window.setTitle(label('同桌 AI · 讨论室','AI Roundtable · Discussion'));
}
module.exports={install};
