
import React from 'react';
import { Machine, Batch, CycleTime } from '../types';

interface ReportModalProps {
  machine: Machine & { cycleAchievement?: number; targetFin?: number; allLots?: Batch[] };
  cycleTimes: CycleTime[];
  currentTime: Date;
  date: string;
  onClose: () => void;
}

const ReportModal: React.FC<ReportModalProps> = ({ machine, cycleTimes, currentTime, date, onClose }) => {
  const parseToSeconds = (timeStr: string) => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const match = timeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!match) return null;
    const h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const s = parseInt(match[3] || "0");
    const d = new Date(date + 'T00:00:00');
    d.setHours(h, m, s, 0);
    return d.getTime() / 1000;
  };

  const fullLots = machine.allLots || machine.lots;
  const firstLotStart = fullLots.find(l => l.start && l.start.includes(':'))?.start;
  const firstStartSec = firstLotStart ? parseToSeconds(firstLotStart) : null;
  const nowSec = currentTime.getTime() / 1000;
  
  // Total elapsed time since the very first lot started
  const totalElapsedSinceStart = firstStartSec ? nowSec - firstStartSec : 0;
  let accumulatedTheoreticalTime = 0;

  const lotBreakdown = fullLots.map((lot, i) => {
    const cycleTimeObj = cycleTimes.find(ct => {
      const lotSpec = lot.spec.toUpperCase().trim();
      const cycleSpec = ct.name.toUpperCase().trim();
      return lotSpec === cycleSpec || lotSpec.includes(cycleSpec) || cycleSpec.includes(lotSpec);
    });
    const ct = cycleTimeObj ? cycleTimeObj.time : 180;
    
    const startSec = parseToSeconds(lot.start);
    const endSec = parseToSeconds(lot.end) || nowSec;
    
    // Standard duration is based on Actual Finished Quantity
    const stdDurationMin = (lot.fin * ct) / 60;
    const actualDurationMin = startSec && endSec ? (endSec - startSec) / 60 : 0;
    const diffMin = actualDurationMin - stdDurationMin;
    const lotEfficiency = actualDurationMin > 0 ? Math.round((stdDurationMin / actualDurationMin) * 100) : 0;
    
    // Theoretical Target per Lot (Cumulative Logic)
    let theoreticalInLot = 0;
    if (firstStartSec) {
      const remainingGlobalTime = totalElapsedSinceStart - accumulatedTheoreticalTime;
      if (remainingGlobalTime > 0) {
        const canFit = Math.floor(remainingGlobalTime / ct);
        theoreticalInLot = Math.min(canFit, lot.set);
        accumulatedTheoreticalTime += (theoreticalInLot * ct);
      }
    }

    return { lot, ct, theoreticalInLot, stdDurationMin, actualDurationMin, diffMin, lotEfficiency };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div className="bg-white dark:bg-slate-800 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-icons-round text-brand-orange">analytics</span>
            <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
              Production Analysis: <span className="text-primary">{machine.name}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><span className="material-icons-round">close</span></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-100/50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total Finished</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white">{machine.totalShiftFin}</span>
            </div>
            <div className="bg-slate-100/50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Theoretical Target</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white">{machine.targetFin}</span>
            </div>
            <div className="bg-brand-orange/5 dark:bg-brand-orange/10 p-4 rounded-xl border border-brand-orange/20 text-center">
              <span className="block text-[10px] font-bold text-brand-orange uppercase mb-1">Global Efficiency</span>
              <span className={`text-2xl font-black ${machine.cycleAchievement && machine.cycleAchievement < 90 ? 'text-red-500' : 'text-brand-orange'}`}>{machine.cycleAchievement}%</span>
            </div>
            <div className="bg-slate-100/50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">First Lot Start</span>
              <span className="text-2xl font-black text-slate-800 dark:text-white">{firstLotStart || '--:--'}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-slate-800 shadow-sm z-10">
                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-2">Lot No</th>
                  <th className="py-3 px-2">Spec</th>
                  <th className="py-3 px-2 text-center">Set</th>
                  <th className="py-3 px-2 text-center">Act</th>
                  <th className="py-3 px-2 text-center">Tar</th>
                  <th className="py-3 px-2 text-center">Std (m)</th>
                  <th className="py-3 px-2 text-center">Act (m)</th>
                  <th className="py-3 px-2 text-center">Loss (m)</th>
                  <th className="py-3 px-2 text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {lotBreakdown.map((item, idx) => (
                  <tr key={idx} className={`text-xs hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${item.lotEfficiency < 90 ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}>
                    <td className="py-3 px-2 font-bold">{item.lot.lotNo}</td>
                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400">{item.lot.spec}</td>
                    <td className="py-3 px-2 text-center font-medium">{item.lot.set}</td>
                    <td className="py-3 px-2 text-center font-black text-primary">{item.lot.fin}</td>
                    <td className="py-3 px-2 text-center font-bold text-slate-400">{item.theoreticalInLot}</td>
                    <td className="py-3 px-2 text-center font-mono">{item.stdDurationMin.toFixed(1)}</td>
                    <td className="py-3 px-2 text-center font-mono font-bold">{item.actualDurationMin.toFixed(1)}</td>
                    <td className={`py-3 px-2 text-center font-mono font-black ${item.diffMin > 5 ? 'text-red-500' : 'text-green-500'}`}>
                      {item.diffMin > 0 ? '+' : ''}{item.diffMin.toFixed(1)}
                    </td>
                    <td className={`py-3 px-2 text-right font-black ${item.lotEfficiency < 90 ? 'text-red-500' : 'text-green-500'}`}>
                      {item.lotEfficiency}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
             <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><span className="material-icons-round text-sm">info</span>Calculation Formulas</h4>
             <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <li>• <strong className="text-slate-700 dark:text-slate-300">Target Time Base:</strong> Theoretical Target now begins from the Actual Start Time of the first lot.</li>
                <li>• <strong className="text-slate-700 dark:text-slate-300">Std (m):</strong> Calculated as (Standard Cycle Time × Actual Finished Quantity) for specific lot performance.</li>
                <li>• <strong className="text-slate-700 dark:text-slate-300">Theoretical Target (Tar):</strong> How many batches could have been finished from the first start time until now, based on standard cycle times.</li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
