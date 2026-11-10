"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePaye, calculatePayrollItem, ugx } = require("../lib/payroll");

function employee(overrides) {
  return { employee_no: "E001", tax_residency: "resident", nssf_mode: "standard", ...overrides };
}

function entry(overrides) {
  return {
    gross_cash_ugx: 1000000,
    taxable_income_ugx: 1000000,
    local_service_tax_ugx: 0,
    nssf_wage_ugx: 0,
    ...overrides
  };
}

test("resident PAYE follows the FY 2026/27 bands", () => {
  assert.equal(calculatePaye(335000, "resident"), 0);
  assert.equal(calculatePaye(400000, "resident"), 13000);
  assert.equal(calculatePaye(410000, "resident"), 15000);
  assert.equal(calculatePaye(450000, "resident"), 25000);
  assert.equal(calculatePaye(485000, "resident"), 33750);
  assert.equal(calculatePaye(1000000, "resident"), 188250);
  assert.equal(calculatePaye(10000000, "resident"), 2888250);
  assert.equal(calculatePaye(11000000, "resident"), 3288250);
});

test("non-resident PAYE uses the flat starting rate", () => {
  assert.equal(calculatePaye(300000, "non_resident"), 30000);
  assert.equal(calculatePaye(335000, "non_resident"), 33500);
  assert.equal(calculatePaye(400000, "non_resident"), 46500);
  assert.equal(calculatePaye(410000, "non_resident"), 48500);
  assert.equal(calculatePaye(1000000, "non_resident"), 225500);
  assert.equal(calculatePaye(11000000, "non_resident"), 3325500);
});

test("standard NSSF deducts 5% employee and 10% employer", () => {
  const item = calculatePayrollItem(
    employee({ nssf_mode: "standard" }),
    entry({ nssf_wage_ugx: 1000000 })
  );

  assert.deepEqual(item, {
    gross_cash_ugx: 1000000,
    taxable_income_ugx: 1000000,
    local_service_tax_ugx: 0,
    paye_ugx: 188250,
    employee_nssf_ugx: 50000,
    employer_nssf_ugx: 100000,
    net_pay_ugx: 761750
  });
});

test("special NSSF charges the employer only", () => {
  const item = calculatePayrollItem(
    employee({ nssf_mode: "special" }),
    entry({ taxable_income_ugx: 0, nssf_wage_ugx: 800000 })
  );

  assert.equal(item.employee_nssf_ugx, 0);
  assert.equal(item.employer_nssf_ugx, 80000);
});

test("exempt NSSF charges nothing", () => {
  const item = calculatePayrollItem(
    employee({ nssf_mode: "exempt" }),
    entry({ nssf_wage_ugx: 700000 })
  );

  assert.equal(item.employee_nssf_ugx, 0);
  assert.equal(item.employer_nssf_ugx, 0);
});

test("Local Service Tax is deducted from gross pay and from taxable income", () => {
  const item = calculatePayrollItem(
    employee(),
    entry({ local_service_tax_ugx: 25000 })
  );

  assert.equal(item.paye_ugx, 180750);
  assert.equal(item.net_pay_ugx, 794250);
});

test("non-resident employees are taxed at non-resident rates", () => {
  const item = calculatePayrollItem(
    employee({ tax_residency: "non_resident" }),
    entry()
  );

  assert.equal(item.paye_ugx, 225500);
});

test("NSSF contributions round to whole shillings", () => {
  const item = calculatePayrollItem(
    employee({ nssf_mode: "standard" }),
    entry({ nssf_wage_ugx: 333 })
  );

  assert.equal(item.employee_nssf_ugx, 17);
  assert.equal(item.employer_nssf_ugx, 33);
});

test("drafts that would pay a negative net salary are rejected", () => {
  assert.throws(
    () => calculatePayrollItem(employee(), entry({ gross_cash_ugx: 100000 })),
    /Deductions exceed cash pay for E001/
  );
});

test("Local Service Tax cannot exceed gross cash pay", () => {
  assert.throws(
    () => calculatePayrollItem(employee(), entry({ local_service_tax_ugx: 1000001 })),
    /Local Service Tax cannot exceed gross cash pay/
  );
});

test("unknown NSSF modes are rejected with the employee number", () => {
  assert.throws(
    () => calculatePayrollItem(employee({ nssf_mode: "other" }), entry()),
    /E001/
  );
});

test("ugx accepts whole non-negative amounts only", () => {
  assert.equal(ugx("1000", "Amount"), 1000);
  assert.equal(ugx(0, "Amount"), 0);
  assert.throws(() => ugx(1.5, "Amount"), /whole number/);
  assert.throws(() => ugx(-1, "Amount"), /whole number/);
  assert.throws(() => ugx("", "Amount"), /whole number/);
  assert.throws(() => ugx(Number.MAX_SAFE_INTEGER + 1, "Amount"), /whole number/);
});
