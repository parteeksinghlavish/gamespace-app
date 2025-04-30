import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import type { Device, Session } from "@prisma/client";
import { DeviceType, SessionStatus, PaymentStatus } from "~/lib/constants";

// Enum values matching Prisma's generated enums
export { SessionStatus, DeviceType, PaymentStatus };

export const playerManagementRouter = createTRPCRouter({
  // Get today's sessions grouped by token
  getTodaySessions: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tokens = await ctx.db.token.findMany({
      where: {
        createdAt: {
          gte: today,
        },
      },
      include: {
        sessions: {
          include: {
            device: true,
          },
          orderBy: {
            startTime: "desc",
          },
        },
        bills: true,
      },
      orderBy: {
        tokenNo: "asc",
      },
    });

    return tokens;
  }),

  // Get available devices for new session
  getAvailableDevices: protectedProcedure.query(async ({ ctx }) => {
    // Get all devices
    const allDevices = await ctx.db.device.findMany();
    
    // Get active sessions
    const activeSessions = await ctx.db.session.findMany({
      where: {
        status: SessionStatus.ACTIVE,
      },
      include: {
        device: true,
      },
    });

    // Create a map of currently used devices
    const usedDevices = new Map<string, any>();
    activeSessions.forEach((session: any) => {
      usedDevices.set(`${session.device.type}-${session.device.counterNo}`, session);
    });

    // Check if Pool or Frame is active
    const isPoolOrFrameActive = activeSessions.some(
      (session: any) => session.device.type === DeviceType.POOL || session.device.type === DeviceType.FRAME
    );

    // Filter out unavailable devices
    const availableDevices = allDevices.filter((device: any) => {
      // If Pool or Frame is active, both are unavailable
      if (isPoolOrFrameActive && (device.type === DeviceType.POOL || device.type === DeviceType.FRAME)) {
        return false;
      }
      
      // Check if this specific device is in use
      return !usedDevices.has(`${device.type}-${device.counterNo}`);
    });

    return availableDevices;
  }),

  // Get all devices (including those in use)
  getAllDevices: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.device.findMany({
      orderBy: [
        { type: 'asc' },
        { counterNo: 'asc' }
      ]
    });
  }),

  // Create a new session
  createSession: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        playerCount: z.number().min(1),
        tokenNo: z.number(),
        comments: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate player count
      const device = await ctx.db.device.findUnique({
        where: { id: input.deviceId },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      if (input.playerCount > device.maxPlayers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This device only allows a maximum of ${device.maxPlayers} players`,
        });
      }

      // Check if device is available
      const activeSessionsOnDevice = await ctx.db.session.findFirst({
        where: {
          deviceId: input.deviceId,
          status: SessionStatus.ACTIVE,
        },
      });

      if (activeSessionsOnDevice) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This device is already in use",
        });
      }

      // Check Pool/Frame constraint
      if (device.type === DeviceType.POOL || device.type === DeviceType.FRAME) {
        const isPoolFrameActive = await ctx.db.session.findFirst({
          where: {
            device: {
              type: {
                in: [DeviceType.POOL, DeviceType.FRAME],
              },
            },
            status: SessionStatus.ACTIVE,
          },
        });

        if (isPoolFrameActive) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Pool table is already in use",
          });
        }
      }

      // Find existing token for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // First check if there's a token with active sessions
      const activeTokenWithNumber = await ctx.db.token.findFirst({
        where: {
          tokenNo: input.tokenNo,
          createdAt: {
            gte: today,
          },
          sessions: {
            some: {
              status: SessionStatus.ACTIVE
            }
          }
        },
      });

      let token;
      // If there's an active token, use it
      if (activeTokenWithNumber) {
        token = activeTokenWithNumber;
      } else {
        // Check if token has any completed bills (PAID or DUE)
        const hasCompletedBill = await ctx.db.bill.findFirst({
          where: {
            token: {
              tokenNo: input.tokenNo,
              createdAt: {
                gte: today,
              },
            },
            status: {
              in: [PaymentStatus.PAID, PaymentStatus.DUE]
            }
          },
          include: {
            token: true
          }
        });

        // Create a new token if token has a completed bill or if it doesn't exist
        if (hasCompletedBill) {
          // Create new token with same number (recycling token number)
          token = await ctx.db.token.create({
            data: {
              tokenNo: input.tokenNo,
            },
          });
        } else {
          // Look for existing token that doesn't have completed bills
          token = await ctx.db.token.findFirst({
            where: {
              tokenNo: input.tokenNo,
              createdAt: {
                gte: today,
              },
            },
          });

          // Create new token if not found
          if (!token) {
            token = await ctx.db.token.create({
              data: {
                tokenNo: input.tokenNo,
              },
            });
          }
        }
      }

      // Create the session
      const session = await ctx.db.session.create({
        data: {
          tokenId: token.id,
          deviceId: input.deviceId,
          playerCount: input.playerCount,
          comments: input.comments,
          status: SessionStatus.ACTIVE,
        },
        include: {
          device: true,
        },
      });

      return session;
    }),

  // End a session
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: { device: true },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      if (session.status === SessionStatus.STOPPED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is already stopped",
        });
      }

      const now = new Date();
      const duration = Math.ceil(
        (now.getTime() - session.startTime.getTime()) / (1000 * 60)
      );

      // Calculate cost: hourlyRate / 60 * durationInMinutes
      const hourlyRate = session.device.hourlyRate;
      const cost = Number(hourlyRate) / 60 * duration;

      const updatedSession = await ctx.db.session.update({
        where: { id: input.sessionId },
        data: {
          status: SessionStatus.STOPPED,
          endTime: now,
          duration: duration,
          cost: cost,
        },
        include: {
          device: true,
        },
      });

      return updatedSession;
    }),

  // Update session comments
  updateSessionComments: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        comments: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const updatedSession = await ctx.db.session.update({
        where: { id: input.sessionId },
        data: {
          comments: input.comments,
        },
      });

      return updatedSession;
    }),

  // Generate bill for a token
  generateBill: protectedProcedure
    .input(z.object({ tokenId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
        include: {
          sessions: {
            include: {
              device: true
            }
          },
        },
      });

      if (!token) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Token not found",
        });
      }

      // First calculate costs for active sessions temporarily (won't save to DB)
      let totalAmount = 0;
      const now = new Date();
      
      for (const session of token.sessions) {
        if (session.status === SessionStatus.ACTIVE) {
          // For active sessions, calculate duration based on current time
          const durationInMinutes = Math.ceil(
            (now.getTime() - new Date(session.startTime).getTime()) / (1000 * 60)
          );
          
          // Calculate cost based on device hourly rate
          const hourlyRate = session.device.hourlyRate;
          const currentCost = (Number(hourlyRate) / 60) * durationInMinutes;
          
          // Add to total
          totalAmount += currentCost;
        } else {
          // For already ended sessions, use the stored cost
          totalAmount += Number(session.cost) || 0;
        }
      }

      // Create bill with the calculated total amount
      const bill = await ctx.db.bill.create({
        data: {
          tokenId: input.tokenId,
          totalAmount: totalAmount,
          status: PaymentStatus.PENDING,
        },
        include: {
          token: {
            include: {
              sessions: {
                include: {
                  device: true
                }
              }
            }
          }
        }
      });

      return bill;
    }),

  // Get bill by ID
  getBill: protectedProcedure
    .input(z.object({ billId: z.number() }))
    .query(async ({ ctx, input }) => {
      const bill = await ctx.db.bill.findUnique({
        where: { id: input.billId },
        include: {
          token: {
            include: {
              sessions: {
                include: {
                  device: true
                }
              }
            }
          }
        }
      });

      if (!bill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bill not found",
        });
      }

      return bill;
    }),

  // Update bill status
  updateBillStatus: protectedProcedure
    .input(z.object({ 
      billId: z.number(),
      status: z.enum([PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.DUE])
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the bill with token information
      const bill = await ctx.db.bill.findUnique({
        where: { id: input.billId },
        include: {
          token: true
        }
      });

      if (!bill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bill not found",
        });
      }

      // Find all active sessions for this token
      const activeSessions = await ctx.db.session.findMany({
        where: {
          tokenId: bill.tokenId,
          status: SessionStatus.ACTIVE
        },
        include: { 
          device: true 
        }
      });

      // End all active sessions
      const now = new Date();
      for (const session of activeSessions) {
        const duration = Math.ceil(
          (now.getTime() - session.startTime.getTime()) / (1000 * 60)
        );

        // Calculate cost: hourlyRate / 60 * durationInMinutes
        const hourlyRate = session.device.hourlyRate;
        const cost = Number(hourlyRate) / 60 * duration;

        // Update the session
        await ctx.db.session.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.STOPPED,
            endTime: now,
            duration: duration,
            cost: cost,
          }
        });
      }

      // Update the bill status
      const updatedBill = await ctx.db.bill.update({
        where: { id: input.billId },
        data: {
          status: input.status,
        },
        include: {
          token: true
        }
      });

      return updatedBill;
    }),
}); 