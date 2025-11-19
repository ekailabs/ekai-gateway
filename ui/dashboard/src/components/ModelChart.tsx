'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { CHART_COLORS } from '@/lib/constants';
import { UsageDataResult } from '@/hooks/useUsageData';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface ModelChartProps {
  className?: string;
  usageData: UsageDataResult;
}

export default function ModelChart({ className = '', usageData }: ModelChartProps) {
  const { costByModel, totalCost, loading, error, refetch } = usageData;

  // Helper function to clean model names for display
  const cleanModelName = (modelName: string) => {
    // Just return the model name as-is, no formatting needed
    return modelName;
  };

  // Convert to chart data format
  const data = Object.entries(costByModel)
    .map(([model, cost]) => ({
      name: cleanModelName(model),
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
        title="Model Comparison"
        description="No model data available yet."
        suggestion="Make some API requests to see model breakdown."
      />
    );
  }

  return (
    <div className={`card p-8 ${className}`}>
      <h3 className="text-2xl font-semibold text-gray-900 mb-6">Model Comparison</h3>
      
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(props: any) => {
                const percent = props.percent || 0;
                return percent >= 5 ? props.name || '' : '';
              }}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip type="model" />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Model List */}
      <div className="space-y-2">
        {data.map((model, index) => (
          <div key={model.name} className="flex items-center justify-between">
            <div className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              ></div>
              <span className="text-sm font-medium">{model.name}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{formatCurrency(model.value)}</p>
              <p className="text-xs text-gray-500">{model.percentage}%</p>
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
