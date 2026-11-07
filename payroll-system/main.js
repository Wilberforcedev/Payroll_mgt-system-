"use strict";

(() => {
  const TAX_RATE_LABEL = "deduction rate";
  const records = [];
  let editingId = null;
  let nextId = 1;

  const form = document.getElementById("payrollForm");
  const nameInput = document.getElementById("employeeName");
  const periodInput = document.getElementById("payPeriod");
  const hoursInput = document.getElementById("hoursWorked");
  const rateInput = document.getElementById("hourlyRate");
  const deductionInput = document.getElementById("deductionRate");
  const rows = document.getElementById("salaryDetails");
  const status = document.getElementById("statusMessage");
  const submitButton = document.getElementById("submitButton");
  const cancelEditButton = document.getElementById("cancelEdit");
  const clearReportButton = document.getElementById("clearReport");

  const numberFormat = new Intl.NumberFormat("en-UG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const integerFormat = new Intl.NumberFormat("en-UG", {
    maximumFractionDigits: 2
  });

  function money(value) {
    return "UGX " + numberFormat.format(value);
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("status-error", Boolean(isError));
  }

  function makeCell(value, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function makeActionButton(label, action, id, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = String(id);
    button.className = className;
    button.setAttribute("aria-label", label + " pay record");
    return button;
  }

  function render() {
    rows.replaceChildren();

    if (records.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 8;
      emptyCell.textContent = "No pay records yet. Add an employee above to begin.";
      emptyRow.append(emptyCell);
      rows.append(emptyRow);
    } else {
      records.forEach((record) => {
        const row = document.createElement("tr");
        row.append(
          makeCell(record.name),
          makeCell(record.period),
          makeCell(integerFormat.format(record.hours), "numeric"),
          makeCell(money(record.rate), "numeric"),
          makeCell(money(record.gross), "numeric"),
          makeCell(money(record.deduction), "numeric"),
          makeCell(money(record.net), "numeric")
        );
        const actions = document.createElement("td");
        actions.className = "row-actions";
        actions.append(
          makeActionButton("Edit", "edit", record.id, "text-button"),
          makeActionButton("Delete", "delete", record.id, "text-button text-button-danger")
        );
        row.append(actions);
        rows.append(row);
      });
    }

    const totals = records.reduce((sum, record) => {
      sum.gross += record.gross;
      sum.deductions += record.deduction;
      sum.net += record.net;
      return sum;
    }, { gross: 0, deductions: 0, net: 0 });

    document.getElementById("employeeCount").textContent = String(records.length);
    document.getElementById("totalGross").textContent = money(roundMoney(totals.gross));
    document.getElementById("totalDeductions").textContent = money(roundMoney(totals.deductions));
    document.getElementById("totalNet").textContent = money(roundMoney(totals.net));
    clearReportButton.disabled = records.length === 0;
  }

  function resetEditor() {
    editingId = null;
    form.reset();
    submitButton.textContent = "Add pay record";
    cancelEditButton.classList.add("hidden");
    document.getElementById("form-title").textContent = "Add a pay record";
  }

  function validateValues() {
    if (!form.reportValidity()) return null;

    const name = nameInput.value.trim();
    const period = periodInput.value;
    const hours = hoursInput.valueAsNumber;
    const rate = rateInput.valueAsNumber;
    const deductionRate = deductionInput.valueAsNumber;

    if (!name) {
      nameInput.setCustomValidity("Enter the employee's name.");
      nameInput.reportValidity();
      nameInput.setCustomValidity("");
      return null;
    }

    if (![hours, rate, deductionRate].every(Number.isFinite) ||
        hours < 0 || hours > 744 ||
        rate < 0 || rate > 1000000000 ||
        deductionRate < 0 || deductionRate > 100) {
      setStatus("Check the hours, hourly rate, and deduction rate. Values must be within the displayed limits.", true);
      return null;
    }

    const grossRaw = hours * rate;
    if (!Number.isFinite(grossRaw)) {
      setStatus("The pay amount is too large to calculate.", true);
      return null;
    }

    const gross = roundMoney(grossRaw);
    const deduction = roundMoney(gross * deductionRate / 100);
    const net = roundMoney(gross - deduction);

    return {
      name,
      period,
      hours,
      rate: roundMoney(rate),
      deductionRate,
      gross,
      deduction,
      net
    };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus("", false);
    const values = validateValues();
    if (!values) return;

    if (editingId !== null) {
      const index = records.findIndex((record) => record.id === editingId);
      if (index === -1) {
        resetEditor();
        setStatus("That record could not be found. Please try again.", true);
        return;
      }
      records[index] = { ...values, id: editingId };
      setStatus("Pay record updated.", false);
    } else {
      records.push({ ...values, id: nextId++ });
      setStatus("Pay record added.", false);
    }

    render();
    resetEditor();
    nameInput.focus();
  });

  cancelEditButton.addEventListener("click", () => {
    resetEditor();
    setStatus("Edit cancelled.", false);
    nameInput.focus();
  });

  rows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const record = records.find((item) => item.id === id);
    if (!record) return;

    if (button.dataset.action === "edit") {
      editingId = record.id;
      nameInput.value = record.name;
      periodInput.value = record.period;
      hoursInput.value = String(record.hours);
      rateInput.value = String(record.rate);
      deductionInput.value = String(record.deductionRate);
      submitButton.textContent = "Update pay record";
      cancelEditButton.classList.remove("hidden");
      document.getElementById("form-title").textContent = "Edit pay record";
      setStatus("Editing " + record.name + ".", false);
      nameInput.focus();
    } else if (button.dataset.action === "delete") {
      if (!window.confirm("Delete the pay record for " + record.name + "?")) return;
      records.splice(records.indexOf(record), 1);
      if (editingId === id) resetEditor();
      render();
      setStatus("Pay record deleted.", false);
    }
  });

  function csvSafe(value) {
    const text = String(value);
    const protectedText = /^[\u0000-\u0020]*[=+@-]/.test(text) ? "'" + text : text;
    return '"' + protectedText.replace(/"/g, '""') + '"';
  }

  document.getElementById("exportCsv").addEventListener("click", () => {
    if (records.length === 0) {
      setStatus("Add at least one pay record before exporting.", true);
      return;
    }

    const headings = ["Employee", "Pay period", "Hours", "Hourly rate (UGX)", "Gross pay (UGX)", "Deduction rate (%)", "Deduction (UGX)", "Net pay (UGX)"];
    const lines = [headings.map(csvSafe).join(",")];
    records.forEach((record) => {
      lines.push([
        record.name,
        record.period,
        record.hours,
        record.rate,
        record.gross,
        record.deductionRate,
        record.deduction,
        record.net
      ].map(csvSafe).join(","));
    });

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "payroll-report.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV report downloaded.", false);
  });

  document.getElementById("printReport").addEventListener("click", () => window.print());

  clearReportButton.addEventListener("click", () => {
    if (!records.length || !window.confirm("Clear all pay records from this session?")) return;
    records.splice(0, records.length);
    resetEditor();
    render();
    setStatus("Session report cleared.", false);
  });

  render();
})();
