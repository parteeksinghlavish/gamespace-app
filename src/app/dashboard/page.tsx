export const metadata = {
  title: 'Dashboard - Gamespace App',
};

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-lg text-gray-500">Welcome to Gamespace Dashboard</p>
          <p className="text-gray-500">This page will show gaming cafe statistics and overview.</p>
        </div>
      </div>
    </div>
  );
} 