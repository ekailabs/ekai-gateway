'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart } from 'recharts';
import { apiService, UsageRecord } from '@/lib/api';
import { groupByDate, formatForChart, calculateBurnRate, detectAnomalies, formatCurrency } from '@/lib/utils';

interface TrendChartProps {
  className?: string;
}

export default function TrendChart({ className = '' }: TrendChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'composed'>('bar');
  const [timeframe, setTimeframe] = useState<'hour' | 'day'>('day');
  const [burnRate, setBurnRate] = useState(0);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalCost: 0,
    totalTokens: 0,
    totalRequests: 0
  });

  useEffect(() => {
    fetchData();
  }, [timeframe]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getUsage();
      const records: UsageRecord[] = response.records || [];
      
      // Process data for chart
      const grouped = groupByDate(records, timeframe);
      const chartData = formatForChart(grouped);
      
      // Calculate metrics
      const dailyBurnRate = calculateBurnRate(records);
      const detectedAnomalies = detectAnomalies(records);
      
      // Calculate totals
      const totalCost = records.reduce((sum, r) => sum + r.total_cost, 0);
      const totalTokens = records.reduce((sum, r) => sum + r.total_tokens, 0);
      const totalRequests = records.length;
      
      setData(chartData);
      setBurnRate(dailyBurnRate);
      setAnomalies(detectedAnomalies);
      setTotalStats({ totalCost, totalTokens, totalRequests });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold">{data.formattedDate}</p>
          {timeframe === 'hour' && <p className="text-sm text-gray-600">{data.formattedTime}</p>}
          <p className="text-blue-600">
            <span className="font-semibold">Cost:</span> {formatCurrency(data.cost)}
          </p>
          <p className="text-green-600">
            <span className="font-semibold">Tokens:</span> {data.tokens.toLocaleString()}
          </p>
          <p className="text-purple-600">
            <span className="font-semibold">Requests:</span> {data.requests}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className={`bg-white p-6 rounded-lg shadow ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white p-6 rounded-lg shadow ${className}`}>
        <div className="text-red-600">
          <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`bg-white p-6 rounded-lg shadow ${className}`}>
        <h3 className="text-lg font-semibold mb-4">Spend Over Time</h3>
        <div className="text-center text-gray-500 py-8">
          <p>No usage data available yet.</p>
          <p className="text-sm">Make some API requests to see spending trends.</p>
        </div>
      </div>
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
                  <Tooltip content={<CustomTooltip />} />
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
                  <Tooltip content={<CustomTooltip />} />
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
                  <Tooltip content={<CustomTooltip />} />
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
                  <Tooltip content={<CustomTooltip />} />
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
