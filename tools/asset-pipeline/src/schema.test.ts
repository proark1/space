import { describe, it, expect } from 'vitest';
import { PipelineConfigSchema, loadConfig } from './schema';

describe('pipeline config', () => {
  it('the bundled pipeline.config.json validates against the schema', () => {
    const config = loadConfig();
    expect(config.budgets.slice_first_load_mb).toBe(25);
    expect(config.codec.default).toBe('meshopt');
    expect(config.budgets.per_glb.creature!.maxTris).toBe(25000);
    expect(config.budgets.scene_total.maxDrawCalls).toBe(150);
    expect(config.codec.lods.length).toBe(3);
  });

  it('rejects a malformed config', () => {
    expect(() => PipelineConfigSchema.parse({ budgets: {}, codec: {} })).toThrow();
  });
});
