"use strict";

(() => {
  let csrfToken = "";
  let activeUser = null;
  let employees = [];
  let currentDetail = null;

  const byId = (id) => document.getElementById(id);
  const loginView = byId("loginView");
  const passwordView = byId("passwordChangeView");
  const appView = byId("appView");
  const sessionControls = byId("sessionControls");
  const activeAdmin = () => activeUser && ["owner", "payroll_admin"].includes(activeUser.role);
  const canOperatePayroll = () => activeUser && ["owner", "payroll_admin", "payroll_operator"].includes(activeUser.role);

  function showMessage(message, isError) {
    const node = byId("appMessage");
    node.textContent = message || "";
    node.classList.toggle("status-error", Boolean(isError));
  }

  function setLoginMessage(message) {
    byId("loginMessage").textContent = message || "";
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return "UGX " + new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(amount);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  async function getCsrfToken() {
    const response = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not initialize secure session.");
    csrfToken = body.csrfToken;
  }

  async function request(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", csrfToken);

    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store"
    });
    if (response.status === 204) return null;
    let body = {};
    try { body = await response.json(); } catch (_error) { body = {}; }

    if (!response.ok) {
      if (response.status === 401 && activeUser) showSignedOut();
      throw new Error(body.error || "The request could not be completed.");
    }
    return body;
  }

  function showSignedOut() {
    activeUser = null;
    sessionControls.classList.add("hidden");
    appView.classList.add("hidden");
    passwordView.classList.add("hidden");
    loginView.classList.remove("hidden");
    setLoginMessage("Your session ended. Sign in again.");
  }

  function showAuthenticated() {
    loginView.classList.add("hidden");
    sessionControls.classList.remove("hidden");
    byId("currentUser").textContent = activeUser.email + " · " + activeUser.role.replaceAll("_", " ");
    if (activeUser.password_change_required) {
      appView.classList.add("hidden");
      passwordView.classList.remove("hidden");
      byId("currentPassword").focus();
      return;
    }
    passwordView.classList.add("hidden");
    appView.classList.remove("hidden");
    byId("usersTab").classList.toggle("hidden", activeUser.role !== "owner");
    byId("auditTab").classList.toggle("hidden", !["owner", "payroll_admin"].includes(activeUser.role));
    document.querySelectorAll(".admin-control").forEach((node) => node.classList.toggle("hidden", !activeAdmin()));
    document.querySelectorAll(".payroll-control").forEach((node) => node.classList.toggle("hidden", !canOperatePayroll()));
    byId("runForm").classList.toggle("hidden", !canOperatePayroll());
  }

  function roleName(role) {
    return ({
      owner: "Owner",
      payroll_admin: "Payroll admin",
      payroll_operator: "Payroll operator",
      viewer: "Read-only viewer"
    })[role] || role;
  }

  function addCell(row, value, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = value == null || value === "" ? "—" : String(value);
    row.append(cell);
    return cell;
  }

  function actionButton(label, action, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = String(id);
    return button;
  }

  async function loadEmployees() {
    const result = await request("/api/employees");
    employees = result.employees;
    renderEmployees();
    renderPayrollInputs();
  }

  function renderEmployees() {
    const tbody = byId("employeeRows");
    tbody.replaceChildren();
    if (!employees.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "No employees have been added.";
      row.append(cell);
      tbody.append(row);
      return;
    }

    employees.forEach((employee) => {
      const row = document.createElement("tr");
      addCell(row, employee.employee_no);
      addCell(row, employee.first_name + " " + employee.last_name);
      addCell(row, employee.email);
      addCell(row, employee.tax_residency === "resident" ? "Resident" : "Non-resident");
      addCell(row, employee.nssf_mode);
      addCell(row, employee.active ? "Active" : "Inactive");
      const actions = document.createElement("td");
      if (activeAdmin()) actions.append(actionButton("Edit", "edit-employee", employee.id));
      row.append(actions);
      tbody.append(row);
    });
  }

  function createAmountInput(employeeId, field, label) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.required = true;
    input.inputMode = "numeric";
    input.dataset.employeeId = String(employeeId);
    input.dataset.field = field;
    input.setAttribute("aria-label", label);
    input.placeholder = "0";
    return input;
  }

  function renderPayrollInputs() {
    const tbody = byId("runRows");
    tbody.replaceChildren();
    const activeEmployees = employees.filter((employee) => employee.active);
    if (!activeEmployees.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "Add and activate employees before preparing payroll.";
      row.append(cell);
      tbody.append(row);
      return;
    }

    activeEmployees.forEach((employee) => {
      const row = document.createElement("tr");
      addCell(row, employee.employee_no + " · " + employee.first_name + " " + employee.last_name);
      [
        ["gross_cash_ugx", "Gross cash pay for " + employee.employee_no],
        ["taxable_income_ugx", "Taxable employment income for " + employee.employee_no],
        ["local_service_tax_ugx", "Local Service Tax for " + employee.employee_no],
        ["nssf_wage_ugx", "NSSF wage for " + employee.employee_no]
      ].forEach(([field, label]) => {
        const cell = document.createElement("td");
        cell.className = "numeric amount-cell";
        cell.append(createAmountInput(employee.id, field, label));
        row.append(cell);
      });
      tbody.append(row);
    });
  }

  function clearEmployeeEditor() {
    byId("employeeForm").reset();
    byId("employeeId").value = "";
    byId("employeeActive").checked = true;
    byId("employeeSubmit").textContent = "Add employee";
    byId("employeeCancel").classList.add("hidden");
  }

  byId("employeeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = {
      employee_no: byId("employeeNo").value.trim(),
      first_name: byId("firstName").value.trim(),
      last_name: byId("lastName").value.trim(),
      email: byId("employeeEmail").value.trim(),
      tax_residency: byId("taxResidency").value,
      nssf_mode: byId("nssfMode").value,
      active: byId("employeeActive").checked
    };
    const id = byId("employeeId").value;
    try {
      if (id) await request("/api/employees/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(data) });
      else {
        delete data.active;
        await request("/api/employees", { method: "POST", body: JSON.stringify(data) });
      }
      clearEmployeeEditor();
      await loadEmployees();
      showMessage(id ? "Employee record updated." : "Employee added.", false);
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  byId("employeeCancel").addEventListener("click", clearEmployeeEditor);

  byId("employeeRows").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit-employee']");
    if (!button) return;
    const employee = employees.find((item) => String(item.id) === button.dataset.id);
    if (!employee) return;
    byId("employeeId").value = employee.id;
    byId("employeeNo").value = employee.employee_no;
    byId("firstName").value = employee.first_name;
    byId("lastName").value = employee.last_name;
    byId("employeeEmail").value = employee.email || "";
    byId("taxResidency").value = employee.tax_residency;
    byId("nssfMode").value = employee.nssf_mode;
    byId("employeeActive").checked = employee.active;
    byId("employeeSubmit").textContent = "Save employee";
    byId("employeeCancel").classList.remove("hidden");
    byId("employeeNo").focus();
  });

  async function loadRuns() {
    const result = await request("/api/payroll/runs");
    renderRuns(result.runs);
  }

  function renderRuns(runs) {
    const tbody = byId("runHistoryRows");
    tbody.replaceChildren();
    if (!runs.length) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 9;
      cell.textContent = "No payroll runs yet.";
      row.append(cell);
      tbody.append(row);
      return;
    }

    runs.forEach((run) => {
      const row = document.createElement("tr");
      addCell(row, run.pay_period);
      const statusCell = addCell(row, run.status);
      statusCell.className = run.status === "approved" ? "approved-status" : "draft-status";
      addCell(row, formatNumber(run.employee_count), "numeric");
      addCell(row, formatMoney(run.gross_cash_ugx), "numeric");
      addCell(row, formatMoney(run.paye_ugx), "numeric");
      addCell(row, formatMoney(run.employee_nssf_ugx), "numeric");
      addCell(row, formatMoney(run.employer_nssf_ugx), "numeric");
      addCell(row, formatMoney(run.net_pay_ugx), "numeric");
      const actions = document.createElement("td");
      actions.append(actionButton("View", "view-run", run.id));
      row.append(actions);
      tbody.append(row);
    });
  }

  async function showRunDetail(id) {
    const result = await request("/api/payroll/runs/" + encodeURIComponent(id));
    currentDetail = result;
    const panel = byId("runDetail");
    panel.replaceChildren();
    panel.classList.remove("hidden");

    const heading = document.createElement("div");
    heading.className = "detail-heading";
    const title = document.createElement("h3");
    title.textContent = "Payroll " + result.run.pay_period + " · " + result.run.status;
    heading.append(title);
    const buttons = document.createElement("div");
    buttons.className = "report-actions";
    const exportButton = document.createElement("button");
    exportButton.className = "button button-secondary";
    exportButton.type = "button";
    exportButton.textContent = "Export payroll CSV";
    exportButton.addEventListener("click", () => exportRunCsv(currentDetail));
    buttons.append(exportButton);
    if (result.run.status === "draft" && ["owner", "payroll_admin"].includes(activeUser.role)) {
      const approve = document.createElement("button");
      approve.className = "button button-primary";
      approve.type = "button";
      approve.textContent = "Approve payroll";
      approve.addEventListener("click", async () => {
        if (!window.confirm("Approve the " + result.run.pay_period + " payroll? Approved runs cannot be edited.")) return;
        try {
          await request("/api/payroll/runs/" + encodeURIComponent(id) + "/approve", { method: "POST", body: "{}" });
          await loadRuns();
          await showRunDetail(id);
          showMessage("Payroll run approved and locked.", false);
        } catch (error) {
          showMessage(error.message, true);
        }
      });
      buttons.append(approve);
    }
    heading.append(buttons);
    panel.append(heading);

    const warning = document.createElement("p");
    warning.className = "helper-copy";
    warning.textContent = "Review the employee-level figures before approval. Approval locks the payroll run; salary payments and statutory filings must still be completed through the appropriate channels.";
    panel.append(warning);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Employee no.", "Employee", "Gross cash", "Taxable income", "LST", "PAYE", "Employee NSSF", "Employer NSSF", "Net pay"].forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.append(th);
    });
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    result.items.forEach((item) => {
      const row = document.createElement("tr");
      [
        item.employee_no, item.employee_name, formatMoney(item.gross_cash_ugx),
        formatMoney(item.taxable_income_ugx), formatMoney(item.local_service_tax_ugx),
        formatMoney(item.paye_ugx), formatMoney(item.employee_nssf_ugx),
        formatMoney(item.employer_nssf_ugx), formatMoney(item.net_pay_ugx)
      ].forEach((value) => addCell(row, value));
      tbody.append(row);
    });
    table.append(thead, tbody);
    tableWrap.append(table);
    panel.append(tableWrap);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function csvEscape(value) {
    let text = String(value == null ? "" : value);
    if (/^[\u0000-\u0020]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportRunCsv(data) {
    if (!data) return;
    const header = ["Pay period", "Employee number", "Employee", "Tax residency", "NSSF status", "Gross cash UGX", "Taxable income UGX", "LST UGX", "PAYE UGX", "Employee NSSF UGX", "Employer NSSF UGX", "Net pay UGX"];
    const rows = [header.map(csvEscape).join(",")];
    data.items.forEach((item) => rows.push([
      data.run.pay_period, item.employee_no, item.employee_name, item.tax_residency,
      item.nssf_mode, item.gross_cash_ugx, item.taxable_income_ugx,
      item.local_service_tax_ugx, item.paye_ugx, item.employee_nssf_ugx,
      item.employer_nssf_ugx, item.net_pay_ugx
    ].map(csvEscape).join(",")));
    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "payroll-" + data.run.pay_period + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  byId("runForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const inputs = Array.from(document.querySelectorAll("#runRows input[data-employee-id]"));
    if (!inputs.length) {
      showMessage("Add active employees before preparing payroll.", true);
      return;
    }
    const invalidInput = inputs.find((input) => input.value === "" || !input.checkValidity());
    if (invalidInput) {
      invalidInput.reportValidity();
      showMessage("Enter valid whole-UGX amounts for every active employee.", true);
      return;
    }
    const map = new Map();
    inputs.forEach((input) => {
      const id = input.dataset.employeeId;
      if (!map.has(id)) map.set(id, { employee_id: id });
      map.get(id)[input.dataset.field] = Number(input.value);
    });
    const items = Array.from(map.values());
    if (items.some((item) => Object.values(item).some((value) => value === "" || value == null) ||
        ["gross_cash_ugx", "taxable_income_ugx", "local_service_tax_ugx", "nssf_wage_ugx"].some((key) => !Number.isSafeInteger(item[key]) || item[key] < 0))) {
      showMessage("Enter valid whole-UGX amounts for every active employee.", true);
      return;
    }

    const period = byId("runPeriod").value;
    if (!period) {
      byId("runPeriod").focus();
      showMessage("Select the payroll period.", true);
      return;
    }

    try {
      const result = await request("/api/payroll/runs", {
        method: "POST",
        body: JSON.stringify({ pay_period: period, items })
      });
      await loadRuns();
      await showRunDetail(result.run.id);
      showMessage("Payroll draft created. Review every line before approval.", false);
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  byId("runHistoryRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='view-run']");
    if (!button) return;
    try { await showRunDetail(button.dataset.id); }
    catch (error) { showMessage(error.message, true); }
  });

  byId("refreshRuns").addEventListener("click", async () => {
    try { await loadRuns(); showMessage("Payroll history refreshed.", false); }
    catch (error) { showMessage(error.message, true); }
  });

  async function loadUsers() {
    const result = await request("/api/users");
    const tbody = byId("userRows");
    tbody.replaceChildren();
    result.users.forEach((user) => {
      const row = document.createElement("tr");
      addCell(row, user.email);
      addCell(row, roleName(user.role));
      addCell(row, user.active ? "Active" : "Inactive");
      addCell(row, user.password_change_required ? "Change required" : "Set");
      const actions = document.createElement("td");
      const toggle = actionButton(user.active ? "Deactivate" : "Activate", "toggle-user", user.id);
      toggle.dataset.active = String(!user.active);
      actions.append(toggle);
      const reset = actionButton("Reset password", "reset-user", user.id);
      actions.append(reset);
      row.append(actions);
      tbody.append(row);
    });
  }

  byId("userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request("/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: byId("userEmail").value,
          role: byId("userRole").value,
          temporary_password: byId("temporaryPassword").value
        })
      });
      byId("userForm").reset();
      await loadUsers();
      showMessage("User created. Share the temporary password through a secure channel.", false);
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  byId("userRows").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    try {
      if (button.dataset.action === "toggle-user") {
        const active = button.dataset.active === "true";
        await request("/api/users/" + encodeURIComponent(id) + "/active", { method: "PATCH", body: JSON.stringify({ active }) });
      } else if (button.dataset.action === "reset-user") {
        const password = window.prompt("Enter a temporary password with at least 14 characters. Share it securely.");
        if (password === null) return;
        await request("/api/users/" + encodeURIComponent(id) + "/reset-password", {
          method: "PATCH",
          body: JSON.stringify({ temporary_password: password })
        });
      }
      await loadUsers();
      showMessage("User account updated.", false);
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  async function loadAudit() {
    const result = await request("/api/audit");
    const tbody = byId("auditRows");
    tbody.replaceChildren();
    result.events.forEach((event) => {
      const row = document.createElement("tr");
      addCell(row, new Date(event.created_at).toLocaleString());
      addCell(row, event.actor_user_id);
      addCell(row, event.event_type);
      addCell(row, event.resource_type + (event.resource_id ? " #" + event.resource_id : ""));
      addCell(row, JSON.stringify(event.details));
      tbody.append(row);
    });
  }

  async function loadWorkspace() {
    showAuthenticated();
    if (activeUser.password_change_required) return;
    try {
      await Promise.all([loadEmployees(), loadRuns()]);
      if (activeUser.role === "owner") await loadUsers();
      if (["owner", "payroll_admin"].includes(activeUser.role)) await loadAudit();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", async () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.add("hidden"));
      button.classList.add("active");
      byId(button.dataset.view).classList.remove("hidden");
      if (button.dataset.view === "auditView" && ["owner", "payroll_admin"].includes(activeUser.role)) {
        try { await loadAudit(); } catch (error) { showMessage(error.message, true); }
      }
      if (button.dataset.view === "usersView" && activeUser.role === "owner") {
        try { await loadUsers(); } catch (error) { showMessage(error.message, true); }
      }
    });
  });

  byId("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("");
    try {
      const result = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: byId("loginEmail").value, password: byId("loginPassword").value })
      });
      csrfToken = result.csrfToken;
      activeUser = result.user;
      byId("loginPassword").value = "";
      await loadWorkspace();
    } catch (error) {
      setLoginMessage(error.message);
    }
  });

  byId("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    byId("passwordMessage").textContent = "";
    try {
      await request("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: byId("currentPassword").value,
          new_password: byId("newPassword").value
        })
      });
      activeUser.password_change_required = false;
      byId("currentPassword").value = "";
      byId("newPassword").value = "";
      await loadWorkspace();
      showMessage("Password updated.", false);
    } catch (error) {
      byId("passwordMessage").textContent = error.message;
    }
  });

  byId("changePasswordOpen").addEventListener("click", () => {
    passwordView.classList.remove("hidden");
    appView.classList.add("hidden");
    byId("passwordChangeTitle").textContent = "Change your password";
  });

  byId("logoutButton").addEventListener("click", async () => {
    try {
      await request("/api/auth/logout", { method: "POST", body: "{}" });
      showSignedOut();
      await getCsrfToken();
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  byId("runPeriod").value = new Date().toISOString().slice(0, 7);

  (async () => {
    try {
      await getCsrfToken();
      const result = await request("/api/auth/me");
      activeUser = result.user;
      await loadWorkspace();
    } catch (_error) {
      loginView.classList.remove("hidden");
      appView.classList.add("hidden");
    }
  })();
})();
