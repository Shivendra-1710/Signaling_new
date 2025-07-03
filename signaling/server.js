import { Server } from 'socket.io';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"], // Allow Vite dev server and other origins
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Store connected clients
const clients = new Map();
// Store room memberships
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      if (data.type === 'REGISTER') {
        // Register the client with their userId
        clients.set(data.from, socket);
        console.log(`Client registered: ${data.from} (socket: ${socket.id})`);
        return;
      }

      // Forward the message to the target user
      const targetSocket = clients.get(data.to);
      if (targetSocket && targetSocket.connected) {
        targetSocket.emit('message', message);
        console.log(`Message forwarded from ${data.from} to ${data.to}`);
      } else {
        console.log(`Target user ${data.to} not found or disconnected`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  socket.on('share-request', (data) => {
    console.log('Share request from', data.fromUserId, 'to', data.targetUserId, 'for room', data.roomId);
    const targetSocket = clients.get(data.targetUserId);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('share-request', data);
      console.log(`Share request forwarded to ${data.targetUserId}`);
    } else {
      console.log(`Target user ${data.targetUserId} not found for share request`);
    }
  });

  // Handle room joining
  socket.on('join-room', (roomId) => {
    console.log(`Socket ${socket.id} joining room: ${roomId}`);
    socket.join(roomId);
    
    // Track room membership
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);
    
    // Notify others in the room that someone joined
    socket.to(roomId).emit('user-joined', { socketId: socket.id, roomId });
    console.log(`Socket ${socket.id} joined room ${roomId}, ${rooms.get(roomId).size} users in room`);
  });

  // Handle WebRTC offer
  socket.on('offer', (data) => {
    console.log(`Received offer for room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', data);
    console.log(`Offer forwarded to room ${data.roomId}`);
  });

  // Handle WebRTC answer
  socket.on('answer', (data) => {
    console.log(`Received answer for room ${data.roomId}`);
    socket.to(data.roomId).emit('answer', data);
    console.log(`Answer forwarded to room ${data.roomId}`);
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    console.log(`Received ICE candidate for room ${data.roomId}`);
    socket.to(data.roomId).emit('ice-candidate', data);
    console.log(`ICE candidate forwarded to room ${data.roomId}`);
  });

  // Handle stop sharing
  socket.on('stop-sharing', (data) => {
    console.log(`Stop sharing for room ${data.roomId}`);
    socket.to(data.roomId).emit('share-stopped', data);
    console.log(`Stop sharing forwarded to room ${data.roomId}`);
  });

  // Remote Access Events
  socket.on('remote-access-request', (data) => {
    console.log('Remote access request from', data.fromUserId, 'to', data.targetUserId, 'for room', data.roomId);
    const targetSocket = clients.get(data.targetUserId);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('remote-access-request', data);
      console.log(`Remote access request forwarded to ${data.targetUserId}`);
    } else {
      console.log(`Target user ${data.targetUserId} not found for remote access request`);
    }
  });

  socket.on('remote-access-offer', (data) => {
    console.log(`Received remote access offer for room ${data.roomId} to ${data.targetUserId}`);
    const targetSocket = clients.get(data.targetUserId);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('remote-access-offer', data);
      console.log(`Remote access offer forwarded to ${data.targetUserId}`);
    } else {
      console.log(`Target user ${data.targetUserId} not found for remote access offer`);
    }
  });

  socket.on('remote-access-answer', (data) => {
    console.log(`Received remote access answer for room ${data.roomId}`);
    socket.to(data.roomId).emit('remote-access-answer', data);
    console.log(`Remote access answer forwarded to room ${data.roomId}`);
  });

  socket.on('remote-access-ice-candidate', (data) => {
    console.log(`Received remote access ICE candidate for room ${data.roomId}`);
    socket.to(data.roomId).emit('remote-access-ice-candidate', data);
    console.log(`Remote access ICE candidate forwarded to room ${data.roomId}`);
  });

  socket.on('remote-access-stop', (data) => {
    console.log(`Stop remote access for room ${data.roomId}`);
    socket.to(data.roomId).emit('remote-access-stopped', data);
    console.log(`Stop remote access forwarded to room ${data.roomId}`);
  });

  // Remote Access Debug Messages
  socket.on('remote-access-debug', (data) => {
    console.log('Remote access debug message from', data.fromUserId, 'to', data.toUserId, ':', data.message);
    const targetSocket = clients.get(data.toUserId);
    if (targetSocket && targetSocket.connected) {
      targetSocket.emit('remote-access-debug', data);
      console.log(`Debug message forwarded to ${data.toUserId}`);
    } else {
      console.log(`Target user ${data.toUserId} not found for debug message`);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'reason:', reason);
    
    // Remove client from the map
    for (const [userId, clientSocket] of clients.entries()) {
      if (clientSocket === socket) {
        clients.delete(userId);
        console.log(`Client unregistered: ${userId}`);
        break;
      }
    }
    
    // Remove from all rooms
    for (const [roomId, sockets] of rooms.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        socket.to(roomId).emit('user-left', { socketId: socket.id, roomId });
        console.log(`Socket ${socket.id} left room ${roomId}`);
        
        // Clean up empty rooms
        if (sockets.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT} with Socket.IO`);
}); 