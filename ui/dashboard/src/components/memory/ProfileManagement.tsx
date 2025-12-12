'use client';

import { useState, useEffect } from 'react';
import { apiService } from '@/lib/api';

interface Profile {
  slug: string;
  displayName: string;
  color: string;
}

interface ProfileManagementProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: string;
  onProfileCreated: (slug: string) => void;
}

const formatProfileName = (slug: string): string => {
  return slug
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getProfileColor = (slug: string, index: number): string => {
  const colors = [
    'bg-emerald-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  return colors[index % colors.length];
};

export default function ProfileManagement({ isOpen, onClose, currentProfile, onProfileCreated }: ProfileManagementProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchProfiles = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiService.getProfiles();
        const profileList: Profile[] = response.profiles.map((slug, index) => ({
          slug,
          displayName: formatProfileName(slug),
          color: getProfileColor(slug, index),
        }));
        setProfiles(profileList);
      } catch (err) {
        setError('Failed to load profiles');
        console.error('Failed to fetch profiles', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Profile Management</h2>
              <p className="text-teal-100 text-sm mt-1">Create and organize your memory profiles</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <p className="mt-4 text-sm text-stone-600">Loading profiles...</p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-6 text-center">
              <p className="text-rose-700 font-semibold">{error}</p>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Available Profiles
              </h3>

              {profiles.length === 0 ? (
                <div className="bg-stone-50 border-2 border-stone-200 rounded-xl p-8 text-center">
                  <p className="text-stone-600 font-medium">No profiles found</p>
                  <p className="text-sm text-stone-500 mt-2">Profiles are created automatically when memories are ingested with a profile parameter.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {profiles.map((profile) => (
                    <div
                      key={profile.slug}
                      className="flex items-center gap-4 p-4 bg-white border-2 border-stone-200 rounded-xl hover:border-stone-300 hover:shadow-md transition-all"
                    >
                      <div className={`w-12 h-12 ${profile.color} rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md`}>
                        {profile.displayName[0].toUpperCase()}
                      </div>
                      
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-900">{profile.displayName}</div>
                        <div className="text-xs text-stone-500">{profile.slug}</div>
                      </div>

                      {profile.slug === currentProfile && (
                        <span className="px-3 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border-2 border-stone-300 text-stone-700 font-semibold rounded-lg hover:bg-stone-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

