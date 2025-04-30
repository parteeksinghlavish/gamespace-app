import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function updateFrameMaxPlayers() {
  try {
    const updatedDevice = await prisma.device.updateMany({
      where: {
        type: 'FRAME',
      },
      data: {
        maxPlayers: 10,
      },
    });
    
    console.log('Frame device max players updated to 10');
    console.log('Updated records:', updatedDevice.count);
  } catch (error) {
    console.error('Error updating Frame device:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateFrameMaxPlayers(); 