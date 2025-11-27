-- 1. Create roles enum type
CREATE TYPE user_role AS ENUM ('admin', 'user');

-- 2. Update profiles table to use the enum
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

-- 3. Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    role user_role NOT NULL,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role, permission_id)
);

-- 5. Insert default permissions
INSERT INTO permissions (name, description) VALUES
    ('manage_users', 'Can create, edit, and delete users'),
    ('manage_bookings', 'Can view and manage all bookings'),
    ('manage_payments', 'Can view and manage all payments'),
    ('manage_inventory', 'Can manage rental items and stock'),
    ('view_reports', 'Can view system reports and analytics'),
    ('manage_system', 'Can manage system settings')
ON CONFLICT (name) DO NOTHING;

-- 6. Assign permissions to roles
INSERT INTO role_permissions (role, permission_id) 
SELECT 'admin', id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id) 
SELECT 'user', id FROM permissions WHERE name IN ('manage_bookings', 'manage_payments')
ON CONFLICT DO NOTHING;

-- 7. Update existing users to have roles (set first user as admin, others as users)
UPDATE profiles 
SET role = 'admin' 
WHERE id IN (
    SELECT id FROM profiles 
    ORDER BY created_at 
    LIMIT 1
);

UPDATE profiles 
SET role = 'user' 
WHERE role IS NULL;

-- 8. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);