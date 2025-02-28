$(document).ready(function (){

    $("#calculateSalary").click(function(){
        let employeeName = $("#employeeName").val();
        let hoursWorked = parseFloat($("#employeeName").val());
        let hourlyRate = parseFloat($("#hourlyWorked").val());
    
        let grossSalary = hoursWorked * hourlyRate;
        let taxReduction = 0.1 * grossSalary;
        let netSalary = grossSalary - taxReduction
         
   
    // add table data
    let newRow =`
    
    <tr>
    
    <td>${employeeName}</td>
    <td>${hoursWorked}</td>
    <td>${hourlyRate}</td>
    <td>${grossSalary}</td>
    <td>${taxReduction}</td>
    <td>${netSalary}</td>
    
    </tr>
    
    `
$("#salaryDetails").append(newRow);


});

});