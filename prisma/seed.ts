import { PrismaClient, DeviceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing devices
  await prisma.device.deleteMany({});

  // PS5: counters = 5, players per session allowed = 1 to 4
  for (let i = 1; i <= 5; i++) {
    await prisma.device.create({
      data: {
        type: 'PS5',
        counterNo: i,
        maxPlayers: 4,
        hourlyRate: 120, // Example rate
      },
    });
  }

  // PS4: counters = 1, players per session allowed = 1 or 2
  await prisma.device.create({
    data: {
      type: 'PS4',
      counterNo: 1,
      maxPlayers: 2,
      hourlyRate: 80, // Example rate
    },
  });

  // VR: counters = 1, players = 1
  await prisma.device.create({
    data: {
      type: 'VR',
      counterNo: 1,
      maxPlayers: 1,
      hourlyRate: 150, // Example rate
    },
  });

  // VR Racing: counters = 1, players = 1
  await prisma.device.create({
    data: {
      type: 'VR_RACING',
      counterNo: 1,
      maxPlayers: 1,
      hourlyRate: 180, // Example rate
    },
  });

  // Pool: counters = 1, players = 1
  await prisma.device.create({
    data: {
      type: 'POOL',
      counterNo: 1,
      maxPlayers: 1,
      hourlyRate: 100, // Example rate
    },
  });

  // Frame: counters = 1, players = 1
  await prisma.device.create({
    data: {
      type: 'FRAME',
      counterNo: 1,
      maxPlayers: 10,
      hourlyRate: 100, // Example rate
    },
  });

  // Racing: counters = 2, players = 1
  for (let i = 1; i <= 2; i++) {
    await prisma.device.create({
      data: {
        type: 'RACING',
        counterNo: i,
        maxPlayers: 1,
        hourlyRate: 130, // Example rate
      },
    });
  }

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 