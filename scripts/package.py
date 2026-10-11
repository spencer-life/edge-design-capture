"""Build deterministic unpacked-extension and source archives, without dependencies."""
import hashlib,json,os,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist';OUT.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'extension/manifest.json').read_text());version=manifest['version']
def put(z,name,data):
    info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
def build():
    for n in manifest['icons'].values():assert(ROOT/'extension'/n).is_file()
    target=OUT/f'edge-design-capture-{version}.zip'
    with zipfile.ZipFile(target,'w')as z:
        for p in sorted((ROOT/'extension').rglob('*')):
            if p.is_file():put(z,'edge-design-capture/'+str(p.relative_to(ROOT/'extension')),p.read_bytes())
        put(z,'START-HERE.md',(ROOT/'README.md').read_bytes())
        put(z,'START-HERE.html',(ROOT/'docs/START-HERE.html').read_bytes())
        for name in ['ARCHITECTURE.md','TESTING.md','DELIVERY.md']:put(z,'docs/'+name,(ROOT/'docs'/name).read_bytes())
        info={'version':version,'revision':os.environ.get('DESIGN_LENS_REVISION','uncommitted local source'),'runtimeFiles':{str(p.relative_to(ROOT/'extension')):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'extension').rglob('*')) if p.is_file()}}
        put(z,'BUILD-INFO.json',json.dumps(info,indent=2).encode())
    with zipfile.ZipFile(target)as z:assert z.testzip()is None;assert 'edge-design-capture/manifest.json'in z.namelist()
    source=OUT/f'edge-design-capture-{version}-source.zip'
    excluded={'.git','node_modules','dist','test-results','__pycache__','.venv'}
    with zipfile.ZipFile(source,'w')as z:
        for p in sorted(ROOT.rglob('*')):
            if p.is_file() and not any(x in excluded for x in p.relative_to(ROOT).parts) and p.suffix not in {'.pyc'}:put(z,'edge-design-capture/'+str(p.relative_to(ROOT)),p.read_bytes())
    sums=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in [target,source]);(OUT/'SHA256SUMS.txt').write_text(sums)
    print(sums,end='');print('Validated extension ZIP: '+str(target))
if __name__=='__main__':build()
