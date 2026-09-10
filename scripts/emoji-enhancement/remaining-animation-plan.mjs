export const photoNames=new Set(['alert','awkward_side_eye','boxcat','cat-meow-hearts','cheers','elmo-fire','extreme-teamwork','hypecat','keanu-thanks','keanu_thanks','magic','milchick_roll','severance-dancing-helly','severance-dancing-mark','severance-dancing','severance-running','severance','side-eye','smart','typingcat','watcat']);
const effects={
 meow_angry_intensifies:[.2,'Intentional anger/shake blur; retain original alpha and trails.'],
 'meow-stretch':[.5,'Preserve stretching, distortion and source lettering.'],
 meow_coffeespitting:[.8,'Keep every white spray particle and its original alpha.'],
 meow_clorox:[.65,'Preserve rapid shake and label lettering.'],
 meow_cloroxsip:[.65,'Preserve rapid shake and label lettering.'],
 'meow_red-bull':[.65,'Preserve jitter and label lettering.'],
 'meow_enjoy-rain':[.65,'Retain rain particles, softness and alpha.'],
 'meow_enjoy-snow':[.65,'Retain snow particles and alpha.'],
 'meow_sad-rain':[.65,'Retain rain particles, softness and alpha.'],
 'roo-redbutton':[.5,'Preserve flashes, glow, exposure changes and explosion.'],
 the_more_you_know:[.2,'Preserve intentional star glow, trails and the original text.'],
};
export function animationPlan(name){
 if(name==='bongo-cat-jumbo')return {kind:'resize',mix:0,alpha:'source',note:'Source is already 1920×1080; export at 512px without model processing.'};
 if(name==='nyancat')return {kind:'pixel',mix:0,alpha:'source',note:'Intentional pixel art; exact 4× nearest-neighbor enlargement.'};
 if(effects[name])return {kind:'art',mix:effects[name][0],alpha:'source',note:effects[name][1]};
 if(photoNames.has(name))return {kind:'photo',mix:.75,alpha:'source',note:'General photo restoration blended with source; preserve likeness, scene, motion and original alpha.'};
 return {kind:'art',mix:1,alpha:'dual',note:'Pilot-selected animevideov3 restoration with dual-background alpha.'};
}
