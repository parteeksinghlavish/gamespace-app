import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import type { Device, Session } from "@prisma/client";
import { DeviceType, SessionStatus, PaymentStatus } from "~/lib/constants";
import { calculatePrice, roundTimeToCharge, calculateDuration } from "~/lib/pricing";

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

  // End a gaming session
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: {
          device: true
        }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      if (session.status === SessionStatus.ENDED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session is already ended",
        });
      }

      // Calculate duration and cost using the new pricing system
      const now = new Date();
      const durationInMinutes = calculateDuration(session.startTime, now);
      
      let cost = 0;
      
      // Special handling for Frame devices
      if (session.device.type === DeviceType.FRAME) {
        // For Frame, cost is fixed at Rs 50 * player count
        cost = 50 * session.playerCount;
        console.log(`Ending Frame session with ${session.playerCount} players: cost = ${cost}`);
      } else {
        try {
          // Calculate price based on device type, player count, and duration
          cost = calculatePrice(
            session.device.type as any, // Cast to any as a workaround for TypeScript
            session.playerCount,
            durationInMinutes
          );
        } catch (error) {
          console.error("Error calculating price:", error);
          // Fallback to legacy calculation if the new system throws an error
          const hourlyRate = Number(session.device.hourlyRate || 0);
          const roundedTime = roundTimeToCharge(durationInMinutes);
          cost = (hourlyRate / 60) * roundedTime;
        }
      }

      // Update the session
      const updatedSession = await ctx.db.session.update({
        where: { id: input.sessionId },
        data: {
          status: SessionStatus.ENDED,
          endTime: now,
          duration: durationInMinutes,
          cost: cost,
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

      let totalAmount = 0;
      const now = new Date();
      
      // Debug log to see what sessions are being calculated
      console.log("Calculating bill for sessions:", token.sessions.map(s => ({
        id: s.id,
        device: s.device.type,
        players: s.playerCount,
        status: s.status,
        cost: s.cost
      })));
      
      for (const session of token.sessions) {
        if (session.status === SessionStatus.ACTIVE) {
          // Special handling for Frame
          if (session.device.type === DeviceType.FRAME) {
            const framePrice = 50 * session.playerCount;
            console.log(`Active Frame session ${session.id}: ${framePrice} (${session.playerCount} players)`);
            totalAmount += framePrice;
            continue;
          }

          // For non-Frame active sessions, calculate duration from start time to now
          const durationInMinutes = calculateDuration(session.startTime, now);
          
          try {
            // Calculate price based on device type, player count, and duration
            const price = calculatePrice(
              session.device.type as any, // Cast to any as a workaround for TypeScript
              session.playerCount,
              durationInMinutes
            );
            
            console.log(`Active session ${session.id} (${session.device.type}): ${price} for ${durationInMinutes}m`);
            totalAmount += price;
          } catch (error) {
            console.error("Error calculating price:", error);
            // Fallback to legacy calculation if the new system throws an error
            const hourlyRate = Number(session.device.hourlyRate || 0);
            const roundedTime = roundTimeToCharge(durationInMinutes);
            const cost = (hourlyRate / 60) * roundedTime;
            console.log(`Fallback calculation for session ${session.id}: ${cost}`);
            totalAmount += cost;
          }
        } else {
          // For ended sessions, use the stored cost
          const sessionCost = Number(session.cost || 0);
          console.log(`Ended session ${session.id} (${session.device.type}): ${sessionCost}`);
          totalAmount += sessionCost;
        }
      }
      
      console.log(`Total calculated amount: ${totalAmount}`);

      // Create the bill
      const bill = await ctx.db.bill.create({
        data: {
          tokenId: token.id,
          amount: totalAmount,
          status: "PENDING",
        },
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
      status: z.enum([PaymentStatus.PENDING, PaymentStatus.PAID, PaymentStatus.DUE]),
      correctedAmount: z.number().optional()
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
        // Special handling for Frame
        if (session.device.type === DeviceType.FRAME) {
          const frameCost = 50 * session.playerCount;
          
          // Update the session
          await ctx.db.session.update({
            where: { id: session.id },
            data: {
              status: SessionStatus.ENDED,
              endTime: now,
              duration: calculateDuration(session.startTime, now),
              cost: frameCost,
            }
          });
          continue;
        }
        
        // Calculate duration using our new helper function
        const durationInMinutes = calculateDuration(session.startTime, now);
        
        let cost = 0;
        try {
          // Calculate price using our new pricing system
          cost = calculatePrice(
            session.device.type as any, // Cast to any as a workaround for TypeScript
            session.playerCount,
            durationInMinutes
          );
        } catch (error) {
          console.error("Error calculating price:", error);
          // Fallback to legacy calculation if the new system throws an error
          const hourlyRate = Number(session.device.hourlyRate || 0);
          const roundedTime = roundTimeToCharge(durationInMinutes);
          cost = (hourlyRate / 60) * roundedTime;
        }

        // Update the session
        await ctx.db.session.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.ENDED,
            endTime: now,
            duration: durationInMinutes,
            cost: cost,
          }
        });
      }

      // Update the bill status and amount if corrected amount is provided
      const updateData: any = {
        status: input.status,
      };
      
      // If client provided a corrected amount, use it
      if (input.correctedAmount !== undefined) {
        updateData.amount = input.correctedAmount;
        console.log(`Updating bill amount from ${bill.amount} to ${input.correctedAmount}`);
      }

      // Update the bill status
      const updatedBill = await ctx.db.bill.update({
        where: { id: input.billId },
        data: updateData,
        include: {
          token: true
        }
      });

      return updatedBill;
    }),

  // Update frames played for Frame game sessions
  updateFramesPlayed: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        comments: z.string(),
        framesPlayed: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: { device: true }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Verify this is a Frame game
      if (session.device.type !== DeviceType.FRAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This endpoint is only for Frame game sessions",
        });
      }

      // Calculate cost based on number of frames
      try {
        // For Frame, cost is now just based on player count (Rs 50 * player count)
        const frameCost = calculatePrice("Frame", session.playerCount, 0, 0);
        
        // Update the session with frames played and cost
        const updatedSession = await ctx.db.session.update({
          where: { id: input.sessionId },
          data: {
            comments: input.comments,
            framesPlayed: input.framesPlayed, // We still track frames for record-keeping
            cost: frameCost,
          },
        });

        return updatedSession;
      } catch (error) {
        console.error("Error calculating frame price:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error calculating price for frames",
        });
      }
    }),

  // Update player count for Frame sessions
  updatePlayerCount: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        playerCount: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        include: { device: true }
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Verify this is a Frame game
      if (session.device.type !== DeviceType.FRAME) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Player count editing is only available for Frame game sessions",
        });
      }

      // Verify player count is within limits
      if (input.playerCount > session.device.maxPlayers) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This device only allows a maximum of ${session.device.maxPlayers} players`,
        });
      }

      // Calculate cost based on number of frames (if any) and new player count
      try {
        // For Frame, cost is now based solely on player count (Rs 50 * player count)
        const frameCost = calculatePrice("Frame", input.playerCount, 0, 0);
        
        // Update the session with new player count and recalculated cost
        const updatedSession = await ctx.db.session.update({
          where: { id: input.sessionId },
          data: {
            playerCount: input.playerCount,
            cost: frameCost,
          },
        });

        return updatedSession;
      } catch (error) {
        console.error("Error calculating frame price:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error calculating price for frames",
        });
      }
    }),
}); 