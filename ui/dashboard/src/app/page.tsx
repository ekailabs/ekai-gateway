'use client';

import { useState, useEffect } from 'react';
import TrendChart from '@/components/TrendChart';
import ProviderChart from '@/components/ProviderChart';
import ModelChart from '@/components/ModelChart';
import UsageTable from '@/components/UsageTable';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import { useUsageData } from '@/hooks/useUsageData';
import { useConfigStatus } from '@/hooks/useConfigStatus';
import ConfigStatus from '@/components/ConfigStatus';
import FirstRunModal from '@/components/FirstRunModal';
import { apiService } from '@/lib/api';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [mounted, setMounted] = useState(false);
  const usageData = useUsageData(dateRange?.from, dateRange?.to);
  const configStatus = useConfigStatus();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  
  useEffect(() => {
    // Set default to last 7 days after hydration
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    setDateRange({ from: start, to: end });
    setMounted(true);
  }, []);

  const handleExportCsv = async () => {
    try {
      setExportError(null);
      setExporting(true);
      await apiService.downloadUsageCsv(dateRange?.from, dateRange?.to);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const showFirstRunGuide = showOnboarding && !usageData.loading && !usageData.error && usageData.totalRequests === 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCEC' }}>
      {/* Header */}
      <header className="bg-white border-b" style={{ borderColor: '#e5e5e5' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">Ekai Gateway Dashboard</h1>
              <p className="text-gray-600">AI Spend Analytics & Usage Tracking</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Last updated</div>
              <div className="text-gray-900 font-medium">
                {mounted ? new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Loading...'}
              </div>
            </div>
          </div>
          
          {/* Date Range Filter */}
          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">Filter by Date Range</h2>
              <p className="text-sm text-gray-500">Select a time period to view usage analytics</p>
            </div>
            <div className="flex items-center gap-3">
              <DateRangePicker 
                value={dateRange} 
                onChange={setDateRange} 
              />
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="px-4 py-2 text-sm font-semibold text-white rounded-md disabled:opacity-60"
                style={{ backgroundColor: '#111827' }}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>
          {exportError && (
            <p className="text-sm text-red-600 mt-2">CSV export failed: {exportError}</p>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <ConfigStatus 
          status={configStatus.data} 
          loading={configStatus.loading} 
          error={configStatus.error} 
          onRetry={configStatus.refetch} 
        />

        <div className="space-y-12">
          {/* Trend Chart */}
          <TrendChart usageData={usageData} />

          {/* Provider and Model Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ProviderChart usageData={usageData} />
            <ModelChart usageData={usageData} />
          </div>

          {/* Usage Table */}
          <UsageTable usageData={usageData} />
        </div>
      </main>

      <FirstRunModal 
        open={showFirstRunGuide} 
        onClose={() => setShowOnboarding(false)} 
        onRefresh={usageData.refetch}
      />
    </div>
  );
}
