require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Player = require('../models/Player');

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    const adminPhone = "+919999999999";
    const adminPassword = "AdminPassword123";

    const existingAdmin = await User.findOne({ phone_number: adminPhone });
    if (existingAdmin) {
      console.log(`Super Admin user with phone ${adminPhone} already exists.`);
      process.exit(0);
    }

    // Create a linked player profile first
    const adminPlayer = new Player({
      first_name: "Super",
      last_name: "Admin",
      display_name: "Admin Administrator",
      batting_style: "RIGHT_HAND",
      bowling_style: "NONE",
      player_roles: ["ALL_ROUNDER"]
    });
    const savedPlayer = await adminPlayer.save();
    console.log("- Created Admin Player profile.");

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(adminPassword, salt);

    // Create Admin User
    const adminUser = new User({
      phone_number: adminPhone,
      password_hash,
      role: 'SUPER_ADMIN',
      associated_player_id: savedPlayer._id,
      account_status: 'ACTIVE'
    });
    await adminUser.save();
    console.log("- Created Super Admin User account.");

    console.log(`\n==================================================`);
    console.log(`Super Admin Seeded Successfully!`);
    console.log(`Phone: ${adminPhone}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`==================================================\n`);

    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
};

seedAdmin();
