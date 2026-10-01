import {z} from 'zod';
// Parse the HTTP shape instead of asserting that an unknown response fits the UI.
const content=z.object({draft:z.string().nullable(),claims:z.array(z.object({text:z.string(),assertion_ids:z.array(z.string()),evidence_ids:z.array(z.string())}).passthrough())}).passthrough();
export const adviceViewRow=z.object({id:z.string(),created_at:z.string(),stale:z.boolean(),include_private_constraints:z.boolean(),content,accepted_detail_count:z.number().optional(),sourceLabels:z.array(z.object({id:z.string(),label:z.string().nullable()})).optional(),snapshot:z.object({assertions:z.array(z.object({id:z.string(),source_id:z.string(),field:z.string(),value:z.string()}).passthrough()),evidence:z.array(z.object({id:z.string(),quote:z.string()}).passthrough())}).passthrough().optional()}).passthrough();
export const latestAdviceView=z.object({latest:adviceViewRow.nullable(),revision:z.number(),materialVersion:z.number(),includePrivateConstraints:z.boolean()}).passthrough();
export type AdviceViewRow=z.infer<typeof adviceViewRow>;
export type LatestAdviceView=z.infer<typeof latestAdviceView>;
