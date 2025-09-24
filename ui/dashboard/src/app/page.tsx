'use client';

import { useState, useEffect } from 'react';
import TrendChart from '@/components/TrendChart';
import ProviderChart from '@/components/ProviderChart';
import ModelChart from '@/components/ModelChart';
import UsageTable from '@/components/UsageTable';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [mounted, setMounted] = useState(false);
  
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
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-1">Filter by Date Range</h2>
              <p className="text-sm text-gray-500">Select a time period to view usage analytics</p>
            </div>
            <DateRangePicker 
              value={dateRange} 
              onChange={setDateRange} 
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-12">
          {/* Trend Chart */}
          <TrendChart dateRange={dateRange} />

          {/* Provider and Model Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ProviderChart dateRange={dateRange} />
            <ModelChart dateRange={dateRange} />
          </div>

          {/* Usage Table */}
          <UsageTable dateRange={dateRange} />
        </div>
      </main>
    </div>
  );
}
