import {spawn} from 'node:child_process';
// A fresh process per batch releases decoder/encoder allocations between batches.
for(let batch=1;batch<=100;batch++){
 let output='';const child=spawn(process.execPath,['scripts/generate-emoji-delivery.mjs','--batch-size=16'],{stdio:['ignore','pipe','inherit']});child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk)});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});if(code!==0)throw Error('Delivery batch failed: '+code);if(output.includes('BATCH COMPLETE 0 encoded'))process.exit(0);
}
throw Error('Delivery did not converge');
