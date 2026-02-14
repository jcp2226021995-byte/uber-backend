const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware");
// CADASTRO MOTORISTA
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, license_number, vehicle_model, vehicle_plate } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newDriver = await pool.query(
      `INSERT INTO drivers (name, email, password, license_number, vehicle_model, vehicle_plate)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, email, hashedPassword, license_number, vehicle_model, vehicle_plate]
    );

    res.json(newDriver.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json("Erro ao cadastrar motorista");
  }
});

// LOGIN MOTORISTA
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const driver = await pool.query("SELECT * FROM drivers WHERE email = $1", [email]);

    if (driver.rows.length === 0) return res.status(400).json("Motorista não encontrado");

    const validPassword = await bcrypt.compare(password, driver.rows[0].password);
    if (!validPassword) return res.status(400).json("Senha incorreta");

    const token = jwt.sign(
      { id: driver.rows[0].id, role: "driver" },
      process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json("Erro no login");
  }
});
// 💰 carteira do motorista
router.get("/wallet", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Apenas motoristas" });
    }

    const result = await pool.query(
      "SELECT balance FROM driver_wallet WHERE driver_id = $1",
      [req.user.id]
    );

    res.json({ balance: result.rows[0]?.balance || 0 });
  } catch (err) {
    console.error("Erro wallet:", err);
    res.status(500).json({ message: "Erro wallet" });
  }
});
module.exports = router;