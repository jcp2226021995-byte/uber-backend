const pool = require("../db");

async function calculateFare(distanceKm, durationMin) {

  // pega preço base
  const pricing = await pool.query("SELECT * FROM pricing_rules LIMIT 1");
  const rule = pricing.rows[0];

  const base = parseFloat(rule.base_fare);
  const perKm = parseFloat(rule.price_per_km);
  const perMin = parseFloat(rule.price_per_min);

  // pega hora atual
  const hour = new Date().getHours();

  // busca surge ativo
  const surgeQuery = await pool.query(
    "SELECT multiplier FROM surge_rules WHERE start_hour <= $1 AND end_hour > $1 LIMIT 1",
    [hour]
  );

  let surge = 1;
  if (surgeQuery.rows.length > 0) {
    surge = parseFloat(surgeQuery.rows[0].multiplier);
  }

  const fare = (base + (distanceKm * perKm) + (durationMin * perMin)) * surge;

  return fare.toFixed(2);
}

module.exports = calculateFare;