"""SRVGGNetCompact inference for official Real-ESRGAN animevideov3 weights.
Architecture adapted from xinntao/Real-ESRGAN, BSD-3-Clause; see adjacent license.
https://github.com/xinntao/Real-ESRGAN/blob/master/realesrgan/archs/srvgg_arch.py
"""
import sys
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image

class SRVGGNetCompact(nn.Module):
    def __init__(self):
        super().__init__()
        self.body = nn.ModuleList([nn.Conv2d(3, 64, 3, 1, 1), nn.PReLU(64)])
        for _ in range(16):
            self.body.extend([nn.Conv2d(64, 64, 3, 1, 1), nn.PReLU(64)])
        self.body.append(nn.Conv2d(64, 48, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(4)

    def forward(self, value):
        result = value
        for layer in self.body:
            result = layer(result)
        return self.upsampler(result) + F.interpolate(value, scale_factor=4, mode='nearest')

torch.set_num_threads(4)
device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = SRVGGNetCompact()
checkpoint = torch.load(sys.argv[3], map_location='cpu', weights_only=True)
model.load_state_dict(checkpoint.get('params_ema', checkpoint.get('params', checkpoint)))
model = model.eval().to(device)
array = np.asarray(Image.open(sys.argv[1]).convert('RGB'), dtype=np.float32) / 255
value = torch.from_numpy(array.transpose(2, 0, 1).copy()).unsqueeze(0).to(device)
with torch.inference_mode():
    result = model(value).clamp(0, 1).squeeze(0).cpu().numpy().transpose(1, 2, 0)
Image.fromarray(np.round(result * 255).astype(np.uint8)).save(sys.argv[2])
print('realesr-animevideov3', device, flush=True)
