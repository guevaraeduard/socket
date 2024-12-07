const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Cambia esto al origen de tu cliente
    methods: ["GET", "POST"],
  },
});

const players = {}; // Objeto para almacenar playerName y socket.id
const rooms = {}; // Objeto para almacenar las salas y sus jugadores

io.on("connection", (socket) => {
  console.log("Un usuario se ha conectado:", socket.id);

  socket.on("joinRoom", ({ playerName }) => {
    players[socket.id] = playerName;
    let user = {
      id: socket.id,
      name: playerName,
      table: [],
      chance: false,
    };

    let roomFound = false;
    for (const room in rooms) {
      if (rooms[room].length < 2) {
        rooms[room].push(user);
        socket.join(room);
        console.log(`${playerName} se ha unido a la sala ${room}.`);
        
        // Emitir evento a ambos jugadores si la sala está completa
        if (rooms[room].length === 2) {
          io.to(room).emit("roomReady", { room, players: rooms[room] });
        }
        
        roomFound = true;
        break;
      }
    }

    if (!roomFound) {
      const newRoom = `room-${Object.keys(rooms).length + 1}`;
      rooms[newRoom] = [user];
      socket.join(newRoom);
      console.log(`${playerName} ha creado y se ha unido a la sala ${newRoom}.`);
      
      // Emitir evento al jugador que está esperando
      socket.emit("waitingForPlayer", { room: newRoom });
    }
  });

  socket.on("cancel-room", () => {
    console.log("El usuario "+ socket.id + " ha solicitado cancelar la sala");
  
    for (const room in rooms) {
      const userIndex = rooms[room].findIndex(user => user.id === socket.id);
      if (userIndex !== -1) {
        rooms[room].splice(userIndex, 1);
        socket.leave(room);
        console.log(`El usuario ${socket.id} ha salido de la sala ${room}.`);
        if (rooms[room].length === 1) {
          const remainingUser = rooms[room][0];
          io.to(remainingUser.id).emit("opponentDisconnected", { message: "¡Felicidades! Has ganado porque tu oponente se ha desconectado." });
        }else{
           // Si la sala está vacía, eliminarla
          delete rooms[room];
          console.log(`La sala ${room} ha sido eliminada porque está vacía.`);
        }
    
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Un usuario se ha desconectado:", socket.id);
    delete players[socket.id];

    for (const room in rooms) {
      const userIndex = rooms[room].findIndex(user => user.id === socket.id);
      if (userIndex !== -1) {
        rooms[room].splice(userIndex, 1);
        // Emitir evento al usuario restante en la sala
        if (rooms[room].length === 1) {
          const remainingUser = rooms[room][0];
          io.to(remainingUser.id).emit("opponentDisconnected", { message: "¡Felicidades! Has ganado porque tu oponente se ha desconectado." });
        }

        if (rooms[room].length === 0) {
          delete rooms[room];
        }
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Servidor escuchando en el puerto 3000");
});
