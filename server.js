const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map(); // socket.id => username
const rooms = new Map(); // roomCode => { creator: socket.id, users: Set(socket.id) }

io.on('connection', (socket) => {
  socket.join('global'); // All users start in the global chat

  socket.on('user:join', (desiredName, cb) => {
    const baseName = desiredName?.trim() || 'anonymous';
    let name = baseName;
    let count = 1;
    while ([...users.values()].includes(name)) {
      count++;
      name = `${baseName}#${count}`;
    }

    users.set(socket.id, name);
    socket.emit('chat:message', {
      username: 'System',
      text: `${name} has joined the chat.`,
      ts: Date.now(),
      system: true,
    });

    io.to('global').emit('users:update', Array.from(users.values()));
    if (cb) cb({ ok: true, assignedName: name });
  });

  socket.on('chat:message', (text, roomCode) => {
    const username = users.get(socket.id) || 'anonymous';
    const room = roomCode ? rooms.get(roomCode) : null;
    const roomName = room ? roomCode : 'global';

    if (typeof text === 'string' && text.trim().length > 0) {
      io.to(roomName).emit('chat:message', {
        username,
        text: text.trim(),
        ts: Date.now(),
        system: false,
      });
    }
  });

  socket.on('room:create', (cb) => {
    const roomCode = Math.floor(Math.random() * 9000) + 1000; // 4-digit code
    rooms.set(roomCode, { creator: socket.id, users: new Set([socket.id]) });
    socket.join(roomCode.toString());
    io.to('global').emit('users:update', Array.from(users.values()));
    if (cb) cb({ ok: true, roomCode });
  });

  socket.on('room:join', (roomCode, cb) => {
    const room = rooms.get(roomCode);
    if (room && !room.users.has(socket.id)) {
      room.users.add(socket.id);
      socket.join(roomCode.toString());
      io.to(roomCode.toString()).emit('chat:message', {
        username: 'System',
        text: `${users.get(socket.id)} has joined the room.`,
        ts: Date.now(),
        system: true,
      });
      io.to('global').emit('users:update', Array.from(users.values()));
      if (cb) cb({ ok: true });
    } else {
      if (cb) cb({ ok: false, error: 'Room not found or already joined.' });
    }
  });

  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);

    rooms.forEach((room, code) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        io.to(code.toString()).emit('chat:message', {
          username: 'System',
          text: `${name} has left the room.`,
          ts: Date.now(),
          system: true,
        });
        if (room.users.size === 0) {
          rooms.delete(code);
        }
      }
    });

    io.to('global').emit('users:update', Array.from(users.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
