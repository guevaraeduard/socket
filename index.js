require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const axios = require("axios");

// Obtener valores de las variables de entorno
const HOST = process.env.URL_BASE || "localhost";

// Middleware de autenticación
/*io.use(async (socket, next) => {
  // Obtener token del handshake
  const token = socket.handshake.headers.token;

  if (!token) {
    next(new Error("invalid"));
  }

  try {
    // Validar token con el servicio externo
    const response = await axios.post(
      `${HOST}/api/app/validate-token`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },


      }

    );
    // Si la validación es exitosa, guardamos la info del usuario
    if (response.data.process) {
      console.log(`Usuario ${socket.id} autenticado correctamente`);
      next();
    } else {
      console.log(`Usuario ${socket.id} no autenticado`);
        next(new Error("invalid"));
    }
  } catch (error) {
    console.log(`Error al validar token del usuario ${socket.id}`);
    next(new Error("invalid"));
  }
});
*/

// Configuración de Socket.IO
io.on("connection", (socket) => {
  // Objeto para almacenar usuarios y su sala actual
  const usuariosSalas = new Map(); // { socketId: { sala: string, nombre: string } }

  socket.on("join_room", (data) => {
    const { sala, nombre } = data;
    const userId = socket.id;

    // Si el usuario ya está en una sala, primero lo sacamos
    if (usuariosSalas.has(userId)) {
      const salaAnterior = usuariosSalas.get(userId).sala;
      socket.leave(salaAnterior);
      socket.broadcast.to(salaAnterior).emit("chat_message", {
        mensaje: `${nombre} ha abandonado la sala ${salaAnterior}`,
        userId: userId,
        sala: salaAnterior,
      });
    }

    // Actualizamos la información del usuario
    usuariosSalas.set(userId, { sala, nombre });
    socket.join(sala);

    console.log(`Usuario ${userId} (${nombre}) unido a la sala: ${sala}`);
    console.log(
      "Estado actual de usuarios y salas:",
      mapToObject(usuariosSalas)
    );

    socket.broadcast.to(sala).emit("chat_message", {
      mensaje: `${nombre} se unió a la sala ${sala}`,
      userId: userId,
      sala: sala,
    });
  });

  socket.on("chat_message", (data) => {
    const { mensaje, sala, conversationId } = data;
    const userId = socket.id;
    const usuario = usuariosSalas.get(userId);

    if (usuario && usuario.sala === sala) {
      socket.broadcast.to(sala).emit("chat_message", {
        mensaje: mensaje,
        userId: userId,
        nombre: usuario.nombre,
        sala: sala,
      });
    }
    io.emit("reload_users", { conversationId });
  });

  socket.on("leave_room", () => {
    const userId = socket.id;
    const usuario = usuariosSalas.get(userId);

    if (usuario) {
      const { sala, nombre } = usuario;
      socket.leave(sala);
      usuariosSalas.delete(userId);

      console.log(`Usuario ${userId} (${nombre}) salió de la sala: ${sala}`);
      socket.broadcast.to(sala).emit("chat_message", {
        mensaje: `${nombre} ha abandonado la sala ${sala}`,
        userId: userId,
        sala: sala,
      });
    }
  });

  socket.on("disconnect", () => {
    const userId = socket.id;
    const usuario = usuariosSalas.get(userId);

    if (usuario) {
      const { sala, nombre } = usuario;
      console.log(
        `Usuario ${userId} (${nombre}) desconectado de la sala: ${sala}`
      );
      socket.broadcast.to(sala).emit("chat_message", {
        mensaje: `${nombre} se ha desconectado`,
        userId: userId,
        sala: sala,
      });
      usuariosSalas.delete(userId);
    }else{
      console.log(`Usuario ${userId} desconectado pero no estaba en ninguna sala`);
    }
  });

  socket.on("user_connected", (data) => {
    const { userId, sala, nombre } = data;
    
    // Verificar si el usuario ya está en una sala
    if (usuariosSalas.has(userId)) {
      console.log(`Usuario ${userId} ya está conectado en una sala`);
      return;
    }

    // Agregar usuario a la sala
    usuariosSalas.set(userId, { sala, nombre });
    socket.join(sala);

    console.log(`Usuario ${userId} (${nombre}) conectado a la sala: ${sala}`);
    
    // Notificar a otros usuarios en la sala
    socket.broadcast.to(sala).emit("chat_message", {
      mensaje: `${nombre} se ha unido a la sala ${sala}`,
      userId: userId,
      sala: sala
    });
  });

  // Función auxiliar para convertir Map a objeto para logging
  function mapToObject(map) {
    const obj = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
