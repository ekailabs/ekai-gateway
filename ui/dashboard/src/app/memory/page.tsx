'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  apiService,
  type MemorySummaryResponse,
  type MemorySectorSummary,
  type MemoryRecentItem,
} from '@/lib/api';
import Link from 'next/link';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const sectorColors: Record<MemorySectorSummary['sector'], string> = {
  episodic: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  semantic: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  procedural: 'bg-amber-100 text-amber-700 border-amber-200',
  affective: 'bg-rose-100 text-rose-700 border-rose-200',
};

const sectorDescriptions: Record<MemorySectorSummary['sector'], string> = {
  episodic: 'Personal events and experiences the system has encountered.',
  semantic: 'Facts, concepts, and general knowledge extracted from interactions.',
  procedural: 'Multi-step skills, workflows, and how-to instructions.',
  affective: 'User preferences, likes/dislikes, and value-based tendencies.',
};

const capitalizeSector = (sector: string): string => {
  return sector.charAt(0).toUpperCase() + sector.slice(1);
};

// Tooltip component
const SectorTooltip = ({ sector, children }: { sector: MemorySectorSummary['sector']; children: React.ReactNode }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <div className="absolute z-50 w-72 p-4 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg shadow-xl bottom-full left-1/2 transform -translate-x-1/2 mb-3 pointer-events-none">
          <div className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${sectorColors[sector].split(' ')[0]}`}></span>
            {capitalizeSector(sector)}
          </div>
          <div className="text-gray-600 leading-relaxed">{sectorDescriptions[sector]}</div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="w-3 h-3 bg-white border-r border-b border-gray-200 transform rotate-45"></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Procedural Card Component
const ProceduralCard = ({ details }: { details: NonNullable<MemoryRecentItem['details']> }) => {
  // Safely handle steps - could be array or string
  const steps = Array.isArray(details.steps) 
    ? details.steps 
    : (typeof details.steps === 'string' ? JSON.parse(details.steps) : []);

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-amber-50/50 px-4 py-2 border-b border-amber-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Procedure Workflow</span>
      </div>
      
      <div className="p-5 space-y-6">
        {/* Goal Section */}
        {details.goal && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Goal</div>
              <div className="text-sm text-gray-900 font-medium">{details.goal}</div>
            </div>
          </div>
        )}
        
        {/* Steps Section */}
        {steps && Array.isArray(steps) && steps.length > 0 && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Execution Steps</div>
              <div className="relative">
                <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-100"></div>
                <ul className="space-y-3 relative">
                  {steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3 items-start group">
                      <div className="flex-shrink-0 w-4 h-4 rounded-full bg-white border-2 border-gray-300 text-[10px] font-bold text-gray-500 flex items-center justify-center mt-0.5 group-hover:border-emerald-400 group-hover:text-emerald-600 transition-colors">
                        {idx + 1}
                      </div>
                      <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Context & Result Grid */}
        {(details.result || details.context) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            {details.result && (
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Outcome</div>
                <div className="text-sm text-gray-800">{details.result}</div>
              </div>
            )}
            {details.context && (
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Context</div>
                <div className="text-sm text-gray-600 italic">{details.context}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function MemoryVaultPage() {
  const [data, setData] = useState<MemorySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSector, setFilterSector] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ type: 'single'; id: string; preview?: string } | { type: 'bulk' } | null>(null);
  const [editModal, setEditModal] = useState<{ id: string; content: string; sector: string } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch more items for better visualization (limit=100)
      const res = await apiService.getMemorySummary(100);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditClick = (id: string, content: string, sector: string) => {
    setEditModal({ id, content, sector });
  };

  const handleDeleteClick = (id: string, preview?: string) => {
    setDeleteModal({ type: 'single', id, preview });
  };

  const handleBulkDeleteClick = () => {
    setDeleteModal({ type: 'bulk' });
  };

  const handleEditConfirm = async () => {
    if (!editModal) return;

    try {
      setEditBusy(true);
      setError(null);
      await apiService.updateMemory(editModal.id, editModal.content, editModal.sector);
      setEditModal(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update memory');
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;

    try {
      if (deleteModal.type === 'single') {
        setBusyId(deleteModal.id);
        setError(null);
        await apiService.deleteMemory(deleteModal.id);
      } else {
        setBulkBusy(true);
        setError(null);
        await apiService.deleteAllMemories();
      }
      setDeleteModal(null);
      await fetchData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : deleteModal.type === 'single'
            ? 'Failed to delete memory'
            : 'Failed to delete all memories'
      );
    } finally {
      setBusyId(null);
      setBulkBusy(false);
    }
  };

  // transform data for charts
  const radarData = useMemo(() => {
    if (!data?.summary) return [];
    return data.summary.map((s) => ({
      subject: capitalizeSector(s.sector),
      A: s.count,
      fullMark: Math.max(...data.summary.map((i) => i.count)) * 1.2,
    }));
  }, [data]);

  const activityData = useMemo(() => {
    if (!data?.recent) return [];
    // Group by hour or day depending on range. For now, just count by "time ago" buckets or raw timestamps
    // Let's do a simple "Last 24h" distribution if possible, or just sort by time
    // Actually, let's visualize the sectors of the recent items in a stacked bar or simple bar
    // A simple histogram of recent activity by sector
    const counts: Record<string, number> = {};
    data.recent.forEach((r) => {
      counts[r.sector] = (counts[r.sector] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: capitalizeSector(name), value }));
  }, [data]);

  const filteredMemories = useMemo(() => {
    if (!data?.recent) return [];
    return data.recent.filter((item) => {
      const matchesSearch = item.preview.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = filterSector === 'all' || item.sector === filterSector;
      return matchesSearch && matchesSector;
    });
  }, [data, searchTerm, filterSector]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCEC' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-900 transition-colors p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Memory Vault</h1>
                <p className="text-sm text-gray-500">
                  {data?.recent?.length ?? 0} active engrams loaded
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchData}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all"
                title="Refresh"
                disabled={loading}
              >
                <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={handleBulkDeleteClick}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors border border-red-200"
                disabled={loading || bulkBusy}
              >
                {bulkBusy ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-6 mt-6 border-b border-gray-100">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'overview'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`pb-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === 'logs'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Memory Logs
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 text-sm text-red-600 bg-red-50 p-4 rounded-lg border border-red-100 flex items-center gap-2">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
             {error}
          </div>
        )}

        {activeTab === 'overview' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Brain Composition Chart */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Brain Composition</h3>
              <div className="h-[300px] w-full flex items-center justify-center p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis 
                      dataKey="subject" 
                      tick={{ fill: '#6b7280', fontSize: 12 }} 
                    />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Radar
                      name="Memories"
                      dataKey="A"
                      stroke="#004f4f"
                      fill="#004f4f"
                      fillOpacity={0.2}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {data?.summary.map((s) => (
                  <SectorTooltip key={s.sector} sector={s.sector}>
                    <div className="text-center p-3 bg-gray-50 rounded-lg cursor-help hover:bg-gray-100 transition-colors">
                      <div className="text-2xl font-bold text-gray-900">{s.count}</div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider">{s.sector}</div>
                    </div>
                  </SectorTooltip>
                ))}
              </div>
            </div>

            {/* Recent Activity Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity Distribution</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280' }} />
                    <Tooltip 
                      cursor={{ fill: '#f9fafb' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="value" fill="#004f4f" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-sm text-gray-500">
                Showing distribution of the last {data?.recent?.length ?? 0} ingested memories.
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50 rounded-t-xl">
              <div className="relative w-full sm:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search memories..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 sm:text-sm transition-shadow"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm rounded-md bg-white"
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
              >
                <option value="all">All Sectors</option>
                <option value="episodic">Episodic</option>
                <option value="semantic">Semantic</option>
                <option value="procedural">Procedural</option>
                <option value="affective">Affective</option>
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      Sector
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Content
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                      Created
                    </th>
                    <th scope="col" className="relative px-6 py-3 w-16">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMemories.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500 text-sm">
                        No memories found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredMemories.map((item) => (
                      <tr 
                        key={item.id} 
                        className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <SectorTooltip sector={item.sector}>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-help ${sectorColors[item.sector]}`}>
                              {capitalizeSector(item.sector)}
                            </span>
                          </SectorTooltip>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className={`text-sm text-gray-900 transition-all ${expandedId === item.id ? '' : 'line-clamp-2'}`}>
                            {item.preview}
                          </div>
                          
                          {expandedId === item.id && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                              {item.sector === 'procedural' && item.details ? (
                                <ProceduralCard details={item.details} />
                              ) : null}
                              
                              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex gap-4">
                                <span>ID: <span className="font-mono select-all">{item.id}</span></span>
                                <span>Last Accessed: {new Date(item.lastAccessed).toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 align-top">
                          {new Date(item.createdAt).toLocaleString(undefined, { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(item.id, item.preview, item.sector);
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 rounded-full hover:bg-blue-50"
                              title="Edit memory"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(item.id, item.preview);
                              }}
                              className="text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 rounded-full hover:bg-red-50"
                              disabled={busyId === item.id}
                              title="Delete memory"
                            >
                              {busyId === item.id ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={() => setDeleteModal(null)}
            />
            
            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full transform transition-all">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {deleteModal.type === 'bulk' ? 'Delete All Memories?' : 'Delete Memory?'}
                      </h3>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    {deleteModal.type === 'bulk' ? (
                      <p className="text-sm text-gray-600">
                        Are you sure you want to delete <strong>all memories</strong>? This action cannot be undone and will permanently remove all stored memories across all sectors.
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600 mb-3">
                          This memory will be permanently deleted. This action cannot be undone.
                        </p>
                        {deleteModal.preview && (
                          <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                            <p className="text-xs text-gray-500 mb-1 font-medium">Preview:</p>
                            <p className="text-sm text-gray-700 line-clamp-3">{deleteModal.preview}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDeleteModal(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      disabled={busyId !== null || bulkBusy}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteConfirm}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={busyId !== null || bulkBusy}
                    >
                      {busyId !== null || bulkBusy ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Memory Modal */}
        {editModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={() => setEditModal(null)}
            />
            
            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full transform transition-all">
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Edit Memory</h3>
                    </div>
                  </div>
                  
                  <div className="mb-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Sector
                      </label>
                      <select
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white"
                        value={editModal.sector}
                        onChange={(e) => setEditModal({ ...editModal, sector: e.target.value })}
                      >
                        <option value="episodic">Episodic</option>
                        <option value="semantic">Semantic</option>
                        <option value="procedural">Procedural</option>
                        <option value="affective">Affective</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Content
                      </label>
                      <textarea
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-y min-h-[200px]"
                        value={editModal.content}
                        onChange={(e) => setEditModal({ ...editModal, content: e.target.value })}
                        placeholder="Enter memory content..."
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        The embedding will be regenerated automatically when you save.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setEditModal(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                      disabled={editBusy}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditConfirm}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={editBusy || !editModal.content.trim()}
                    >
                      {editBusy ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
