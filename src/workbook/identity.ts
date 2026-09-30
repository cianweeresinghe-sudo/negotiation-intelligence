export const DEMO_OWNERS = { alice: '11111111-1111-4111-8111-111111111111', bob: '22222222-2222-4222-8222-222222222222' } as const;
// Identity is server configuration only. No request argument is accepted.
export function requireCurrentOwner(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ALLOW_SYNTHETIC_IDENTITY !== '1' || !['development','test'].includes(env.NODE_ENV ?? '')) throw new Error('Synthetic identity is disabled in production');
  const key = env.DEMO_USER;
  if (key !== 'alice' && key !== 'bob') throw new Error('Set DEMO_USER to alice or bob for synthetic development');
  return DEMO_OWNERS[key];
}
