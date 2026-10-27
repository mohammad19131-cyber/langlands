-- Catalog check for 0012. Run as postgres on the rehearsal database only.
-- Does not print hashes or connection details. Expected:
--   authenticated.password_hash = false
--   anon.* = false
--   authenticated public columns = true
--   service_role.password_hash = true

select
  role_name,
  column_name,
  has_column_privilege(role_name, 'public.teams'::regclass, column_name, 'SELECT') as can_select
from (
  values
    ('anon'),
    ('authenticated'),
    ('service_role')
) as roles(role_name)
cross join (
  values
    ('id'),
    ('competition_id'),
    ('seat'),
    ('name'),
    ('slug'),
    ('disqualified'),
    ('login_id'),
    ('password_hash')
) as cols(column_name)
order by 1, 2;
