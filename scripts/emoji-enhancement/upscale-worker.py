"""Persistent local Real-ESRGAN worker; architecture BSD-3-Clause, see license.
Official animevideov3 (16 convolutions) and general-x4v3 (32 convolutions).
General uses a 50/50 strong/weak denoise weight interpolation.
"""
import json
import sys
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image

class Compact(nn.Module):
    def __init__(self, depth):
        super().__init__()
        self.body = nn.ModuleList([nn.Conv2d(3, 64, 3, 1, 1), nn.PReLU(64)])
        for _ in range(depth):
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
models = {}
weights_root = Path(sys.argv[1])
def weights(name):
    checkpoint = torch.load(weights_root / name, map_location='cpu', weights_only=True)
    return checkpoint.get('params_ema', checkpoint.get('params', checkpoint))
def model_for(kind):
    if kind not in models:
        model = Compact(32 if kind.startswith('photo') else 16)
        if kind.startswith('photo'):
            strong, weak = weights('realesr-general-x4v3.pth'), weights('realesr-general-wdn-x4v3.pth')
            state = strong if kind == 'photo-strong' else {k: .5 * strong[k] + .5 * weak[k] for k in strong}
        else:
            state = weights('realesr-animevideov3.pth')
        model.load_state_dict(state)
        models[kind] = model.eval().to(device)
    return models[kind]
for line in sys.stdin:
    job = json.loads(line)
    try:
        array = np.asarray(Image.open(job['input']).convert('RGB'), dtype=np.float32) / 255
        value = torch.from_numpy(array.transpose(2, 0, 1).copy()).unsqueeze(0).to(device)
        with torch.inference_mode():
            result = model_for(job['kind'])(value).clamp(0, 1).squeeze(0).cpu().numpy().transpose(1, 2, 0)
        target = Path(job['output'])
        temporary = target.with_suffix('.tmp.png')
        Image.fromarray(np.round(result * 255).astype(np.uint8)).save(temporary)
        temporary.replace(target)
        print(json.dumps({'id': job['id'], 'ok': True, 'device': device}), flush=True)
    except Exception as error:
        print(json.dumps({'id': job['id'], 'error': str(error)}), flush=True)
