-- Migration 003: Register 'policy_access' as a first-class module in the Permission Matrix
-- Run this ONCE against the live database.

-- 1. Insert the new module (idempotent)
INSERT INTO public.modules (module_name, display_name, is_active)
VALUES ('policy_access', 'Policy Access Control', TRUE)
ON CONFLICT (module_name) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_active    = EXCLUDED.is_active;

-- 2. Grant Super Admin all operations on the new module (idempotent)
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name = 'Super Admin'
  AND  m.module_name = 'policy_access'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- 3. Grant Admin read-only access to Policy Access Control
INSERT INTO public.role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM   public.roles r
CROSS  JOIN public.modules m
CROSS  JOIN public.operations o
WHERE  r.role_name = 'Admin'
  AND  m.module_name = 'policy_access'
  AND  o.operation_name = 'read'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;
