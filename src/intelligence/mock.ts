import type { ModelAdapter, Source } from './contracts';
export const SYNTHETIC_TEXT = 'Offer: GBP 50,000 annually.';
export class MockModelAdapter implements ModelAdapter {
  async extract(source: Source): Promise<unknown> {
    if (source.text !== SYNTHETIC_TEXT) throw new Error('Mock supports only the built-in synthetic offer');
    return { source_id: source.id, base_revision: 999, candidates: [{ field: 'base', value: '50000', currency: 'GBP', period: 'annual',
      epistemic_type: 'counterparty_claim', confidence: 'high', confidence_rationale: 'The literal annual base is present in the synthetic source.',
      sensitivity: 'shareable', evidence: [{ source_id: source.id, quote: SYNTHETIC_TEXT }] }], unknowns: ['deadline'], conflicts: [] };
  }
  async advise(): Promise<unknown> {
    return { situation: 'The unresolved synthetic source states an annual base of GBP 50,000.',
      recommended_action: 'Can you review the proposed offer term?', intended_effect: 'Can you confirm the term before deciding?',
      rationale: 'The proposed base is a counterparty claim.', main_risk: 'Is the deadline still unknown?',
      alternative: 'Can you ask for the acceptance deadline?', decision_changing_question: 'What is your objective?',
      revision: 999, material_version: 999, unresolved_proposal_ids: ['proposal-base'], assumptions: [], draft: null,
      claims: [{ text: 'The unresolved synthetic source states an annual base of GBP 50,000.', output_path: '/situation', evidence_ids: ['synthetic-offer'], assertion_ids: [] },
        { text: 'The proposed base is a counterparty claim.', output_path: '/rationale', evidence_ids: ['synthetic-offer'], assertion_ids: [] }] };
  }
}
