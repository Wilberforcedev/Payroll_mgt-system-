"use strict";

const RESIDENT_PAYER_VERSION = "UG-FY2026-27-effective-2026-07-01";
const UGX_LIMIT = Number.MAX_SAFE_INTEGER;

function ugx(value, fieldName) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > UGX_LIMIT) {
    throw new Error(fieldName + " must be a non-negative whole number of UGX.");
  }
  return parsed;
}

function roundUgx(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid payroll amount.");
  return Math.round(value);
}

function calculatePaye(chargeableIncomeUgx, residency) {
  const income = ugx(chargeableIncomeUgx, "Chargeable income");
  let tax;

  if (residency === "resident") {
    if (income <= 335000) tax = 0;
    else if (income <= 410000) tax = (income - 335000) * 0.20;
    else if (income <= 485000) tax = 15000 + (income - 410000) * 0.25;
    else if (income <= 10000000) tax = 33750 + (income - 485000) * 0.30;
    else tax = 33750 + (income - 485000) * 0.30 + (income - 10000000) * 0.10;
  } else if (residency === "non_resident") {
    if (income <= 335000) tax = income * 0.10;
    else if (income <= 410000) tax = 33500 + (income - 335000) * 0.20;
    else tax = 48500 + (income - 410000) * 0.30 + Math.max(0, income - 10000000) * 0.10;
  } else {
    throw new Error("Select resident or non-resident tax status.");
  }

  return roundUgx(tax);
}

function calculatePayrollItem(employee, entry) {
  const grossCash = ugx(entry.gross_cash_ugx, "Gross cash pay");
  const taxableIncome = ugx(entry.taxable_income_ugx, "Taxable employment income");
  const nssfWage = ugx(entry.nssf_wage_ugx, "NSSF wage");
  const localServiceTax = ugx(entry.local_service_tax_ugx, "Local Service Tax");

  if (localServiceTax > grossCash) {
    throw new Error("Local Service Tax cannot exceed gross cash pay.");
  }

  const chargeableIncome = Math.max(0, taxableIncome - localServiceTax);
  const paye = calculatePaye(chargeableIncome, employee.tax_residency);

  let employeeNssf = 0;
  let employerNssf = 0;
  if (employee.nssf_mode === "standard") {
    employeeNssf = roundUgx(nssfWage * 0.05);
    employerNssf = roundUgx(nssfWage * 0.10);
  } else if (employee.nssf_mode === "special") {
    employerNssf = roundUgx(nssfWage * 0.10);
  } else if (employee.nssf_mode !== "exempt") {
    throw new Error("Select a valid NSSF status for " + employee.employee_no + ".");
  }

  const netPay = grossCash - localServiceTax - paye - employeeNssf;
  if (netPay < 0) {
    throw new Error("Deductions exceed cash pay for " + employee.employee_no + ". Review taxable pay and manual deductions before creating the run.");
  }

  return {
    gross_cash_ugx: grossCash,
    taxable_income_ugx: taxableIncome,
    local_service_tax_ugx: localServiceTax,
    paye_ugx: paye,
    employee_nssf_ugx: employeeNssf,
    employer_nssf_ugx: employerNssf,
    net_pay_ugx: netPay
  };
}

module.exports = {
  RESIDENT_PAYER_VERSION,
  calculatePaye,
  calculatePayrollItem,
  ugx
};
