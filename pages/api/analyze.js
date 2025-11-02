// pages/api/analyze.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { tickers, month } = req.body || {};
  if (!tickers || !month) {
    return res.status(400).json({ error: "tickers et month sont requis" });
  }

  // ton VPS Python
  const BACKEND_URL =
    process.env.DATA_BACKEND_URL || "http://84.46.253.225:8000/analyze";

  try {
    const resp = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tickers, month }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({
        error: "backend python KO",
        detail: text,
      });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: "impossible d'appeler le backend python",
      detail: String(err),
    });
  }
}

