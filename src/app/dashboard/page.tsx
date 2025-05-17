import dynamic from 'next/dynamic';

// Use dynamic import for the client component to avoid SSR issues
const DashboardContent = dynamic(() => import('./DashboardContent'), {
  loading: () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  ),
  ssr: false // Disable server-side rendering for this component
});

export const metadata = {
  title: 'Dashboard - Gamespace App',
  description: 'Device status monitoring and webhook management',
};

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-6">
      <DashboardContent />
    </div>
  );
} 