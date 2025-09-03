'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { groupByDate, formatForChart, calculateBurnRate, detectAnomalies, formatCurrency } from '@/lib/utils';
import { useUsageData } from '@/hooks/useUsageData';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface TrendChartProps {
  className?: string;
}

export default function TrendChart({ className = '' }: TrendChartProps) {
  const { records, loading, error, refetch } = useUsageData();
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
  const [timeframe, setTimeframe] = useState<'hour' | 'day'>('day');

  // Process data for chart
  const grouped = groupByDate(records, timeframe);
  const data = formatForChart(grouped);
  const burnRate = calculateBurnRate(records);
  const anomalies = detectAnomalies(records);
  const totalStats = {
    totalCost: records.reduce((sum, r) => sum + r.total_cost, 0),
    totalTokens: records.reduce((sum, r) => sum + r.total_tokens, 0),
    totalRequests: records.length
  };


  if (loading) {
    return <LoadingSkeleton className={className} />;
  }

  if (error) {
    return <ErrorState className={className} message={error} onRetry={refetch} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState 
        className={className}
        title="Usage Analytics"
        description="No usage data available yet."
        suggestion="Make some API requests to see spending trends."
      />
    );
  }

  return (
    <div className={`card p-8 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900 mb-2">Usage Analytics</h3>
          <p className="text-gray-600">
            Daily burn rate: <span className="font-medium text-gray-900">{formatCurrency(burnRate)}/day</span>
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex gap-3">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as 'hour' | 'day')}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="day">Daily</option>
            <option value="hour">Hourly</option>
          </select>
          
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'line' | 'bar')}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:border-teal-500 focus:outline-none"
          >
            <option value="line">Line</option>
            <option value="bar">Bar</option>
          </select>
        </div>
      </div>

      {/* Anomalies Alert */}
      {anomalies.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 text-sm">
            <span className="font-semibold">⚠️ Spending Anomaly Detected:</span> 
            {' '}{anomalies.length} day(s) with unusually high spending
          </p>
        </div>
      )}

      {/* Two Charts Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Spend Over Time Chart */}
        <div>
          <h4 className="text-lg font-semibold mb-4 text-gray-900">Spend Over Time</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    tickFormatter={(value) => `$${value.toFixed(4)}`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="cost" />} />
                  <Line 
                    type="monotone" 
                    dataKey="cost" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    tickFormatter={(value) => `$${value.toFixed(4)}`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="cost" />} />
                  <Bar dataKey="cost" fill="#3b82f6" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tokens Over Time Chart */}
        <div>
          <h4 className="text-lg font-semibold mb-4 text-gray-900">Tokens Over Time</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    tickFormatter={(value) => value.toLocaleString()}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="cost" />} />
                  <Line 
                    type="monotone" 
                    dataKey="tokens" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 2 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    tickFormatter={(value) => value.toLocaleString()}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="cost" />} />
                  <Bar dataKey="tokens" fill="#10b981" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 text-center">
        <div className="p-6 rounded-lg" style={{ backgroundColor: '#f8fafc' }}>
          <p className="text-2xl font-semibold text-gray-900 mb-2">
            {formatCurrency(totalStats.totalCost)}
          </p>
          <p className="text-gray-600">Total Spend</p>
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: '#f8fafc' }}>
          <p className="text-2xl font-semibold text-gray-900 mb-2">
            {totalStats.totalTokens.toLocaleString()}
          </p>
          <p className="text-gray-600">Total Tokens</p>
        </div>
        <div className="p-6 rounded-lg" style={{ backgroundColor: '#f8fafc' }}>
          <p className="text-2xl font-semibold text-gray-900 mb-2">
            {totalStats.totalRequests}
          </p>
          <p className="text-gray-600">Total Requests</p>
        </div>
      </div>
    </div>
  );
}
