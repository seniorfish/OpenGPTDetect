// ---------- Generate docs/schemas/ppl-scale-v1.schema.json ----------
// Run: npm run gen:schema -w @opengptdetect/core
// The Zod schema in src/scale.ts is the single source of truth; this derives the
// JSON Schema that Python (jsonschema) and community tooling validate against.
// Requires Node >= 23.6 (native type stripping).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { PplScaleProfileSchema } from '../src/scale.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../../../docs/schemas/ppl-scale-v1.schema.json')

const schema = z.toJSONSchema(PplScaleProfileSchema, { target: 'draft-2020-12' })
schema.$id =
  'https://raw.githubusercontent.com/seniorfish/OpenGPTDetect/main/docs/schemas/ppl-scale-v1.schema.json'
schema.title = 'PPL scale profile'
schema.description =
  'Shareable color-scale configuration: ppl->color stops plus text-classification guideline thresholds.'

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(schema, null, 2) + '\n')
console.log('wrote', OUT)
