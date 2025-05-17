'use client';

import { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { DeviceType, SessionStatus } from '~/lib/constants';
import { 
  CubeTransparentIcon, 
  PlayIcon, 
  StopIcon, 
  ClockIcon,
  UsersIcon,
  WifiIcon,
  NoSymbolIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  IdentificationIcon,
  TicketIcon,
  TvIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/solid';

// Define device card component
const DeviceCard = ({ 
  device, 
  onTriggerWebhook,
  isWebhookEnabled,
}: { 
  device: any; 
  onTriggerWebhook: (deviceId: number, status: string) => void;
  isWebhookEnabled: boolean;
}) => {
  const isActive = device.currentStatus === SessionStatus.ACTIVE;
  const startTime = device.startTime ? new Date(device.startTime) : null;
  
  // Calculate duration for active sessions
  const [duration, setDuration] = useState<string>('-');
  
  useEffect(() => {
    if (!isActive || !startTime) {
      setDuration('-');
      return;
    }
    
    const calculateDuration = () => {
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) {
        setDuration(`${hours}h ${minutes}m`);
      } else {
        setDuration(`${minutes}m`);
      }
    };
    
    calculateDuration();
    const intervalId = setInterval(calculateDuration, 15000); // Update every 15 seconds for more reactivity
    return () => clearInterval(intervalId);
  }, [isActive, startTime]);
  
  // Get icon based on device type
  const getDeviceTypeIcon = (type: string) => {
    switch (type) {
      case DeviceType.PS5:
      case DeviceType.PS4:
        return <TvIcon className="h-7 w-7" />;
      case DeviceType.VR:
      case DeviceType.VR_RACING:
        return <ViewfinderCircleIcon className="h-7 w-7" />;
      case DeviceType.POOL:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 00-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
        );
      case DeviceType.FRAME:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.158 0a.079.079 0 01.079.079v.008a.079.079 0 01-.079.079h-.008a.079.079 0 01-.079-.079v-.008a.079.079 0 01.079-.079h.008z" />
          </svg>
        );
      case DeviceType.RACING:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.056a.957.957 0 01-1.657.943l-2.663-2.545a.956.956 0 010-1.362L7.343 8.44A.956.956 0 018.172 8h8.252c.477 0 .903.285 1.078.714l.292.972c.11.364.024.774-.217 1.06l-2.51 3.754a.957.957 0 01-1.32.316l-1.387-.925L12.75 3.03z" />
          </svg>
        );
      default:
        return <CubeTransparentIcon className="h-7 w-7 opacity-50" />;
    }
  };

  const cardBaseStyle = "relative flex flex-col justify-between aspect-square rounded-2xl p-3.5 transition-all duration-200 ease-in-out transform focus:outline-none focus:ring-2 focus:ring-offset-2";
  const activeStyle = "bg-blue-500 text-white shadow-lg hover:shadow-xl focus:ring-blue-400";
  const idleStyle = "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400";
  
  const handleCardClick = () => {
    if (isWebhookEnabled) {
      onTriggerWebhook(device.id, device.currentStatus);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCardClick}
      className={`${cardBaseStyle} ${isActive ? activeStyle : idleStyle} ${isWebhookEnabled ? 'cursor-pointer' : 'cursor-default'}`}
      disabled={!isWebhookEnabled}
      aria-label={`Device ${device.type} ${device.counterNo}, Status: ${isActive ? 'Active' : 'Idle'}${isWebhookEnabled ? ', Click to trigger webhook' : ', Webhooks disabled'}`}
    >
      <div className="flex justify-between items-start">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : 'bg-gray-200'}`}>
          {getDeviceTypeIcon(device.type)}
        </div>
      </div>

      <div className="mt-1">
        <h3 className="font-semibold text-base leading-tight truncate">{device.type} {device.counterNo}</h3>
        {isActive ? (
          <div className="text-xs mt-1 space-y-0.5">
            <div className="flex items-center">
              <ClockIcon className={`h-3.5 w-3.5 mr-1 ${isActive ? 'opacity-80' : 'text-gray-500'}`} /> 
              <span>{duration}</span>
            </div>
            <div className="flex items-center">
              <UsersIcon className={`h-3.5 w-3.5 mr-1 ${isActive ? 'opacity-80' : 'text-gray-500'}`} /> 
              <span>{device.playerCount} Player{device.playerCount !== 1 ? 's' : ''}</span>
            </div>
            {device.tokenNo && (
              <div className="flex items-center">
                <IdentificationIcon className={`h-3.5 w-3.5 mr-1 ${isActive ? 'opacity-80' : 'text-gray-500'}`} /> 
                <span>Token: {device.tokenNo}</span>
              </div>
            )}
            {device.orderNumber && (
              <div className="flex items-center">
                <TicketIcon className={`h-3.5 w-3.5 mr-1 ${isActive ? 'opacity-80' : 'text-gray-500'}`} /> 
                <span>Order: {device.orderNumber}</span>
              </div>
            )}
          </div>
        ) : (
          <p className={`text-sm ${isActive ? 'opacity-90' : 'text-gray-500'}`}>Idle</p>
        )}
      </div>
    </button>
  );
};

// Main dashboard component
export default function DashboardContent() {
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'idle'>('all');
  const [webhookStatus, setWebhookStatus] = useState<{ success?: boolean; message?: string; error?: boolean } | null>(null);
  
  // Fetch device status
  const { 
    data: devices, 
    isLoading: isLoadingDevices,
    refetch: refetchDevices,
  } = api.dashboard.getDeviceStatus.useQuery(undefined, {
    refetchInterval: 15000, // Refetch every 15 seconds for faster updates
    refetchOnWindowFocus: true,
  });
  
  // Get webhook configuration
  const { data: webhookConfig } = api.dashboard.getWebhookConfig.useQuery();
  
  // Webhook trigger mutation
  const triggerWebhookMutation = api.dashboard.triggerWebhook.useMutation({
    onSuccess: (data) => {
      setWebhookStatus({ success: true, message: data.message });
      setTimeout(() => setWebhookStatus(null), 4000);
    },
    onError: (error) => {
      setWebhookStatus({ success: false, error: true, message: error.message });
      setTimeout(() => setWebhookStatus(null), 5000);
    },
  });
  
  // Filter devices based on active tab
  const filteredDevices = devices ? devices.filter(device => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return device.currentStatus === SessionStatus.ACTIVE;
    if (activeTab === 'idle') return device.currentStatus === SessionStatus.ENDED;
    return true;
  }) : [];
  
  // Trigger webhook handler
  const handleTriggerWebhook = (deviceId: number, status: string) => {
    const deviceWebhookInfo = webhookConfig?.deviceWebhooks?.find(d => d.id === deviceId);
    const isThisDeviceWebhookEnabled = !!(webhookConfig?.webhooksEnabled || deviceWebhookInfo?.hasDeviceSpecificWebhooks);

    if (!isThisDeviceWebhookEnabled) {
      setWebhookStatus({
        success: false,
        error: true,
        message: "Webhooks not configured or enabled for this device."
      });
      setTimeout(() => setWebhookStatus(null), 5000);
      return;
    }
    triggerWebhookMutation.mutate({
      deviceId,
      status: status as SessionStatus,
    });
  };
  
  // Count active and ended devices
  const activeCount = devices?.filter(d => d.currentStatus === SessionStatus.ACTIVE).length || 0;
  const idleCount = devices?.filter(d => d.currentStatus === SessionStatus.ENDED).length || 0;
  
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-gray-50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Device Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time monitoring of all gaming devices</p>
        </div>
        
        <button
          onClick={() => refetchDevices()}
          className="flex items-center justify-center space-x-2 bg-white hover:bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl shadow-sm border border-gray-200 transition-colors duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.992v4.992c0 .001 0 .001 0 .002Z" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 bg-white shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 rounded-xl">
              <WifiIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-500">Total Devices</h2>
              <p className="text-2xl font-semibold text-gray-900">{devices?.length || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl p-5 bg-white shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-green-100 rounded-xl">
              <PlayIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-500">Active</h2>
              <p className="text-2xl font-semibold text-gray-900">{activeCount}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl p-5 bg-white shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gray-200 rounded-xl">
              <StopIcon className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-gray-500">Idle</h2>
              <p className="text-2xl font-semibold text-gray-900">{idleCount}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Webhook status notification */}
      {webhookStatus && (
        <div 
          className={`rounded-xl p-4 flex items-center text-sm shadow-md border ${
            webhookStatus.error 
              ? 'bg-red-50 text-red-700 border-red-200' 
              : webhookStatus.success 
                ? 'bg-green-50 text-green-700 border-green-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}
        >
          {webhookStatus.error ? <ExclamationTriangleIcon className="h-5 w-5 mr-2.5 flex-shrink-0" /> : 
           webhookStatus.success ? <CheckCircleIcon className="h-5 w-5 mr-2.5 flex-shrink-0" /> : 
           <InformationCircleIcon className="h-5 w-5 mr-2.5 flex-shrink-0" />}
          <span>{webhookStatus.message}</span>
        </div>
      )}
      
      {/* Device filters */}
      <div className="bg-white rounded-xl shadow-sm p-1.5 border border-gray-200 flex space-x-1">
        <button
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('all')}
        >
          All ({devices?.length || 0})
        </button>
        <button
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none ${
            activeTab === 'active'
              ? 'bg-green-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('active')}
        >
          Active ({activeCount})
        </button>
        <button
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors duration-150 focus:outline-none ${
            activeTab === 'idle'
              ? 'bg-gray-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('idle')}
        >
          Idle ({idleCount})
        </button>
      </div>
      
      {/* Device grid */}
      {isLoadingDevices ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500">Loading devices...</p>
          </div>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
          <NoSymbolIcon className="h-12 w-12 mx-auto text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-700">No devices found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'all' 
              ? 'No devices are registered in the system.' 
              : `No devices are currently ${activeTab}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filteredDevices.map((device) => {
            const deviceWebhookInfo = webhookConfig?.deviceWebhooks?.find(d => d.id === device.id);
            return (
              <DeviceCard 
                key={device.id} 
                device={device} 
                onTriggerWebhook={handleTriggerWebhook}
                isWebhookEnabled={!!(webhookConfig?.webhooksEnabled || deviceWebhookInfo?.hasDeviceSpecificWebhooks)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
} 