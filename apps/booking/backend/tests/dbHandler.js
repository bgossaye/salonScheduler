const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Real mongod binary, in-memory — not a mock. This lets tests exercise
// actual Mongoose behavior (unique indexes, $elemMatch, transactions on a
// replica set) instead of stubbing the DB layer, which is what matters most
// for the conflict-detection and coupon logic these tests cover.
async function connect() {
  mongoServer = await MongoMemoryServer.create({
    // A single-node replica set is required for mongoose transactions
    // (session.withTransaction) to work — appointmentIntegrity.js uses
    // exactly that, so the test DB needs to match.
    instance: { replSet: 'rakie-test-rs' },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { dbName: 'rakie-test' });
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connect, closeDatabase, clearDatabase };
