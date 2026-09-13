const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {_electron}=require(process.env.PLAYWRIGHT_PATH);
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 // Hosted Mac runners do not provide the same GPU environment as a physical Mac.
 const app=await _electron.launch({executablePath:path.join(process.env.MAC_APP,'Contents/MacOS/Electron'),args:['--qa','--disable-gpu'],env});
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
  const desktop=fs.mkdtempSync(path.join(os.tmpdir(),'roundtable-desktop-'));
  const executable=path.join(process.env.MAC_APP,'Contents/MacOS/Electron');
  const link=require('../src/desktop-shortcut.cjs').create({desktop,executable,platform:'darwin'});
  assert.equal(fs.realpathSync(link),fs.realpathSync(process.env.MAC_APP));
  await page.screenshot({path:path.join(process.env.MAC_STAGE,'mac-workflow.png')});
  console.log('PASS: packaged Mac app launches; isolated empty data; English workflow; Command zoom.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
