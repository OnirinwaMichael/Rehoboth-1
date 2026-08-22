export type UserRole = 'CMD' | 'Doctor' | 'Nurse' | 'Lab' | 'Accountant' | 'Receptionist' | 'Pharmacy';
export interface User {
uid: string;
email: string;
role: UserRole;
name: string;
status: 'active' | 'inactive' | 'invited';
photoURL?: string;
phone?: string;
}
export interface Patient {
cardId: string;
name: string;
gender: 'male' | 'female';
dob: string;
stateOfOrigin: string;
age: number;
occupation: string;
address: string;
phone: string;
nextOfKin: string;
relationship: string;
nokAddress: string;
nokPhone: string;
category: 'single card' | 'family card' | 'antenatal' | "children's card";
createdAt: string;
}
export interface Vitals {
bloodPressure?: string;
temperature?: string;
sugarLevel?: string;
pulse?: string;
respiratoryRate?: string;
spo2?: string;
weight?: string;
}
export interface MedicalRecord {
id: string;
patientId: string;
staffId: string;
vitals?: Vitals;
diagnosis?: string;
prescriptions?: string[];
recommendedTests?: string[];
admissionRecommended?: boolean;
cSectionRecommended?: boolean;
paymentFee?: number;
paymentStatus?: 'pending' | 'paid';
dispensed?: boolean;
dispensedAt?: string;
dispensedBy?: string;
createdAt: string;
}
export interface LabResultParameter {
parameter: string;
result: string;
range: string;
unit: string;
}
export interface LabTest {
id: string;
patientId: string;
recordId?: string;
testType: string;
price?: number;
result?: string;
structuredResults?: LabResultParameter[];
imageUrl?: string;
paymentStatus: 'pending' | 'paid';
createdAt: string;
}
export interface FinancialRecord {
id: string;
patientId: string;
totalAmount: number;
paidAmount: number;
pendingAmount: number;
paymentStatus: 'fully paid' | 'partially paid';
paymentMethod: 'cash' | 'bank transfer';
reconciled?: boolean;
reconciledAt?: string;
reconciledBy?: string;
createdAt: string;
}
export interface InventoryItem {
id: string;
name: string;
price: number;
stock: number;
category: string;
lastUpdated: string;
}
export interface AuditLog {
id: string;
staffId: string;
action: string;
details: string;
timestamp: string;
}
export interface Visit {
id?: string;
patientId: string;
timestamp: string;
diagnosis: string;
labResults: string;
structuredLabNote?: string;
prescription: string;
prescriptionNote?: string;
billingAmount: number;
paymentStatus?: 'pending' | 'paid';
staffId: string;
}
export interface Appointment {
id: string;
patientId: string;
patientName: string;
doctorId: string;
doctorName: string;
date: string;
time: string;
reason: string;
status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
createdAt: string;
updatedAt: string;
}
export interface Expense {
id: string;
description: string;
amount: number;
category: 'salaries' | 'utilities' | 'supplies' | 'maintenance' | 'others';
staffId: string;
createdAt: string;
}
