$(document).ready(function () {

    const TAX_RATE = 0.1;

    function money(value) {
        return value.toFixed(2);
    }

    $("#calculateSalary").click(function () {
        const employeeName = $("#employeeName").val().trim();
        const hoursWorked = parseFloat($("#hoursWorked").val());
        const hourlyRate = parseFloat($("#hourlyRate").val());

        if (employeeName === "") {
            alert("Please enter the employee name.");
            return;
        }

        if (!isFinite(hoursWorked) || hoursWorked < 0) {
            alert("Please enter a valid number of hours worked.");
            return;
        }

        if (!isFinite(hourlyRate) || hourlyRate < 0) {
            alert("Please enter a valid hourly rate.");
            return;
        }

        const grossSalary = hoursWorked * hourlyRate;
        const taxReduction = grossSalary * TAX_RATE;
        const netSalary = grossSalary - taxReduction;

        const newRow = `
            <tr>
                <td>${$("<div>").text(employeeName).html()}</td>
                <td>${hoursWorked}</td>
                <td>${money(hourlyRate)}</td>
                <td>${money(grossSalary)}</td>
                <td>${money(taxReduction)}</td>
                <td>${money(netSalary)}</td>
            </tr>
        `;

        $("#salaryDetails").append(newRow);

        $("#employeeName").val("");
        $("#hoursWorked").val("");
        $("#hourlyRate").val("");
        $("#employeeName").focus();
    });

});
