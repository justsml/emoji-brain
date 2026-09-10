import fs from 'node:fs/promises';import {readFileSync,existsSync} from 'node:fs';import {parseEnv} from 'node:util';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import sharp from 'sharp';
const exec=promisify(execFile);const env={...parseEnv(readFileSync('.env','utf8')),...process.env};
const dir=new URL('./',import.meta.url).pathname;
const prompt=readFileSync(`${dir}run.mjs`,'utf8').match(/const prompt = '([^']+)';/)[1];
await fs.copyFile('/tmp/emoji-sunburst-endpoints.json',`${dir}sunburst-pricing.json`);
await Promise.all(['meow-cat','everythingisbroken'].map(async name=>{
 const key=`${name}--openai--gpt-image-2.5-sunburst`,file=`${dir}${key}.result.json`;
 const body={model:'openai/gpt-image-2.5-sunburst',prompt,quality:'max',aspect_ratio:'1:1',output_format:'png',n:1,input_references:[{type:'image_url',image_url:{url:`data:image/webp;base64,${(await fs.readFile(`public/emojis/${name}.webp`)).toString('base64')}`}}]};
 await fs.writeFile(`${dir}${key}.input.json`,JSON.stringify(body,null,2));
 if(!existsSync(file)){
  console.log('Starting',key);
  await exec('curl',['-sS','--max-time','600','-H',`Authorization: Bearer ${env.OPENROUTER_API_KEY||env.OPENROUTER_AI_KEY}`,'-H','Content-Type: application/json','--data-binary',`@${dir}${key}.input.json`,'https://openrouter.ai/api/v1/images','-o',file]);
 }
 const r=JSON.parse(await fs.readFile(file));
 if(r.data?.[0]?.b64_json){await sharp(Buffer.from(r.data[0].b64_json,'base64')).png().toFile(`${dir}${key}.png`);console.log('Succeeded',key,r.usage);}else console.log(key,r.error||r);
}));
