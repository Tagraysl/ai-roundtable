const assert=require('node:assert/strict'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_PATH);
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(process.env.MAC_APP,'Contents/MacOS/Electron'),args:['--qa'],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
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
  await page.keyboard.press('Meta+-');await page.keyboard.press('Meta+0');
  const zoom=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());assert.equal(zoom,1);
  console.log('PASS: packaged Mac app launches; isolated empty data; English workflow; Command zoom.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
