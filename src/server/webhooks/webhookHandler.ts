import { DeviceType, SessionStatus } from '~/lib/constants';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Get device-specific webhook URL based on device type, counter number, and status
 */
function getDeviceWebhookUrl(deviceType: string, counterNo: number, status: SessionStatus): string | null {
  // Try to get device-specific webhook URL first
  // Format: {DEVICE_TYPE}_{COUNTER_NUMBER}_{STATUS}_WEBHOOK_URL
  const deviceSpecificKey = `${deviceType}_${counterNo}_${status}_WEBHOOK_URL`;
  const deviceSpecificUrl = process.env[deviceSpecificKey];
  
  if (deviceSpecificUrl) {
    console.log(`Using device-specific webhook URL for ${deviceType} ${counterNo} ${status}: ${deviceSpecificKey}`);
    return deviceSpecificUrl;
  }
  
  // Fall back to global status-based webhook URL
  const globalKey = `${status}_WEBHOOK_URL`;
  const globalUrl = process.env[globalKey];
  
  if (globalUrl) {
    console.log(`Using global webhook URL for ${status}: ${globalKey}`);
    return globalUrl;
  }
  
  // No webhook URL configured
  console.log(`No webhook URL configured for ${deviceType} ${counterNo} ${status}`);
  return null;
}

/**
 * Handles sending webhooks when a session status changes
 */
export async function handleSessionStatusChange(
  deviceId: number,
  status: SessionStatus,
  sessionId?: number
): Promise<{ success: boolean; message: string }> {
  try {
    // Get device details
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new Error(`Device with ID ${deviceId} not found`);
    }

    // Get the appropriate webhook URL for this device and status
    const webhookUrl = getDeviceWebhookUrl(device.type, device.counterNo, status);

    if (!webhookUrl) {
      return {
        success: false,
        message: `No webhook URL configured for ${device.type} ${device.counterNo} ${status}`,
      };
    }

    // Get session details if sessionId is provided
    let sessionDetails = null;
    if (sessionId) {
      sessionDetails = await prisma.session.findUnique({
        where: { id: sessionId },
      });
    }

    // Prepare payload
    const payload = {
      deviceType: device.type,
      deviceNumber: device.counterNo,
      status,
      sessionId,
      playerCount: sessionDetails?.playerCount || 0,
      timestamp: new Date().toISOString(),
    };

    console.log(`Sending ${status} webhook for ${device.type} ${device.counterNo}:`, payload);

    // Send webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed: ${response.status} ${errorText}`);
    }

    console.log(`Successfully sent ${status} webhook for ${device.type} ${device.counterNo}`);

    return {
      success: true,
      message: `Successfully triggered ${status} webhook for ${device.type} ${device.counterNo}`,
    };
  } catch (error: any) {
    console.error("Error triggering webhook:", error);
    return {
      success: false,
      message: error.message || "Failed to trigger webhook",
    };
  }
} 