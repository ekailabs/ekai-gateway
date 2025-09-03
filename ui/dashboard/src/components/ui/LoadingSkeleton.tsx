interface LoadingSkeletonProps {
  className?: string;
  title?: boolean;
  chart?: boolean;
  table?: boolean;
}

export default function LoadingSkeleton({ 
  className = '', 
  title = true,
  chart = true,
  table = false 
}: LoadingSkeletonProps) {
  return (
    <div className={`card p-8 ${className}`}>
      <div className="animate-pulse">
        {title && <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>}
        
        {chart && <div className="h-64 bg-gray-200 rounded mb-4"></div>}
        
        {table && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}