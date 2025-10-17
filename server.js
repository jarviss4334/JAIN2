// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const users = new Map(); // socket.id => username

io.on('connection', (socket) => {
  // When a new user joins with a desired username
  socket.on('user:join', (desiredName, cb) => {
    const baseName = desiredName?.trim() || 'anonymous';
    let name = baseName;
    let count = 1;
    while ([...users.values()].includes(name)) {
      count++;
      name = `${baseName}#${count}`;
    }

    users.set(socket.id, name);
    socket.join('main');

    if (cb) cb({ ok: true, assignedName: name });

    // Broadcast system message: user joined
    io.to('main').emit('chat:message', {
      username: 'System',
      text: `${name} has joined the chat.`,
      ts: Date.now(),
      system: true,
    });

    // Update user list for all clients
    io.to('main').emit('users:update', Array.from(users.values()));
  });

  // When a user sends a chat message
  socket.on('chat:message', (text) => {
    const username = users.get(socket.id) || 'anonymous';
    if (typeof text === 'string' && text.trim().length > 0) {
      io.to('main').emit('chat:message', {
        username,
        text: text.trim(),
        ts: Date.now(),
        system: false,
      });
    }
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    const name = users.get(socket.id);
    users.delete(socket.id);

    if (name) {
      // Broadcast system message: user left
      io.to('main').emit('chat:message', {
        username: 'System',
        text: `${name} has left the chat.`,
        ts: Date.now(),
        system: true,
      });
    }

    // Update user list for all clients
    io.to('main').emit('users:update', Array.from(users.values()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
