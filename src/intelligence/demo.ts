import { MockModelAdapter, SYNTHETIC_TEXT } from './mock';
import { extractProposals, getAdvice } from './boundary';
export async function buildDemo() {
  const source = { id: 'synthetic-offer', text: SYNTHETIC_TEXT, sensitivity: 'private' as const };
  const adapter = new MockModelAdapter();
  const extraction = await extractProposals(adapter, source, 0);
  const advice = await getAdvice(adapter, { revision: 0, materialVersion: 1,
    evidenceIds: ['synthetic-offer'], assertionIds: [], unresolvedProposalIds: ['proposal-base'] });
  return { source, proposals: extraction.candidates, acceptedAssertions: [], advice };
}
