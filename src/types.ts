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
stateOfOrigin: string;
age: string;
occupation: string;
address: string;
phone: string;
nextOfKin: string;
relationship: string;
nokAddress: string;
nokPhone: string;
category: 'single card' | 'family card' | 'antenatal' | "children's card";
createdAt: string;
registrationType: 'fresh' | 'old';
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
paymentStatus?: 'pending' | 'partial' | 'paid';
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
export interface LabRequestDetails {
hospitalClinic?: string;
ward?: string;
no?: string;
clinicalHistory?: string;
consultant?: string;
provisionalDiagnosis?: string;
natureOfSpecimen?: string;
}
export interface LabTestCatalogItem {
id: string;
name: string;
price: number;
category?: string;
createdAt: string;
updatedAt: string;
linkedResourceId?: string | null;
resourceQtyPerTest: number;
}
export interface LabResource {
id: string;
name: string;
unit: string;
stock: number;
lowStockThreshold: number;
category?: string;
createdAt: string;
updatedAt: string;
}
export interface Admission {
id: string;
patientId: string;
admittedAt: string;
admittedBy: string;
reason?: string;
dischargedAt?: string;
dischargedBy?: string;
createdAt: string;
}
export interface DrugChartEntry {
id: string;
admissionId: string;
patientId: string;
entryDate: string;
drugName: string;
dose?: string;
timeGiven?: string;
administeredBy: string;
notes?: string;
createdAt: string;
}
export interface VitalSignEntry {
id: string;
admissionId: string;
patientId: string;
entryDate: string;
timeOfDay: 'Night' | 'Morning' | 'Afternoon';
temperature?: string;
pulse?: string;
respiration?: string;
bloodPressure?: string;
recordedBy: string;
createdAt: string;
}
export interface AntenatalFollowup {
id: string;
patientId: string;
visitDate: string;
heightOfFundus?: string;
presentationPosition?: string;
foetalHeart?: string;
bloodPressure?: string;
urineTest?: string;
weight?: string;
hgbPcv?: string;
remarks?: string;
treatment?: string;
recordedBy: string;
createdAt: string;
}
export interface PreviousPregnancy {
year?: string;
duration?: string;
complication?: string;
whereDelivered?: string;
babyAliveOrDeath?: string;
ageAtDeath?: string;
}
export interface AntenatalBooking {
id: string;
patientId: string;
inPatientNo?: string;
tribe?: string;
husbandOccupation?: string;
pastMedicalHistory?: string;
lmp?: string;
edd?: string;
gravida?: string;
para?: string;
noAlive?: string;
noDead?: string;
abortion?: string;
previousPregnancies: PreviousPregnancy[];
historyPresentPregnancy?: string;
examinationBreast?: string;
examinationHeight?: string;
examinationCvs?: string;
examinationPelvis?: string;
examinationAbdomen?: string;
examinationShape?: string;
examinationSize?: string;
generalAppearance?: string;
createdBy: string;
updatedAt: string;
createdAt: string;
}
export interface Prescription {
id: string;
patientId: string;
recordId?: string;
staffId: string;
drugName: string;
drugPrice: number;
quantity: number;
paymentStatus: 'pending' | 'partial' | 'paid';
createdAt: string;
dosageMorning: number;
dosageAfternoon: number;
dosageNight: number;
durationDays: number;
route: 'Oral' | 'Injection' | 'Topical' | 'IV' | 'Other';
instructions?: string;
dispensed: boolean;
dispensedAt?: string;
dispensedBy?: string;
}
export interface BillingItem {
id: string;
itemType: 'consultation' | 'visit' | 'lab_test' | 'prescription';
description: string;
amount: number;
paymentStatus: 'pending' | 'partial' | 'paid';
createdAt: string;
paidSoFar: number;
balance: number;
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
paymentStatus: 'pending' | 'partial' | 'paid';
createdAt: string;
reportType?: 'legacy' | 'basic' | 'comprehensive';
requestDetails?: LabRequestDetails;
panelResults?: import('./data/labReportTemplates').ComprehensivePanelResults;
}
export interface ClinicalLetter {
id: string;
patientId: string;
staffId: string;
staffName?: string;
letterType: 'diagnosis' | 'referral';
yourRef?: string;
ourRef?: string;
referredTo?: string;
body: string;
createdAt: string;
updatedAt: string;
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
paymentStatus?: 'pending' | 'partial' | 'paid';
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
