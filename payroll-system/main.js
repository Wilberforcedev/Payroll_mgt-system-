"use strict";

(function () {
  const STORAGE_KEY = "payrollDeskEntries";
  const TAX_RATE_DEFAULT = 10;
  const form = document.getElementById("payrollForm");
  const nameInput = document.getElementById("employeeName");
  const hoursInput = document.getElementById("hoursWorked");
  const rateInput = document.getElementById("hourlyRate");
  const deductionInput = document.getElementById("deductionRate");
  const dateInput = document.getElementById("payDate");
  const rows = document.getElementById("salaryDetails");
  const searchInput = document.getElementById("searchInput");
  const emptyState = document.getElementById("emptyState");
  const searchEmpty = document.getElementById("searchEmpty");
  const toast = document.getElementById("toast");
  let entries = loadEntries();
  let toastTimer;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function loadEntries() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.filter(function (entry) {
        return entry && typeof entry.id === "string" &&
          typeof entry.employeeName === "string" &&
          Number.isFinite(Number(entry.hoursWorked)) &&
          Number.isFinite(Number(entry.hourlyRate)) &&
          Number.isFinite(Number(entry.deductionRate)) &&
          typeof entry.payDate === "string";
      }).map(function (entry) {
        const hours = Number(entry.hoursWorked);
        const rate = Number(entry.hourlyRate);
        const deductionRate = Number(entry.deductionRate);
        const gross = roundMoney(hours * rate);
        const deduction = roundMoney(gross * deductionRate / 100);
        return Object.assign({}, entry, {
          hoursWorked: hours,
          hourlyRate: rate,
          deductionRate: deductionRate,
          grossSalary: gross,
          deductionAmount: deduction,
          netSalary: roundMoney(gross - deduction)
        });
      });
    } catch (error) {
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch (error) {
      return false;
    }
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function formatMoney(value) {
    return "UGX " + new Intl.NumberFormat("en-UG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  }

  function formatDate(value) {
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (part) { return !part; })) return value;
    return new Intl.DateTimeFormat("en-UG", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(function (part) {
      return part.charAt(0);
    }).join("");
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function updateSummary() {
    setText("employeeCount", String(entries.length));
    const totals = entries.reduce(function (sum, entry) {
      sum.gross += entry.grossSalary;
      sum.deductions += entry.deductionAmount;
      sum.net += entry.netSalary;
      return sum;
    }, { gross: 0, deductions: 0, net: 0 });
    setText("grossTotal", formatMoney(roundMoney(totals.gross)));
    setText("deductionTotal", formatMoney(roundMoney(totals.deductions)));
    setText("netTotal", formatMoney(roundMoney(totals.net)));
    setText("recordCount", entries.length + (entries.length === 1 ? " entry" : " entries"));
    document.getElementById("exportCsv").disabled = entries.length === 0;
    document.getElementById("clearAll").disabled = entries.length === 0;
  }

  function createCell(value, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value;
    return cell;
  }

  function render() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const filtered = entries.filter(function (entry) {
      return entry.employeeName.toLocaleLowerCase().includes(query);
    });
    rows.replaceChildren();

    filtered.forEach(function (entry) {
      const row = document.createElement("tr");
      row.className = "table-row";

      const employeeCell = document.createElement("td");
      const employeeWrap = document.createElement("div");
      employeeWrap.className = "employee-cell";
      const badge = document.createElement("span");
      badge.className = "employee-avatar";
      badge.textContent = initials(entry.employeeName);
      const employeeName = document.createElement("span");
      employeeName.textContent = entry.employeeName;
      employeeWrap.append(badge, employeeName);
      employeeCell.append(employeeWrap);

      row.append(
        employeeCell,
        createCell(formatDate(entry.payDate)),
        createCell(new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 }).format(entry.hoursWorked)),
        createCell(formatMoney(entry.grossSalary), "amount"),
        createCell(formatMoney(entry.deductionAmount) + " (" + entry.deductionRate + "%)"),
        createCell(formatMoney(entry.netSalary), "net-amount")
      );

      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-row";
      deleteButton.setAttribute("aria-label", "Delete payroll entry for " + entry.employeeName);
      deleteButton.title = "Delete entry";
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", function () {
        deleteEntry(entry.id);
      });
      actionCell.append(deleteButton);
      row.append(actionCell);
      rows.append(row);
    });

    const hasEntries = entries.length > 0;
    emptyState.hidden = hasEntries;
    searchEmpty.hidden = !hasEntries || filtered.length > 0;
    updateSummary();
  }

  function clearErrors() {
    ["nameError", "hoursError", "rateError", "deductionError", "dateError"].forEach(function (id) {
      setText(id, "");
    });
    [nameInput, hoursInput, rateInput, deductionInput, dateInput].forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
  }

  function setError(input, errorId, message) {
    setText(errorId, message);
    input.setAttribute("aria-invalid", "true");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("visible");
    }, 2600);
  }

  function deleteEntry(id) {
    entries = entries.filter(function (entry) { return entry.id !== id; });
    const saved = saveEntries();
    render();
    showToast(saved ? "Payroll entry deleted." : "Entry deleted for this session; browser storage failed.");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearErrors();

    const employeeName = nameInput.value.trim();
    const hoursWorked = Number(hoursInput.value);
    const hourlyRate = Number(rateInput.value);
    const deductionRate = Number(deductionInput.value);
    const payDate = dateInput.value;
    let valid = true;

    if (!employeeName) {
      setError(nameInput, "nameError", "Enter the employee's name.");
      valid = false;
    }
    if (hoursInput.value === "" || !Number.isFinite(hoursWorked) || hoursWorked < 0) {
      setError(hoursInput, "hoursError", "Enter zero or more hours.");
      valid = false;
    }
    if (rateInput.value === "" || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
      setError(rateInput, "rateError", "Enter a valid rate of zero or more.");
      valid = false;
    }
    if (deductionInput.value === "" || !Number.isFinite(deductionRate) || deductionRate < 0 || deductionRate > 100) {
      setError(deductionInput, "deductionError", "Use a rate from 0% to 100%.");
      valid = false;
    }
    if (!payDate || Number.isNaN(new Date(payDate + "T00:00:00").getTime())) {
      setError(dateInput, "dateError", "Choose a valid pay date.");
      valid = false;
    }
    if (!valid) {
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    const grossSalary = roundMoney(hoursWorked * hourlyRate);
    const deductionAmount = roundMoney(grossSalary * deductionRate / 100);
    const entry = {
      id: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      employeeName: employeeName,
      hoursWorked: hoursWorked,
      hourlyRate: hourlyRate,
      deductionRate: deductionRate,
      payDate: payDate,
      grossSalary: grossSalary,
      deductionAmount: deductionAmount,
      netSalary: roundMoney(grossSalary - deductionAmount)
    };

    entries.unshift(entry);
    const saved = saveEntries();
    render();
    form.reset();
    deductionInput.value = String(TAX_RATE_DEFAULT);
    dateInput.value = localDateString(new Date());
    nameInput.focus();
    showToast(saved ? "Payroll entry added and saved." : "Entry added for this session; browser storage failed.");
  });

  searchInput.addEventListener("input", render);

  document.getElementById("clearAll").addEventListener("click", function () {
    if (!entries.length || !window.confirm("Delete all payroll entries saved in this browser?")) return;
    entries = [];
    const saved = saveEntries();
    render();
    showToast(saved ? "All payroll entries cleared." : "Entries cleared for this session; browser storage failed.");
  });

  document.getElementById("exportCsv").addEventListener("click", function () {
    if (!entries.length) return;
    const headings = ["Employee name", "Pay date", "Hours worked", "Hourly rate (UGX)", "Gross pay (UGX)", "Deduction rate (%)", "Deduction (UGX)", "Net pay (UGX)"];
    const lines = [headings].concat(entries.map(function (entry) {
      return [
        entry.employeeName, entry.payDate, entry.hoursWorked, entry.hourlyRate,
        entry.grossSalary, entry.deductionRate, entry.deductionAmount, entry.netSalary
      ];
    }));
    const csv = lines.map(function (line) {
      return line.map(function (value) {
        let text = String(value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "payroll-report-" + localDateString(new Date()) + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Payroll report exported.");
  });

  const now = new Date();
  dateInput.value = localDateString(now);
  deductionInput.value = String(TAX_RATE_DEFAULT);
  setText("todayLabel", new Intl.DateTimeFormat("en-UG", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }).format(now));
  render();
})();