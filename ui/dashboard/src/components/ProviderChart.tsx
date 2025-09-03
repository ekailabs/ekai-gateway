'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { CHART_COLORS } from '@/lib/constants';
import { useUsageData } from '@/hooks/useUsageData';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface ProviderChartProps {
  className?: string;
}

export default function ProviderChart({ className = '' }: ProviderChartProps) {
  const { costByProvider, totalCost, loading, error, refetch } = useUsageData();

  // Convert to chart data format
  const data = Object.entries(costByProvider)
    .map(([provider, cost]) => ({
      name: provider.charAt(0).toUpperCase() + provider.slice(1),
      value: Number(cost.toFixed(6)),
      percentage: totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0'
    }))
    .sort((a, b) => b.value - a.value);


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
        title="Provider Breakdown"
        description="No provider data available yet."
        suggestion="Make some API requests to see provider breakdown."
      />
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
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip type="provider" />} />
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
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
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
