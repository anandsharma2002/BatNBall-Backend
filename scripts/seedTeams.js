require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Team = require('../models/Team');
const Player = require('../models/Player');
const User = require('../models/User');

const seedTeams = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    // Find the user Anand Sharma to make them the creator
    const creator = await User.findOne({ phone_number: "+919000000001" });
    if (!creator) {
      console.error("Anand Sharma user not found. Please run seedUsers first.");
      process.exit(1);
    }

    // Check if RCB already exists
    const existingRcb = await Team.findOne({ team_short_name: "RCB" });
    if (existingRcb) {
      console.log("RCB team already seeded.");
      process.exit(0);
    }

    // Find other seeded players to add to RCB roster
    const player2 = await Player.findOne({ display_name: "Test 2" });
    const player3 = await Player.findOne({ display_name: "Test 3" });
    const player4 = await Player.findOne({ display_name: "Test 4" });

    const squad_members = [];
    if (player2) squad_members.push({ player_id: player2._id, role_in_team: "CAPTAIN" });
    if (player3) squad_members.push({ player_id: player3._id, role_in_team: "WICKET_KEEPER" });
    if (player4) squad_members.push({ player_id: player4._id, role_in_team: "MEMBER" });

    const rcbTeam = new Team({
      team_name: "Royal Challengers Bengaluru",
      team_short_name: "RCB",
      created_by_user_id: creator._id,
      squad_members
    });

    await rcbTeam.save();
    console.log("Seeded RCB team successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Seeding teams failed:", error);
    process.exit(1);
  }
};

seedTeams();
