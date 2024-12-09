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
      your: false,
    };

    let roomFound = false;
    for (const room in rooms) {
      if (rooms[room].length < 2) {
        rooms[room].push(user);
        socket.join(room);
        console.log(`${socket.id} se ha unido a la sala ${room}.`);
        console.log(rooms[room]);
        // Emitir evento a ambos jugadores si la sala está completa
        if (rooms[room].length === 2) {
          io.to(room).emit("roomReady", { room, players: rooms[room] });
        }
        roomFound = true;
        break;
      }
    }

    if (!roomFound) {
      const newRoom = `room-${socket.id}`;
      user.your = true;
      rooms[newRoom] = [user];
      socket.join(newRoom);
      console.log(`${socket.id} ha creado y se ha unido a la sala ${newRoom}.`);
    }
  });

  socket.on("cancel-room", () => {
    console.log("El usuario " + socket.id + " ha solicitado cancelar la sala");

    for (const room in rooms) {
      const userIndex = rooms[room].findIndex((user) => user.id === socket.id);
      if (userIndex !== -1) {
        rooms[room].splice(userIndex, 1);
        socket.leave(room);
        console.log(`El usuario ${socket.id} ha salido de la sala ${room}.`);
        if (rooms[room].length === 1) {
          const remainingUser = rooms[room][0];
          socket.to(remainingUser.id).emit("opponentDisconnected", {
            message:
              "¡Felicidades! Has ganado porque tu oponente se ha desconectado.",
          });
        } else {
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
      const userIndex = rooms[room].findIndex((user) => user.id === socket.id);
      if (userIndex !== -1) {
        rooms[room].splice(userIndex, 1);
        // Emitir evento al usuario restante en la sala
        if (rooms[room].length === 1) {
          const remainingUser = rooms[room][0];
          socket.to(remainingUser.id).emit("opponentDisconnected", {
            message:
              "¡Felicidades! Has ganado porque tu oponente se ha desconectado.",
          });
        }

        if (rooms[room].length === 0) {
          console.log("Sala eliminada " + room);
          delete rooms[room];
        }
        break;
      }
    }
  });

  socket.on("delete-room", ({ room }) => {
    console.log("Solicitud para eliminar la sala:", room);

    if (rooms[room]) {
      // Desconectar a todos los usuarios de la sala
      rooms[room].forEach((user) => {
        // io.to(user.id).emit("roomDeleted", { message: "La sala ha sido eliminada." });
        io.sockets.sockets.get(user.id).leave(room);
      });

      // Eliminar la sala
      delete rooms[room];
      console.log(`La sala ${room} ha sido eliminada.`);
    } else {
      console.log(`La sala ${room} no existe.`);
    }
  });

  socket.on("fillTable", ({ room, table }) => {
    console.log(
      `Evento fillTable recibido de ${socket.id} para la sala ${room}.`
    );

    if (rooms[room]) {
      const userIndex = rooms[room].findIndex((user) => user.id === socket.id);
      if (userIndex !== -1) {
        rooms[room][userIndex].table = table;
        console.log(
          `Tabla actualizada para el usuario ${socket.id} en la sala ${room}.`
        );
        //console.log(table);
      } else {
        console.log(`Usuario ${socket.id} no encontrado en la sala ${room}.`);
      }
    } else {
      console.log(`La sala ${room} no existe.`);
    }
  });

  socket.on("shot", ({ room, cell }) => {
    console.log(`Evento shot recibido de ${socket.id} para la sala ${room}.`);

    if (rooms[room]) {
      const userIndex = rooms[room].findIndex((user) => user.id === socket.id);
      const opponentIndex = userIndex === 0 ? 1 : 0;

      if (userIndex !== -1 && rooms[room][opponentIndex]) {
        const opponentTable = rooms[room][opponentIndex].table;
        const cellIndex = cell.x * 10 + cell.y; // Calcula el índice basado en las coordenadas
        let hit = false;
        let miss = false;
        let your = false;
        if (opponentTable[cellIndex].ships) {
          opponentTable[cellIndex].hit = true;
          hit = true;
          your = true;
          console.log(`Hit at (${cell.x}, ${cell.y})`);
        } else {
          opponentTable[cellIndex].miss = true;
          miss = true;
          console.log(`Miss at (${cell.x}, ${cell.y})`);
        }
        let data = {
          x: cell.x,
          y: cell.y,
          hit,
          miss,
        };

        socket.broadcast.to(room).emit("shot-received", data, !your);
        socket.emit("shot-send", data, your);

        const allShipsHit = opponentTable.every(
          (cell) => !cell.ships || (cell.ships && cell.hit)
        );

        if (allShipsHit) {
          socket.broadcast.to(room).emit("loss-game");
          socket.emit("winner-game", {
            message: "Felicidades Has Ganado El Juego",
          });
          console.log(
            `El usuario ${socket.id} ha ganado el juego en la sala ${room}.`
          );

          rooms[room].forEach((user) => {
            // io.to(user.id).emit("roomDeleted", { message: "La sala ha sido eliminada." });
            io.sockets.sockets.get(user.id).leave(room);
          });

          // Eliminar la sala
          delete rooms[room];
          console.log(`La sala ${room} ha sido eliminada.`);
        }
      } else {
        console.log(`Usuario u oponente no encontrado en la sala ${room}.`);
      }
    } else {
      console.log(`La sala ${room} no existe.`);
    }
  });
});

server.listen(3000, () => {
  console.log("Servidor escuchando en el puerto 3000");
});
