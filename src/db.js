const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let memServer = null;

/**
 * Connects to MongoDB.
 * - If MONGODB_URI is set (e.g. a locally installed MongoDB or Atlas), that is used.
 * - Otherwise a real MongoDB server is started automatically with its data kept in ./data/db,
 *   so your records survive restarts.
 */
async function connect() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const dbPath = path.join(__dirname, '..', 'data', 'db');
    fs.mkdirSync(dbPath, { recursive: true });
    memServer = await MongoMemoryServer.create({
      instance: {
        dbPath,
        storageEngine: 'wiredTiger',
        port: Number(process.env.MONGO_PORT || 27018),
      },
    });
    uri = memServer.getUri();
  }
  await mongoose.connect(uri, { dbName: process.env.DB_NAME || 'lorry_business' });
  return uri;
}

async function disconnect() {
  await mongoose.disconnect();
  if (memServer) await memServer.stop({ doCleanup: false }); // keep data on disk
}

module.exports = { connect, disconnect };
