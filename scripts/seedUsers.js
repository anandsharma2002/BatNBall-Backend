require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Player = require('../models/Player');

const usersToSeed = [
  {
    first_name: "Anand",
    last_name: "Sharma",
    display_name: "A. Sharma",
    phone_number: "+919000000001",
    password: "Sharmaas",
    role: "SUPER_ADMIN"
  },
  {
    first_name: "Super",
    last_name: "Test",
    display_name: "S. Test",
    phone_number: "+919000000002",
    password: "TestSuper",
    role: "SUPER_ADMIN"
  },
  {
    first_name: "Test",
    last_name: "1",
    display_name: "Test 1",
    phone_number: "+919000000003",
    password: "TestUser1",
    role: "USER"
  },
  {
    first_name: "Test",
    last_name: "2",
    display_name: "Test 2",
    phone_number: "+919000000004",
    password: "TestUser2",
    role: "USER"
  },
  {
    first_name: "Test",
    last_name: "3",
    display_name: "Test 3",
    phone_number: "+919000000005",
    password: "TestUser3",
    role: "USER"
  },
  {
    first_name: "Test",
    last_name: "4",
    display_name: "Test 4",
    phone_number: "+919000000006",
    password: "TestUser4",
    role: "USER"
  }
];

const seedUsers = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    console.log("\nSeeding user database...");

    for (const item of usersToSeed) {
      // Check if user already exists
      const existingUser = await User.findOne({ phone_number: item.phone_number });
      if (existingUser) {
        console.log(`- User with phone ${item.phone_number} already exists, skipping.`);
        continue;
      }

      // 1. Create linked player profile
      const player = new Player({
        first_name: item.first_name,
        last_name: item.last_name,
        display_name: item.display_name,
        batting_style: "RIGHT_HAND",
        bowling_style: "NONE",
        player_roles: ["ALL_ROUNDER"]
      });
      const savedPlayer = await player.save();

      // 2. Hash password
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(item.password, salt);

      // 3. Create User account
      const user = new User({
        phone_number: item.phone_number,
        password_hash,
        role: item.role,
        associated_player_id: savedPlayer._id,
        account_status: "ACTIVE"
      });
      await user.save();

      console.log(`- Seeded User: ${item.first_name} ${item.last_name} (${item.role})`);
    }

    console.log("\nAll users successfully seeded in database!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedUsers();
