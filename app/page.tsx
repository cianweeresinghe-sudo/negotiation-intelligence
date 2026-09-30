import { buildDemo } from '../src/intelligence/demo';
export default async function Home() {
  const demo = await buildDemo();
  return <main>
    <header><p className="eyebrow">Negotiation Intelligence</p><h1>A clearer next move</h1>
      <p>Local synthetic demonstration · deterministic mock · no live advice</p></header>
    <section><h2>Original source</h2><blockquote>{demo.source.text}</blockquote></section>
    <div className="columns"><section><h2>Proposed update</h2>
      <p className="badge">Pending review</p><p>Annual base: GBP {String(demo.proposals[0].value)}</p>
      <p>Counterparty claim · private</p><p>Evidence: “{demo.proposals[0].evidence[0].quote}”</p>
      <p>Review controls arrive in the ingestion/review milestone.</p></section>
      <section><h2>Accepted workbook</h2><p>No accepted assertions yet.</p>
        <p>Extracting a proposal does not change the workbook.</p></section></div>
    <section><h2>Next step</h2><p>{demo.advice.recommended_action}</p>
      <p>{demo.advice.situation}</p><p className="muted">Supporting source: synthetic-offer. This is unresolved material, not accepted state.</p></section>
    <footer>Only a built-in synthetic offer is processed. Accounts, uploads, persistence and sending are not enabled.</footer>
  </main>;
}
