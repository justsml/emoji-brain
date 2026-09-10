import {describe,it,expect} from 'vitest';
import {planSlackEmojiReplacements, type ReplacementImage} from './slackEmojiReplacements';
const image=(name:string,width=128,height=128,animated=false):ReplacementImage=>({name,width,height,animated});
describe('read-only Slack replacement plan',()=>{
  it('offers replacement only for a smaller exact-name match',()=>{
    const result=planSlackEmojiReplacements([image('roo'),image('cat'),image('new')],[image('roo',64,64),image('cat')]);
    expect(result.map(r=>r.action)).toEqual(['replace-smaller','keep-existing','upload-new']);
  });
  it('preserves larger, mixed-dimension and animated existing images',()=>{
    const incoming=['large','wide','animated'].map(name=>image(name));
    const existing=[image('large',256,256),image('wide',256,64),image('animated',64,64,true)];
    expect(planSlackEmojiReplacements(incoming,existing).map(r=>r.action)).toEqual(['keep-existing','keep-existing','keep-existing']);
  });
  it('does not mistake square padding for higher resolution',()=>{
    expect(planSlackEmojiReplacements([image('wide')],[image('wide',128,64)])[0].action).toBe('keep-existing');
  });
  it('never replaces aliases or guesses unknown metadata',()=>{
    const result=planSlackEmojiReplacements([image('alias'),image('unknown'),image('animation')],[{...image('alias',32,32),aliasFor:'other'},{name:'unknown'},{name:'animation',width:64,height:64}]);
    expect(result.map(r=>r.action)).toEqual(['keep-existing','manual-review','manual-review']);
  });
  it('requires review when aliases depend on the emoji being replaced',()=>{
    expect(planSlackEmojiReplacements([image('cat')],[image('cat',64,64),{name:'kitty',aliasFor:'cat'}])[0].action).toBe('manual-review');
  });
  it('does not fuzzy-match families or choose between duplicate names',()=>{
    expect(planSlackEmojiReplacements([image('meow_cat')],[image('cat',32,32)])[0].action).toBe('upload-new');
    expect(planSlackEmojiReplacements([image('cat')],[image('cat',32,32),image('cat',64,64)])[0].action).toBe('manual-review');
    expect(planSlackEmojiReplacements([image('cat'),image('cat')],[]).every(r=>r.action==='manual-review')).toBe(true);
  });
});
