-- Allow a custom staff day to repeat every two, three, or four weeks.
-- Existing rows remain weekly because the default is one week.
alter table public.staff_hours
  add column if not exists repeat_weeks smallint not null default 1,
  add column if not exists repeat_anchor date;

alter table public.staff_hours
  drop constraint if exists staff_hours_repeat_weeks_check;

alter table public.staff_hours
  add constraint staff_hours_repeat_weeks_check
  check (repeat_weeks between 1 and 4);

comment on column public.staff_hours.repeat_weeks is
  '1 for weekly; 2-4 for a custom shift that repeats every N weeks.';

comment on column public.staff_hours.repeat_anchor is
  'A working occurrence used as the recurrence anchor when repeat_weeks > 1.';
