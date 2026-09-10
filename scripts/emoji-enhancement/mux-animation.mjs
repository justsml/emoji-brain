import fs from 'node:fs/promises';import sharp from 'sharp';
// Full-canvas no-blend frames preserve repeated holds and disappearing pixels.
// https://developers.google.com/speed/webp/docs/riff_container
const chunk=(type,payload)=>{const h=Buffer.alloc(8);h.write(type);h.writeUInt32LE(payload.length,4);return Buffer.concat([h,payload,...(payload.length%2?[Buffer.alloc(1)]:[])])};
export async function muxAnimation({frameFiles,width,height,delays,loop},file){
 if(frameFiles.length<2||frameFiles.length!==delays.length||!Number.isInteger(loop)||loop<0||loop>65535)throw Error('Invalid animation');
 const extended=Buffer.alloc(10);extended[0]=0x12;extended.writeUIntLE(width-1,4,3);extended.writeUIntLE(height-1,7,3);
 const control=Buffer.alloc(6);control.writeUInt16LE(loop,4);const chunks=[chunk('VP8X',extended),chunk('ANIM',control)],cache=new Map();
 for(let i=0;i<frameFiles.length;i++){
  if(!Number.isInteger(delays[i])||delays[i]<0||delays[i]>0xffffff)throw Error('Invalid duration');
  let image=cache.get(frameFiles[i]);if(!image){const data=await sharp(frameFiles[i]).webp({lossless:true,effort:2}).toBuffer();const pieces=[];for(let p=12;p<data.length;){const type=data.toString('ascii',p,p+4),length=data.readUInt32LE(p+4),end=p+8+length+(length%2);if(['VP8L','VP8 ','ALPH'].includes(type))pieces.push(data.subarray(p,end));p=end;}image=Buffer.concat(pieces);if(!image.length)throw Error('Missing WebP frame data');cache.set(frameFiles[i],image);}
  const header=Buffer.alloc(16);header.writeUIntLE(width-1,6,3);header.writeUIntLE(height-1,9,3);header.writeUIntLE(delays[i],12,3);header[15]=2;chunks.push(chunk('ANMF',Buffer.concat([header,image])));
 }
 const body=Buffer.concat(chunks),header=Buffer.alloc(12);header.write('RIFF');header.writeUInt32LE(body.length+4,4);header.write('WEBP',8);await fs.writeFile(file+'.tmp',Buffer.concat([header,body]));
 const m=await sharp(file+'.tmp',{animated:true}).metadata();if(m.pages!==frameFiles.length||m.width!==width||m.pageHeight!==height||JSON.stringify(m.delay)!==JSON.stringify(delays)||(m.loop??0)!==loop)throw Error('Mux changed timing/geometry');await fs.rename(file+'.tmp',file);
}
