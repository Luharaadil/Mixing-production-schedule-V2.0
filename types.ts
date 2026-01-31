export type MachineStatus = string;

export interface Batch {
  lotNo: string;
  spec: string;
  set: number;
  fin: number;
  recv: number;
  start: string;
  end: string;
  sequenceNumber: string;
}

export interface Machine {
  id: string;
  name: string;
  status: MachineStatus;
  type: 'mixer' | 'preparation';
  icon: string;
  pictureUrl?: string;
  activeLotNo?: string;
  lots: Batch[];
  totalShiftSet?: number;
  totalShiftFin?: number;
}

export interface CycleTime {
  id: number;
  name: string;
  time: number;
  machineType: string;
}

export type Language = 'en' | 'hi' | 'gu' | 'zh';

export interface AppState {
  category: 'mixer' | 'preparation';
  visibleMachineIds: string[];
  productionDate: string;
  shift: 'A' | 'B' | 'C';
  language: Language;
  theme: 'light' | 'dark';
}