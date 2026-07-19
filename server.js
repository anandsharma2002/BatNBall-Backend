require('dotenv').config();
console.log('DEBUG: Node Env:', process.env.NODE_ENV);
console.log('DEBUG: Is Vercel:', !!process.env.VERCEL);
console.log('DEBUG: MONGO_URI:', process.env.MONGO_URI ? 'Defined (starts with: ' + process.env.MONGO_URI.substring(0, 15) + '...)' : 'UNDEFINED');
console.log('DEBUG: JWT_SECRET:', process.env.JWT_SECRET ? 'Defined' : 'UNDEFINED');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

const uploadBaseDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadBaseDir));

// Connect to Database
connectDB();

// HTTP & Socket.io Setup
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});
app.set('io', io);

// Register Socket.io events modularly
const registerSocketEvents = require('./sockets');
registerSocketEvents(io);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Welcome to the BatNBall API. Use /ping or /api/v1/... endpoints.' });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'BatNBall API is active' });
});

app.get('/api/v1/health', (req, res) => {
  const mongoose = require('mongoose');
  res.status(200).json({
    status: 'OK',
    message: 'BatNBall API is active',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: !!process.env.VERCEL,
      MONGO_URI_DEFINED: !!process.env.MONGO_URI,
      JWT_SECRET_DEFINED: !!process.env.JWT_SECRET,
    },
    database: {
      readyState: mongoose.connection.readyState,
      connectionHost: mongoose.connection.host || null,
      error: global.dbConnectionError || null
    }
  });
});

app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/players', require('./routes/playerRoutes'));
app.use('/api/v1/teams', require('./routes/teamRoutes'));
app.use('/api/v1/matches', require('./routes/matchRoutes'));
app.use('/api/v1/matches/:matchId/score', require('./routes/scoringRoutes'));
app.use('/api/v1/leaderboard', require('./routes/leaderboardRoutes'));

// Start Server
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
