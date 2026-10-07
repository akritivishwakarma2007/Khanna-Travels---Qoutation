const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (
      !uri ||
      uri === 'your_mongodb_atlas_connection_string_here' ||
      uri.includes('admin:password@cluster.mongodb.net') ||
      uri.includes('username:password')
    ) {
      console.warn('⚠️  MONGODB_URI not configured — running in offline mode.');
      mongoose.set('bufferCommands', false);
      return false;
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
      socketTimeoutMS: 5000
    });
    console.log('✅  MongoDB connected:', mongoose.connection.host);
    return true;
  } catch (err) {
    console.error('❌  MongoDB connection error:', err.message);
    mongoose.set('bufferCommands', false);
    return false;
  }
};

module.exports = connectDB;
