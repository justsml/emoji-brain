import {spawn} from 'node:child_process';import fs from 'node:fs/promises';
let child,pending=new Map(),nextId=0,buffer='';
export async function localMatte(input,output){
 try{await fs.access(output);return {model:'birefnet-general-lite',cached:true}}catch{}
 if(!child){child=spawn(process.env.EMOJI_MATTE_PYTHON??'/tmp/emoji-enhancement-venv/bin/python',['scripts/emoji-enhancement/local-matte.py'],{env:{...process.env,OMP_NUM_THREADS:'4'},stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const split=buffer.indexOf('\n'),line=buffer.slice(0,split);buffer=buffer.slice(split+1);try{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);r.ok?p.resolve({model:'birefnet-general-lite'}):p.reject(Error(r.error))}}catch{}}});child.on('error',error=>{for(const p of pending.values())p.reject(error);pending.clear()});child.on('exit',code=>{for(const p of pending.values())p.reject(Error('Local matte worker exited '+code));pending.clear();child=undefined});child.stderr.on('data',()=>{});}
 const id=nextId++;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,input,output})+'\n')});
}
export function closeLocalMatte(){child?.stdin.end()}
