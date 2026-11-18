// UAE consultant-standard 14-point submittal index.
export const DEFAULT_INDEX = () => [
  { id: 'e1', title: 'COMPANY PROFILE', kind: 'upload' },
  { id: 'e2', title: 'COMMERCIAL LICENSE', kind: 'upload' },
  { id: 'e3', title: 'AUTHORIZATION LETTER', kind: 'upload' },
  { id: 'e4', title: 'MANUFACTURER PROFILE', kind: 'upload' },
  { id: 'e5', title: 'PUMP SCHEDULE', kind: 'schedule' },
  { id: 'e6', title: 'TECHNICAL LITERATURE – TRANSFER PUMP SET', kind: 'technical', category: 'transfer' },
  { id: 'e7', title: 'TECHNICAL LITERATURE – BOOSTER PUMP SET', kind: 'technical', category: 'booster' },
  { id: 'e8', title: 'TECHNICAL LITERATURE – BOOSTER PUMP SET - BASEMENT', kind: 'technical', category: 'booster-basement' },
  { id: 'e9', title: 'TECHNICAL LITERATURE – CIRCULATION PUMP SET', kind: 'technical', category: 'circulation' },
  { id: 'e10', title: 'TECHNICAL LITERATURE – SUMP PUMP SET', kind: 'technical', category: 'sump' },
  { id: 'e11', title: 'PREVIOUS PROJECT APPROVALS', kind: 'upload' },
  { id: 'e12', title: 'ISO CERTIFICATES', kind: 'upload' },
  { id: 'e13', title: 'COUNTRY OF ORIGIN - COPY', kind: 'upload' },
  { id: 'e14', title: 'DRAFT WARRANTY', kind: 'upload' },
].map((e) => ({ include: true, ...e }));

export const DEFAULT_PROJECT = () => ({
  projectName: '',
  client: '',
  consultant: '',
  contractor: '',
  refNo: '',
  revision: '0',
  date: new Date().toISOString().slice(0, 10),
  supplier: 'Greenland Equipment & Machinery Est. L.L.C',
  preparedBy: '',
  checkedBy: '',
  approvedBy: '',
  subject: 'Material Submittal – Water Pumps, Booster Sets & Pressure Vessels',
});
