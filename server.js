require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
require("dotenv").config();

// importa as rotas de usuários (agora descomenta!)
const userRoutes = require('./routes/userRoutes');

//importa as rotas de riderRoutes
const rideRoutes = require('./routes/rideRoutes');

// importa as rotas driverRoutes
const driverRoutes = require("./routes/driverRoutes");


// permite JSON nas requisições
app.use(express.json());

// usa as rotas de usuários
app.use('/api/users', userRoutes);

app.use('/api/rides', rideRoutes);

app.use("/api/drivers", driverRoutes);
// rota principal só pra teste
app.get('/', (req, res) => {
  res.send('Servidor funcionando ✅');
});

// inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
