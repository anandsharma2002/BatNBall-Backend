module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Socket client connected:', socket.id);
    
    socket.on('join_match_room', (matchId) => {
      socket.join(matchId);
      socket.join(`match_room_${matchId}`);
      console.log(`Socket ${socket.id} joined room: ${matchId} (legacy)`);
    });

    socket.on('join:match', (matchId) => {
      socket.join(matchId);
      socket.join(`match_room_${matchId}`);
      console.log(`Socket ${socket.id} joined room: match_room_${matchId}`);
    });

    socket.on('disconnect', () => {
      console.log('Socket client disconnected:', socket.id);
    });
  });
};
