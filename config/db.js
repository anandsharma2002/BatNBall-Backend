const mongoose = require('mongoose');

const migrateUsernames = async () => {
  try {
    const Player = require('../models/Player');
    const players = await Player.find({ 
      $or: [
        { username: { $exists: false } },
        { username: null },
        { username: "" }
      ]
    });
    
    if (players.length === 0) return;
    
    console.log(`Found ${players.length} players without usernames. Starting migration...`);
    
    for (const player of players) {
      let baseUsername = (player.display_name || player.first_name || 'player')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (!baseUsername) baseUsername = 'player';
      
      let username = baseUsername;
      let suffix = 1;
      while (await Player.findOne({ username })) {
        username = `${baseUsername}${suffix}`;
        suffix++;
      }
      
      player.username = username;
      await player.save();
      console.log(`Migrated player: ${player.display_name} -> username: ${username}`);
    }
    console.log('Username migration completed successfully.');
  } catch (err) {
    console.error('Error during username migration:', err);
  }
};

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI environment variable is missing!");
    }
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Run username migration
    await migrateUsernames();
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
