function install({Menu,app,window,language}){
 const en=language==='en',label=(zh,english)=>en?english:zh;
 const role=(name,zh,english)=>({role:name,label:label(zh,english)});
 Menu.setApplicationMenu(Menu.buildFromTemplate([
 ...(process.platform==='darwin'?[{label:app.name,submenu:[role('about','关于同桌 AI','About AI Roundtable'),{type:'separator'},role('hide','隐藏','Hide'),role('hideOthers','隐藏其他','Hide others'),role('unhide','全部显示','Show all'),{type:'separator'},role('quit','退出','Quit')]}]:[]),
 {label:label('文件','File'),submenu:[role('close','关闭窗口','Close window'),role('quit','退出','Quit')]},
 {label:label('编辑','Edit'),submenu:[role('undo','撤销','Undo'),role('redo','重做','Redo'),{type:'separator'},role('cut','剪切','Cut'),role('copy','复制','Copy'),role('paste','粘贴','Paste'),role('selectAll','全选','Select all')]},
 {label:label('视图','View'),submenu:[... [['reset','实际大小','Actual size','CmdOrCtrl+0'],['in','放大界面','Zoom in','CmdOrCtrl+='],['out','缩小界面','Zoom out','CmdOrCtrl+-'],['fullscreen','切换全屏（Esc 可退出）','Toggle full screen (Esc exits)','F11']].map(([name,zh,en,accelerator])=>({label:label(zh,en),accelerator,click:()=>require('./window-controls.cjs').action(window,name)}))]},
 {label:label('窗口','Window'),submenu:[role('minimize','最小化','Minimize'),role('zoom','缩放窗口','Zoom window')]}
 ]));
 window.setTitle(label('同桌 AI · 讨论室','AI Roundtable · Discussion'));
}
module.exports={install};
