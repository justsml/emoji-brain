"""JSON-lines worker. Install rembg[cpu]==2.0.84 in an external Python 3.12 venv."""
import json
import sys
from pathlib import Path
from rembg import new_session, remove

session = new_session('birefnet-general-lite', providers=['CPUExecutionProvider'])
for line in sys.stdin:
    job = json.loads(line)
    try:
        output = Path(job['output'])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(remove(Path(job['input']).read_bytes(), session=session))
        print(json.dumps({'id': job['id'], 'ok': True}), flush=True)
    except Exception as error:
        print(json.dumps({'id': job['id'], 'error': str(error)}), flush=True)
