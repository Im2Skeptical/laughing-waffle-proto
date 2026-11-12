"""Reduce complete, alpha-separated Crown modules to the map's pixel scale."""
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'images/dark-fantasy/crown-modular-v1'
RUNTIME=ROOT/'images/dark-fantasy/map-generation-prototype/assets/runtime'
roles=['citadel','barracks','armoury','arcade','tower','wallNE','wallNW','corner','gate','ruinedGate','courtWing','colonnade','ruinedHall','brokenWall','ruinedHouses','house','pair','workshop','foundation','flag']
# House width matches the established 12px house import. Other widths follow
# doors/roof pitches, rather than fitting every object into the same square.
widths=[26,28,22,26,16,28,28,24,22,22,30,28,28,24,24,12,22,20,20,8]
links=['blade','bladeLow','bladeBroken','ribBrace','galleryNE','galleryNW','rampartNE','rampartNW','galleryCorner','galleryT','linkedGate','court','ruinedGalleryNE','ruinedGalleryNW','terrace','ribRuin']
link_widths=[12,12,12,22,28,24,28,22,28,30,26,30,28,24,30,24]
entries=[]
for filename,columns,rows,names,sizes in [('warlord-parts-v1.png',5,4,roles,widths),('warlord-links-v2.png',4,4,links,link_widths)]:
    source=Image.open(FOLDER/filename).convert('RGBA')
    payload=json.dumps([source.width,source.height,columns,rows]).encode()+b'\n'+source.tobytes()
    cells=json.loads(subprocess.run(['node',str(ROOT/'scripts/map-terrain-frame-probe.mjs')],input=payload,capture_output=True,check=True).stdout)
    entries.extend((source,cell,role,size,filename) for cell,role,size in zip(cells,names,sizes))
atlas=Image.new('RGBA',(6*38,6*44))
frames=[]
for i,(source,cell,role,width,filename) in enumerate(entries):
    if cell['cutRuns']: raise ValueError(f'Incomplete module {role}: {cell["cutRuns"]}')
    sprite=source.crop((cell['left'],cell['top'],cell['right'],cell['bottom']))
    alpha=np.array(sprite)[...,3]
    ys,xs=np.nonzero(alpha>=100)
    sprite=sprite.crop((int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1))
    sprite=sprite.resize((width,round(width*sprite.height/sprite.width)),Image.Resampling.LANCZOS)
    if sprite.height>42: raise ValueError(f'Tall module {role}')
    x,y=i%6*38+1,i//6*44+1
    atlas.paste(sprite,(x,y))
    frames.append({'role':role,'rect':[x,y,*sprite.size],'cutRuns':cell['cutRuns'],'source':filename})
atlas.save(RUNTIME/'crown-modular-v1.webp','WEBP',lossless=True,method=6)
(RUNTIME/'crown-modular-v1.json').write_text(json.dumps({'version':1,'classId':'warrior','frames':frames},separators=(',',':')))
print(f'Crown modules: {len(frames)} complete frames, ordinary house width 12px, {(RUNTIME/"crown-modular-v1.webp").stat().st_size} bytes')
