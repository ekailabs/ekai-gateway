import TrendChart from '@/components/TrendChart';
import ProviderChart from '@/components/ProviderChart';
import ModelChart from '@/components/ModelChart';
import UsageTable from '@/components/UsageTable';

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


          {/* Trend Chart */}
          <TrendChart />

          {/* Provider and Model Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ProviderChart />
            <ModelChart />
          </div>

          {/* Usage Table */}
          <UsageTable />
        </div>
      </main>
    </div>
  );
}
