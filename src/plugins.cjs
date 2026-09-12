const fs=require('node:fs'),path=require('node:path');
class Plugins{
 constructor({root,store,bundled}){this.root=path.join(root,'plugins');this.store=store;this.bundled=bundled;this.config=store.read('plugin-settings',{web:'enabled'});if(this.config.web!=='removed')this.installFiles();}
 installFiles(){fs.mkdirSync(this.root,{recursive:true});fs.copyFileSync(this.bundled,path.join(this.root,'web-window.cjs'));}
 status(){return {id:'web',name:'网页自动连接',status:this.config.web||'enabled'};}
 set(action){if(action==='install'){this.installFiles();this.config.web='enabled';}else if(action==='disable')this.config.web='disabled';else if(action==='enable'){this.installFiles();this.config.web='enabled';}else if(action==='remove'){const target=path.resolve(this.root,'web-window.cjs');if(path.dirname(target)!==path.resolve(this.root))throw Error('Invalid plugin path');fs.rmSync(target,{force:true});this.config.web='removed';}else throw Error('未知插件操作');this.store.write('plugin-settings',this.config);return this.status();}
 create(options){if(this.config.web!=='enabled')return null;return new (require(path.join(this.root,'web-window.cjs')).WebWindow)(options);}
}
module.exports={Plugins};
