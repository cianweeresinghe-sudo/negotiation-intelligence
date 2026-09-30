export type AcceptedAssertion=Readonly<{id:string;field:string;value:string;currency:string|null;period:string|null;epistemic_type:string;sensitivity:'private'|'shareable';outbound_quote_allowed:boolean;source_id:string;evidence_id:string;conflict_group_id:string|null}>;
export type AcceptedEvidence=Readonly<{id:string;source_id:string;assertion_id:string;quote:string}>;
export type AdviceSnapshot=Readonly<{revision:number;materialVersion:number;includePrivateConstraints:boolean;assertions:readonly AcceptedAssertion[];evidence:readonly AcceptedEvidence[];conflicts:readonly Readonly<{id:string;assertionIds:readonly string[]}>[];pendingProposalIds:readonly string[]}>;
export interface AdviceAdapter{readonly version:string;generate(snapshot:AdviceSnapshot,signal:AbortSignal):Promise<unknown>}
export function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
