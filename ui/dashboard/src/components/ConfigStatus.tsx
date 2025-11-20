import { ConfigStatusResponse } from '@/lib/api';

interface ConfigStatusProps {
  status: ConfigStatusResponse | null;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  zai: 'z-AI',
};

export default function ConfigStatus({ status, loading, error, onRetry }: ConfigStatusProps) {
  if (loading || !status) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="card p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-40"></div>
        </div>
        <div className="card p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-28"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 mb-8 border-red-200 bg-red-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-red-900 mb-1">Configuration Error</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-red-700 bg-white hover:bg-red-100 rounded-lg border border-red-300 transition-colors"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeProviders = Object.entries(status.providers)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  
  const inactiveProviders = Object.entries(status.providers)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => name);

  const getModeDisplay = () => {
    switch (status.mode) {
      case 'byok':
        return 'Bring Your Own Keys';
      case 'hybrid':
        return 'Hybrid (BYOK + x402)';
      case 'x402-only':
        return 'x402 Payments';
      default:
        return status.mode;
    }
  };

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Providers Card */}
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Providers</div>
          <div className="flex items-center gap-2">
            {activeProviders.length > 0 ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeProviders.slice(0, 3).map((provider) => (
                    <span
                      key={provider}
                      className="inline-block px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded"
                    >
                      {PROVIDER_LABELS[provider.toLowerCase()] || provider}
                    </span>
                  ))}
                  {activeProviders.length > 3 && (
                    <span className="text-sm text-gray-600">+{activeProviders.length - 3}</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-gray-900">{activeProviders.length}</span>
                </div>
              </>
            ) : (
              <span className="text-sm text-gray-400">None active</span>
            )}
          </div>
        </div>

        {/* Mode Card */}
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Mode</div>
          <div className="text-base font-semibold text-gray-900">{getModeDisplay()}</div>
        </div>

        {/* x402 Status Card */}
        <div className="card p-5">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Payment Method</div>
          <div className="flex items-center gap-2">
            {status.x402Enabled ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded text-sm font-medium">
                  x402
                </span>
                <span className="text-sm text-gray-600">Enabled</span>
              </>
            ) : (
              <span className="text-sm text-gray-400">API Keys Only</span>
            )}
          </div>
        </div>
      </div>

      {/* Warning for missing providers */}
      {inactiveProviders.length > 0 && (
        <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              Missing providers: {inactiveProviders.map(p => PROVIDER_LABELS[p.toLowerCase()] || p).join(', ')}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {status.x402Enabled 
                ? (
                  <>
                    These will automatically use x402 on-chain payments if supported by the x402 gateway URL.{' '}
                    <a 
                      href="https://docs.ekailabs.xyz/get_started_with_x402" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline hover:text-amber-900 font-medium"
                    >
                      Learn more about x402 on Ekai
                    </a>
                    .
                  </>
                )
                : 'Add API keys to your .env file to enable these providers.'}
            </p>
          </div>
        </div>
      )}

      {/* Critical warning for no providers */}
      {activeProviders.length === 0 && !status.x402Enabled && (
        <div className="mt-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-900">No providers configured</p>
            <p className="text-sm text-red-700 mt-0.5">
              Add API keys to your .env file or enable x402 payments to start using the gateway.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
