alter table public.rooms
  add column generator_version integer not null default 4,
  add constraint rooms_generator_version_supported
    check (generator_version in (3, 4));
