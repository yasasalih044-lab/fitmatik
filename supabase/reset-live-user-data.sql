-- Fit-matik production user-data reset (IRREVERSIBLE)
--
-- Run this file ONLY in the intended production Supabase SQL editor after:
--   1. the staging deployment has passed its complete smoke test, and
--   2. the new application version has been deployed or maintenance mode is on.
--
-- This intentionally removes application USER DATA only. It does not touch
-- application source, domain configuration, environment secrets, or static
-- brand assets. The surrounding transaction gives all-or-nothing semantics.

begin;

-- Ledger ve AI makbuzları normal uygulama işleminde değişmezdir. Hesap
-- silinirken FK cascade bu satırları da silmek zorunda olduğundan, yalnızca bu
-- kontrollü reset işlemi için kullanıcı-tetikleyicilerini geçici kapatıyoruz.
-- Bu SQL Editor'de proje sahibi/postgres rolüyle çalıştırılmalıdır. Hata olursa
-- transaction rollback'i bu DDL değişikliklerini de geri alır.
alter table public.fitcoin_ledger disable trigger fitcoin_ledger_immutable;
alter table public.ai_usage_receipts disable trigger ai_usage_receipts_immutable;

-- New relational accounts cascade to their entries, wallets, ledger rows,
-- analysis runs, and provider usage receipts.
delete from public.app_accounts;

alter table public.ai_usage_receipts enable trigger ai_usage_receipts_immutable;
alter table public.fitcoin_ledger enable trigger fitcoin_ledger_immutable;

-- Eski telefon/IP HMAC sayaçları kullanıcılar yeniden kayıt olurken onları
-- engellemesin; ham IP veya telefon zaten bu tabloda hiç tutulmaz.
delete from public.signup_rate_limits;

-- The legacy table might not exist because the old application normally used
-- Storage. Clear it when it does, without failing an otherwise valid reset.
do $$
begin
  if to_regclass('public.entries') is not null then
    execute 'truncate table public.entries';
  end if;
end;
$$;

-- Remove old object-store account records and immutable meal log objects.
delete from storage.objects
where bucket_id = 'fitmatik'
  and (name like 'accounts/%' or name like 'log/%');

-- Old meal photos were stored at YYYY-MM-DD/<uuid>.<extension>. Limit the
-- deletion to that generated shape so unrelated static files are untouched.
delete from storage.objects
where bucket_id = 'fitmatik'
  and name ~ E'^\\d{4}-\\d{2}-\\d{2}/[0-9a-f-]+\\.(jpg|jpeg|png|webp|heic)$';

-- This bucket is dedicated to the new, private account-scoped meal images.
delete from storage.objects
where bucket_id = 'fitmatik-private';

commit;
