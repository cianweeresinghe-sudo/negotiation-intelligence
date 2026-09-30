import { z } from 'zod';
export const revision = z.number().int().min(0).max(2147483646);
export const createCaseInput = z.object({ title: z.string().trim().min(1).max(120) }).strict();
export const updateCaseInput = z.object({ title: z.string().trim().min(1).max(120), expectedRevision: revision }).strict();
export const entryInput = z.object({
 field: z.enum(['base','minimum_base','deadline','objective','alternative','note']), value: z.string().trim().min(1).max(2000),
 currency: z.string().regex(/^[A-Z]{3}$/).nullable(), period: z.enum(['annual','monthly','one_time']).nullable(),
 epistemicType: z.enum(['documented_observation','counterparty_claim','user_assumption','user_constraint']),
 sensitivity: z.enum(['private','shareable']).default('private'), expectedRevision: revision,
 recordConflict: z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
 if (['base','minimum_base'].includes(input.field) && (!/^\d{1,12}(\.\d{1,2})?$/.test(input.value) || !input.currency || !input.period)) ctx.addIssue({ code:'custom', message:'Money requires decimal text, currency and period' });
 if (input.field==='minimum_base' && (input.epistemicType!=='user_constraint' || input.sensitivity!=='private')) ctx.addIssue({ code:'custom', message:'Minimum base is a private user constraint' });
});
export const deleteInput = z.object({ expectedRevision: revision }).strict();
export const resolveInput = z.object({ expectedRevision: revision, keepAssertionId: z.uuid() }).strict();
export type EntryInput = z.infer<typeof entryInput>;
