// Script to clear all session entries from the database
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function clearSessions() {
  try {
    console.log('Clearing all data from the database...');
    
    // First clear all bills since they reference sessions
    const deletedBills = await prisma.bill.deleteMany({});
    console.log(`✅ ${deletedBills.count} bills deleted`);
    
    // Then clear all sessions
    const deletedSessions = await prisma.session.deleteMany({});
    console.log(`✅ ${deletedSessions.count} sessions deleted`);
    
    // Delete all orders instead of marking them as completed
    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`✅ ${deletedOrders.count} orders deleted`);
    
    // Also delete all tokens
    const deletedTokens = await prisma.token.deleteMany({});
    console.log(`✅ ${deletedTokens.count} tokens deleted`);
    
    console.log('\n🎮 Database cleaned successfully!');
    console.log('You can now start with a fresh set of gaming sessions.');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
clearSessions(); 