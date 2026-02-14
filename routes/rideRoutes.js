const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const calculateFare = require("../utils/fareCalculator");
router.get("/test", (req, res) => {
  res.send("RIDE ROUTES OK");
});

console.log("CALCULATE FARE >>>",calculateFare);
console.log('🔥 rideRoutes carregado');
console.log("AUTH MIDDLEWARE:", authMiddleware);
// 🚗 Criar corrida (usuário)
router.post("/create", authMiddleware, async (req, res) => {
  try {
    // BLOQUEAR USUÁRIO COM CORRIDA ATIVA
const activeRide = await pool.query(
  "SELECT * FROM rides WHERE user_id = $1 AND ride_status NOT IN ('finished', 'cancelled')",
  [req.user.id]
);

if (activeRide.rows.length > 0) {
  return res.status(400).json({ message: "Usuário já tem corrida ativa" });
}
    const userId = req.user.id;
    const { pickup_location, dropoff_location, distance_km, duration_min } = req.body;

    if (!pickup_location || !dropoff_location || !distance_km || !duration_min) {
      return res.status(400).json({ message: "Dados obrigatórios faltando" });
    }

    // calcula preço base
    const fare = await calculateFare(distance_km, duration_min);

    // multiplicador dinâmico (pode mudar depois)
    const surgeMultiplier = 1;

    // preço final
    const finalFare = fare * surgeMultiplier;

    // 25% plataforma
    const platformFee = finalFare * 0.25;

    // 75% motorista
    const driverEarnings = finalFare - platformFee;

    const result = await pool.query(
      `
      INSERT INTO rides 
      (user_id, pickup_location, dropoff_location, distance_km, duration_min, surge_multiplier, calculated_fare, platform_fee, driver_earnings, ride_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
      RETURNING *
      `,
      [userId, pickup_location, dropoff_location, distance_km, duration_min, surgeMultiplier, finalFare, platformFee, driverEarnings]
    );

    res.status(201).json({
      message: "Corrida criada com taxa da plataforma",
      ride: result.rows[0],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao criar corrida" });
  }
});
// 🏁 Listar corridas pendentes (para motoristas)
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    // Verifica se o usuário é motorista
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: 'Acesso negado: apenas motoristas podem acessar' });
    }

    // Busca no banco todas as corridas com ride_status = 'pending'
    const result = await pool.query(
        `SELECT * FROM rides WHERE ride_status = 'pending' ORDER BY created_at ASC`
    );

    res.json(result.rows); // retorna lista de corridas pendentes
  } catch (error) {
    console.error('❌ Erro ao listar corridas pendentes:', error);
    res.status(500).json({ message: 'Erro interno ao listar corridas' });
  }
});


// motorista aceita corrida
router.post("/accept/:id", authMiddleware, async (req, res) => {
  try{
    // BLOQUEAR MOTORISTA COM CORRIDA ATIVA
const activeDriverRide = await pool.query(
  "SELECT * FROM rides WHERE driver_id = $1 AND ride_status NOT IN ('finished', 'cancelled')",
  [req.user.id]
);

if (activeDriverRide.rows.length > 0) {
  return res.status(400).json({ message: "Motorista já está em corrida" });
}
console.log("TOKEN DECODED:",req.user);
    if (req.user.role !== "driver") {
      return res.status(403).json("Apenas motoristas podem aceitar corrida");
    }

    const rideId = req.params.id;
    const driverId = req.user.id;

    console.log("🚕 MOTORISTA ID:", driverId);
    console.log("🚕 CORRIDA ID:", rideId);

    const result = await pool.query(
      `
      UPDATE rides 
      SET driver_id=$1, ride_status='accepted'
      WHERE id=$2
      RETURNING *
      `,
      [driverId, rideId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json("Corrida não encontrada");
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ ERRO ACCEPT:", err);
    res.status(500).json("Erro ao aceitar corrida");
  }
});
// motorista chegou no local
router.put("/:id/arrived", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json("Só motorista pode marcar chegada");
    }

    const rideId = req.params.id;
    const driverId = req.user.id;

    // Buscar corrida
    const ride = await pool.query("SELECT * FROM rides WHERE id=$1", [rideId]);

    if (ride.rows.length === 0) {
      return res.status(404).json("Corrida não encontrada");
    }

    // BLOQUEIO PROFISSIONAL
    if (ride.rows[0].ride_status !== "accepted") {
      return res.status(400).json("Corrida precisa estar ACCEPTED para marcar chegada");
    }

    const update = await pool.query(
      "UPDATE rides SET ride_status='arrived' WHERE id=$1 AND driver_id=$2 RETURNING *",
      [rideId, driverId]
    );

    res.json(update.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json("Erro ao marcar chegada");
  }
});
// iniciar corrida
router.put("/:id/start", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json("Só motorista pode iniciar corrida");
    }

    const rideId = req.params.id;
    const driverId = req.user.id;

    const ride = await pool.query("SELECT * FROM rides WHERE id=$1", [rideId]);

    if (ride.rows.length === 0) {
      return res.status(404).json("Corrida não encontrada");
    }

    // BLOQUEIO PROFISSIONAL
    if (ride.rows[0].ride_status !== "arrived") {
      return res.status(400).json("Motorista precisa chegar antes de iniciar");
    }

    const update = await pool.query(
      "UPDATE rides SET ride_status='started' WHERE id=$1 AND driver_id=$2 RETURNING *",
      [rideId, driverId]
    );

    res.json(update.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json("Erro ao iniciar corrida");
  }
});

// 📜 Histórico de corridas do usuário
router.get("/user/history", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json("Apenas usuários podem ver esse histórico");
    }

    const result = await pool.query(
      "SELECT * FROM rides WHERE user_id=$1 ORDER BY created_at DESC",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erro ao buscar histórico do usuário");
  }
});

// 📜 Histórico de corridas do motorista
router.get("/driver/history", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json("Apenas motoristas podem ver esse histórico");
    }

    const result = await pool.query(
      "SELECT * FROM rides WHERE driver_id=$1 ORDER BY created_at DESC",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erro ao buscar histórico do motorista");
  }
});
// ❌ Usuário cancela corrida
router.post("/cancel/user/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json("Apenas usuário pode cancelar");
    }

    const rideId = req.params.id;

    // verifica se corrida existe
    const rideCheck = await pool.query(
      "SELECT * FROM rides WHERE id=$1",
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json("Corrida não existe");
    }

    const status = rideCheck.rows[0].ride_status;

    // BLOQUEIO PROFISSIONAL
    if (status === "started" || status === "finished") {
      return res
        .status(400)
        .json("Não pode cancelar corrida em andamento ou finalizada");
    }

    // cancela corrida
    const ride = await pool.query(
      "UPDATE rides SET ride_status='canceled' WHERE id=$1 RETURNING *",
      [rideId]
    );

    res.json({
      message: "Corrida cancelada pelo usuário",
      ride: ride.rows[0],
    });
  } catch (err) {
    console.error("ERRO CANCEL USER:", err);
    res.status(500).json("Erro ao cancelar corrida");
  }
});
// ❌ Motorista cancela corrida
router.post("/cancel/driver/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json("Apenas motorista pode cancelar");
    }

    const rideId = req.params.id;

    // verifica se corrida existe
    const rideCheck = await pool.query(
      "SELECT * FROM rides WHERE id=$1",
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json("Corrida não existe");
    }

    const status = rideCheck.rows[0].ride_status;

    // BLOQUEIO PROFISSIONAL
    if (status === "started" || status === "finished") {
      return res
        .status(400)
        .json("Não pode cancelar corrida em andamento ou finalizada");
    }

    // cancela corrida
    const ride = await pool.query(
      "UPDATE rides SET ride_status='canceled' WHERE id=$1 RETURNING *",
      [rideId]
    );

    res.json({
      message: "Corrida cancelada pelo motorista",
      ride: ride.rows[0],
    });
  } catch (err) {
    console.error("ERRO CANCEL DRIVER:", err);
    res.status(500).json("Erro ao cancelar corrida");
  }
});
// 🏁 Motorista finaliza corrida
router.post("/finish/:id", authMiddleware, async (req, res) => {
  try {

    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Só motorista pode finalizar" });
    }

    const rideId = req.params.id;
    const driverId = req.user.id;

    // pega corrida
    const ride = await pool.query("SELECT * FROM rides WHERE id=$1", [rideId]);

    if (ride.rows.length === 0) {
      return res.status(404).json({ message: "Corrida não encontrada" });
    }

    // 🔥 BLOQUEIO PROFISSIONAL
    if (ride.rows[0].ride_status !== "started") {
      return res.status(400).json({ message: "Corrida precisa estar STARTED" });
    }

    // finaliza corrida
    const update = await pool.query(
      "UPDATE rides SET ride_status='finished' WHERE id=$1 AND driver_id=$2 RETURNING *",
      [rideId, driverId]
    );

    // 💰 paga motorista (SÓ DEPOIS DE FINALIZAR)
    await pool.query(
      "UPDATE driver_wallet SET balance = balance + $1 WHERE driver_id = $2",
      [ride.rows[0].driver_earnings, ride.rows[0].driver_id]
    );

    res.json({
      message: "Corrida finalizada e pagamento creditado",
      ride: update.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao finalizar corrida" });
  }
});
// ⭐ Usuário avalia motorista
router.post("/:rideId/rate", authMiddleware, async (req, res) => {
  const { rideId } = req.params;
  const { rating, comment } = req.body;

  if (req.user.role !== "user") {
    return res.status(403).json("Apenas usuários podem avaliar");
  }

  try {
    // pegar corrida
    const ride = await pool.query(
      "SELECT * FROM rides WHERE id = $1",
      [rideId]
    );

    if (ride.rows.length === 0) {
      return res.status(404).json("Corrida não encontrada");
    }

    const driverId = ride.rows[0].driver_id;

    // salvar avaliação
    await pool.query(
      "INSERT INTO ride_ratings (ride_id, user_id, driver_id, rating, comment) VALUES ($1,$2,$3,$4,$5)",
      [rideId, req.user.id, driverId, rating, comment]
    );

    // calcular média nova
   const result = await pool.query(
  "SELECT COALESCE(AVG(rating), 0) as avg_rating, COUNT(*) as total FROM ride_ratings WHERE driver_id = $1",
  [driverId]
);

    const avgRating = result.rows[0].avg_rating;
    const totalReviews = result.rows[0].total;

    // atualizar motorista
    await pool.query(
      "UPDATE drivers SET rating = $1, total_reviews = $2 WHERE id = $3",
      [avgRating, totalReviews, driverId]
    );

    res.json({
      message: "Avaliação salva e nota do motorista atualizada",
      rating: avgRating,
      total_reviews: totalReviews
    });

  } catch (err) {
    console.error("ERRO AVALIAR:", err);
    res.status(500).json("Erro ao avaliar motorista");
  }
});
// ⭐ Média de avaliação do motorista
router.get("/driver/:id/rating", async (req, res) => {
  try {
    const driverId = req.params.id;

    const result = await pool.query(
      "SELECT AVG(rating) as media, COUNT(*) as total FROM ride_ratings WHERE driver_id=$1",
      [driverId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao buscar avaliação");
  }
});

module.exports = router;