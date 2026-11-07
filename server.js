"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const { Pool } = require("pg");
const { calculatePayrollItem, ugx, RESIDENT_PAYER_VERSION } = require("./lib/payroll");

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || "";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
if (sessionSecret.length < 32) throw new Error("Set SESSION_SECRET to a random value of at least 32 characters.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: production && process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
pool.on("error", (error) => console.error("Unexpected database pool error:", error.message));

const app = express();
if (production) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => { req.body = req.body || {}; next(); });
app.use(session({
  name: "payroll.sid",
  secret: sessionSecret,
  store: new (connectPgSimple(session))({
    pool,
    tableName: "http_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function text(value, name, max = 120) {
  if (typeof value !== "string") throw new Error(name + " is required.");
  const clean = value.trim();
  if (!clean || clean.length > max) throw new Error(name + " must be between 1 and " + max + " characters.");
  return clean;
}

function email(value) {
  const result = text(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error("Enter a valid email address.");
  return result;
}

function validPeriod(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) return reject(error);
      resolve("scrypt$" + salt.toString("hex") + "$" + derived.toString("hex"));
    });
  });
}

function verifyPassword(password, saved) {
  return new Promise((resolve, reject) => {
    const parts = String(saved).split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return resolve(false);
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    crypto.scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, actual) => {
      if (error) return reject(error);
      resolve(actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
    });
  });
}

function safeUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    role: user.role,
    password_change_required: Boolean(user.password_change_required)
  };
}

async function audit(client, actorId, eventType, resourceType, resourceId, details = {}) {
  await client.query(
    "INSERT INTO audit_events (actor_user_id, event_type, resource_type, resource_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [actorId || null, eventType, resourceType, resourceId == null ? null : String(resourceId), JSON.stringify(details)]
  );
}

async function currentUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Sign in is required." });
  const result = await pool.query(
    "SELECT id, email, role, active, password_change_required FROM app_users WHERE id = $1",
    [req.session.userId]
  );
  const user = result.rows[0];
  if (!user || !user.active) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "This account is inactive. Contact the system owner." });
  }
  req.user = user;
  next();
}

function readyUser(req, res, next) {
  if (req.user.password_change_required) {
    return res.status(403).json({ error: "Change your temporary password before using the payroll system." });
  }
  next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission to do that." });
    next();
  };
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
}));

app.get("/api/csrf", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken: req.session.csrfToken });
});

const csrfProtection = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const sent = req.get("x-csrf-token") || "";
  const stored = req.session.csrfToken || "";
  const sentBuffer = Buffer.from(sent);
  const storedBuffer = Buffer.from(stored);
  if (!stored || sentBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(sentBuffer, storedBuffer)) {
    return res.status(403).json({ error: "Security token expired. Reload the page and try again." });
  }
  next();
};
app.use("/api", csrfProtection);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." }
});

app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
  const accountEmail = email(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const found = await pool.query(
    "SELECT id, email, password_hash, role, active, password_change_required FROM app_users WHERE email = $1",
    [accountEmail]
  );
  const user = found.rows[0];
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !user.active || !valid) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = String(user.id);
  req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
  await audit(pool, user.id, "auth.login", "user", user.id);
  res.json({ user: safeUser(user), csrfToken: req.session.csrfToken });
}));

app.post("/api/auth/logout", currentUser, asyncRoute(async (req, res) => {
  await audit(pool, req.user.id, "auth.logout", "user", req.user.id);
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie("payroll.sid", { httpOnly: true, secure: production, sameSite: "strict" });
  res.status(204).end();
}));

app.get("/api/auth/me", currentUser, (req, res) => res.json({ user: safeUser(req.user) }));

app.post("/api/auth/password", currentUser, asyncRoute(async (req, res) => {
  const current = typeof req.body.current_password === "string" ? req.body.current_password : "";
  const nextPassword = typeof req.body.new_password === "string" ? req.body.new_password : "";
  const stored = await pool.query("SELECT password_hash FROM app_users WHERE id = $1", [req.user.id]);
  if (!stored.rows[0] || !(await verifyPassword(current, stored.rows[0].password_hash))) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  if (nextPassword.length < 14 || nextPassword.length > 200) {
    return res.status(400).json({ error: "Choose a password with at least 14 characters." });
  }
  const newHash = await hashPassword(nextPassword);
  await pool.query(
    "UPDATE app_users SET password_hash = $1, password_change_required = FALSE, updated_at = NOW() WHERE id = $2",
    [newHash, req.user.id]
  );
  await audit(pool, req.user.id, "auth.password_changed", "user", req.user.id);
  res.json({ ok: true });
}));

app.use("/api", currentUser, readyUser);


app.get("/api/users", currentUser, readyUser, allowRoles("owner"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT id, email, role, active, password_change_required, created_at FROM app_users ORDER BY email");
  res.json({ users: result.rows.map((user) => ({ ...safeUser(user), active: user.active, created_at: user.created_at })) });
}));

app.post("/api/users", currentUser, readyUser, allowRoles("owner"), asyncRoute(async (req, res) => {
  const accountEmail = email(req.body.email);
  const password = typeof req.body.temporary_password === "string" ? req.body.temporary_password : "";
  const role = req.body.role;
  if (password.length < 14 || password.length > 200) throw new Error("Temporary password must have at least 14 characters.");
  if (!["owner", "payroll_admin", "payroll_operator", "viewer"].includes(role)) throw new Error("Select a valid user role.");
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    "INSERT INTO app_users (email, password_hash, role, password_change_required) VALUES ($1, $2, $3, TRUE) RETURNING id, email, role, active, password_change_required, created_at",
    [accountEmail, passwordHash, role]
  );
  await audit(pool, req.user.id, "user.created", "user", result.rows[0].id, { email: accountEmail, role });
  res.status(201).json({ user: { ...safeUser(result.rows[0]), active: result.rows[0].active, created_at: result.rows[0].created_at } });
}));

app.patch("/api/users/:id/reset-password", currentUser, readyUser, allowRoles("owner"), asyncRoute(async (req, res) => {
  const id = ugx(req.params.id, "User ID");
  const password = typeof req.body.temporary_password === "string" ? req.body.temporary_password : "";
  if (password.length < 14 || password.length > 200) throw new Error("Temporary password must have at least 14 characters.");
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    "UPDATE app_users SET password_hash=$1, password_change_required=TRUE, updated_at=NOW() WHERE id=$2 RETURNING id, email",
    [passwordHash, id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
  await audit(pool, req.user.id, "user.password_reset", "user", id, { email: result.rows[0].email });
  res.json({ ok: true });
}));

app.patch("/api/users/:id/active", currentUser, readyUser, allowRoles("owner"), asyncRoute(async (req, res) => {
  const id = ugx(req.params.id, "User ID");
  if (id === Number(req.user.id)) return res.status(400).json({ error: "You cannot deactivate your own account." });
  if (typeof req.body.active !== "boolean") throw new Error("Active status must be true or false.");
  const result = await pool.query(
    "UPDATE app_users SET active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, email, role, active",
    [req.body.active, id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "User not found." });
  if (!req.body.active && result.rows[0].role === "owner") {
    const owners = await pool.query("SELECT COUNT(*)::int AS count FROM app_users WHERE role='owner' AND active=TRUE");
    if (owners.rows[0].count === 0) {
      await pool.query("UPDATE app_users SET active=TRUE WHERE id=$1", [id]);
      return res.status(409).json({ error: "At least one active owner account must remain." });
    }
  }
  await audit(pool, req.user.id, "user.active_changed", "user", id, { active: req.body.active });
  res.json({ user: { id: String(result.rows[0].id), email: result.rows[0].email, role: result.rows[0].role, active: result.rows[0].active } });
}));

app.get("/api/employees", asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, employee_no, first_name, last_name, email, tax_residency, nssf_mode, active FROM employees ORDER BY active DESC, last_name, first_name"
  );
  res.json({ employees: result.rows });
}));

app.post("/api/employees", allowRoles("owner", "payroll_admin"), asyncRoute(async (req, res) => {
  const employeeNo = text(req.body.employee_no, "Employee number", 40);
  const firstName = text(req.body.first_name, "First name", 80);
  const lastName = text(req.body.last_name, "Last name", 80);
  const contact = req.body.email ? email(req.body.email) : null;
  const residency = req.body.tax_residency;
  const nssfMode = req.body.nssf_mode;
  if (!["resident", "non_resident"].includes(residency)) throw new Error("Select resident or non-resident tax status.");
  if (!["standard", "special", "exempt"].includes(nssfMode)) throw new Error("Select a valid NSSF status.");

  const result = await pool.query(
    "INSERT INTO employees (employee_no, first_name, last_name, email, tax_residency, nssf_mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, employee_no, first_name, last_name, email, tax_residency, nssf_mode, active",
    [employeeNo, firstName, lastName, contact, residency, nssfMode]
  );
  await audit(pool, req.user.id, "employee.created", "employee", result.rows[0].id, { employee_no: employeeNo });
  res.status(201).json({ employee: result.rows[0] });
}));

app.patch("/api/employees/:id", allowRoles("owner", "payroll_admin"), asyncRoute(async (req, res) => {
  const id = ugx(req.params.id, "Employee ID");
  const employeeNo = text(req.body.employee_no, "Employee number", 40);
  const firstName = text(req.body.first_name, "First name", 80);
  const lastName = text(req.body.last_name, "Last name", 80);
  const contact = req.body.email ? email(req.body.email) : null;
  const residency = req.body.tax_residency;
  const nssfMode = req.body.nssf_mode;
  const active = req.body.active;
  if (!["resident", "non_resident"].includes(residency)) throw new Error("Select resident or non-resident tax status.");
  if (!["standard", "special", "exempt"].includes(nssfMode)) throw new Error("Select a valid NSSF status.");
  if (typeof active !== "boolean") throw new Error("Employee active status is invalid.");

  const result = await pool.query(
    "UPDATE employees SET employee_no=$1, first_name=$2, last_name=$3, email=$4, tax_residency=$5, nssf_mode=$6, active=$7, updated_at=NOW() WHERE id=$8 RETURNING id, employee_no, first_name, last_name, email, tax_residency, nssf_mode, active",
    [employeeNo, firstName, lastName, contact, residency, nssfMode, active, id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Employee not found." });
  await audit(pool, req.user.id, "employee.updated", "employee", id, { employee_no: employeeNo, active });
  res.json({ employee: result.rows[0] });
}));

app.get("/api/payroll/runs", asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, pay_period, status, employee_count, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx, created_at, approved_at FROM payroll_runs ORDER BY pay_period DESC"
  );
  res.json({ runs: result.rows });
}));

app.post("/api/payroll/runs", allowRoles("owner", "payroll_admin", "payroll_operator"), asyncRoute(async (req, res) => {
  const payPeriod = req.body.pay_period;
  if (!validPeriod(payPeriod)) throw new Error("Pay period must use YYYY-MM format.");
  if (!Array.isArray(req.body.items) || req.body.items.length === 0 || req.body.items.length > 2000) {
    throw new Error("Provide payroll data for at least one employee.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const employeeResult = await client.query(
      "SELECT id, employee_no, first_name, last_name, tax_residency, nssf_mode FROM employees WHERE active = TRUE ORDER BY id"
    );
    if (!employeeResult.rows.length) throw new Error("Add active employees before creating a payroll run.");
    const employees = employeeResult.rows;
    const inputById = new Map();
    for (const item of req.body.items) {
      const id = String(ugx(item.employee_id, "Employee ID"));
      if (inputById.has(id)) throw new Error("An employee appears more than once in this payroll run.");
      inputById.set(id, item);
    }
    if (inputById.size !== employees.length || employees.some((person) => !inputById.has(String(person.id)))) {
      throw new Error("Enter one pay record for every active employee. Deactivate employees who should not be included.");
    }

    const calculated = [];
    for (const employee of employees) {
      const item = calculatePayrollItem(employee, inputById.get(String(employee.id)));
      calculated.push({ employee, item });
    }

    const sums = calculated.reduce((totals, row) => {
      for (const key of Object.keys(totals)) totals[key] += row.item[key];
      return totals;
    }, {
      gross_cash_ugx: 0,
      taxable_income_ugx: 0,
      local_service_tax_ugx: 0,
      paye_ugx: 0,
      employee_nssf_ugx: 0,
      employer_nssf_ugx: 0,
      net_pay_ugx: 0
    });
    for (const value of Object.values(sums)) {
      if (!Number.isSafeInteger(value)) throw new Error("Payroll total exceeds the supported amount.");
    }

    const runResult = await client.query(
      "INSERT INTO payroll_runs (pay_period, status, employee_count, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx, created_by) VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, pay_period, status, employee_count, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx, created_at",
      [payPeriod, calculated.length, sums.gross_cash_ugx, sums.taxable_income_ugx, sums.local_service_tax_ugx, sums.paye_ugx, sums.employee_nssf_ugx, sums.employer_nssf_ugx, sums.net_pay_ugx, req.user.id]
    );
    const run = runResult.rows[0];

    for (const row of calculated) {
      const employee = row.employee;
      const item = row.item;
      await client.query(
        "INSERT INTO payroll_items (payroll_run_id, employee_id, employee_no, employee_name, tax_residency, nssf_mode, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [run.id, employee.id, employee.employee_no, employee.first_name + " " + employee.last_name, employee.tax_residency, employee.nssf_mode, item.gross_cash_ugx, item.taxable_income_ugx, item.local_service_tax_ugx, item.paye_ugx, item.employee_nssf_ugx, item.employer_nssf_ugx, item.net_pay_ugx]
      );
    }
    await audit(client, req.user.id, "payroll.draft_created", "payroll_run", run.id, { pay_period: payPeriod, employee_count: calculated.length, paye_version: RESIDENT_PAYE_VERSION });
    await client.query("COMMIT");
    res.status(201).json({ run });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/payroll/runs/:id", asyncRoute(async (req, res) => {
  const id = ugx(req.params.id, "Payroll run ID");
  const run = await pool.query(
    "SELECT id, pay_period, status, employee_count, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx, created_at, approved_at FROM payroll_runs WHERE id=$1",
    [id]
  );
  if (!run.rows[0]) return res.status(404).json({ error: "Payroll run not found." });
  const items = await pool.query(
    "SELECT employee_no, employee_name, tax_residency, nssf_mode, gross_cash_ugx, taxable_income_ugx, local_service_tax_ugx, paye_ugx, employee_nssf_ugx, employer_nssf_ugx, net_pay_ugx FROM payroll_items WHERE payroll_run_id=$1 ORDER BY employee_name",
    [id]
  );
  res.json({ run: run.rows[0], items: items.rows });
}));

app.post("/api/payroll/runs/:id/approve", allowRoles("owner", "payroll_admin"), asyncRoute(async (req, res) => {
  const id = ugx(req.params.id, "Payroll run ID");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE payroll_runs SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 AND status='draft' RETURNING id, pay_period, status, approved_at",
      [req.user.id, id]
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Only a draft payroll run can be approved." });
    }
    await audit(client, req.user.id, "payroll.approved", "payroll_run", id, { pay_period: result.rows[0].pay_period });
    await client.query("COMMIT");
    res.json({ run: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/audit", allowRoles("owner", "payroll_admin"), asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT id, actor_user_id, event_type, resource_type, resource_id, details, created_at FROM audit_events ORDER BY created_at DESC LIMIT 500"
  );
  res.json({ events: result.rows });
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use("/payroll-system", express.static(path.join(__dirname, "payroll-system"), {
  etag: true,
  maxAge: production ? "1h" : 0,
  index: "index.html",
  dotfiles: "deny"
}));
app.get("/", (_req, res) => res.redirect("/payroll-system/"));

app.use((error, _req, res, _next) => {
  if (error && error.code === "23505") return res.status(409).json({ error: "A record with that unique value already exists." });
  if (error && error.type === "entity.parse.failed") return res.status(400).json({ error: "Request body must be valid JSON." });
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (message.startsWith("Invalid") || message.includes("required.") || message.includes("must ") || message.includes("Select ") || message.includes("exceed") || message.includes("Provide ") || message.includes("Enter ") || message.includes("Add active") || message.includes("appears more") || message.includes("one pay record")) {
    return res.status(400).json({ error: message });
  }
  console.error("Request failed:", message);
  res.status(500).json({ error: "The request could not be completed." });
});

async function start() {
  const schema = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8");
  await pool.query(schema);
  const count = await pool.query("SELECT COUNT(*)::int AS count FROM app_users");
  if (count.rows[0].count === 0) {
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!bootstrapEmail || !bootstrapPassword || bootstrapPassword.length < 14) {
      throw new Error("No administrator exists. Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 14 characters for first startup.");
    }
    const passwordHash = await hashPassword(bootstrapPassword);
    await pool.query(
      "INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, 'owner')",
      [email(bootstrapEmail), passwordHash]
    );
    console.info("Created the initial payroll owner account. Remove BOOTSTRAP_ADMIN_PASSWORD from deployment variables after first startup.");
  }
  app.listen(port, "0.0.0.0", () => console.info("Payroll app listening on port " + port));
}

start().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
