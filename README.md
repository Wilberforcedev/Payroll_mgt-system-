# Payroll Management System

A small client-side payroll calculator built with HTML, CSS, and jQuery. Enter an employee's name,
hours worked, and hourly rate to get their gross salary, 10% tax deduction, and net salary in a
running report table.

## Features

- Calculates gross, tax (10%), and net salary per employee
- Appends each calculation to a salary report table without reloading the page
- Validates input: name is required, hours and rate must be numbers of zero or more
- Clears the form and returns focus to the name field after each entry

## Project structure

```
payroll-system/
  index.html   # Markup: input form, Calculate button, report table
  main.js      # Salary calculation and validation
  style.css    # Page and table styling
```

## Setup

There is no build step and no dependencies to install.

1. Clone the repository:
   ```bash
   git clone https://github.com/Wilberforcedev/Payroll_mgt-system-.git
   cd Payroll_mgt-system-
   ```
2. Open `payroll-system/index.html` in a browser.

To serve it over HTTP instead of opening the file directly:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000/payroll-system/>.

jQuery 3.6.0 is loaded from a CDN, so the first load requires an internet connection.

## Usage

1. Type the employee's name.
2. Enter hours worked and the hourly rate (decimals are allowed).
3. Click **Calculate Salary**.
4. A new row appears in the Salary Report table with the gross salary, tax reduction, and net
   salary. The form resets, ready for the next employee.

## Calculation

| Value | Formula |
| --- | --- |
| Gross salary | `hours worked × hourly rate` |
| Tax reduction | `gross salary × 0.10` |
| Net salary | `gross salary - tax reduction` |

Amounts are rounded to two decimal places for display; the tax rate is the `TAX_RATE` constant at
the top of `main.js` if it needs to change.

## Limitations

- The report is kept in page memory only — reloading the page clears it.
- Currency is not labeled; amounts are shown as plain numbers.
