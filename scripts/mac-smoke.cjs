const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {_electron}=require(process.env.PLAYWRIGHT_PATH);
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 // Hosted Mac runners do not provide the same GPU environment as a physical Mac.
 const app=await _electron.launch({executablePath:path.join(process.env.MAC_APP,'Contents/MacOS/AI-Roundtable'),args:['--qa','--disable-gpu'],env});
 app.process().on('exit',(code,signal)=>console.log('QA process exit',{code,signal}));
 app.process().stderr.on('data',chunk=>process.stderr.write(chunk));
 app.process().stdout.on('data',chunk=>process.stdout.write(chunk));
 console.log(await app.evaluate(({app,BrowserWindow})=>{
  app.on('before-quit',()=>console.log('QA before-quit'));
  app.on('render-process-gone',(_,wc,details)=>console.error('QA renderer gone',details));
  return {path:app.getAppPath(),packaged:app.isPackaged,windows:BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),url:w.webContents.getURL()}))};
 }));
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);console.log('QA initial page',page.url());
  await page.locator('#preferences-open').waitFor();
  await page.waitForFunction(()=>!!window.roundtable);
  const state=await page.evaluate(()=>window.roundtable.call('state'));
  assert.equal(state.version,require('../package.json').version);
  assert(!state.dataRoot.startsWith(process.env.MAC_APP));
  assert(state.rooms.every(r=>!r.messages.length&&!(r.materials||[]).length));
  assert(state.members.every(m=>!m.hasKey));
  await page.locator('#preferences-open').click();
  await page.locator('#ui-language').selectOption('en');
  await page.locator('#preferences-close').click();
  await page.locator('#workflow-nav').click();
  await page.locator('.wf-node').first().waitFor();
  const toolbar=await page.locator('.wf-toolbar').evaluate(el=>{
   const box=el.getBoundingClientRect();
   return [...el.children].filter(c=>c.getClientRects().length).every(c=>{const r=c.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1;});
  });assert(toolbar,'Workflow controls must stay inside their toolbar background');
  await page.keyboard.press('Meta+-');await page.keyboard.press('Meta+0');
  const zoom=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());assert.equal(zoom,1);
  const desktop=fs.mkdtempSync(path.join(os.tmpdir(),'roundtable-desktop-'));
  const executable=path.join(process.env.MAC_APP,'Contents/MacOS/AI-Roundtable');
  const link=require('../src/desktop-shortcut.cjs').create({desktop,executable,platform:'darwin'});
  assert.equal(fs.realpathSync(link),fs.realpathSync(process.env.MAC_APP));
  await page.screenshot({path:path.join(process.env.MAC_STAGE,'mac-workflow.png')});
  console.log('PASS: packaged Mac app launches; isolated empty data; English workflow; Command zoom.');
 }catch(e){console.error('QA failure process state',{exitCode:app.process().exitCode,signalCode:app.process().signalCode});throw e;}
 finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
