# Ekai Gateway Dashboard

A comprehensive spend dashboard for tracking AI model usage and pricing across multiple providers.

## Features

- 📊 **Real-time Analytics**: Monitor spending and usage patterns with live data
- 📈 **Trend Visualization**: Track spend and token usage over time with interactive charts
- 🥧 **Provider Breakdown**: See cost distribution across different AI providers (OpenAI, Anthropic, etc.)
- 🎯 **Model Comparison**: Compare costs and usage across different AI models
- 📋 **Usage Table**: Detailed tabular view of all API requests with sorting and filtering
- 💰 **Cost Optimization**: Identify the most cost-effective models for your use cases

## Dashboard Components

### TrendChart
- **Spend Over Time**: Bar/line charts showing daily or hourly cost trends
- **Tokens Over Time**: Bar/line charts showing token usage patterns
- **Burn Rate**: Daily average spending calculation

### ProviderChart
- **Pie Chart**: Visual breakdown of costs by provider
- **Cost Distribution**: See which providers you're spending the most on
- **Percentage Analysis**: Understand your provider usage patterns

### ModelChart
- **Pie Chart**: Visual breakdown of costs by AI model
- **Model Comparison**: Compare costs across GPT-4, Claude, and other models
- **Usage Insights**: Identify your most-used models

### UsageTable
- **Detailed Records**: Sortable table showing all API requests
- **Request Details**: Timestamp, provider, model, tokens, and costs
- **Interactive Sorting**: Click column headers to sort data
- **Summary Statistics**: Total requests, tokens, and costs

## Getting Started

### Prerequisites
- Node.js 18+ 
- Backend gateway running on port 3001

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Optional: Environment Configuration

The dashboard automatically connects to `http://localhost:3001` by default. If you need to connect to a different backend URL, create a `.env.local` file:

```bash
NEXT_PUBLIC_API_BASE_URL=http://your-backend-url:port
```

## API Integration

The dashboard connects to the Ekai Gateway backend through these endpoints:

- `GET /usage` - Fetch usage statistics and cost data
- `GET /health` - Check backend health status

## Architecture

### Component Structure
- **Shared Hook**: `useUsageData` - Centralized API data fetching
- **UI Components**: Reusable loading, error, and empty state components  
- **Chart Components**: Interactive visualizations with shared tooltips
- **Table Component**: Sortable data table with detailed request information

### Code Organization
```
src/
├── components/
│   ├── TrendChart.tsx      # Time-based analytics
│   ├── ProviderChart.tsx   # Provider cost breakdown  
│   ├── ModelChart.tsx      # Model cost comparison
│   ├── UsageTable.tsx      # Detailed request table
│   └── ui/                 # Shared UI components
│       ├── LoadingSkeleton.tsx
│       ├── ErrorState.tsx
│       ├── EmptyState.tsx
│       └── ChartTooltip.tsx
├── hooks/
│   └── useUsageData.ts     # Shared data fetching logic
└── lib/
    ├── api.ts              # API service functions
    ├── constants.ts        # Shared constants
    └── utils.ts            # Utility functions
```

## Technology Stack

- **Next.js** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Beautiful, composable charts for data visualization
- **Custom Hooks** - Shared logic and state management

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

This project is part of the Ekai Gateway ecosystem.
