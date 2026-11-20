
-- 1. Default Operations
INSERT INTO operations (operation_name, display_name)
VALUES
    ('create', 'Create'),
    ('read', 'Read'),
    ('update', 'Update'),
    ('delete', 'Delete'),
    ('export', 'Export'),
    ('import', 'Import'),
    ('approval', 'Approval')
ON CONFLICT (operation_name) DO NOTHING;


-- Register the Predefined Module by Developers
INSERT INTO modules (module_name, display_name, is_active)
VALUES
    ('users', 'User Management', TRUE),
    ('roles', 'Role Management', TRUE),
    ('permissions', 'Permission Management', TRUE),
    ('userrole', 'User Role Management', TRUE), 
    ('usersrequest', 'New User Request Management', TRUE),
    ('templates', 'Template Management', TRUE),
    ('libraries', 'Library Management', TRUE),
    ('policy_access', 'Policy Access Control', TRUE),
    ('documents', 'Policy & Document Management', TRUE)
ON CONFLICT (module_name) DO NOTHING;

-- Default Roles
INSERT INTO roles (role_name, description, is_active)
VALUES
    ('Super Admin', 'Full unrestricted access to all modules and operations', TRUE),
    ('Admin', 'Administrator access with permission to manage users and roles', TRUE),
    ('User', 'Standard user with basic access', TRUE),
    ('Department admin', 'Department-scoped policy access and first-level policy review', TRUE)
ON CONFLICT (role_name) DO NOTHING;


-- Grant Super Admin all operations on all modules
INSERT INTO role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM roles r
CROSS JOIN modules m
CROSS JOIN operations o
WHERE r.role_name = 'Super Admin'
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;

-- Grant Admin full access to users and roles modules
INSERT INTO role_permissions (role_id, module_id, operation_id)
SELECT r.id, m.id, o.id
FROM roles r
CROSS JOIN modules m
CROSS JOIN operations o
WHERE r.role_name = 'Admin'
  AND m.module_name IN ('users', 'roles', 'permissions')
ON CONFLICT (role_id, module_id, operation_id) DO NOTHING;
