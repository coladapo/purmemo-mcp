-- Authentication and Multi-tenancy Schema
-- This extends the base schema with user management and tenant isolation

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free', -- free, starter, pro, enterprise
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb,
    
    -- Indexes
    INDEX idx_tenants_slug (slug),
    INDEX idx_tenants_plan (plan)
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- admin, owner, member, guest
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    INDEX idx_users_email (email),
    INDEX idx_users_tenant_id (tenant_id),
    INDEX idx_users_tenant_role (tenant_id, role)
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- memories, users, tenants, etc.
    action VARCHAR(50) NOT NULL, -- create, read, update, delete, manage
    
    -- Indexes
    INDEX idx_permissions_resource (resource),
    UNIQUE (resource, action)
);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(50) NOT NULL,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    
    PRIMARY KEY (role, permission_id),
    INDEX idx_role_permissions_role (role)
);

-- User sessions table (for session-based auth)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Indexes
    INDEX idx_user_sessions_user_id (user_id),
    INDEX idx_user_sessions_token_hash (token_hash),
    INDEX idx_user_sessions_expires_at (expires_at)
);

-- Password history table (for password policy)
CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_password_history_user_id (user_id),
    INDEX idx_password_history_created_at (created_at)
);

-- OAuth connections table
CREATE TABLE IF NOT EXISTS oauth_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- google, github, microsoft, etc.
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    UNIQUE (provider, provider_user_id),
    INDEX idx_oauth_connections_user_id (user_id)
);

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    invited_by UUID NOT NULL REFERENCES users(id),
    token VARCHAR(255) NOT NULL UNIQUE,
    accepted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Indexes
    INDEX idx_invitations_tenant_id (tenant_id),
    INDEX idx_invitations_email (email),
    INDEX idx_invitations_token (token)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_audit_logs_tenant_id (tenant_id),
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_created_at (created_at),
    INDEX idx_audit_logs_resource (resource_type, resource_id)
);

-- Update existing tables for multi-tenancy
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private'; -- private, team, public

-- Add foreign key constraints after column exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memories_tenant_id_fkey') THEN
        ALTER TABLE memories ADD CONSTRAINT memories_tenant_id_fkey 
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memories_created_by_fkey') THEN
        ALTER TABLE memories ADD CONSTRAINT memories_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add indexes for multi-tenancy
CREATE INDEX IF NOT EXISTS idx_memories_tenant_id ON memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_by ON memories(created_by);
CREATE INDEX IF NOT EXISTS idx_memories_tenant_visibility ON memories(tenant_id, visibility);

-- Update entities table for multi-tenancy
ALTER TABLE entities ADD COLUMN IF NOT EXISTS tenant_id UUID;
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_tenant_id_fkey') THEN
        ALTER TABLE entities ADD CONSTRAINT entities_tenant_id_fkey 
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_entities_tenant_id ON entities(tenant_id);

-- Update api_keys table for better integration
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_tenant_id_fkey') THEN
        ALTER TABLE api_keys ADD CONSTRAINT api_keys_tenant_id_fkey 
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Default permissions
INSERT INTO permissions (name, description, resource, action) VALUES
    ('memories.create', 'Create memories', 'memories', 'create'),
    ('memories.read', 'Read memories', 'memories', 'read'),
    ('memories.update', 'Update memories', 'memories', 'update'),
    ('memories.delete', 'Delete memories', 'memories', 'delete'),
    ('memories.manage', 'Manage all memories', 'memories', 'manage'),
    ('users.read', 'View users', 'users', 'read'),
    ('users.manage', 'Manage users', 'users', 'manage'),
    ('tenants.manage', 'Manage tenant settings', 'tenants', 'manage'),
    ('billing.manage', 'Manage billing', 'billing', 'manage')
ON CONFLICT (resource, action) DO NOTHING;

-- Default role permissions
INSERT INTO role_permissions (role, permission_id) 
SELECT 'member', id FROM permissions WHERE name IN (
    'memories.create', 'memories.read', 'memories.update', 'memories.delete'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id) 
SELECT 'admin', id FROM permissions WHERE name NOT IN (
    'billing.manage'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role, permission_id) 
SELECT 'owner', id FROM permissions ON CONFLICT DO NOTHING;

-- Row-level security policies
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memories
CREATE POLICY memories_tenant_isolation ON memories
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY memories_visibility ON memories
    FOR SELECT
    USING (
        visibility = 'public' OR
        (visibility = 'team' AND tenant_id = current_setting('app.current_tenant_id')::uuid) OR
        (visibility = 'private' AND created_by = current_setting('app.current_user_id')::uuid)
    );

-- RLS Policies for entities
CREATE POLICY entities_tenant_isolation ON entities
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- RLS Policies for users
CREATE POLICY users_tenant_isolation ON users
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Functions for tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id UUID, user_id UUID)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', tenant_id::text, true);
    PERFORM set_config('app.current_user_id', user_id::text, true);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup old sessions function
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    DELETE FROM invitations WHERE expires_at < CURRENT_TIMESTAMP AND accepted = false;
END;
$$ LANGUAGE plpgsql;