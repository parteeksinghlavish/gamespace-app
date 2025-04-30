import { Suspense } from 'react';
import PlayerManagementContent from './PlayerManagementContent';

export const metadata = {
  title: 'Player Management - Gamespace App',
};

export default function PlayerManagementPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Player Management</h1>
        <Suspense fallback={
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        }>
          <PlayerManagementContent />
        </Suspense>
      </div>
    </div>
  );
} 