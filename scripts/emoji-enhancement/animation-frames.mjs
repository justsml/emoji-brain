import sharp from 'sharp';

export async function decodeAnimation(file){
 const meta=await sharp(file,{animated:true}).metadata();
 if((meta.pages??1)<2)throw Error('Expected animation');
 const {data,info}=await sharp(file,{animated:true}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pageHeight=meta.pageHeight,bytes=info.width*pageHeight*4;
 const frames=Array.from({length:meta.pages},(_,i)=>Buffer.from(data.subarray(i*bytes,(i+1)*bytes)));
 return {width:info.width,height:pageHeight,frames,delays:meta.delay,loop:meta.loop??0};
}

export async function encodeAnimation({frames,width,height,delays,loop},file){
 if(frames.length!==delays.length||frames.some(f=>f.length!==width*height*4))throw Error('Invalid animation frame geometry/timing');
 await sharp(Buffer.concat(frames),{raw:{width,height:height*frames.length,channels:4,pageHeight:height}}).webp({lossless:true,effort:6,delay:delays,loop,minSize:false,mixed:false}).toFile(file);
 const actual=await sharp(file,{animated:true}).metadata();
 if(actual.pages!==frames.length||actual.pageHeight!==height||actual.width!==width||JSON.stringify(actual.delay)!==JSON.stringify(delays)||(actual.loop??0)!==loop)throw Error('Encoder changed animation timing/frames');
}

export async function resizeFrames(animation,target=512){
 const scale=target/Math.max(animation.width,animation.height),width=Math.round(animation.width*scale),height=Math.round(animation.height*scale);
 const frames=[];
 for(const data of animation.frames)frames.push(await sharp(data,{raw:{width:animation.width,height:animation.height,channels:4}}).resize(width,height).ensureAlpha().raw().toBuffer());
 return {...animation,frames,width,height};
}
