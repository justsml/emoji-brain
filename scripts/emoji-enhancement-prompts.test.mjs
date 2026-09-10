import { describe, it, expect } from 'vitest';
import { planEnhancement } from './emoji-enhancement-prompts.mjs';
describe('enhancement routing', () => {
  it('combines subject constraints with rendering and verified text', () => {
    const plan = planEnhancement({ kind: 'illustration', subject: 'brown tabby cat', text: { mode: 'exact', lines: ['10/10'] } });
    expect(plan.prompt).toContain('brown tabby cat');
    expect(plan.prompt).toContain('10/10');
    expect(plan.acceptanceChecks).toContain('same species, markings and defining features');
  });
  it('blocks text uncertainty rather than guessing from a label', () => {
    const plan = planEnhancement({ kind: 'flat', text: { mode: 'unknown' } });
    expect(plan.status).toBe('needs-review');
    expect(plan.prompt).toBeNull();
  });
  it('requires a usable reference for a named photo subject', () => {
    expect(planEnhancement({ kind: 'photo', identity: 'Henry Winkler as Fonzie', text: { mode: 'none' } }).status).toBe('needs-review');
    expect(planEnhancement({ kind: 'photo', identity: 'Henry Winkler as Fonzie', identityReferenceVerified: true, text: { mode: 'none' } }).status).toBe('ready');
  });
  it('keeps verified text literal and disallows ambiguous configuration', () => {
    const plan = planEnhancement({ kind: 'illustration', text: { mode: 'exact', lines: ['10/10', 'A "quote"'] } });
    expect(plan.prompt).toContain(JSON.stringify(['10/10', 'A "quote"']));
    expect(() => planEnhancement({ kind: 'flat', text: { mode: 'exact', lines: [] } })).toThrow();
    expect(() => planEnhancement({ kind: 'flat', text: { mode: 'none', lines: ['oops'] } })).toThrow();
  });
  it('requires transparency postprocessing and review for every style', () => {
    for (const kind of ['photo', 'flat', 'illustration']) {
      const plan = planEnhancement({ kind, text: { mode: 'none' } });
      expect(plan.status).toBe('ready');
      expect(plan.postprocess.required).toBe(true);
      expect(plan.autoReplace).toBe(false);
    }
  });
});
