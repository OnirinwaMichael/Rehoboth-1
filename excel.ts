import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, parseISO } from 'date-fns';
import { FinancialRecord, Expense } from '../types';
interface ReportData {
income: FinancialRecord[];
expenses: Expense[];
}
export const generateFinancialReport = (data: ReportData) => {
const wb = XLSX.utils.book_new();
const processData = (startDate: Date, endDate: Date) => {
const periodIncome = data.income.filter(r => {
const date = parseISO(r.createdAt);
return isWithinInterval(date, { start: startDate, end: endDate });
});
const periodExpenses = data.expenses.filter(e => {
const date = parseISO(e.createdAt);
return isWithinInterval(date, { start: startDate, end: endDate });
});
const totalIncome = periodIncome.reduce((acc, r) => acc + r.paidAmount, 0);
const totalExpenses = periodExpenses.reduce((acc, e) => acc + e.amount, 0);
const netProfit = totalIncome - totalExpenses;
const rows = [
['Financial Statement', `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`],
[],
['INCOME'],
['Date', 'Patient ID', 'Description', 'Method', 'Amount'],
...periodIncome.map(r => [
format(parseISO(r.createdAt), 'yyyy-MM-dd HH:mm'),
r.patientId,
'Medical Services',
r.paymentMethod,
r.paidAmount
]),
['', '', '', 'Total Income', totalIncome],
[],
['EXPENSES'],
['Date', 'Category', 'Description', 'Staff ID', 'Amount'],
...periodExpenses.map(e => [
format(parseISO(e.createdAt), 'yyyy-MM-dd HH:mm'),
e.category,
e.description,
e.staffId,
e.amount
]),
['', '', '', 'Total Expenses', totalExpenses],
[],
['SUMMARY'],
['Total Income', totalIncome],
['Total Expenses', totalExpenses],
['Net Profit/Loss', netProfit],
];
return XLSX.utils.aoa_to_sheet(rows);
};
const now = new Date();
// Daily (Today)
const dailyStart = new Date(now.setHours(0, 0, 0, 0));
const dailyEnd = new Date(now.setHours(23, 59, 59, 999));
XLSX.utils.book_append_sheet(wb, processData(dailyStart, dailyEnd), 'Daily');
// Weekly (Sunday as first day)
const weeklyStart = startOfWeek(now, { weekStartsOn: 0 });
const weeklyEnd = endOfWeek(now, { weekStartsOn: 0 });
XLSX.utils.book_append_sheet(wb, processData(weeklyStart, weeklyEnd), 'Weekly');
// Monthly
const monthlyStart = startOfMonth(now);
const monthlyEnd = endOfMonth(now);
XLSX.utils.book_append_sheet(wb, processData(monthlyStart, monthlyEnd), 'Monthly');
// Annual
const annualStart = startOfYear(now);
const annualEnd = endOfYear(now);
XLSX.utils.book_append_sheet(wb, processData(annualStart, annualEnd), 'Annual');
const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
saveAs(dataBlob, `Financial_Statement_${format(now, 'yyyy-MM-dd')}.xlsx`);
};
