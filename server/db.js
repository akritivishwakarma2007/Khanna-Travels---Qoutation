const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (
      !uri ||
      uri === 'your_mongodb_atlas_connection_string_here' ||
      uri.includes('username:password')
    ) {
      console.warn('⚠️  MONGODB_URI not configured — running in offline mode.');
      mongoose.set('bufferCommands', false);
      return false;
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 30000
    });
    console.log('✅  MongoDB Atlas connected successfully:', mongoose.connection.host);
    return true;
  } catch (err) {
    console.error('❌  MongoDB Atlas connection error:', err.message);
    mongoose.set('bufferCommands', false);
    return false;
  }
};

module.exports = connectDB;
