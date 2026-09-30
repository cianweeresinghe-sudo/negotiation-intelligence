import Ajv2020 from 'ajv/dist/2020.js';
import extractionSchema from '../../contracts/EXTRACTION.schema.json';
import adviceSchema from '../../contracts/ADVICE.schema.json';
const ajv = new Ajv2020({ allErrors: true, strict: false });
const extractionValidator = ajv.compile(extractionSchema);
const adviceValidator = ajv.compile(adviceSchema);
export function validateExtraction(value: unknown): asserts value is Extraction {
  if (!extractionValidator(value)) throw new Error('Invalid extraction contract');
}
export function validateAdvice(value: unknown): asserts value is Advice {
  if (!adviceValidator(value)) throw new Error('Invalid advice contract');
}
export type Sensitivity = 'private' | 'shareable';
export type Source = { id: string; text: string; sensitivity: Sensitivity };
export type Candidate = {
  field: string; value: unknown; currency: string | null; period: string | null;
  epistemic_type: string; confidence: string; confidence_rationale: string;
  sensitivity: Sensitivity; evidence: { source_id: string; quote: string }[];
};
export type Extraction = { source_id: string; base_revision: number; candidates: Candidate[]; unknowns: string[]; conflicts: string[] };
export type Claim = { text: string; output_path: string; evidence_ids: string[]; assertion_ids: string[] };
export type Advice = { situation: string; recommended_action: string; intended_effect: string;
  rationale: string; main_risk: string; alternative: string; decision_changing_question: string;
  revision: number; material_version: number; unresolved_proposal_ids: string[];
  assumptions: string[]; draft: string | null; claims: Claim[] };
export type Context = { revision: number; materialVersion: number;
  evidenceIds: string[]; assertionIds: string[]; unresolvedProposalIds: string[] };
export interface ModelAdapter {
  extract(source: Source): Promise<unknown>;
  advise(): Promise<unknown>;
}
