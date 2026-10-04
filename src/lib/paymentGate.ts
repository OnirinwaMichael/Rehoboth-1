// "Verified" means the receptionist has recorded money against the bill, in full or in part.
// Only 'pending' (nothing recorded yet) keeps Lab entry and Pharmacy dispensing locked.
// A part-paid bill stays open in Finance > Pending Bills until the balance is collected.
// The database enforces the same rule (migration 0022); this keeps the screens in step with it.
export const paymentRecorded = (status?: string | null): boolean =>
  status === 'paid' || status === 'partial';
