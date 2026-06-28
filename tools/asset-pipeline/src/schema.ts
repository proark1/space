import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Schema for pipeline.config.json (spec 07). This is the M0 SCAFFOLD: the config + its validator
 * + a CLI entry. The actual optimize / budget-check / manifest steps (gltf-transform + KTX2) land
 * in M2 (T36/T37); for now the only job is "the config parses against this schema".
 */

const GlbBudget = z.object({
  maxTris: z.number().int().positive(),
  maxDrawCalls: z.number().int().positive(),
  maxTexMemMB: z.number().positive(),
});

export const PipelineConfigSchema = z.object({
  budgets: z.object({
    slice_first_load_mb: z.number().positive(),
    per_glb: z.record(GlbBudget),
    scene_total: z.object({
      maxDrawCalls: z.number().int().positive(),
      maxTris: z.number().int().positive(),
      maxTexMemMB: z.number().positive(),
    }),
  }),
  codec: z.object({
    default: z.enum(['meshopt', 'draco']),
    dracoWhenBytesOver: z.number().int().positive(),
    ktx2: z.object({
      uastcSlots: z.array(z.string()),
      etc1sSlots: z.array(z.string()),
      uastc: z.object({ level: z.number().int(), rdo: z.number(), zstd: z.number().int() }),
      etc1s: z.object({ quality: z.number().int() }),
    }),
    lods: z.array(z.object({ ratio: z.number().positive(), error: z.number().min(0) })),
  }),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export const CONFIG_PATH = fileURLToPath(new URL('../pipeline.config.json', import.meta.url));

/** Read + validate the config; throws a ZodError if it doesn't match the schema. */
export function loadConfig(path: string = CONFIG_PATH): PipelineConfig {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return PipelineConfigSchema.parse(raw);
}
