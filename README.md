# Payroll Desk

A server-backed payroll MVP for one employer, built with Node.js, Express, and PostgreSQL. The interface is served by the application; payroll calculations and records are handled by the server and database.

## Implemented

- Password-protected accounts with owner, payroll admin, payroll operator, and read-only roles.
- First-owner bootstrap through deployment environment variables; new accounts receive a temporary password and must change it at first sign-in.
- PostgreSQL persistence for users, employees, payroll runs, and audit events.
- Session cookies marked HttpOnly and SameSite Strict; Secure cookies in production.
- CSRF token checks for state-changing API requests, Content Security Policy, request size limits, and sign-in rate limiting.
- Employee register with resident/non-resident tax status and standard, special, or exempt NSSF handling.
- Monthly draft payroll for every active employee, with gross cash pay, taxable employment income, NSSF wage, and employer-entered Local Service Tax.
- Uganda PAYE calculation using URA’s FY 2026/27 rates effective 1 July 2026.
- NSSF standard rates of 5% employee and 10% employer; special NSSF mode calculates 10% employer contribution only.
- Draft review, approval lock, audit entries, safe deletion of draft runs, payroll history, and CSV export.

## Payroll rule scope

The employer must enter the correct monthly taxable employment income and NSSF wage for each employee. Local Service Tax is also entered manually for the current pay period using the applicable local government schedule. The system does not determine whether specific allowances, benefits, exemptions, or employee categories are taxable or NSSF-eligible.

This version does not file URA or NSSF returns, make salary payments, calculate benefits in kind, handle overtime/leave/severance, or provide payslip PDFs. Payroll rules and employee classifications must be reviewed by a qualified Ugandan payroll professional before the system is used for live payroll.

## Requirements

- Node.js 20 or later
- PostgreSQL 12 or later
- A secure production secret manager and HTTPS deployment

## Local setup

1. Copy the example environment file and configure PostgreSQL:

   ```bash
   cp .env.example .env
   ```

2. Set a unique session secret of at least 32 characters. Generate one with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

3. Set `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters. These are used only if the database has no accounts.

4. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

5. Open <http://localhost:3000/>.

After the first owner account is created, remove `BOOTSTRAP_ADMIN_PASSWORD` from the deployment environment. Never commit `.env` or production credentials.

## Production deployment

1. Provision PostgreSQL with backups enabled and restrict database access to the app.
2. Set `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, and `PORT` in the host’s secret variables. Set `DATABASE_SSL=true` only when the database provider requires TLS.
3. Add the bootstrap owner credentials for the initial deployment, then remove the temporary password once the first account exists.
4. Terminate HTTPS at the hosting provider and confirm secure cookies work through its trusted proxy.
5. Configure scheduled backups and test a restore before processing payroll.
6. Review all tax, NSSF, LST, and employee classification settings with the employer’s payroll adviser before approving a live run.

The application creates the initial database tables on startup. Schema changes after initial deployment should be introduced through reviewed, versioned migrations before deployment.

## Uganda payroll references

- [URA: PAYE rates effective from 1 July 2026](https://ura.go.ug/en/changes-to-paye-return-form-following-the-income-tax-amendment-act-2026/)
- [URA: PAYE rates and residency status](https://ura.go.ug/en/domestic-taxes/paye-rates/)
- [URA: Employment income and Local Service Tax](https://ura.go.ug/en/employment-income/)
- [NSSF: Membership and standard contribution rates](https://www.nssfug.org/about-us/membership/)
- [NSSF Act, Cap. 230](https://www.nssfug.org/site/assets/files/1501/nssf_act_cap_230.pdf)

The employer remains responsible for confirming the current law, applicable exemptions, declarations, remittance deadlines, and employee-specific treatment. This repository is a single-employer MVP and has not been externally security-reviewed or certified for statutory filing.
