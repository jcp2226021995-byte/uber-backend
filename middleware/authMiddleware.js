const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  console.log("TOKEN RECEBIDO:", authHeader);

  if (!authHeader) return res.status(401).json({ message: "Token não enviado" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      console.log("ERRO JWT:", err);
      return res.status(403).json({ message: "Token inválido" });
    }

    req.user = user;
    console.log("USUÁRIO NO TOKEN:", user);
    next();
  });
}

module.exports = authenticateToken;