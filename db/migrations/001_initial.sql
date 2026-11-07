CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'payroll_admin', 'payroll_operator', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_change_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  employee_no TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  tax_residency TEXT NOT NULL CHECK (tax_residency IN ('resident', 'non_resident')),
  nssf_mode TEXT NOT NULL DEFAULT 'standard' CHECK (nssf_mode IN ('standard', 'special', 'exempt')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGSERIAL PRIMARY KEY,
  pay_period CHAR(7) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  employee_count INTEGER NOT NULL DEFAULT 0,
  gross_cash_ugx BIGINT NOT NULL DEFAULT 0,
  taxable_income_ugx BIGINT NOT NULL DEFAULT 0,
  local_service_tax_ugx BIGINT NOT NULL DEFAULT 0,
  paye_ugx BIGINT NOT NULL DEFAULT 0,
  employee_nssf_ugx BIGINT NOT NULL DEFAULT 0,
  employer_nssf_ugx BIGINT NOT NULL DEFAULT 0,
  net_pay_ugx BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL REFERENCES app_users(id),
  approved_by BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id BIGSERIAL PRIMARY KEY,
  payroll_run_id BIGINT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  employee_no TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  tax_residency TEXT NOT NULL,
  nssf_mode TEXT NOT NULL,
  gross_cash_ugx BIGINT NOT NULL,
  taxable_income_ugx BIGINT NOT NULL,
  local_service_tax_ugx BIGINT NOT NULL,
  paye_ugx BIGINT NOT NULL,
  employee_nssf_ugx BIGINT NOT NULL,
  employer_nssf_ugx BIGINT NOT NULL,
  net_pay_ugx BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_items_run_idx ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS employees_active_idx ON employees(active);
