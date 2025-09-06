import { formatCurrency } from '@/lib/utils';

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  label?: string;
  type?: 'cost' | 'tokens' | 'provider' | 'model';
}

export default function ChartTooltip({ active, payload, label, type = 'cost' }: ChartTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload as Record<string, any>;

  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      {type === 'cost' && (
        <>
          <p className="font-semibold">{data.formattedDate || label}</p>
          {data.formattedTime && <p className="text-sm text-gray-600">{data.formattedTime}</p>}
          <p className="text-blue-600">
            <span className="font-semibold">Cost:</span> {formatCurrency(data.cost || data.value)}
          </p>
          {data.tokens && (
            <p className="text-green-600">
              <span className="font-semibold">Tokens:</span> {data.tokens.toLocaleString()}
            </p>
          )}
          {data.requests && (
            <p className="text-purple-600">
              <span className="font-semibold">Requests:</span> {data.requests}
            </p>
          )}
        </>
      )}

      {type === 'tokens' && (
        <>
          <p className="font-semibold">{data.formattedDate || label}</p>
          <p className="text-green-600">
            <span className="font-semibold">Tokens:</span> {data.tokens?.toLocaleString() || data.value?.toLocaleString()}
          </p>
        </>
      )}

      {(type === 'provider' || type === 'model') && (
        <>
          <p className="font-semibold">{data.name}</p>
          <p className="text-blue-600">
            <span className="font-semibold">Cost:</span> {formatCurrency(data.value)}
          </p>
          <p className="text-gray-600">
            <span className="font-semibold">Percentage:</span> {data.percentage}%
          </p>
        </>
      )}
    </div>
  );
}