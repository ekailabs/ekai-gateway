'use client';

import { useEffect, useState } from 'react';
import { apiService } from '@/lib/api';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

interface GraphDetailsPanelProps {
  entity: string;
  onClose: () => void;
}

interface Triple {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom: number;
  validTo: number | null;
}

export function GraphDetailsPanel({ entity, onClose }: GraphDetailsPanelProps) {
  const [triples, setTriples] = useState<{ incoming: Triple[]; outgoing: Triple[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch both directions
        const [incomingData, outgoingData] = await Promise.all([
          apiService.getGraphTriples({ entity, direction: 'incoming', maxResults: 50 }),
          apiService.getGraphTriples({ entity, direction: 'outgoing', maxResults: 50 })
        ]);

        if (mounted) {
          setTriples({
            incoming: incomingData.triples,
            outgoing: outgoingData.triples
          });
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load details');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [entity]);

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-stone-200 z-50 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{entity}</h3>
          <p className="text-xs text-stone-500 font-medium uppercase tracking-wider mt-1">Entity Details</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-stone-200 rounded-lg transition-colors text-stone-500 hover:text-stone-700"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-4 bg-stone-100 rounded w-3/4 animate-pulse"></div>
            <div className="h-20 bg-stone-50 rounded animate-pulse"></div>
            <div className="h-4 bg-stone-100 rounded w-1/2 animate-pulse delay-75"></div>
            <div className="h-20 bg-stone-50 rounded animate-pulse delay-75"></div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Outgoing Facts */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-1.5 bg-teal-100 text-teal-600 rounded-md">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
                <h4 className="text-sm font-bold text-stone-900">Outgoing Facts</h4>
                <span className="text-xs font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                  {triples?.outgoing.length || 0}
                </span>
              </div>
              
              {triples?.outgoing.length === 0 ? (
                <p className="text-sm text-stone-400 italic pl-9">No outgoing facts recorded.</p>
              ) : (
                <div className="space-y-3 pl-3 border-l-2 border-stone-100 ml-3">
                  {triples?.outgoing.map((t) => (
                    <div key={t.id} className="relative pl-6 py-1 group">
                      <div className="absolute left-[-5px] top-3 w-2.5 h-2.5 bg-stone-200 rounded-full group-hover:bg-teal-400 transition-colors border-2 border-white"></div>
                      <div className="text-sm">
                        <span className="text-teal-600 font-semibold">{t.predicate}</span>
                        <span className="mx-1.5 text-stone-300">→</span>
                        <span className="text-slate-900 font-medium bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                          {t.object}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Incoming Facts */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-1.5 bg-amber-100 text-amber-600 rounded-md">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                  </svg>
                </span>
                <h4 className="text-sm font-bold text-stone-900">Incoming References</h4>
                <span className="text-xs font-medium text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                  {triples?.incoming.length || 0}
                </span>
              </div>

              {triples?.incoming.length === 0 ? (
                <p className="text-sm text-stone-400 italic pl-9">No incoming references found.</p>
              ) : (
                <div className="space-y-3 pl-3 border-l-2 border-stone-100 ml-3">
                  {triples?.incoming.map((t) => (
                    <div key={t.id} className="relative pl-6 py-1 group">
                      <div className="absolute left-[-5px] top-3 w-2.5 h-2.5 bg-stone-200 rounded-full group-hover:bg-amber-400 transition-colors border-2 border-white"></div>
                      <div className="text-sm">
                        <span className="text-slate-900 font-medium bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                          {t.subject}
                        </span>
                        <span className="mx-1.5 text-stone-300">→</span>
                        <span className="text-amber-600 font-semibold">{t.predicate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

