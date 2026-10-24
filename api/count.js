// Shows the running total of passes made: visit /api/count
module.exports = async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (!url || !token) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "Counter not connected yet" }));
  }
  try {
    const r = await fetch(`${url}/get/passes_made`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json();
    res.statusCode = 200;
    res.end(JSON.stringify({ passes_made: Number(data.result || 0) }));
  } catch (_) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Could not read counter" }));
  }
};
