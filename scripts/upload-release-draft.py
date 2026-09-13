"""Upload only verified build outputs; publishing a draft is a separate manual step."""
import hashlib,json,pathlib,re,subprocess,sys
root=pathlib.Path(sys.argv[1]);assets=[]
version=json.loads(pathlib.Path('package.json').read_text())['version']
assert re.fullmatch(r'\d+\.\d+\.\d+',version)
for manifest in root.rglob('*SHA256SUMS.txt'):
    for line in manifest.read_text().splitlines():
        expected,name=line.split(maxsplit=1);name=name.strip()
        assert pathlib.Path(name).name==name and version in name
        p=manifest.parent/name
        with p.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
        assert actual==expected.lower(),f'Checksum mismatch: {name}'
        print(actual+'  '+name,flush=True);assets.append(p)
    assets.append(manifest)
assert len(assets)==11 and len({p.name for p in assets})==11, 'Expected Windows, source and both Mac builds'
tag='v'+version
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
existing=subprocess.run(['gh','release','view',tag,'--json','isDraft'],capture_output=True,text=True)
if existing.returncode==0:
    assert json.loads(existing.stdout)['isDraft'], 'Never overwrite a public release'
    subprocess.run(['gh','release','edit',tag,'--target',commit],check=True)
else:
    subprocess.run(['gh','release','create',tag,'--target',commit,'--title','同桌 AI / AI Roundtable '+version+' — Preview','--draft','--prerelease','--notes','Mac 双架构与单模型工作流 / macOS builds and single-model workflows. Final notes will be added after verification.'],check=True)
subprocess.run(['gh','release','upload',tag,'--clobber',*map(str,assets)],check=True)
print('Draft uploaded: '+tag)
