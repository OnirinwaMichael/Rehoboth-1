-- Permanently remove date of birth from every patient record, past
-- and future. Age remains a separate, independently-entered field
-- and is unaffected.
alter table public.patients drop column if exists dob;
