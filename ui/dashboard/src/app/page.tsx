import TrendChart from '@/components/TrendChart';
import ProviderChart from '@/components/ProviderChart';
import ModelChart from '@/components/ModelChart';

export default function Dashboard() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFCEC' }}>
      {/* Header */}
      <header className="bg-white border-b" style={{ borderColor: '#e5e5e5' }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-2">Ekai Gateway Dashboard</h1>
              <p className="text-gray-600">AI Spend Analytics & Usage Tracking</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Last updated</div>
              <div className="text-gray-900 font-medium">{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-12">
          {/* Welcome Section */}
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold text-gray-900 mb-4">Welcome to Ekai Gateway</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Track your AI model usage, costs, and performance across multiple providers.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div className="card p-8 text-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#f0f9ff' }}>
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Real-time Analytics</h3>
              <p className="text-gray-600">Monitor spending and usage patterns with live data updates</p>
            </div>
            <div className="card p-8 text-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#f0f9ff' }}>
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Cost Optimization</h3>
              <p className="text-gray-600">Identify the most cost-effective models for your use cases</p>
            </div>
            <div className="card p-8 text-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#f0f9ff' }}>
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Multi-Provider</h3>
              <p className="text-gray-600">Support for OpenAI, Anthropic, and other AI providers</p>
            </div>
          </div>
          
          {/* Trend Chart */}
          <TrendChart />
          
          {/* Provider and Model Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ProviderChart />
            <ModelChart />
          </div>
        </div>
      </main>
    </div>
  );
}
