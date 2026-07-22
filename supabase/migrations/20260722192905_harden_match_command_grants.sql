revoke all on table public.match_commands from service_role;
grant select, insert on table public.match_commands to service_role;

revoke all on sequence public.match_commands_id_seq from service_role;
grant usage, select on sequence public.match_commands_id_seq to service_role;
