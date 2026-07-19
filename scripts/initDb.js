require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

// Load Models
const User = require('../models/User');
const Player = require('../models/Player');
const Team = require('../models/Team');
const Match = require('../models/Match');
const BallByBall = require('../models/BallByBall');
const PlayerCareerStats = require('../models/PlayerCareerStats');
const Partnership = require('../models/Partnership');

const initDatabase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI not found in environment variables");
    }

    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully to MongoDB Atlas.");

    const models = [
      { name: 'User', model: User },
      { name: 'Player', model: Player },
      { name: 'Team', model: Team },
      { name: 'Match', model: Match },
      { name: 'BallByBall', model: BallByBall },
      { name: 'PlayerCareerStats', model: PlayerCareerStats },
      { name: 'Partnership', model: Partnership }
    ];

    console.log("\nInitializing collections and indexes...");
    for (const { name, model } of models) {
      console.log(`Syncing indexes for ${name}...`);
      await model.init(); // Wait for Mongoose to build indexes on the collection
      await model.syncIndexes(); // Ensures actual DB indexes match schema
      console.log(`Successfully synced indexes for ${name}.`);
    }

    console.log("\nDatabase setup completed successfully on MongoDB Atlas!");
    process.exit(0);
  } catch (error) {
    console.error("Database setup failed:", error);
    process.exit(1);
  }
};

initDatabase();
