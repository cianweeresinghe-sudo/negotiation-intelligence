# M1 cost, region and retention comparison

Decision status: proposed. Owner accepted M0 commit 683d71b in Buzz event 8eb3c0ce7800c98bec6598efab1683f8f7a653145f6a06f659faf5eec85bd262. Budget: $100/month, USD assumed. Researched 30 September 2026; estimates exclude tax and overages and require checkout verification. No services purchased.

| Option | Monthly infrastructure baseline | Region | Retention and tradeoff |
| --- | --- | --- | --- |
| Local synthetic demo | $0 incremental hosted services | Local machine | Synthetic data only; reproducible local Postgres/auth/storage and mock model. No provider processing or production availability. Recommended Monday path. |
| Supabase Pro + Render web and worker | About $39: $25 + $7 + $7 | Specific Frankfurt for DB and compute; Supabase also lists London, Render does not list UK | Managed auth/Postgres/private storage plus persistent worker. Supabase Pro DB backups retained 7 days, platform logs 7 days; storage objects are not in DB backups. Render log/platform retention needs confirmation before live data. |
| Supabase Pro + Vercel Pro + Render worker | About $52: $25 + $20 + $7, assuming one paid Vercel seat | Supabase London or Frankfurt; Render worker Frankfurt; Vercel runtime region requires explicit configuration/verification | Same database retention; separate execution platforms increase region/log policy work. More native Next.js hosting, higher baseline. Hobby restricted to personal non-commercial use. |

Recommendation: start local with a mock adapter now. For hosted staging, prefer the first managed combination if EU processing is acceptable and the small compute instances pass workload checks. London database alone does not establish UK-only processing: app, worker, logs, support and model processing must be considered separately. Region selection is not compliance assurance. If UK-only processing is required, revisit hosting before provisioning rather than silently mixing regions.

Budget envelope (planning allocation, not vendor quote): $39 infrastructure + $25 model/evaluation allowance + $10 staging allowance + $26 tax/overage/contingency = $100. Separate staging can exceed the allowance if it duplicates paid services; keep staging synthetic/local initially and verify isolated hosted environment costs before enabling it. No purchased domain, PITR or paid logging add-ons. Extra projects, compute and workspace charges must be checked. Supabase spend cap covers selected usage, not every possible charge. Enforce app-side model budget reservation, max tokens, timeouts and concurrency; a provider dashboard alert is not a hard total cap. Stop new paid work before the ceiling while preserving saved cases. Model allowance is a cap, not a throughput claim; model selection and token-cost forecast require fixture baseline.

Retention proposal for owner approval: active cases until user deletion; immediately revoke deleted-case access, cancel jobs and remove accessible originals/derived data. Existing database backups may retain deleted rows through their retention window. Maintain deletion tombstones outside restored case snapshots and reapply them before reopening a restore. Decide encrypted object backup/expiry separately because DB backups do not include objects. Do not store source text, drafts or private limits in routine logs. Confirm Render/Vercel platform logs and provider contracts; no blanket immediate-erasure promise. Model-provider region/retention is still unresolved, so hosted evaluation uses synthetic data only and live processing remains blocked pending policy and consent.

Next owner decision: approve local/mock development now and indicate whether EU hosting is acceptable or UK-only processing is required. Paid account setup is a later explicit step after review, not implied by spec acceptance.

Sources (official):
- [Supabase pricing](https://supabase.com/pricing): $25 Pro baseline/one micro credit, backup/log retention, Free inactivity pause.
- [Supabase regions](https://supabase.com/docs/guides/platform/regions): London and Frankfurt; primary region is a location control.
- [Supabase backups](https://supabase.com/docs/guides/platform/backups): storage objects excluded from DB backups.
- [Supabase cost controls](https://supabase.com/docs/guides/platform/cost-control): spend cap scope.
- [Render pricing](https://render.com/pricing): indexed Starter web/worker $7 each; verify dashboard quote before purchase.
- [Render regions](https://render.com/docs/regions): Frankfurt available; no UK region listed.
- [Vercel pricing](https://vercel.com/pricing) and [Hobby restrictions](https://vercel.com/docs/plans/hobby): Pro $20 baseline and personal/non-commercial Hobby restriction.
