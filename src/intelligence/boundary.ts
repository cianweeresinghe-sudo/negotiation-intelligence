import { validateAdvice, validateExtraction, type ModelAdapter, type Source, type Context, type Advice } from './contracts';
export async function extractProposals(adapter: ModelAdapter, source: Source, revision: number) {
  const raw = await adapter.extract({ ...source });
  validateExtraction(raw);
  if (raw.source_id !== source.id) throw new Error('Source mismatch');
  return { ...raw, base_revision: revision, candidates: raw.candidates.map(candidate => ({
    ...candidate, sensitivity: source.sensitivity === 'private' || candidate.sensitivity === 'private' ? 'private' as const : 'shareable' as const,
    outbound_quote_allowed: false,
  })) };
}
// Conservative scaffold check, not a semantic truth/coverage evaluator. Every
// declarative sentence in displayed prose requires an exact per-path claim.
export function checkClaimCoverage(advice: Advice, context: Context): string[] {
  const problems: string[] = [];
  const prose = ['situation', 'recommended_action', 'intended_effect', 'rationale', 'main_risk', 'alternative', 'decision_changing_question', 'draft'] as const;
  for (const claim of advice.claims) {
    const key = claim.output_path.slice(1);
    if (!(prose as readonly string[]).includes(key) || typeof advice[key as keyof Advice] !== 'string' ||
      !(advice[key as keyof Advice] as string).includes(claim.text)) problems.push('Claim is not present at its output path');
    if (!claim.evidence_ids.length && !claim.assertion_ids.length) problems.push('Claim has no support');
    if (claim.evidence_ids.some(id => !context.evidenceIds.includes(id)) || claim.assertion_ids.some(id => !context.assertionIds.includes(id))) problems.push('Unknown supporting reference');
  }
  for (const key of prose) {
    const value = advice[key];
    if (!value) continue;
    for (const sentence of value.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)) {
      if (sentence.endsWith('?')) continue;
      if (!advice.claims.some(c => c.output_path === `/${key}` && c.text === sentence && (c.evidence_ids.length || c.assertion_ids.length))) problems.push(`Uncovered statement at /${key}`);
    }
  }
  return problems;
}
export async function getAdvice(adapter: ModelAdapter, context: Context) {
  const raw = await adapter.advise();
  validateAdvice(raw);
  const advice = { ...raw, revision: context.revision, material_version: context.materialVersion };
  if (advice.unresolved_proposal_ids.some(id => !context.unresolvedProposalIds.includes(id))) throw new Error('Unknown proposal reference');
  const problems = checkClaimCoverage(advice, context);
  if (problems.length) throw new Error(`Advice blocked: ${problems.join('; ')}`);
  return { ...advice,
    evidence_ids: [...new Set(advice.claims.flatMap(c => c.evidence_ids))],
    assertion_ids: [...new Set(advice.claims.flatMap(c => c.assertion_ids))] };
}
