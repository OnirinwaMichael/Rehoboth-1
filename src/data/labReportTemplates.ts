// Field definitions mirroring The Rehoboth Clinic & Maternity's physical
// laboratory forms 1:1, so the digital version can be filled, saved, and
// printed/exported to look like the paper original.

export interface TemplateField {
  key: string;
  label: string;
}

// ---- Basic Lab Request Form (single slip) ----
export const LAB_REQUEST_FIELDS: TemplateField[] = [
  { key: 'hospitalClinic', label: 'Hospital/Clinic' },
  { key: 'ward', label: 'Ward' },
  { key: 'no', label: 'No.' },
  { key: 'clinicalHistory', label: 'Clinical History' },
  { key: 'consultant', label: 'Consultant' },
  { key: 'provisionalDiagnosis', label: 'Provisional Diagnosis' },
  { key: 'natureOfSpecimen', label: 'Nature of Specimen' },
];

// ---- Comprehensive Lab Report — Haematology / BGS ----
export const HAEMATOLOGY_FIELDS: TemplateField[] = [
  { key: 'hb', label: 'Hb' },
  { key: 'pcv', label: 'PCV' },
  { key: 'wbc', label: 'WBC' },
  { key: 'mcl', label: 'MCL' },
  { key: 'esr', label: 'ESR' },
  { key: 'diffnL', label: 'DIFFN — L (20-45)' },
  { key: 'diffnM', label: 'DIFFN — M (2-10)' },
  { key: 'diffnE', label: 'DIFFN — E (1-6)' },
  { key: 'diffnB', label: 'DIFFN — B (0-1)' },
  { key: 'retics', label: 'Retics' },
  { key: 'bloodFilmComment', label: 'Blood Film Comment' },
  { key: 'sicklingTest', label: 'Sickling Test' },
  { key: 'mp', label: 'MP' },
  { key: 'plateletsCount', label: 'Platelets Count' },
  { key: 'bleedingTime', label: 'Bleeding Time' },
  { key: 'clottingTime', label: 'Clotting Time' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'genotype', label: 'Genotype' },
  { key: 'haefTest', label: 'HAEF Test' },
  { key: 'vdrl', label: 'VDRL' },
  { key: 'rfFactor', label: 'RF Factor' },
  { key: 'hivScreening', label: 'HIV I & II Screening' },
  { key: 'mantouxTest', label: 'Mantoux Test' },
  { key: 'hepatitisA', label: 'Hepatitis Screening A' },
  { key: 'hepatitisB', label: 'Hepatitis Screening B' },
  { key: 'hepatitisC', label: 'Hepatitis Screening C' },
  { key: 'hepatitisD', label: 'Hepatitis Screening D' },
];

// ---- Widal Test ----
export const WIDAL_FIELDS: TemplateField[] = [
  { key: 'salmonellaTyphiH', label: 'Salmonella typhi "H"' },
  { key: 'salmonellaTyphiO', label: 'Salmonella typhi "O"' },
  { key: 'salmonellaParatyphiHA', label: 'Salmonella paratyphi "HA"' },
  { key: 'salmonellaParatyphiOA', label: 'Salmonella paratyphi "OA"' },
  { key: 'salmonellaParatyphiHB', label: 'Salmonella paratyphi "HB"' },
  { key: 'salmonellaParatyphiOB', label: 'Salmonella paratyphi "OB"' },
  { key: 'salmonellaParatyphiHC', label: 'Salmonella paratyphi "HC"' },
  { key: 'salmonellaParatyphiOC', label: 'Salmonella paratyphi "OC"' },
];
export const WIDAL_SIGNIFICANT_TITRE = 'Significant Titre >/ 1:80';

// ---- Urinalysis ----
export const URINALYSIS_FIELDS: TemplateField[] = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'ph', label: 'PH' },
  { key: 'protein', label: 'Protein' },
  { key: 'glucose', label: 'Glucose' },
  { key: 'ketone', label: 'Ketone' },
  { key: 'bilirubin', label: 'Bilirubin' },
  { key: 'urobilinogen', label: 'Urobilinogen' },
  { key: 'nitrate', label: 'Nitrate' },
  { key: 'ascorbicAcid', label: 'Ascorbic Acid' },
  { key: 'scr', label: 'Scr' },
  { key: 'rbc', label: 'RBC' },
  { key: 'others', label: 'Others' },
];

// ---- Parasitology ----
export const PARASITOLOGY_FIELDS: TemplateField[] = [
  { key: 'skinSnipMicrofilaria', label: 'Skin Snip for Microfilaria' },
  { key: 'bloodMicrofilaria', label: 'Blood for Microfilaria' },
  { key: 'stool', label: 'Stool' },
  { key: 'macroscopy', label: 'Macroscopy' },
  { key: 'microscopy', label: 'Microscopy' },
  { key: 'wetPreparation', label: 'Wet Preparation' },
];

// ---- Semen Analysis ----
export const SEMEN_ANALYSIS_FIELDS: TemplateField[] = [
  { key: 'timeProduced', label: 'Time Produced' },
  { key: 'timeReceived', label: 'Time Received' },
  { key: 'timeAnalyzed', label: 'Time Analyzed' },
  { key: 'pAbstinence', label: 'P. Abstinence' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'volume', label: 'Volume' },
  { key: 'mthOfProduction', label: 'Mth of Production' },
  { key: 'motilityRate', label: 'Motility Rate (%)' },
  { key: 'liquefactionPeriod', label: 'Liquefaction Period' },
  { key: 'odour', label: 'Odour' },
  { key: 'stainingReaction', label: 'Staining Reaction' },
  { key: 'active', label: 'Active' },
  { key: 'sluggish', label: 'Sluggish' },
  { key: 'dead', label: 'Dead' },
  { key: 'totalSpermCount', label: 'Total Sperm Count (Million/ml)' },
  { key: 'morphologyAbnormality', label: 'Morphology/Abnormality' },
];

// ---- Biochemistry ----
export const BIOCHEMISTRY_FIELDS: TemplateField[] = [
  { key: 'fbs', label: 'FBS (3.6-6.9mmol/L)' },
  { key: 'rbs', label: 'RBS (6.9-10.0mmol/L)' },
  { key: 'twoHrs', label: '2HRS' },
  { key: 'pregnancyTest', label: 'Pregnancy Test' },
  { key: 'psa', label: 'Prostrate Specific Antigen (PSA)' },
];

// ---- Culture / Microscopy specimen grid ----
export const CULTURE_SPECIMEN_TYPES = [
  'Culture', 'Skin', 'Sputum', 'Blood', 'Stool', 'Urine',
  'High Vagina Swab', 'Urethral Swab', 'Ear Swab', 'Nasal Swab',
  'Wound Swab', 'CSF', 'Semen', 'Eye Swab',
];
export const MICROSCOPY_FINDINGS = [
  'Microscopy', 'Epithelial cells', 'Pus cells', 'RBS', 'Bacteria',
  'Cast', 'Crystal', 'Yeast cells', 'T.V.', 'S haematobium', 'Others',
];

// ---- Blood Transfusion ----
export const BLOOD_TRANSFUSION_FIELDS: TemplateField[] = [
  { key: 'donorBloodGroup', label: "Donor's Blood Group" },
  { key: 'recipientBloodGroup', label: "Recipient's Blood Group" },
  { key: 'crossMatchingTest', label: 'Cross-matching Test' },
  { key: 'hepatitisScreening', label: 'Hepatitis Screening' },
  { key: 'hivScreening', label: 'HIV I & II Screening' },
  { key: 'noOfPintOfBlood', label: 'No. of Pint of Blood' },
];

// ---- Gram's Reaction / Antibiotic Sensitivity Pattern ----
export const SENSITIVITY_ANTIBIOTICS: string[] = [
  'AMPICILLIN', 'AMPICLOX', 'AMOXYCILLIN', 'AUDUMENTIN', 'CIPROTAB', 'MAXPAN', 'COTRIMOXAZOLE',
  'CLOXACILLIN', 'CLAVAMOX', 'DAXIMIN', 'ERYTHROMYCIN', 'MALIDIXIC ACID', 'GENTAMICIN', 'NORBACTIN', 'NITROFURANTOIN',
  'FIXIME', 'PROCAINEPEN', 'PEFLOTAB', 'PEFLACINE', 'ROCEPHIN', 'RAINCEF', 'STREPTOMYCIN', 'AZITHROMYCIN',
  'SPARDIUM', 'TRAFLOX', 'UNZYN', 'ZINNAT', 'ZITHROMAX', 'TETRADOX', 'TETRACYCLINE', 'TARIVID',
];

export interface ComprehensivePanelResults {
  haematology?: Record<string, string>;
  widal?: Record<string, string>;
  urinalysis?: Record<string, string>;
  parasitology?: Record<string, string>;
  semenAnalysis?: Record<string, string>;
  biochemistry?: Record<string, string>;
  cultureMicroscopy?: Record<string, Record<string, string>>; // specimenType -> finding -> value
  bloodTransfusion?: Record<string, string>;
  sensitivity?: Record<string, { rate: string; result: 'S' | 'R' | '' }>; // antibiotic -> reading
  clinicNo?: string;
  clinician?: string;
  clinicalDiagnosis?: string;
  specimen?: string;
}

export const emptyPanelResults = (): ComprehensivePanelResults => ({
  haematology: {}, widal: {}, urinalysis: {}, parasitology: {},
  semenAnalysis: {}, biochemistry: {}, cultureMicroscopy: {},
  bloodTransfusion: {}, sensitivity: {},
  clinicNo: '', clinician: '', clinicalDiagnosis: '', specimen: '',
});
