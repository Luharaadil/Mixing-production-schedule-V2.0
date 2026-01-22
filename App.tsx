
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Machine, Batch, Language, MachineStatus, CycleTime } from './types';
import { INITIAL_MACHINES, INITIAL_CYCLE_TIMES, TRANSLATIONS } from './constants';
import MachineCard from './components/MachineCard';
import ReportModal from './components/ReportModal';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1QomV7ceg4MLr0Y6mOM7n2OoYmZgO5D0xN6A3lC13-lg/export?format=csv&gid=0';

const App: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>(INITIAL_MACHINES);
  const [cycleTimes, setCycleTimes] = useState<CycleTime[]>(INITIAL_CYCLE_TIMES);
  const [category, setCategory] = useState<'mixer' | 'preparation'>('mixer');
  const [visibleIds, setVisibleIds] = useState<string[]>(INITIAL_MACHINES.map(m => m.id));
  const [lang, setLang] = useState<Language>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [shift, setShift] = useState<'A' | 'B' | 'C'>('A');
  const pageSize = 3; 
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [isConfigOpen, setConfigOpen] = useState(false);
  const [reportMachineId, setReportMachineId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sheetUpdatedTime, setSheetUpdatedTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineCategory, setNewMachineCategory] = useState<'mixer' | 'preparation'>('mixer');
  const [newMachinePicture, setNewMachinePicture] = useState<string | undefined>(undefined);
  
  const [newCycleName, setNewCycleName] = useState('');
  const [newCycleTime, setNewCycleTime] = useState('');
  const [newCycleMachineType, setNewCycleMachineType] = useState('Mixer');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const isMobile = windowWidth < 768;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      fetchSheetData();
    }, 120000);
    return () => clearInterval(refreshTimer);
  }, [productionDate, shift]);

  useEffect(() => {
    fetchSheetData();
  }, [productionDate, shift]);

  useEffect(() => {
    setCurrentPage(1);
  }, [category, visibleIds, shift, productionDate]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const parseDateTimeToSeconds = (dateTimeStr: string) => {
    if (!dateTimeStr || dateTimeStr === '--:--' || dateTimeStr === 'START') return null;
    const timeMatch = dateTimeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!timeMatch) return null;
    const hrs = parseInt(timeMatch[1]);
    const mins = parseInt(timeMatch[2]);
    const secs = parseInt(timeMatch[3] || "0");
    const d = new Date(productionDate + 'T00:00:00');
    d.setHours(hrs, mins, secs, 0);
    return d.getTime();
  };

  const calculateTheoreticalFin = (machineLots: Batch[]) => {
    if (machineLots.length === 0) return 0;
    
    // Theoretical Target begins from the Actual Start Time of the first lot in the list.
    const firstLotWithStartTime = machineLots.find(l => l.start && l.start.includes(':'));
    if (!firstLotWithStartTime) return 0;
    
    const firstStartTimestamp = parseDateTimeToSeconds(firstLotWithStartTime.start);
    if (!firstStartTimestamp) return 0;
    
    const nowTimestamp = currentTime.getTime();
    let remainingSeconds = (nowTimestamp - firstStartTimestamp) / 1000;
    if (remainingSeconds <= 0) return 0;
    
    let theoreticalCount = 0;
    for (let i = 0; i < machineLots.length; i++) {
      const lot = machineLots[i];
      const cycleTimeObj = cycleTimes.find(ct => {
        const lotSpec = lot.spec.toUpperCase().trim();
        const cycleSpec = ct.name.toUpperCase().trim();
        return lotSpec === cycleSpec || lotSpec.includes(cycleSpec) || cycleSpec.includes(lotSpec);
      });
      const batchCycleSeconds = cycleTimeObj ? cycleTimeObj.time : 180;
      
      const maxPossibleBatches = Math.floor(remainingSeconds / batchCycleSeconds);
      const batchesCanDo = Math.min(maxPossibleBatches, lot.set);
      
      theoreticalCount += batchesCanDo;
      remainingSeconds -= (batchesCanDo * batchCycleSeconds);
      
      if (remainingSeconds < batchCycleSeconds || batchesCanDo < lot.set) break;
    }
    
    return theoreticalCount;
  };

  const fetchSheetData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${SHEET_URL}&cache_bust=${Date.now()}`);
      const csvText = await response.text();
      const rows = csvText.split('\n').map(row => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
          if (row[i] === '"') inQuotes = !inQuotes;
          else if (row[i] === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else current += row[i];
        }
        result.push(current.trim());
        return result;
      });

      if (rows.length > 0 && rows[0][0]) {
        const timestamp = rows[0][0].replace(/^"|"$/g, '').trim();
        setSheetUpdatedTime(timestamp);
      }

      const runningDataMap: Record<string, { fin: number, start: string, end: string }> = {};
      rows.forEach(row => {
        const lotKey = row[3];
        if (lotKey && lotKey !== 'LOT NO') {
          runningDataMap[lotKey] = {
            fin: parseInt(row[5]) || 0,
            start: row[8] || '--:--',
            end: row[9] || '--:--'
          };
        }
      });

      const machineBatches: Record<string, Batch[]> = {};
      rows.slice(1).forEach(row => {
        if (row.length < 29) return; 
        const machineNo = row[14];
        const lotNo = row[16];
        const spec = row[17];
        const setValue = parseInt(row[19]) || 0;
        const schedDate = row[28];
        const schedShiftVal = row[21];
        const rowShift = schedShiftVal === '1' ? 'A' : schedShiftVal === '3' ? 'B' : schedShiftVal === '5' ? 'C' : '';
        const isSameDate = schedDate.includes(productionDate) || productionDate.includes(schedDate);
        
        if (rowShift === shift && isSameDate) {
          if (!machineBatches[machineNo]) machineBatches[machineNo] = [];
          const actuals = runningDataMap[lotNo] || { fin: 0, start: '--:--', end: '--:--' };
          const adjustedSet = Math.max(setValue, actuals.fin);
          machineBatches[machineNo].push({ lotNo, spec, set: adjustedSet, fin: actuals.fin, recv: 0, start: actuals.start, end: actuals.end });
        }
      });

      setMachines(prev => prev.map(m => {
        let allLotsForMachine = machineBatches[m.name] || machineBatches[m.id] || [];
        allLotsForMachine.sort((a, b) => (a.start !== '--:--' && b.start !== '--:--') ? a.start.localeCompare(b.start) : 0);
        const totalShiftSet = allLotsForMachine.reduce((acc, lot) => acc + lot.set, 0);
        const totalShiftFin = allLotsForMachine.reduce((acc, lot) => acc + lot.fin, 0);

        let lastStartedIdx = -1;
        for (let i = allLotsForMachine.length - 1; i >= 0; i--) {
          if (allLotsForMachine[i].fin > 0) {
            lastStartedIdx = i;
            break;
          }
        }
        let newStatus: MachineStatus = 'Idle';
        let activeLotNo = '';
        let displayPivotIdx = 0;
        if (allLotsForMachine.length > 0) {
          if (lastStartedIdx === -1) {
            newStatus = 'Setup Required';
            activeLotNo = allLotsForMachine[0].lotNo;
            displayPivotIdx = 0;
          } else {
            const currentLot = allLotsForMachine[lastStartedIdx];
            if (currentLot.fin < currentLot.set) {
              newStatus = 'Running';
              activeLotNo = currentLot.lotNo;
              displayPivotIdx = lastStartedIdx;
            } else {
              if (lastStartedIdx < allLotsForMachine.length - 1) {
                newStatus = 'Setup Required';
                activeLotNo = allLotsForMachine[lastStartedIdx + 1].lotNo;
                displayPivotIdx = lastStartedIdx + 1;
              } else {
                newStatus = 'Complete';
                activeLotNo = currentLot.lotNo;
                displayPivotIdx = lastStartedIdx;
              }
            }
          }
        }
        const startIdx = Math.max(0, displayPivotIdx - 1);
        const displayLots = allLotsForMachine.slice(startIdx, startIdx + 4);
        return {
          ...m,
          status: m.status === 'Maintenance' ? 'Maintenance' : newStatus,
          activeLotNo,
          lots: displayLots,
          allLots: allLotsForMachine, 
          totalShiftSet,
          totalShiftFin
        } as Machine & { allLots: Batch[] };
      }));
    } catch (error) {
      console.error('Error fetching sheet data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const machinesWithEfficiency = useMemo(() => {
    return machines.map(m => {
      const fullLots = (m as any).allLots || m.lots;
      const theoreticalTarget = calculateTheoreticalFin(fullLots);
      const actualFin = m.totalShiftFin || 0;
      const cycleAchievement = theoreticalTarget > 0 
        ? Math.round((actualFin / theoreticalTarget) * 100) 
        : (actualFin > 0 ? 100 : 0); 
      return {
        ...m,
        targetFin: theoreticalTarget,
        cycleAchievement: Math.min(cycleAchievement, 150)
      };
    });
  }, [machines, currentTime, cycleTimes, productionDate]);

  const filteredMachines = useMemo(() => {
    return machinesWithEfficiency.filter(m => m.type === category && visibleIds.includes(m.id));
  }, [machinesWithEfficiency, category, visibleIds]);

  const totalPages = Math.max(1, Math.ceil(filteredMachines.length / pageSize));

  const paginatedMachines = useMemo(() => {
    if (isMobile) return filteredMachines;
    const start = (currentPage - 1) * pageSize;
    return filteredMachines.slice(start, start + pageSize);
  }, [filteredMachines, currentPage, pageSize, isMobile]);

  const summary = useMemo(() => {
    const activeMachines = filteredMachines;
    let totalSet = 0;
    let totalFin = 0;
    let totalTarget = 0;
    activeMachines.forEach(m => {
      totalSet += m.totalShiftSet || 0;
      totalFin += m.totalShiftFin || 0;
      totalTarget += (m as any).targetFin || 0;
    });
    const setAchievement = totalSet > 0 ? Math.round((totalFin / totalSet) * 100) : 0;
    const cycleAchievement = totalTarget > 0 ? Math.round((totalFin / totalTarget) * 100) : 0;
    return { totalSet, totalFin, setAchievement, cycleAchievement };
  }, [filteredMachines]);

  const reportMachine = useMemo(() => 
    machinesWithEfficiency.find(m => m.id === reportMachineId) || null
  , [reportMachineId, machinesWithEfficiency]);

  const t = (key: string) => (TRANSLATIONS[lang] as any)[key] || key;

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

  const toggleMachineVisibility = (id: string) => {
    setVisibleIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const handleSelectAllInDept = () => {
    const deptIds = machines.filter(m => m.type === category).map(m => m.id);
    setVisibleIds(prev => [...new Set([...prev, ...deptIds])]);
  };

  const handleSelectNoneInDept = () => {
    const deptIds = machines.filter(m => m.type === category).map(m => m.id);
    setVisibleIds(prev => prev.filter(id => !deptIds.includes(id)));
  };

  const updateMachineStatus = (id: string, status: MachineStatus) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, status } : m));
  };

  const handleAddMachine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineName.trim()) return;
    const id = newMachineName.replace(/\s+/g, '-').toUpperCase();
    const newMachine: Machine = { id, name: newMachineName, status: 'Idle', type: newMachineCategory, icon: newMachineCategory === 'mixer' ? 'blender' : 'science', pictureUrl: newMachinePicture, lots: [] };
    setMachines(prev => [...prev, newMachine]);
    setVisibleIds(prev => [...prev, id]);
    setNewMachineName('');
    setNewMachinePicture(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteMachine = (id: string) => {
    setMachines(prev => prev.filter(m => m.id !== id));
    setVisibleIds(prev => prev.filter(vid => vid !== id));
  };

  const handleAddCycleTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCycleName.trim() || !newCycleTime) return;
    const newEntry: CycleTime = { id: Date.now(), name: newCycleName, time: parseInt(newCycleTime), machineType: newCycleMachineType };
    setCycleTimes(prev => [...prev, newEntry]);
    setNewCycleName('');
    setNewCycleTime('');
  };

  const handleDeleteCycleTime = (id: number) => setCycleTimes(prev => prev.filter(c => c.id !== id));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewMachinePicture(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300`}>
      {/* Sidebar / Options View */}
      <aside className={`bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col z-50 transition-all duration-300 
        ${isMobile ? (isSidebarOpen ? 'fixed inset-0 w-full shadow-2xl' : 'w-0 overflow-hidden border-none pointer-events-none') : (isSidebarOpen ? 'w-80' : 'w-0 overflow-hidden border-none')}`}>
        
        <div className="h-20 shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
          <h1 className="font-black text-lg tracking-tighter text-slate-900 dark:text-white leading-tight">
            {t('brand').split(' ').slice(0, 1)}<br/>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('brand').split(' ').slice(1).join(' ')}</span>
          </h1>
          {isMobile && (
            <button onClick={toggleSidebar} className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-3 py-2.5 rounded-2xl text-[10px] font-black shadow-xl shadow-primary/30 transition-all active:scale-95">
              <span className="material-icons-round text-sm">grid_view</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('date')}</label>
            <div className="relative group cursor-pointer" onClick={() => dateInputRef.current?.showPicker()}>
              <span className="material-icons-round absolute left-3 top-3 text-slate-400 text-sm group-hover:text-primary transition-colors z-10 pointer-events-none">calendar_today</span>
              <input ref={dateInputRef} type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer transition-all" />
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('shift')}</label>
            <div className="grid grid-cols-3 gap-3">
              {['A', 'B', 'C'].map(s => (
                <button key={s} onClick={() => setShift(s as any)} className={`py-3 rounded-xl text-xs font-black transition-all border ${shift === s ? 'bg-primary text-white border-primary shadow-xl shadow-primary/20 scale-105' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-primary'}`}>{s}</button>
              ))}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('dept')}</label>
            <div className="space-y-3">
              <button onClick={() => setCategory('mixer')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl font-bold transition-all border ${category === 'mixer' ? 'bg-primary/10 text-primary border-primary/20 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-transparent'}`}>
                <div className="flex items-center"><span className="material-icons-round mr-4 text-xl">blender</span><span>{t('mixer')}</span></div>
                <span className={`text-[10px] px-3 py-1 rounded-full font-black ${category === 'mixer' ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-500'}`}>{machines.filter(m => m.type === 'mixer').length}</span>
              </button>
              <button onClick={() => setCategory('preparation')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl font-bold transition-all border ${category === 'preparation' ? 'bg-primary/10 text-primary border-primary/20 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-transparent'}`}>
                <div className="flex items-center"><span className="material-icons-round mr-4 text-xl">science</span><span>{t('prep')}</span></div>
                <span className={`text-[10px] px-3 py-1 rounded-full font-black ${category === 'preparation' ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-500'}`}>{machines.filter(m => m.type === 'preparation').length}</span>
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('filter')}</label>
              <div className="flex gap-4">
                <button onClick={handleSelectAllInDept} className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest">{t('all')}</button>
                <button onClick={handleSelectNoneInDept} className="text-[10px] font-black text-slate-400 hover:underline uppercase tracking-widest">{t('none')}</button>
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-700 p-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
              {machines.filter(m => m.type === category).map(m => (
                <button key={m.id} onClick={() => toggleMachineVisibility(m.id)} className={`w-full flex items-center gap-4 px-4 py-2 rounded-xl transition-all text-xs font-black ${visibleIds.includes(m.id) ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-md border border-slate-200 dark:border-slate-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <span className={`w-2 h-2 rounded-full ${visibleIds.includes(m.id) ? 'bg-primary shadow-[0_0_8px_rgba(14,165,233,0.5)]' : 'bg-slate-300'}`}></span>
                  {m.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('lang')}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 cursor-pointer outline-none transition-all">
              <option value="en">English</option><option value="hi">Hindi (हिंदी)</option><option value="gu">Gujarati (ગુજરાતી)</option><option value="zh">Chinese (中文)</option>
            </select>
          </section>

          <section>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t('theme')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTheme('light')} className={`flex items-center justify-center gap-3 py-3 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest ${theme === 'light' ? 'bg-primary text-white border-primary shadow-xl shadow-primary/20' : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                <span className="material-icons-round text-sm">light_mode</span> Light
              </button>
              <button onClick={() => setTheme('dark')} className={`flex items-center justify-center gap-3 py-3 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest ${theme === 'dark' ? 'bg-slate-900 text-white border-slate-800 shadow-xl shadow-black/40' : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                <span className="material-icons-round text-sm">dark_mode</span> Dark
              </button>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-4 shrink-0">
          <button onClick={() => setConfigOpen(true)} className="flex items-center w-full justify-center px-6 py-4 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all group active:scale-95 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-primary hover:text-primary shadow-sm"><span className="material-icons-round text-sm mr-3 group-hover:rotate-180 transition-transform duration-700">settings</span><span>{t('config')}</span></button>
        </div>
      </aside>

      {/* Main Content View */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden relative transition-opacity duration-300 ${isMobile && isSidebarOpen ? 'opacity-0' : 'opacity-100'}`}>
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-col h-auto shrink-0 relative z-20 shadow-sm">
          <div className="flex items-center justify-between px-2 md:px-8 h-16 md:h-24 relative">
            <button onClick={toggleSidebar} className="p-2 md:p-3 rounded-2xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-90 flex items-center gap-1 border border-slate-100 dark:border-slate-700 hover:border-slate-200">
              <span className="material-icons-round">{isSidebarOpen ? 'menu_open' : 'menu'}</span>
            </button>
            
            <h1 className="flex-1 px-2 text-center font-black text-brand-orange uppercase tracking-tighter text-[10px] sm:text-sm md:text-3xl drop-shadow-sm select-none mobile-title-shrink">
              {t('title')}
            </h1>
            
            <div className="flex items-center gap-1 md:gap-3">
               {isLoading && <span className="material-icons-round animate-spin text-primary text-xs md:text-base">refresh</span>}
               <button onClick={fetchSheetData} className="p-2 md:p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all active:rotate-180 duration-500 shrink-0 border border-transparent hover:border-slate-200" title="Refresh Data"><span className="material-icons-round text-lg md:text-2xl">refresh</span></button>
               <div className="hidden lg:flex flex-col items-end bg-slate-50 dark:bg-slate-900/50 px-4 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
                  <span className="block text-[8px] uppercase font-black text-slate-400 leading-none mb-1">Last Update</span>
                  <span className="block text-xs font-mono font-black text-primary leading-none">
                    {sheetUpdatedTime || currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
               </div>
            </div>
          </div>
          
          <div className="flex items-center justify-center pb-5 px-2 md:px-4 overflow-x-auto no-scrollbar">
            <div className="bg-slate-100/50 dark:bg-slate-900/80 px-4 md:px-16 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-wrap md:flex-nowrap gap-x-4 md:gap-x-20 gap-y-2 md:gap-y-3 shadow-xl justify-center items-center backdrop-blur-sm">
                <div className="flex flex-col items-center"><span className="text-[7px] md:text-[10px] font-black text-slate-400 uppercase leading-none mb-1 md:mb-1.5 tracking-widest">Total Plan</span><span className="text-xs md:text-3xl font-black text-slate-800 dark:text-white leading-none tracking-tighter">{summary.totalSet}</span></div>
                <div className="flex flex-col items-center"><span className="text-[7px] md:text-[10px] font-black text-slate-400 uppercase leading-none mb-1 md:mb-1.5 tracking-widest">Finished</span><span className="text-xs md:text-3xl font-black text-primary leading-none tracking-tighter">{summary.totalFin}</span></div>
                <div className="flex flex-col items-center"><span className="text-[7px] md:text-[10px] font-black text-slate-400 uppercase leading-none mb-1 md:mb-1.5 tracking-widest">Plan Achievement</span><span className={`text-xs md:text-3xl font-black leading-none tracking-tighter ${summary.setAchievement >= 100 ? 'text-green-500' : 'text-primary'}`}>{summary.setAchievement}%</span></div>
                <div className="hidden md:block w-px h-10 bg-slate-200 dark:bg-slate-700 mx-2"></div>
                <div className="flex flex-col items-center"><span className="text-[7px] md:text-[10px] font-black text-brand-orange uppercase leading-none mb-1 md:mb-1.5 tracking-widest">Cycle Efficiency</span><span className={`text-xs md:text-3xl font-black leading-none tracking-tighter ${summary.cycleAchievement >= 100 ? 'text-green-500' : (summary.cycleAchievement < 90 ? 'text-red-500' : 'text-brand-orange')}`}>{summary.cycleAchievement}%</span></div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 dark:bg-slate-900/50 custom-scrollbar pb-32">
          <div className="grid gap-6 md:gap-6 items-stretch" style={{ gridTemplateColumns: paginatedMachines.length > 0 ? `repeat(${isMobile ? 1 : Math.min(paginatedMachines.length, 3)}, minmax(0, 1fr))` : '1fr' }}>
            {paginatedMachines.length > 0 ? paginatedMachines.map(m => (
              <MachineCard key={m.id} machine={m} lang={lang} shift={shift} date={productionDate} layoutRows={1} cycleTimes={cycleTimes} currentTime={currentTime} onOpenReport={(id) => setReportMachineId(id)} />
            )) : (
              <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 opacity-60">
                <span className="material-icons-round text-9xl mb-6">analytics</span>
                <p className="text-2xl font-black uppercase tracking-[0.2em]">No data selected</p>
                <p className="text-sm font-bold mt-2">Activate machines in the sidebar to view metrics</p>
              </div>
            )}
          </div>

          {totalPages > 1 && !isMobile && (
            <div className="flex items-center justify-center gap-4 mt-12 py-6">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-black hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-20 transition-all shadow-lg active:scale-95 uppercase tracking-[0.2em]"
              >
                <span className="material-icons-round text-base">chevron_left</span> {t('prev')}
              </button>
              
              <div className="flex items-center gap-3">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-14 h-14 rounded-2xl text-sm font-black transition-all flex items-center justify-center border shadow-xl ${currentPage === page ? 'bg-primary border-primary text-white scale-110 shadow-primary/40' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-primary hover:text-primary'}`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-black hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-20 transition-all shadow-lg active:scale-95 uppercase tracking-[0.2em]"
              >
                {t('next')} <span className="material-icons-round text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {reportMachine && (
        <ReportModal machine={reportMachine} cycleTimes={cycleTimes} currentTime={currentTime} date={productionDate} onClose={() => setReportMachineId(null)} />
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setConfigOpen(false)}></div>
          <div className="relative w-full max-w-6xl bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl flex flex-col max-h-[95vh] overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-2xl font-black flex items-center gap-4 tracking-tighter text-slate-900 dark:text-white"><span className="material-icons-round text-primary text-3xl">settings</span>{t('config')}</h2>
              <button onClick={() => setConfigOpen(false)} className="p-3 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-90"><span className="material-icons-round text-2xl">close</span></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar space-y-16">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-1 lg:border-r border-slate-100 dark:border-slate-700 lg:pr-12">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><span className="material-icons-round text-primary">add_circle</span>Add Machine</h3>
                  <form onSubmit={handleAddMachine} className="bg-slate-50 dark:bg-slate-900/30 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-700 space-y-8">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Unique Name</label>
                      <input type="text" value={newMachineName} onChange={(e) => setNewMachineName(e.target.value)} placeholder="e.g. BM-10" className="w-full text-sm font-bold rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none px-5 py-4 transition-all" required />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Department</label>
                      <select value={newMachineCategory} onChange={(e) => setNewMachineCategory(e.target.value as any)} className="w-full text-sm font-bold rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none px-5 py-4 cursor-pointer transition-all">
                        <option value="mixer">Mixer</option>
                        <option value="preparation">Preparation</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Machine Visualization</label>
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-[2rem] flex items-center justify-center overflow-hidden bg-white dark:bg-slate-800 relative group cursor-pointer transition-all hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-700/50" onClick={() => fileInputRef.current?.click()}>
                          {newMachinePicture ? <img src={newMachinePicture} alt="Preview" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center text-slate-300 group-hover:text-primary transition-all duration-300"><span className="material-icons-round text-5xl mb-3">add_a_photo</span><span className="text-[10px] font-black uppercase tracking-[0.2em]">Upload Image</span></div>}
                        </div>
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-primary hover:bg-primary-600 text-white font-black py-5 px-8 rounded-2xl transition-all shadow-2xl shadow-primary/20 active:scale-95 uppercase tracking-widest text-[10px]">Add Machine</button>
                  </form>
                </div>

                <div className="lg:col-span-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><span className="material-icons-round text-primary">view_list</span>Fleet Management</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-h-[650px] overflow-y-auto pr-4 custom-scrollbar">
                    {machines.map(m => (
                      <div key={m.id} className="flex flex-col bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 group hover:shadow-xl transition-all duration-300">
                        <div className="flex items-center justify-between mb-5">
                          <div className="flex items-center gap-5 overflow-hidden">
                            {m.pictureUrl ? <div className="w-16 h-16 rounded-2xl bg-slate-200 overflow-hidden shrink-0 border border-slate-300 dark:border-slate-600 shadow-lg"><img src={m.pictureUrl} className="w-full h-full object-cover" /></div> : <div className={`w-4 h-4 rounded-full ${m.status === 'Running' ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-slate-300'} shrink-0`} />}
                            <div className="truncate"><span className="font-black text-lg text-slate-800 dark:text-slate-100 tracking-tighter">{m.name}</span><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{m.type}</p></div>
                          </div>
                          <button onClick={() => handleDeleteMachine(m.id)} className="text-slate-300 hover:text-red-500 transition-colors p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10" title="Delete Machine"><span className="material-icons-round text-2xl">delete_outline</span></button>
                        </div>
                        <div className="relative">
                          <input 
                            list={`status-list-${m.id}`}
                            value={m.status} 
                            onChange={(e) => updateMachineStatus(m.id, e.target.value)} 
                            className="text-xs font-black py-3.5 px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none w-full pr-12 transition-all"
                            placeholder="Set Status..."
                          />
                          <datalist id={`status-list-${m.id}`}>
                            <option value="Running" /><option value="Idle" /><option value="Maintenance" /><option value="Setup Required" /><option value="Complete" />
                          </datalist>
                          <span className="material-icons-round absolute right-4 top-3.5 text-slate-300 text-lg pointer-events-none">unfold_more</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 pt-16">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-3"><span className="material-icons-round text-primary">timer</span>Production Specs</h3>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                  <div className="lg:col-span-1">
                    <form onSubmit={handleAddCycleTime} className="bg-slate-50 dark:bg-slate-900/30 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-700 space-y-8">
                      <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Spec Identifier</label><input type="text" value={newCycleName} onChange={(e) => setNewCycleName(e.target.value)} placeholder="e.g. Tread 101" className="w-full text-sm font-bold rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none px-5 py-4 transition-all" required /></div>
                      <div><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Std. Time (Sec)</label><input type="number" value={newCycleTime} onChange={(e) => setNewCycleTime(e.target.value)} placeholder="e.g. 180" className="w-full text-sm font-bold rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none px-5 py-4 transition-all" required /></div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Machine Type</label>
                        <select value={newCycleMachineType} onChange={(e) => setNewCycleMachineType(e.target.value)} className="w-full text-sm font-bold rounded-2xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-4 focus:ring-primary/10 outline-none px-5 py-4 cursor-pointer transition-all">
                          <option value="Mixer">Mixer</option><option value="Cutting">Cutting</option><option value="Chemical">Chemical</option>
                        </select>
                      </div>
                      <button type="submit" className="w-full bg-slate-900 dark:bg-slate-700 text-white font-black py-5 px-8 rounded-2xl hover:bg-black transition-all shadow-xl active:scale-95 uppercase tracking-widest text-[10px]">Register Spec</button>
                    </form>
                  </div>
                  <div className="lg:col-span-3">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xl">
                      <div className="max-h-[550px] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
                          <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-20">
                            <tr>
                              <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Spec Name</th>
                              <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Category</th>
                              <th className="px-8 py-5 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Duration</th>
                              <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {cycleTimes.map(ct => (
                              <tr key={ct.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 transition-all duration-200">
                                <td className="px-8 py-5 text-sm font-black text-slate-700 dark:text-slate-200 tracking-tight">{ct.name}</td>
                                <td className="px-8 py-5 text-center">
                                  <span className={`inline-block px-4 py-1.5 rounded-full text-[9px] font-black uppercase border tracking-widest ${ct.machineType === 'Mixer' ? 'bg-blue-50 border-blue-200 text-blue-600' : ct.machineType === 'Cutting' ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-purple-50 border-purple-200 text-purple-600'}`}>
                                    {ct.machineType}
                                  </span>
                                </td>
                                <td className="px-8 py-5 text-sm text-center font-mono text-primary font-black">{ct.time}s</td>
                                <td className="px-8 py-5 text-right"><button onClick={() => handleDeleteCycleTime(ct.id)} className="text-slate-200 hover:text-red-500 transition-all p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10"><span className="material-icons-round text-xl">delete_sweep</span></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-slate-700 flex justify-end bg-slate-50 dark:bg-slate-900/50">
              <button onClick={() => setConfigOpen(false)} className="px-16 py-5 bg-primary hover:bg-primary-600 text-white font-black rounded-2xl shadow-2xl shadow-primary/20 hover:opacity-90 active:scale-95 transition-all uppercase tracking-[0.2em] text-[10px]">Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
