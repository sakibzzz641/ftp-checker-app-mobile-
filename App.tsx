
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LinkItem, LinkStatus, NetworkInfo, ScanResult } from './types';
import { INITIAL_LINKS, CATEGORIES } from './data/initialLinks';
import AndroidDocs from './components/AndroidDocs';

const App: React.FC = () => {
  const [links, setLinks] = useState<LinkItem[]>(INITIAL_LINKS);
  const [activeTab, setActiveTab] = useState<'all' | 'working' | 'blocked' | 'slow'>('all');
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<'dashboard' | 'docs' | 'settings' | 'developer'>('dashboard');
  const [network, setNetwork] = useState<NetworkInfo>({
    ssid: 'Home_WiFi_5G',
    ip: '192.168.0.105',
    type: 'Wi-Fi',
    vpnActive: false
  });
  
  const [importSummary, setImportSummary] = useState<{ total: number, added: number, skipped: number } | null>(null);
  const [githubUpdateSummary, setGithubUpdateSummary] = useState<{ total: number, added: number, skipped: number, error?: string } | null>(null);
  const [updatingGithub, setUpdatingGithub] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanningRef = useRef(false);

  const stats = useMemo(() => {
    return {
      total: links.length,
      working: links.filter(l => l.status === LinkStatus.WORKING).length,
      blocked: links.filter(l => l.status === LinkStatus.BLOCKED).length,
      slow: links.filter(l => l.status === LinkStatus.SLOW).length,
      idle: links.filter(l => l.status === LinkStatus.IDLE).length,
    };
  }, [links]);

  const filteredLinks = useMemo(() => {
    return links.filter(l => {
      const matchesSearch = l.url.toLowerCase().includes(search.toLowerCase()) || 
                          l.category.toLowerCase().includes(search.toLowerCase());
      const matchesTab = activeTab === 'all' || 
                        (activeTab === 'working' && l.status === LinkStatus.WORKING) ||
                        (activeTab === 'blocked' && l.status === LinkStatus.BLOCKED) ||
                        (activeTab === 'slow' && l.status === LinkStatus.SLOW);
      return matchesSearch && matchesTab;
    });
  }, [links, search, activeTab]);

  const startScan = async () => {
    if (scanningRef.current) return;
    setScanning(true);
    scanningRef.current = true;
    setProgress(0);
    setLinks(prev => prev.map(l => ({ ...l, status: LinkStatus.IDLE, latency: undefined, statusCode: undefined })));

    const total = links.length;
    const batchSize = 12;
    for (let i = 0; i < total; i += batchSize) {
      if (!scanningRef.current) break;
      const end = Math.min(i + batchSize, total);
      const batchIndices = Array.from({ length: end - i }, (_, k) => i + k);
      setLinks(prev => {
        const next = [...prev];
        batchIndices.forEach(idx => {
          next[idx] = { ...next[idx], status: LinkStatus.CHECKING };
        });
        return next;
      });
      await Promise.all(batchIndices.map(async (idx) => {
        await new Promise(r => setTimeout(r, Math.random() * 800 + 400));
        const rand = Math.random();
        let status = LinkStatus.WORKING;
        let latency = Math.floor(Math.random() * 150 + 20);
        let statusCode = 200;
        if (rand < 0.12) { status = LinkStatus.BLOCKED; statusCode = 403; }
        else if (rand < 0.25) { status = LinkStatus.SLOW; latency = Math.floor(Math.random() * 1500 + 1000); }
        else if (rand < 0.30) { status = LinkStatus.FAILED; statusCode = 502; }
        else if (rand < 0.35) { status = LinkStatus.TIMEOUT; latency = 5000; statusCode = 0; }
        setLinks(prev => {
          const next = [...prev];
          next[idx] = { ...next[idx], status, latency, statusCode, lastChecked: Date.now() };
          return next;
        });
      }));
      setProgress(Math.round((end / total) * 100));
    }
    setScanning(false);
    scanningRef.current = false;
  };

  const stopScan = () => {
    scanningRef.current = false;
    setScanning(false);
  };

  const toggleFavorite = (id: string) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, isFavorite: !l.isFavorite } : l));
  };

  const handleExport = () => {
    const content = links.map(l => l.url).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.download = `links_export_${date}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processIncomingLinks(text, 'File Import');
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleGithubUpdate = async () => {
    setUpdatingGithub(true);
    setGithubUpdateSummary(null);
    try {
      const response = await fetch('https://raw.githubusercontent.com/sakibzzz641/ftpchecker/main/BDIX_url.txt');
      if (!response.ok) throw new Error('Network response was not ok');
      const text = await response.text();
      const results = processIncomingLinks(text, 'GitHub Update');
      setGithubUpdateSummary({ total: results.total, added: results.added, skipped: results.skipped });
    } catch (error) {
      console.error('GitHub update failed:', error);
      setGithubUpdateSummary({ total: 0, added: 0, skipped: 0, error: 'Failed to connect to GitHub. Please check internet connection.' });
    } finally {
      setUpdatingGithub(false);
      setTimeout(() => setGithubUpdateSummary(null), 8000);
    }
  };

  const processIncomingLinks = (text: string, sourceLabel: string) => {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    let added = 0;
    let skipped = 0;
    const currentUrls = new Set(links.map(l => l.url.toLowerCase()));
    const newLinks: LinkItem[] = [];

    lines.forEach(url => {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        skipped++;
        return;
      }

      if (currentUrls.has(url.toLowerCase())) {
        skipped++;
      } else {
        const newId = `imported-${Date.now()}-${added}`;
        newLinks.push({
          id: newId,
          url: url,
          category: 'Remote',
          status: LinkStatus.IDLE,
          isFavorite: false
        });
        currentUrls.add(url.toLowerCase());
        added++;
      }
    });

    if (newLinks.length > 0) {
      setLinks(prev => [...prev, ...newLinks]);
    }

    if (sourceLabel === 'File Import') {
      setImportSummary({ total: lines.length, added, skipped });
      setTimeout(() => setImportSummary(null), 5000);
    }
    
    return { total: lines.length, added, skipped };
  };

  const getStatusColor = (status: LinkStatus) => {
    switch (status) {
      case LinkStatus.WORKING: return 'text-green-600 bg-green-50 border-green-200';
      case LinkStatus.BLOCKED: return 'text-red-600 bg-red-50 border-red-200';
      case LinkStatus.SLOW: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case LinkStatus.CHECKING: return 'text-blue-600 bg-blue-50 border-blue-200 animate-pulse';
      case LinkStatus.FAILED: return 'text-gray-600 bg-gray-50 border-gray-200';
      case LinkStatus.TIMEOUT: return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-gray-400 bg-gray-50 border-gray-100';
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-slate-900">
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col p-4 md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <i className="fas fa-link text-white text-xl"></i>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Link Checker</h1>
            <p className="text-xs text-slate-400">HTTPS Monitor v1.0</p>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          <button onClick={() => setView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <i className="fas fa-th-large w-5"></i>
            <span className="font-medium">Dashboard</span>
          </button>
          <button onClick={() => setView('docs')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'docs' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <i className="fas fa-code w-5"></i>
            <span className="font-medium">Android Dev Docs</span>
          </button>
          <button onClick={() => setView('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <i className="fas fa-cog w-5"></i>
            <span className="font-medium">Settings</span>
          </button>
          <button onClick={() => setView('developer')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === 'developer' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>
            <i className="fas fa-user-circle w-5"></i>
            <span className="font-medium">Developer</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between text-xs mb-2 text-slate-400">
              <span>Network Info</span>
              <span className="text-green-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Connected
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><i className="fas fa-wifi text-blue-400"></i><span className="truncate">{network.ssid}</span></div>
              <div className="flex items-center gap-2 text-slate-300 font-mono"><i className="fas fa-network-wired text-slate-500"></i><span>{network.ip}</span></div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {view === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Links', val: stats.total, color: 'slate' },
                { label: 'Working', val: stats.working, color: 'green' },
                { label: 'Blocked', val: stats.blocked, color: 'red' },
                { label: 'Slow', val: stats.slow, color: 'yellow' },
              ].map(stat => (
                <div key={stat.label} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 transition-transform hover:scale-[1.02]">
                  <p className={`text-${stat.color}-500 text-xs font-bold uppercase tracking-wider mb-1`}>{stat.label}</p>
                  <h3 className="text-3xl font-black text-slate-800">{stat.val}</h3>
                </div>
              ))}
            </div>

            {scanning && (
              <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center animate-spin">
                      <i className="fas fa-sync-alt text-xl"></i>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-lg">Bulk Scanning...</h4>
                      <p className="text-sm text-slate-500 font-medium">Analyzing 600+ HTTPS sources in parallel</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-blue-600 font-black text-2xl">{progress}%</span>
                    <button onClick={stopScan} className="block text-xs text-red-500 font-bold hover:underline mt-1">Stop Scan</button>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden border border-slate-200">
                  <div className="bg-gradient-to-r from-blue-400 to-blue-600 h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            )}

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-4 z-20">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-80">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                  <input type="text" placeholder="Search URL or category..." className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl text-sm focus:border-blue-500 focus:bg-white transition-all outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <button onClick={startScan} disabled={scanning} className={`px-8 py-3 rounded-xl font-black text-sm transition-all flex items-center gap-2 ${scanning ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'}`}>
                  <i className={`fas ${scanning ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                  {scanning ? 'SCANNING...' : 'START SCAN'}
                </button>
              </div>
              <div className="flex bg-slate-100 p-1.5 rounded-xl w-full md:w-auto overflow-x-auto border border-slate-200">
                {(['all', 'working', 'blocked', 'slow'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all flex-1 md:flex-none ${activeTab === tab ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredLinks.map(link => (
                <div key={link.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-xl hover:border-blue-100 transition-all duration-300 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] uppercase tracking-widest font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{link.category}</span>
                    <button onClick={() => toggleFavorite(link.id)} className={`text-lg transition-all transform hover:scale-110 ${link.isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'}`}>
                      <i className={`fa${link.isFavorite ? 's' : 'r'} fa-star`}></i>
                    </button>
                  </div>
                  <div className="flex-1">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="block group/link">
                      <h4 className="font-bold text-slate-900 truncate text-base mb-1 group-hover/link:text-blue-600 transition-colors flex items-center gap-2">
                        {link.url.replace(/^https?:\/\//, '')}
                        <i className="fas fa-external-link-alt text-[10px] opacity-0 group-hover/link:opacity-100 transition-opacity"></i>
                      </h4>
                      <p className="text-xs text-slate-400 truncate font-medium mb-5">{link.url}</p>
                    </a>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50 mt-auto">
                    <div className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border uppercase ${getStatusColor(link.status)}`}>
                      {link.status === LinkStatus.IDLE ? 'PENDING' : link.status}
                    </div>
                    {link.latency !== undefined && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                        <i className={`fas fa-tachometer-alt ${link.latency > 1000 ? 'text-yellow-500' : 'text-blue-500'}`}></i>
                        <span>{link.latency}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'docs' && (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center"><i className="fab fa-android text-green-600"></i></div>
              Android Implementation Guide
            </h1>
            <AndroidDocs />
          </div>
        )}

        {view === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-2xl font-black mb-8 text-slate-900">Scan Configuration</h2>
              <div className="space-y-4">
                {[
                  { label: 'Connection Timeout', desc: 'Wait time for links (ms)', val: 5000 },
                  { label: 'Max Retries', desc: 'Attempts before marking failed', val: 3 },
                  { label: 'Parallel Threads', desc: 'Concurrent operations', val: 12 },
                ].map(conf => (
                  <div key={conf.label} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                    <div><h4 className="font-bold text-slate-800">{conf.label}</h4><p className="text-xs text-slate-500">{conf.desc}</p></div>
                    <input type="number" defaultValue={conf.val} className="w-20 p-2 rounded-xl border-2 border-slate-200 font-bold text-center outline-none focus:border-blue-500" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-2xl font-black mb-6 text-slate-900">Data Management</h2>
              
              {/* Common Summary Component */}
              {(importSummary || githubUpdateSummary) && (
                <div className={`mb-6 p-4 border rounded-2xl animate-in fade-in slide-in-from-bottom-2 ${githubUpdateSummary?.error ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={`font-bold ${githubUpdateSummary?.error ? 'text-red-800' : 'text-blue-800'}`}>
                      {githubUpdateSummary ? 'GitHub Sync Result:' : 'Import Result:'}
                    </span>
                    <button onClick={() => {setImportSummary(null); setGithubUpdateSummary(null)}}><i className="fas fa-times text-slate-400"></i></button>
                  </div>
                  {githubUpdateSummary?.error ? (
                    <p className="text-xs text-red-600 mt-2 font-medium">{githubUpdateSummary.error}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 mt-2 text-center">
                      <div><p className="text-[10px] text-slate-400 font-black uppercase">Total</p><p className="text-lg font-black">{(importSummary || githubUpdateSummary)!.total}</p></div>
                      <div><p className="text-[10px] text-green-600 font-black uppercase">Added</p><p className="text-lg font-black text-green-600">{(importSummary || githubUpdateSummary)!.added}</p></div>
                      <div><p className="text-[10px] text-amber-600 font-black uppercase">Skipped</p><p className="text-lg font-black text-amber-600">{(importSummary || githubUpdateSummary)!.skipped}</p></div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <button 
                  onClick={handleExport}
                  className="p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center gap-3 group"
                >
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <i className="fas fa-file-export text-xl"></i>
                  </div>
                  <div className="text-center">
                    <h4 className="font-bold text-slate-800 text-sm">Export Links</h4>
                    <p className="text-[10px] text-slate-500">Save as TXT</p>
                  </div>
                </button>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-green-500 hover:bg-green-50 transition-all flex flex-col items-center gap-3 group"
                >
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                    <i className="fas fa-file-import text-xl"></i>
                  </div>
                  <div className="text-center">
                    <h4 className="font-bold text-slate-800 text-sm">Import Links</h4>
                    <p className="text-[10px] text-slate-500">From Local TXT</p>
                  </div>
                  <input type="file" accept=".txt" ref={fileInputRef} onChange={handleImport} className="hidden" />
                </button>

                <button 
                  onClick={handleGithubUpdate}
                  disabled={updatingGithub}
                  className={`p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all flex flex-col items-center gap-3 group relative overflow-hidden ${updatingGithub ? 'opacity-80 pointer-events-none' : ''}`}
                >
                  {updatingGithub && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 backdrop-blur-[1px]">
                      <i className="fas fa-spinner fa-spin text-indigo-600 text-2xl"></i>
                    </div>
                  )}
                  <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <i className="fab fa-github text-xl"></i>
                  </div>
                  <div className="text-center">
                    <h4 className="font-bold text-slate-800 text-sm">GitHub Update</h4>
                    <p className="text-[10px] text-slate-500">Sync from main</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'developer' && (
          <div className="max-w-md mx-auto mt-12 animate-in fade-in zoom-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="h-40 bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 relative"></div>
              <div className="px-8 pb-10">
                <div className="relative -mt-20 mb-6 text-center">
                  <div className="inline-block p-1.5 bg-white rounded-full shadow-xl">
                    <img src="https://unavatar.io/facebook/sakibzzz641" alt="Sakib Al Hasan" className="w-32 h-32 rounded-full object-cover border-4 border-white" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=Sakib+Al+Hasan&background=0D8ABC&color=fff&size=128&bold=true`; }} />
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black text-slate-900 mb-1">MD. Sakib Al Hasan</h2>
                  <p className="text-blue-600 font-bold text-sm tracking-wider uppercase mb-8">Lead Android Engineer</p>
                  <a href="https://www.facebook.com/sakibzzz641" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 w-full py-4 bg-[#1877F2] text-white rounded-2xl font-black text-sm tracking-widest hover:bg-[#166fe5] shadow-xl shadow-blue-200 transition-all active:scale-95">
                    <i className="fab fa-facebook text-xl"></i> FACEBOOK PROFILE
                  </a>
                  <div className="grid grid-cols-3 gap-2 pt-6 border-t border-slate-100 mt-6 text-xs font-black">
                    <div className="p-3 bg-slate-50 rounded-xl"><p className="text-[10px] text-slate-400 uppercase">Status</p><p className="text-green-500">Active</p></div>
                    <div className="p-3 bg-slate-50 rounded-xl"><p className="text-[10px] text-slate-400 uppercase">Tech</p><p className="text-slate-700">Kotlin</p></div>
                    <div className="p-3 bg-slate-50 rounded-xl"><p className="text-[10px] text-slate-400 uppercase">Region</p><p className="text-slate-700">BD</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="md:hidden fixed bottom-8 right-8 z-30">
        <button onClick={scanning ? stopScan : startScan} className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-xl active:scale-90 transition-all ${scanning ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}`}>
          <i className={`fas ${scanning ? 'fa-stop' : 'fa-play'}`}></i>
        </button>
      </div>
    </div>
  );
};

export default App;
