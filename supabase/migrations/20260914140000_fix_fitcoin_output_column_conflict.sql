-- OUT-parameter names from the Fitcoin RPCs intentionally match the API
-- response fields. In PL/pgSQL they must not shadow wallet column reads.
-- Recreate the affected functions with the safe per-function resolution rule
-- for already-migrated production databases.
do $migration$
declare
  v_definition text;
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.fitcoin_begin_analysis(uuid,text,text,bigint)'::regprocedure,
    'public.fitcoin_fail_analysis(uuid,uuid,text,text)'::regprocedure,
    'public.fitcoin_finalize_analysis(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position('#variable_conflict use_column' in v_definition) = 0 then
      v_definition := replace(
        v_definition,
        E'AS $function$\n',
        E'AS $function$\n#variable_conflict use_column\n'
      );
      execute v_definition;
    end if;
  end loop;
end;
$migration$;
