# Payroll Management System

A lightweight payroll calculator and report built with HTML, CSS, and vanilla JavaScript.

## Features

- Calculates gross pay, a configurable percentage deduction, and net pay
- Defaults the deduction rate to 10%; the rate can be changed for each entry
- Validates names, hours, rates, dates, and deduction percentages
- Saves entries in the current browser using local storage
- Shows payroll totals and supports employee-name search
- Deletes individual entries or clears the saved report
- Exports entries to CSV
- Responsive layout for desktop, tablet, and mobile screens

## Run

No build step or package installation is required. Open \`payroll-system/index.html\` in a browser, or serve the repository locally:

\`\`\`bash
python -m http.server 8000
\`\`\`

Then open <http://localhost:8000/payroll-system/>.

## Calculation

- Gross pay = hours worked × hourly rate
- Deduction = gross pay × configured deduction percentage
- Net pay = gross pay − deduction

Amounts are labelled in Ugandan shillings (UGX). The 10% default is a configurable example rate; this calculator does not determine statutory tax, PAYE, pension, or other payroll obligations.

## Data

Payroll entries are stored in the browser's local storage on the device where they are entered. This is a front-end demonstration and does not provide user accounts, server-side storage, backups, or access controls.