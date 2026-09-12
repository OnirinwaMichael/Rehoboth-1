-- Age becomes free text so it can describe babies ("3 months",
-- "2 weeks") and very old patients ("90+", "advanced age") instead
-- of being forced into a whole-number-of-years integer. Existing
-- numeric ages are preserved as their text form (e.g. 45 -> '45').
-- The 0-150 numeric range check no longer applies to free text.
alter table public.patients drop constraint patients_age_check;
alter table public.patients alter column age type text using age::text;
