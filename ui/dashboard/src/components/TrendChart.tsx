'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { groupByDate, formatForChart, calculateBurnRate, detectAnomalies, formatCurrency, formatNumber } from '@/lib/utils';
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
                    tickFormatter={(value) => timeframe === 'hour' ? 
                      new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 
                      new Date(value).toLocaleDateString()}
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
                    tickFormatter={(value) => timeframe === 'hour' ? 
                      new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 
                      new Date(value).toLocaleDateString()}
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
          <h4 className="text-lg font-semibold mb-4 text-gray-900">Token Usage Breakdown</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => timeframe === 'hour' ? 
                      new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 
                      new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(value) => formatNumber(value)}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="tokens" />} />
                  <Line
                    type="monotone"
                    dataKey="inputTokens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Input"
                    dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cacheWriteTokens"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    name="Cache Write"
                    dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cacheReadTokens"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Cache Read"
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="outputTokens"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    name="Output"
                    dot={{ fill: '#f59e0b', strokeWidth: 2, r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => timeframe === 'hour' ? 
                      new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 
                      new Date(value).toLocaleDateString()}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(value) => formatNumber(value)}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip type="tokens" />} />
                  <Bar dataKey="inputTokens" stackId="tokens" fill="#3b82f6" name="Input" />
                  <Bar dataKey="cacheWriteTokens" stackId="tokens" fill="#8b5cf6" name="Cache Write" />
                  <Bar dataKey="cacheReadTokens" stackId="tokens" fill="#10b981" name="Cache Read" />
                  <Bar dataKey="outputTokens" stackId="tokens" fill="#f59e0b" name="Output" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Token Type Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-sm text-gray-600">Input</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded"></div>
              <span className="text-sm text-gray-600">Cache Write</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-sm text-gray-600">Cache Read</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500 rounded"></div>
              <span className="text-sm text-gray-600">Output</span>
            </div>
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
            {formatNumber(totalStats.totalTokens)}
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
