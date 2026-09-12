const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fileParser',{receive:fn=>ipcRenderer.once('parse-file',(_,data)=>fn(data)),finish:data=>ipcRenderer.send('parsed-file',data)});
