const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authMiddleware");

// REGISTRAR USUÁRIO
router.post("/register", async (req, res) => {
  try {
    console.log("🚀 Requisição recebida no backend:", req.body);
    

    const { name, email, password, role } = req.body;
console.log("💾 Dados para cadastro:", { name, email, password, role });
    if (!name || !email || !password || !role) {
      return res.status(400).json("Preencha todos os campos");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role",
      [name, email, hashedPassword, role]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Erro interno no backend:", err);
    console.error("ERRO REGISTER:", err);
    res.status(500).json("Erro interno no servidor");
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await pool.query("SELECT * FROM users WHERE email=$1", [email]);

    if (user.rows.length === 0) {
      return res.status(404).json("Usuário não encontrado");
    }

    const valid = await bcrypt.compare(password, user.rows[0].password);

    if (!valid) {
      return res.status(401).json("Senha incorreta");
    }
     console.log("SECRET LOGIN:", process.env.ACCESS_TOKEN_SECRET);

    const token = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("ERRO LOGIN:", err);
    res.status(500).json("Erro no login");
  }
});

module.exports = router;