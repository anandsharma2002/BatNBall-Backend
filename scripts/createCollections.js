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

const run = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    console.log("\nInserting temporary records to initialize collections...");

    // 1. Create User
    const user = await User.create({
      phone_number: "+911111111111",
      password_hash: "$2b$10$temporaryhashhereforinitpurposeonly"
    });
    console.log("- Created temporary document in 'users'");

    // 2. Create Player
    const player = await Player.create({
      first_name: "Temporary",
      last_name: "Initialization",
      display_name: "Temp Init",
      batting_style: "RIGHT_HAND"
    });
    console.log("- Created temporary document in 'players'");

    // 3. Create Team
    const team = await Team.create({
      team_name: "Temporary Init Team",
      team_short_name: "TIT",
      created_by_user_id: user._id
    });
    console.log("- Created temporary document in 'teams'");

    // 4. Create Match
    const match = await Match.create({
      venue: "Temporary Init Stadium",
      match_date_time: new Date(),
      total_overs_per_innings: 20,
      max_overs_per_bowler: 4,
      ball_type: "COSCO",
      created_by: user._id,
      team_first_id: team._id,
      team_second_id: team._id
    });
    console.log("- Created temporary document in 'matches'");

    // 5. Create BallByBall
    await BallByBall.create({
      match_id: match._id,
      innings_number: 1,
      over_number: 0,
      ball_number_in_over: 1,
      total_legal_balls_in_innings: 1,
      batting_team_id: team._id,
      bowling_team_id: team._id,
      striker_id: player._id,
      non_striker_id: player._id,
      bowler_id: player._id,
      match_phase: "POWERPLAY",
      current_total_score: 0,
      current_wickets_down: 0
    });
    console.log("- Created temporary document in 'ball_by_ball'");

    // 6. Create PlayerCareerStats
    await PlayerCareerStats.create({
      player_id: player._id
    });
    console.log("- Created temporary document in 'player_career_stats'");

    // 7. Create Partnership
    await Partnership.create({
      match_id: match._id,
      batsman_1_id: player._id,
      batsman_2_id: player._id
    });
    console.log("- Created temporary document in 'partnerships'");

    console.log("\nAll 7 collections initialized successfully with indexes!");

    // Clean up the temporary documents, leaving the empty collections intact
    console.log("\nCleaning up temporary database entries...");
    await Player.deleteMany({});
    await User.deleteMany({});
    await Team.deleteMany({});
    await Match.deleteMany({});
    await BallByBall.deleteMany({});
    await PlayerCareerStats.deleteMany({});
    await Partnership.deleteMany({});
    console.log("Database clean up complete. Empty collections will remain visible in MongoDB Atlas.");

    process.exit(0);
  } catch (error) {
    console.error("Error setting up database collections:", error);
    process.exit(1);
  }
};

run();
