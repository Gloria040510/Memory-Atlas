from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
with ZipFile(root/'dist/memory-atlas-extension.zip','w',ZIP_DEFLATED) as z:
    for f in sorted((root/'extension').glob('*')):
        if f.is_file():z.write(f,f.name)
with ZipFile(root/'dist/memory-atlas-source.zip','w',ZIP_DEFLATED) as z:
    for folder in ['dist','docs','extension','test','scripts']:
        for f in sorted((root/folder).rglob('*')):
            if f.is_file() and f.suffix not in ['.zip','.pyc']:z.write(f,Path('memory-atlas')/f.relative_to(root))
    for name in ['README.md','package.json','LICENSE','.gitignore']:
        if (root/name).exists():z.write(root/name,'memory-atlas/'+name)
