import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
import data from '../src/data/emoji-metadata.json' with {type:'json'};
import vocabulary from '../src/data/tag-vocabulary.json' with {type:'json'};

// Labels are canonical ids, but people search in their own words. Each tag's
// aliases are exactly that synonym list, so they go into the indexed text
// alongside the id — without them "whiskers", "uwu" and "tears" return nothing.
const synonyms = new Map<string,string[]>(vocabulary.tags.map(tag=>[tag.id,tag.aliases]));

// Broad words no single tag owns. Searching "animal" should reach every animal,
// and the vocabulary deliberately has no tag meaning "an animal of some kind".
const HYPERNYMS: Record<string,string[]> = {
  cat:['animal','pet'],dog:['animal','pet'],bear:['animal'],bird:['animal'],
  rodent:['animal','pet'],'sea-creature':['animal'],amphibian:['animal'],
  'animal-other':['animal'],person:['human'],face:['smiley','emoji'],
};
function expand(tags: string[]) {
  return tags.flatMap(tag=>[...(synonyms.get(tag)??[]),...(HYPERNYMS[tag]??[])]);
}
async function buildIndex() {
  const records=data.emojis.map(emoji=>({
    language:'en',url:emoji.path,
    content:[...new Set([emoji.filename,...emoji.categories,...emoji.tags,...(emoji.aliases??[]),...expand(emoji.tags),emoji.animated?'animated':'static'])].join(', '),
    sort:{created:emoji.created.split('T')[0],filename:emoji.filename},
    meta:{id:emoji.id},
    // Matched IDs come back in the search response, avoiding one data-fragment
    // fetch/excerpt computation per result for metadata already in the app.
    filters:{emoji_id:[emoji.id],animated:[emoji.animated?'animated':'static']},
  }));
  if(new Set(records.map(r=>r.url)).size!==records.length||new Set(records.map(r=>r.meta.id)).size!==records.length)throw Error('Duplicate Pagefind document or emoji ID');
  const hash=(bytes: string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
  const version=JSON.parse(await fs.readFile('node_modules/pagefind/package.json','utf8')).version;
  const fingerprint=hash(JSON.stringify({records,version,script:await fs.readFile(new URL(import.meta.url),'utf8')}));
  try {
    const previous=JSON.parse(await fs.readFile('public/pagefind/build-manifest.json','utf8'));
    if(previous.fingerprint===fingerprint){
      let valid=true;
      for(const file of previous.files)if(hash(await fs.readFile('public/pagefind/'+file.path))!==file.sha256){valid=false;break;}
      if(valid){console.log(`Pagefind unchanged: reused ${records.length} unique records`);return;}
    }
  } catch { /* Missing/stale output: rebuild once. */ }
  const pagefind=await import('pagefind');
  const {index,errors}=await pagefind.createIndex();
  if(!index||errors.length)throw Error(`Pagefind initialization failed: ${errors.join(', ')}`);
  const staging=await fs.mkdtemp('public/.pagefind-');
  try {
    for(const record of records){const result=await index.addCustomRecord(record);if(result.errors.length)throw Error(result.errors.join('; '));}
    const written=await index.writeFiles({outputPath:staging});if(written.errors.length)throw Error(written.errors.join('; '));
    const files=[];
    for(const entry of await fs.readdir(staging,{recursive:true,withFileTypes:true}))if(entry.isFile()){
      const path=(entry.parentPath+'/'+entry.name).slice(staging.length+1);
      files.push({path,sha256:hash(await fs.readFile(staging+'/'+path))});
    }
    await fs.writeFile(staging+'/build-manifest.json',JSON.stringify({fingerprint,records:records.length,version,files},null,2)+'\n');
    await fs.rm('public/pagefind',{recursive:true,force:true});await fs.rename(staging,'public/pagefind');
    console.log(`Pagefind built once: ${records.length} unique records`);
  }finally{await fs.rm(staging,{recursive:true,force:true});await pagefind.close();}
}
await buildIndex();
