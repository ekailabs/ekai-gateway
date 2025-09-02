'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { apiService } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface ProviderChartProps {
  className?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function ProviderChart({ className = '' }: ProviderChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getUsage();
      const costByProvider = response.costByProvider || {};
      const total = response.totalCost || 0;
      
      // Convert to chart data format
      const chartData = Object.entries(costByProvider)
        .map(([provider, cost]) => ({
          name: provider.charAt(0).toUpperCase() + provider.slice(1),
          value: Number(cost.toFixed(6)),
          percentage: total > 0 ? ((cost / total) * 100).toFixed(1) : '0'
        }))
        .sort((a, b) => b.value - a.value);
      
      setData(chartData);
      setTotalCost(total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold">{data.name}</p>
          <p className="text-blue-600">
            <span className="font-semibold">Cost:</span> {formatCurrency(data.value)}
          </p>
          <p className="text-gray-600">
            <span className="font-semibold">Percentage:</span> {data.percentage}%
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
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-48 bg-gray-200 rounded"></div>
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
        <h3 className="text-lg font-semibold mb-4">Provider Breakdown</h3>
        <div className="text-center text-gray-500 py-8">
          <p>No provider data available yet.</p>
          <p className="text-sm">Make some API requests to see provider breakdown.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-8 ${className}`}>
      <h3 className="text-2xl font-semibold text-gray-900 mb-6">Provider Breakdown</h3>
      
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage }) => `${name} (${percentage}%)`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {data.map((provider, index) => (
          <div key={provider.name} className="flex items-center justify-between">
            <div className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              ></div>
              <span className="text-sm font-medium">{provider.name}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{formatCurrency(provider.value)}</p>
              <p className="text-xs text-gray-500">{provider.percentage}%</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-lg font-medium text-gray-600">Total Cost:</span>
          <span className="text-2xl font-semibold text-gray-900">{formatCurrency(totalCost)}</span>
        </div>
      </div>
    </div>
  );
}
