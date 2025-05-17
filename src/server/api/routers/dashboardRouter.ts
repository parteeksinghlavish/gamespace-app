import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { SessionStatus, DeviceType, OrderStatus } from "~/lib/constants";
import fetch from "node-fetch";

export const dashboardRouter = createTRPCRouter({
  // Get all devices with their current status
  getDeviceStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      // First, get all devices
      const devices = await ctx.db.device.findMany({
        orderBy: [
          { type: 'asc' },
          { counterNo: 'asc' }
        ]
      });

      // Get all active sessions from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const activeSessions = await ctx.db.session.findMany({
        where: {
          status: SessionStatus.ACTIVE,
          // Consider if you want to restrict to today's sessions or all active
          // startTime: { 
          //   gte: today,
          // },
        },
        include: {
          device: true,
          token: true, // Include token data
          order: {      // Include order data
            select: {
              orderNumber: true,
            }
          }
        },
      });

      // Create a map of currently used devices
      const deviceStatusMap = new Map();
      activeSessions.forEach((session) => { // Use specific type if available, else any
        deviceStatusMap.set(session.deviceId, {
          sessionId: session.id,
          status: SessionStatus.ACTIVE,
          startTime: session.startTime,
          playerCount: session.playerCount,
          tokenNo: session.token?.tokenNo, // Add tokenNo
          orderNumber: session.order?.orderNumber, // Add orderNumber
        });
      });

      // Map devices with their status
      const devicesWithStatus = devices.map((device) => {
        const statusDetails = deviceStatusMap.get(device.id) || { 
          status: SessionStatus.ENDED, 
          tokenNo: null, 
          orderNumber: null 
        };
        return {
          ...device,
          currentStatus: statusDetails.status,
          currentSessionId: statusDetails.sessionId || null,
          startTime: statusDetails.startTime || null,
          playerCount: statusDetails.playerCount || 0,
          tokenNo: statusDetails.tokenNo,
          orderNumber: statusDetails.orderNumber,
        };
      });

      return devicesWithStatus;
    } catch (error) {
      console.error("Error getting device status:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve device status",
      });
    }
  }),

  // Call webhook for device status change
  triggerWebhook: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        status: z.enum([SessionStatus.ACTIVE, SessionStatus.ENDED]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // First verify device exists
        const device = await ctx.db.device.findUnique({
          where: { id: input.deviceId },
        });

        if (!device) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Device not found",
          });
        }

        // Get the current session status for this device (if any)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const currentSession = await ctx.db.session.findFirst({
          where: {
            deviceId: input.deviceId,
            status: SessionStatus.ACTIVE,
          },
        });

        // Validate requested webhook status against actual device status
        const currentDeviceStatus = currentSession ? SessionStatus.ACTIVE : SessionStatus.ENDED;
        
        if (input.status !== currentDeviceStatus) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot trigger ${input.status} webhook. Device is currently ${currentDeviceStatus}.`,
          });
        }

        // Logic for getDeviceWebhookUrl will be used by handleSessionStatusChange
        // For manual trigger, we can assume the webhook handler itself will use the correct URL.
        // We just need to ensure the status is correct.
        // For simplicity, let's call the handleSessionStatusChange directly or replicate its core logic
        // For now, assume this just validates and the actual webhook send is elsewhere or needs more params
        
        let webhookUrlToCall;
        const deviceSpecificActiveKey = `${device.type}_${device.counterNo}_${SessionStatus.ACTIVE}_WEBHOOK_URL`;
        const deviceSpecificEndedKey = `${device.type}_${device.counterNo}_${SessionStatus.ENDED}_WEBHOOK_URL`;

        if (input.status === SessionStatus.ACTIVE) {
          webhookUrlToCall = process.env[deviceSpecificActiveKey] || process.env.ACTIVE_WEBHOOK_URL;
        } else {
          webhookUrlToCall = process.env[deviceSpecificEndedKey] || process.env.ENDED_WEBHOOK_URL;
        }

        if (!webhookUrlToCall) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `No webhook URL configured for ${device.type} ${device.counterNo} ${input.status} status`,
          });
        }

        const payload = {
          deviceType: device.type,
          deviceNumber: device.counterNo,
          status: input.status,
          timestamp: new Date().toISOString(),
          triggeredManually: true,
          sessionId: currentSession?.id
        };

        const response = await fetch(webhookUrlToCall, {
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

        return {
          success: true,
          message: `Successfully triggered ${input.status} webhook for ${device.type} ${device.counterNo}`,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("Error triggering webhook:", error);
        throw new TRPCError({
          code: error.code || "INTERNAL_SERVER_ERROR",
          message: error.message || "Failed to trigger webhook",
        });
      }
    }),

  // Get webhook configuration
  getWebhookConfig: protectedProcedure.query(async ({ ctx }) => {
    // Get all devices to check for device-specific webhooks
    const devices = await ctx.db.device.findMany({
      orderBy: [
        { type: 'asc' },
        { counterNo: 'asc' }
      ]
    });

    // Create a map of device-specific webhook configurations
    const deviceWebhooks = devices.map(device => {
      const activeKey = `${device.type}_${device.counterNo}_${SessionStatus.ACTIVE}_WEBHOOK_URL`;
      const endedKey = `${device.type}_${device.counterNo}_${SessionStatus.ENDED}_WEBHOOK_URL`;
      
      return {
        id: device.id,
        type: device.type,
        counterNo: device.counterNo,
        activeWebhookUrl: process.env[activeKey] || '',
        endedWebhookUrl: process.env[endedKey] || '',
        hasDeviceSpecificWebhooks: !!(process.env[activeKey] || process.env[endedKey]),
      };
    });

    return {
      // Global webhook URLs
      globalActiveWebhookUrl: process.env.ACTIVE_WEBHOOK_URL || '',
      globalEndedWebhookUrl: process.env.ENDED_WEBHOOK_URL || '',
      webhooksEnabled: !!(process.env.ACTIVE_WEBHOOK_URL && process.env.ENDED_WEBHOOK_URL),
      
      // Device-specific webhook information
      deviceWebhooks,
      
      // Summary of configuration
      hasDeviceSpecificWebhooks: deviceWebhooks.some(d => d.hasDeviceSpecificWebhooks),
    };
  }),
}); 