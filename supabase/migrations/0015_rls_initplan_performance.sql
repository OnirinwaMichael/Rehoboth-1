-- 0015 — RLS performance: evaluate the role/identity helpers ONCE per query, not once per row.
-- Policies called is_staff() / current_staff_role() / has_role() / auth.uid() directly, so
-- Postgres re-ran a users lookup for every row it scanned (7,000+ patients).
-- Wrapping each call as (select fn()) makes it an init-plan: same result, evaluated once.
-- Semantics are unchanged (all four are STABLE). Verified before applying: 204 role x table
-- visibility counts identical before/after; patients full read ~97 ms -> ~5 ms.
--
-- Rollback (if ever needed): re-run this loop replacing '(select X())' with 'X()'.
create function pg_temp.wrap_rls(x text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(x,
    '(?<!SELECT )(public\.)?(is_staff|current_staff_role)\(\)', '(select \1\2())', 'g'),
    '(?<!SELECT )(public\.)?(has_role)\((''[A-Za-z_]+''::user_role)\)', '(select \1\2(\3))', 'g'),
    '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g') $f$;

do $mig$
declare r record; nq text; nw text; stmt text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check
           from pg_policies where schemaname = 'public' loop
    nq := pg_temp.wrap_rls(r.qual);
    nw := pg_temp.wrap_rls(r.with_check);
    if nq is distinct from r.qual or nw is distinct from r.with_check then
      stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if r.qual is not null then stmt := stmt || ' using (' || nq || ')'; end if;
      if r.with_check is not null then stmt := stmt || ' with check (' || nw || ')'; end if;
      execute stmt;
    end if;
  end loop;
end
$mig$;
