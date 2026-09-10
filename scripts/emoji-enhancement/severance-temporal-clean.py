"""Recover the static wide-shot background from temporal consensus; retain moving pixels."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
root=Path('experiments/image-enhancement/remaining-animations/severance-running')
out=root/'temporal-wide';out.mkdir(exist_ok=True)
# Raw decoded original frames prepared by the JS entrypoint.
a=np.fromfile(out/'source.rgba',np.uint8).reshape(90,64,64,4)
bg=np.median(a[27:,:,:,:3],axis=0).astype(np.uint8)
bg=np.array(Image.fromarray(bg).filter(ImageFilter.MedianFilter(3)))
plate=np.array(Image.open(root/'nano-reference-v2/frame-30.png').convert('RGB').resize((64,64),Image.Resampling.LANCZOS))
Image.fromarray(plate).resize((128,128),Image.Resampling.LANCZOS).save(out/'background.png')
for i in range(27,90):
 frame=np.array(Image.fromarray(a[i,:,:,:3]).filter(ImageFilter.MedianFilter(3)))
 # Restrict foreground detection to the runner's region, excluding dark baseboards.
 delta=np.abs(frame.astype(float)-bg.astype(float)).mean(2)
 mask=(delta>30)&(frame.mean(2)<155)
 mask[:15]=False;mask[59:]=False;mask[:,45:]=False
 labels,n=ndimage.label(mask)
 keep=np.zeros_like(mask)
 sizes=np.bincount(labels.ravel());sizes[0]=0
 main=labels==sizes.argmax() if n else np.zeros_like(mask)
 yy,xx=np.where(main)
 for k in range(1,n+1):
  part=labels==k
  py,px=ndimage.center_of_mass(part)
  if len(xx) and part.sum()>=3 and xx.min()-8<=px<=xx.max()+8 and yy.min()-16<=py<=yy.max()+3:keep|=part
 if i<40:keep[:]=False
 keep=ndimage.binary_fill_holes(ndimage.binary_dilation(keep,iterations=2))
 mask=ndimage.gaussian_filter(keep.astype(float),.6).clip(0,1)
 # Recovered background suppresses source noise; moving figure stays frame-specific.
 clean=(frame*mask[:,:,None]+plate*(1-mask[:,:,None])).round().astype(np.uint8)
 Image.fromarray(clean).resize((128,128),Image.Resampling.LANCZOS).save(out/f'input-{i}.png')
 Image.fromarray((mask*255).astype(np.uint8)).save(out/f'mask-{i}.png')
