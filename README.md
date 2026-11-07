# Payroll Desk

A lightweight, browser-based payroll calculator built with HTML, CSS, and vanilla JavaScript. It helps prepare and review basic gross-to-net pay summaries for a browser session.

## Features

- Record and edit employee pay entries by pay period.
- Calculate gross pay from hours worked and an hourly rate.
- Apply a user-entered deduction percentage and show the net amount.
- View payroll totals for the current session.
- Delete individual entries or clear the session report.
- Export the report as CSV or print it.
- Responsive layout with keyboard focus indicators, labels, and screen-reader status messages.
- Uses text-only DOM updates for employee-entered content and protects exported CSV text against spreadsheet formula injection.

## Important limitations

This is a front-end demonstration, not a production payroll service. It has no login, server, database, audit log, backups, or access controls. Entries are held only in browser memory and disappear when the page is reloaded. Do not enter confidential employee information or use this tool as the official payroll record.

The deduction percentage is user-entered and is not a statutory tax calculation. The app does not calculate Uganda PAYE, NSSF, overtime, benefits, leave, employer contributions, or other payroll obligations. Confirm all applicable rules with a qualified payroll professional before calculating real pay.

## Run locally

No build step or package installation is required.

1. Clone this repository:
   ```bash
   git clone https://github.com/Wilberforcedev/Payroll_mgt-system-.git
   cd Payroll_mgt-system-
   ```
2. Open `payroll-system/index.html` in a modern browser.

For local HTTP serving, run this from the repository root:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/payroll-system/>.

## Calculation

- Gross pay = hours worked × hourly rate
- Deduction = gross pay × entered deduction rate ÷ 100
- Net pay = gross pay − deduction

Displayed amounts are formatted in UGX and rounded to two decimal places. The deduction is an estimate supplied by the user, not a tax determination.

## Requirements before production use

A real payroll deployment needs, at minimum:

- A server-side application and database with authenticated user accounts and role-based access.
- Encryption in transit and appropriate protection of employee data at rest.
- Verified, configurable payroll rules for the operating jurisdiction and pay period.
- Auditable pay-run approvals, payslip generation, backups, and recovery procedures.
- Automated tests for calculations, validation, permissions, and export handling.
- Security review, monitoring, and a deployment process that protects production data.

Those production controls are not present in this repository.
