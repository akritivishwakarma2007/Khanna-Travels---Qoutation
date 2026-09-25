const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri || uri === 'your_mongodb_atlas_connection_string_here') {
      console.warn('⚠️  MONGODB_URI not set — running in offline/demo mode (data will not persist).');
      return false;
    }
    await mongoose.connect(uri);
    console.log('✅  MongoDB connected:', mongoose.connection.host);
    return true;
  } catch (err) {
    console.error('❌  MongoDB connection error:', err.message);
    return false;
  }
};

module.exports = connectDB;
