
import React from 'react';
import { Machine, Language, Batch, CycleTime } from '../types';
import { TRANSLATIONS } from '../constants';

interface MachineCardProps {
  machine: Machine & { cycleAchievement?: number; targetFin?: number; allLots?: Batch[] };
  lang: Language;
  shift: string;
  date: string;
  layoutRows: number;
  cycleTimes: CycleTime[];
  currentTime: Date;
  onOpenReport: (id: string) => void;
}

const MachineCard: React.FC<MachineCardProps> = ({ machine, lang, shift, date, layoutRows, cycleTimes, currentTime, onOpenReport }) => {
  const t = (key: string) => (TRANSLATIONS[lang] as any)[key] || key;

  const displayLots = machine.lots;
  const totalSet = machine.totalShiftSet || 0;
  const totalFin = machine.totalShiftFin || 0;
  const targetFin = machine.targetFin || 0;
  
  const planPercentage = totalSet > 0 ? Math.round((totalFin / totalSet) * 100) : 0;
  const cyclePercentage = machine.cycleAchievement || 0;

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Running': return { bg: 'bg-green-500', text: 'text-white', border: 'border-green-600', icon: 'text-green-500' };
      case 'Setup Required': return { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-600', icon: 'text-blue-500' };
      case 'Maintenance': return { bg: 'bg-red-500', text: 'text-white', border: 'border-red-600', icon: 'text-red-500' };
      case 'Idle': return { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600', icon: 'text-yellow-500' };
      case 'Complete': return { bg: 'bg-indigo-500', text: 'text-white', border: 'border-indigo-600', icon: 'text-indigo-500' };
      default: return { bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-600', icon: 'text-slate-400' };
    }
  };

  const styles = getStatusStyles(machine.status);

  // Responsive adjustments based on grid density
  const isCompact = layoutRows >= 3;
  const headerHeight = isCompact ? 'h-24 md:h-28' : 'h-32 md:h-40';
  const tableFontSize = isCompact ? 'text-[8px] md:text-[10px]' : 'text-[10px] md:text-sm';
  const headerFontSize = isCompact ? 'text-sm md:text-lg' : 'text-xl md:text-2xl';

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col hover:shadow-lg transition-all duration-300 h-full ${machine.status === 'Setup Required' ? 'ring-2 ring-blue-400/20' : ''}`}>
      <div className={`${headerHeight} relative flex items-center justify-center overflow-hidden border-b border-slate-200 dark:border-slate-700 group bg-slate-100 dark:bg-slate-900 shrink-0 transition-all`}>
        {machine.pictureUrl ? (
          <img src={machine.pictureUrl} alt={machine.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-20 dark:opacity-40">
             <span className={`material-icons-round ${isCompact ? 'text-3xl' : 'text-6xl'}`}>{machine.icon}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30"></div>
        <div className="absolute top-2 left-3 z-10">
          <h3 className={`${headerFontSize} font-black text-white tracking-tight drop-shadow-lg`}>{machine.name}</h3>
        </div>
        <div className="absolute top-2 right-3 z-10">
          <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-lg border ${styles.bg} ${styles.text} ${styles.border}`}>
            {t(machine.status.toLowerCase().replace(/\s+/g, '_'))}
          </span>
        </div>
      </div>

      <div className="px-3 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[8px] md:text-[10px] font-bold uppercase tracking-tight">
            <span className="text-slate-400">{t('shift_plan_progress')}</span>
            <span className="text-primary font-black">{totalFin} / {totalSet} ({planPercentage}%)</span>
          </div>
          <div className="relative w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
            <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out ${planPercentage >= 100 ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${Math.min(planPercentage, 100)}%` }} />
          </div>
        </div>

        <div className="space-y-1 group cursor-pointer" onClick={() => onOpenReport(machine.id)} title="Click to view detailed calculation report">
          <div className="flex items-center justify-between text-[8px] md:text-[10px] font-bold uppercase tracking-tight">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">{t('cycle_efficiency')}</span>
              <span className="material-icons-round text-[10px] text-slate-300 group-hover:text-brand-orange transition-colors">info</span>
            </div>
            <span className={`${cyclePercentage < 90 ? 'text-red-500' : 'text-brand-orange'} font-black`}>{totalFin} / {targetFin} ({cyclePercentage}%)</span>
          </div>
          <div className="relative w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
            <div className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out ${cyclePercentage >= 100 ? 'bg-green-500' : (cyclePercentage < 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-brand-orange')}`} style={{ width: `${Math.min(cyclePercentage, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700 table-fixed">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr>
              {['lot', 'spec', 'set', 'fin', 'start', 'end', 'recv'].map(col => (
                <th key={col} className="px-1.5 py-1.5 text-left text-[8px] md:text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter">{t(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
            {[0, 1, 2, 3].map((rowIdx) => {
              const lot = displayLots[rowIdx];
              if (!lot) return <tr key={`empty-${rowIdx}`} className="h-9 md:h-11"><td colSpan={7} className="px-2"></td></tr>;
              const isLotActive = lot.lotNo === machine.activeLotNo;
              const isSetup = machine.status === 'Setup Required' && isLotActive;
              const isRunning = machine.status === 'Running' && isLotActive;
              return (
                <tr key={rowIdx} className={`h-9 md:h-11 ${isRunning ? 'bg-green-50/70 dark:bg-green-900/10 border-l-4 border-green-500' : isSetup ? 'bg-blue-50/70 dark:bg-blue-900/10 border-l-4 border-blue-500' : ''} transition-colors`}>
                  <td className={`px-1.5 py-1 whitespace-nowrap ${tableFontSize} font-bold truncate`}>{lot.lotNo}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap ${tableFontSize} text-slate-500 dark:text-slate-400 truncate`}>{lot.spec}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap text-center ${tableFontSize} font-bold`}>{lot.set}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap text-center ${tableFontSize} font-black ${lot.fin >= lot.set ? 'text-blue-500' : 'text-green-500'}`}>{lot.fin}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap font-mono text-[8px] md:text-[10px] text-slate-400`}>{lot.start.split(' ').pop()}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap font-mono text-[8px] md:text-[10px] text-slate-400`}>{lot.end.split(' ').pop()}</td>
                  <td className={`px-1.5 py-1 whitespace-nowrap text-center ${tableFontSize} text-slate-500`}>{lot.recv}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {displayLots.length === 0 && <div className="px-4 py-8 text-center text-xs text-slate-400 italic font-medium">{t('no_job')}</div>}
      </div>
    </div>
  );
};

export default MachineCard;
