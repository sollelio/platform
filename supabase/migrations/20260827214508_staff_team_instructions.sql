-- =============================================================================
-- Sollelio v2 — Operational Staff MVP · Step 6 · Fixed team instructions
-- Migration: 20260827214508_staff_team_instructions.sql
--
-- Additive. Creates one relation. It alters no Point 1 object, changes no
-- Step 1/3/4/5 rule, adds no permission, and depends on no Events Core
-- relation.
--
-- DOMAIN: what the team is told to bring and wear is a rule of the HOUSE, not
-- of an event. It is the same sentence every time — the uniform, the badge,
-- meals, water — so it is written once per organization and reproduced at the
-- foot of every individual plan. There is deliberately no per-event override:
-- the business decision is that these are fixed, and a schema that allowed
-- exceptions would invite them.
--
-- Two texts, not one, because they are used differently: the standard block is
-- always printed, and the hot-weather block is a clearly labelled contingency
-- printed underneath it. No weather is detected anywhere in this MVP — nobody
-- calls an API and nothing guesses. The section is simply always there, headed
-- so a person reads it as "if it is a scorcher, also bring…".
--
-- The wording itself is DATA, entered by the house through the backoffice.
-- Nothing in this file, in the application, or in any test contains a real
-- organization's actual instructions.
--
-- NO PERMISSION IS ADDED: these instructions are part of the team catalogue
-- that Step 1 already governs. Reading them needs staff.read, writing them
-- staff.manage — the same keys that already govern who the team is. A separate
-- key would be a boundary without a difference.
--
-- PLANS ARE NOT STORED: an individual plan is a live projection of current
-- assignments, current tasks and current event data, computed when it is
-- looked at. Nothing is snapshotted, so nothing can go stale, and there is no
-- second copy of the truth to reconcile when a task moves.
--
-- AUDIT: as in the earlier steps, attribution lives on the row and no audit
-- trigger is installed; the reusable helper belongs to E1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Relations.
-- -----------------------------------------------------------------------------

-- One row per organization: the organization IS the key. A house has one set
-- of standing instructions, so there is nothing to disambiguate and no way to
-- accumulate rival copies.
create table if not exists public.staff_team_instructions (
    organization_id uuid not null references public.organizations (id) on delete cascade,
    standard_instructions text,
    hot_weather_instructions text,
    created_at timestamptz not null default now(),
    created_by uuid references public.user_profiles (user_id) on delete set null,
    updated_at timestamptz,
    updated_by uuid references public.user_profiles (user_id) on delete set null,
    constraint staff_team_instructions_pkey primary key (organization_id),
    -- blank is stored as NULL, never as an empty string: "not written yet" and
    -- "written, and empty" would otherwise be indistinguishable on the plan
    constraint staff_team_instructions_standard_not_blank
        check (standard_instructions is null or btrim(standard_instructions) <> ''),
    constraint staff_team_instructions_hot_not_blank
        check (hot_weather_instructions is null or btrim(hot_weather_instructions) <> ''),
    constraint staff_team_instructions_standard_length
        check (standard_instructions is null or length(standard_instructions) <= 4000),
    constraint staff_team_instructions_hot_length
        check (hot_weather_instructions is null or length(hot_weather_instructions) <= 4000)
);

-- -----------------------------------------------------------------------------
-- 2. Row level security. Enable, never force, as in every earlier step.
-- -----------------------------------------------------------------------------

alter table public.staff_team_instructions enable row level security;

drop policy if exists staff_team_instructions_select on public.staff_team_instructions;
create policy staff_team_instructions_select on public.staff_team_instructions for select
    using (public.has_permission(organization_id, 'staff.read')
        or public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_team_instructions_insert on public.staff_team_instructions;
create policy staff_team_instructions_insert on public.staff_team_instructions for insert
    with check (public.has_permission(organization_id, 'staff.manage'));
drop policy if exists staff_team_instructions_update on public.staff_team_instructions;
create policy staff_team_instructions_update on public.staff_team_instructions for update
    using      (public.has_permission(organization_id, 'staff.manage'))
    with check (public.has_permission(organization_id, 'staff.manage'));
-- no DELETE policy: instructions are cleared by emptying them, not by removing
-- the row — the row is the house's slot for them and outlives any wording

-- -----------------------------------------------------------------------------
-- 3. Privileges. As everywhere else, revoke the baseline's standing grant
--    first, then hand back column by column, to authenticated only.
-- -----------------------------------------------------------------------------

revoke all on table public.staff_team_instructions from public, anon, authenticated;

grant select on public.staff_team_instructions to authenticated;
grant insert (organization_id, standard_instructions, hot_weather_instructions)
      on public.staff_team_instructions to authenticated;
-- NOT organization_id: a set of instructions never moves house
grant update (standard_instructions, hot_weather_instructions, updated_at, updated_by)
      on public.staff_team_instructions to authenticated;
