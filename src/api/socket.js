import { Server } from 'socket.io';

const handler = (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }

  if (!res.socket.server.io) {
    const io = new Server(res.socket.server);
    res.socket.server.io = io;

    const peers = new Map();

    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);
      socket.on('error', (err) => console.error('Socket error:', err));

      socket.on('register-robot', () => {
        peers.set('robot', socket);
        console.log('Robot registered');
        socket.broadcast.emit('robot-registered');
      });

      socket.on('offer', (data) => {
        console.log('Received offer from:', socket.id);
        if (peers.has('robot')) {
          peers.get('robot').emit('offer', data);
        }
      });

      socket.on('answer', (data) => {
        console.log('Received answer from:', socket.id);
        socket.broadcast.emit('answer', data);
      });

      socket.on('candidate', (data) => {
        console.log('Received candidate from:', socket.id);
        socket.broadcast.emit('candidate', data);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        peers.delete(socket.id);
      });
    });
  }

  res.socket.server.io.attach(res.socket);
  res.end();
};

export default handler;