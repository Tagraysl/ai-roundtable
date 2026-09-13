const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {storageRoot,appBundle}=require('../src/platform-paths.cjs');
test('macOS data lives outside the app bundle and survives app relocation',()=>{
 const opts={platform:'darwin',packaged:true,executable:'/Applications/AI Roundtable.app/Contents/MacOS/Electron',appData:'/Users/test/Library/Application Support'};
 assert.equal(storageRoot(opts),path.join(opts.appData,'AI Roundtable'));
 assert.equal(storageRoot({...opts,executable:'/Volumes/Download/AI Roundtable.app/Contents/MacOS/Electron'}),storageRoot(opts));
 assert.equal(appBundle(opts.executable),path.resolve('/Applications/AI Roundtable.app'));
});
test('Windows retains portable storage and QA uses a separate temporary root',()=>{
 assert.equal(storageRoot({platform:'win32',packaged:false,sourceRoot:'project'}),'project');
 assert.equal(storageRoot({qa:true,temp:'temp'}),path.join('temp','ai-roundtable-qa-'+process.pid));
});
