"""Build a clean, ad-hoc-signed macOS app, ZIP and drag-to-Applications DMG."""
import hashlib, json, os, pathlib, plistlib, shutil, subprocess, sys, time, urllib.request, uuid
root=pathlib.Path(__file__).resolve().parents[1]
assert sys.platform=='darwin', 'Build on macOS to preserve bundle links and signatures'
arch=sys.argv[1];assert arch in ('arm64','x64')
pkg=json.loads((root/'package.json').read_text());version=pkg['version'];electron=pkg['devDependencies']['electron']
stage=root/'dist'/('mac-'+arch+'-'+uuid.uuid4().hex);stage.mkdir(parents=True)
name=f'electron-v{electron}-darwin-{arch}.zip';base=f'https://github.com/electron/electron/releases/download/v{electron}/'
archive=stage/name
urllib.request.urlretrieve(base+name,archive)
manifest=urllib.request.urlopen(base+'SHASUMS256.txt').read().decode()
expected=next(line.split()[0] for line in manifest.splitlines() if line.split()[-1].lstrip('*')==name)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected, 'Electron checksum mismatch'
unpack=stage/'runtime';subprocess.run(['ditto','-x','-k',str(archive),str(unpack)],check=True)
app=stage/'AI Roundtable.app';shutil.move(str(unpack/'Electron.app'),app)
resources=app/'Contents'/'Resources';target=resources/'app';target.mkdir()
for name in ('src','extension','third-party','docs','package.json','README.md','README.en.md','LICENSE'):
    src=root/name
    if src.is_dir():shutil.copytree(src,target/name)
    else:shutil.copy2(src,target/name)
denied={'data','instance','qa','.git','node_modules','secrets.json','rooms.json','settings.json','data-location.json'}
for p in target.rglob('*'):
    assert not p.is_symlink() and not (set(p.relative_to(target).parts)&denied),f'Unexpected release path: {p}'
plist=app/'Contents'/'Info.plist';info=plistlib.loads(plist.read_bytes())
oldExecutable=info['CFBundleExecutable']
(app/'Contents'/'MacOS'/oldExecutable).rename(app/'Contents'/'MacOS'/'AI-Roundtable')
info.update(CFBundleExecutable='AI-Roundtable',CFBundleName='AI Roundtable',CFBundleDisplayName='AI Roundtable',CFBundleIdentifier='io.tagraysl.ai-roundtable',CFBundleShortVersionString=version,CFBundleVersion=version)
plist.write_bytes(plistlib.dumps(info))
# Ad-hoc signing allows modified bundles on Apple silicon. It is NOT Developer ID signing/notarization.
subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
zipfile=stage/f'AI-Roundtable-{version}-macOS-{arch}.zip'
subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(zipfile)],check=True)
dmgroot=stage/'disk';dmgroot.mkdir();subprocess.run(['ditto',str(app),str(dmgroot/app.name)],check=True)
os.symlink('/Applications',dmgroot/'Applications')
dmg=stage/f'AI-Roundtable-{version}-macOS-{arch}.dmg'
for attempt in range(3):
    result=subprocess.run(['hdiutil','create','-volname','AI Roundtable','-srcfolder',str(dmgroot),'-fs','HFS+','-ov','-format','UDZO',str(dmg)],capture_output=True,text=True)
    if result.returncode==0:break
    if 'Resource busy' not in result.stderr or attempt==2:raise RuntimeError(result.stderr)
    time.sleep(5*(attempt+1))
subprocess.run(['hdiutil','verify',str(dmg)],check=True)
(stage/f'macOS-{arch}-SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in (zipfile,dmg)))
if os.environ.get('GITHUB_ENV'):
    with open(os.environ['GITHUB_ENV'],'a') as f:f.write(f'MAC_APP={app}\nMAC_STAGE={stage}\n')
print(f'Built {app}; macOS minimum: {info.get("LSMinimumSystemVersion", "see Electron requirements")}')
