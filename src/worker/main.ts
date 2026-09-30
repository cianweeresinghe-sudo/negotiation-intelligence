import { buildDemo } from '../intelligence/demo';
// One-shot mock execution harness; a persistent queue is a separate M1 issue.
await buildDemo();
console.log(JSON.stringify({ adapter: 'mock', status: 'complete', synthetic: true }));
