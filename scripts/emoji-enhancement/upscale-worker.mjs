import {spawn} from 'node:child_process';
let child,next=0,buffer='';const pending=new Map();
export function upscaleLocal(input,output,kind='art'){
 if(!child){child=spawn(process.env.EMOJI_MATTE_PYTHON??'/tmp/emoji-enhancement-venv/bin/python',['scripts/emoji-enhancement/upscale-worker.py',process.env.EMOJI_MODEL_DIR??'/tmp/emoji-models'],{stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const i=buffer.indexOf('\n'),line=buffer.slice(0,i);buffer=buffer.slice(i+1);let r;try{r=JSON.parse(line)}catch{continue}const p=pending.get(r.id);if(p){pending.delete(r.id);r.ok?p.resolve(r):p.reject(Error(r.error));}}});child.on('error',e=>{for(const p of pending.values())p.reject(e);pending.clear()});child.on('exit',code=>{for(const p of pending.values())p.reject(Error('Upscale worker exited '+code));pending.clear();child=undefined;});child.stderr.on('data',chunk=>process.stderr.write(chunk));}
 const id=next++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,input,output,kind})+'\n')});
}
export function closeUpscaleWorker(){child?.stdin.end()}
