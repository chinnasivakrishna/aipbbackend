// Complete MongoDB index fix script
// Save as fixIndexesComplete.js and run with: node fixIndexesComplete.js

const mongoose = require('mongoose');

async function fixIndexesComplete() {
  try {
    // Connect to MongoDB (adjust connection string as needed)
    await mongoose.connect('mongodb+srv://chinnasivakrishna2003:siva@cluster0.u7gjmpo.mongodb.net/aipublisher?retryWrites=true&w=majority&appName=Cluster0');
    
    const db = mongoose.connection.db;
    const collection = db.collection('mobileusers');
    
    console.log('🔍 Current indexes:');
    const currentIndexes = await collection.indexes();
    currentIndexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)} ${index.unique ? '(UNIQUE)' : ''}`);
    });
    
    // Step 1: Drop the problematic mobile_1_client_1 index (uses wrong field name)
    const hasWrongIndex = currentIndexes.some(index => index.name === 'mobile_1_client_1');
    
    if (hasWrongIndex) {
      console.log('\n🗑️  Dropping problematic mobile_1_client_1 index (uses wrong field "client")...');
      await collection.dropIndex('mobile_1_client_1');
      console.log('✅ Successfully dropped mobile_1_client_1 index');
    } else {
      console.log('✅ mobile_1_client_1 index not found (already fixed)');
    }
    
    // Step 2: Ensure correct compound index exists
    const hasCorrectIndex = currentIndexes.some(index => 
      index.name === 'mobile_1_clientId_1' || 
      (index.key && index.key.mobile === 1 && index.key.clientId === 1)
    );
    
    if (!hasCorrectIndex) {
      console.log('\n📝 Creating correct compound index...');
      await collection.createIndex(
        { mobile: 1, clientId: 1 }, 
        { unique: true, name: 'mobile_1_clientId_1' }
      );
      console.log('✅ Successfully created mobile_1_clientId_1 index');
    } else {
      console.log('✅ Correct compound index already exists');
    }
    
    // Step 3: Clean up any existing documents with null clientId
    console.log('\n🧹 Checking for documents with null clientId...');
    const nullClientIdDocs = await collection.find({ clientId: null }).toArray();
    
    if (nullClientIdDocs.length > 0) {
      console.log(`⚠️  Found ${nullClientIdDocs.length} documents with null clientId`);
      console.log('These documents need manual review:');
      nullClientIdDocs.forEach(doc => {
        console.log(`- Mobile: ${doc.mobile}, ID: ${doc._id}, Created: ${doc.createdAt}`);
      });
      
      // Option: Delete them or update them - uncomment as needed
      // await collection.deleteMany({ clientId: null });
      // console.log('🗑️ Deleted documents with null clientId');
    } else {
      console.log('✅ No documents with null clientId found');
    }
    
    // Step 4: Verify final state
    console.log('\n🎯 Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)} ${index.unique ? '(UNIQUE)' : ''}`);
    });
    
    // Step 5: Test the fix with a sample query
    console.log('\n🧪 Testing index functionality...');
    const testResult = await collection.findOne({ mobile: '7702366289' });
    if (testResult) {
      console.log(`📱 Found existing record: Mobile ${testResult.mobile}, ClientId: ${testResult.clientId}`);
    }
    
    console.log('\n✅ Index fix completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Removed problematic mobile_1_client_1 index');
    console.log('- Ensured mobile_1_clientId_1 index exists');
    console.log('- Ready for application restart');
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the fix
fixIndexesComplete();