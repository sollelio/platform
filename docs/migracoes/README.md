# docs/migracoes/ — histórico e validação, NÃO a cadeia executável

**A cadeia executável e canónica do esquema é `supabase/migrations/`.**
Uma migração só é real (reprodutível) quando existe lá.

## O que vive aqui

- **Migrações numeradas (`020`–`110`)** — artefactos históricos/de
  referência. Guardam a intenção e as notas de cada passo. Nunca são fonte
  de verdade para deploy.
  - `020`–`108` estão todas contidas no baseline
    `supabase/migrations/20260821024034_legacy_production_baseline.sql`
    (esquema de produção auditado a 21/08/2026).
  - `109` e `110` foram escritas aqui depois do baseline e aplicadas à mão —
    foi assim que o TEST, reconstruído pela cadeia canónica, ficou para
    trás. As cópias canónicas são:
    - `109` → `supabase/migrations/20260910163011_legacy_109_demand_loss_and_repeat_contact_trace.sql`
    - `110` → `supabase/migrations/20260924120521_legacy_110_request_attribution_and_authorship.sql`
      (sem o `begin;`/`commit;` próprio — o CLI já corre cada migração
      numa transacção).
- **Scripts de validação (`validacao_*.sql`)** — continuam aqui; correm-se
  antes/depois de aplicar a migração correspondente.
- **Scripts avulsos** (`inventario_*`, `limpeza_dados_teste.sql`,
  `semear-comunicado-condicoes.sql`, `form_errors.sql`) — operacionais ou
  de conteúdo, não fazem parte do esquema.

## Regras

1. **Toda a migração nova nasce em `supabase/migrations/`** (timestamp
   UTC + nome descritivo). Nada de migrações novas só aqui.
2. **Não se avança um ambiente à mão** (SQL editor) sem reconciliar o
   ledger da cadeia canónica (`supabase migration repair --status applied
   <timestamp>`, depois de provar que o esquema corresponde).
3. As cópias numeradas de 109/110 não se editam para «corrigir» — a
   versão que conta é a timestamped.
4. O guarda `src/lib/cadeiaMigracoes.test.mjs` (corre no `npm test`)
   falha se aparecer uma migração numerada nova aqui sem a cópia canónica.
