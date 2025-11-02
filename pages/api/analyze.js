// pages/api/analyze.js

const FRENCH_MONTHS = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

const ENGLISH_MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// helper
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMonth(input) {
  const s = (input || "").toString().trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 12) return n;
  }
  if (FRENCH_MONTHS[s]) return FRENCH_MONTHS[s];
  if (ENGLISH_MONTHS[s]) return ENGLISH_MONTHS[s];
  throw new Error("Mois invalide: " + input);
}

// bornes du mois en timestamps unix (secondes)
function monthBoundsUnix(year, month, today) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const theoreticalEnd = new Date(Date.UTC(nextYear, nextMonth - 1, 1));

  if (year === today.getUTCFullYear() && month === today.getUTCMonth() + 1) {
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);
    const end = tomorrow < theoreticalEnd ? tomorrow : theoreticalEnd;
    return [
      Math.floor(start.getTime() / 1000),
      Math.floor(end.getTime() / 1000),
    ];
  }

  return [
    Math.floor(start.getTime() / 1000),
    Math.floor(theoreticalEnd.getTime() / 1000),
  ];
}

function pickYearsForLast10(month, today) {
  const currentYear = today.getUTCFullYear();
  const startYear =
    month > today.getUTCMonth() + 1 ? currentYear - 1 : currentYear;
  return Array.from({ length: 10 }, (_, i) => startYear - i);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { tickers, month } = req.body || {};
  if (!tickers || !month) {
    return res.status(400).json({ error: "tickers et month sont requis" });
  }

  let monthNum;
  try {
    monthNum = parseMonth(month);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const today = new Date();
  const years = pickYearsForLast10(monthNum, today);
  const tickerList = tickers
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // sleep configurable
  const SLEEP_MS = process.env.YAHOO_SLEEP_MS
    ? Number(process.env.YAHOO_SLEEP_MS)
    : 800;

  const finalResults = [];

  for (const ticker of tickerList) {
    const perYear = [];
    const allDays = [];
    const yearErrors = [];

    for (const year of years) {
      const [period1, period2] = monthBoundsUnix(year, monthNum, today);

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?period1=${period1}&period2=${period2}&interval=1d`;

      let json;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json,text/plain,*/*",
          },
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        json = await resp.json();
      } catch (e) {
        console.error(
          `[analyze] échec téléchargement pour ${ticker} ${year}-${monthNum}:`,
          e?.message || e
        );
        yearErrors.push({ year, error: e?.message || String(e) });
        // on dort même en cas d’erreur pour pas spam
        await sleep(SLEEP_MS);
        continue;
      }

      const result = json?.chart?.result?.[0];
      const error = json?.chart?.error;
      if (!result || error) {
        yearErrors.push({
          year,
          error: error?.description || "réponse Yahoo vide",
        });
        await sleep(SLEEP_MS);
        continue;
      }

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];

      if (!timestamps.length || !closes.length) {
        yearErrors.push({ year, error: "pas de données dans chart" });
        await sleep(SLEEP_MS);
        continue;
      }

      const rows = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const price = closes[i];
        if (price == null) continue;
        const d = new Date(ts * 1000);
        if (
          d.getUTCFullYear() === year &&
          d.getUTCMonth() + 1 === monthNum
        ) {
          rows.push({
            date: d,
            close: price,
          });
        }
      }

      if (!rows.length) {
        yearErrors.push({
          year,
          error: "aucune ligne dans le mois après filtrage",
        });
        await sleep(SLEEP_MS);
        continue;
      }

      const sorted = rows.sort((a, b) => a.close - b.close).slice(0, 4);

      const lows = sorted.map((r) => {
        const day = r.date.getUTCDate();
        allDays.push(day);
        return {
          date: r.date.toISOString().slice(0, 10),
          price: r.close,
        };
      });

      perYear.push({
        year,
        lows,
      });

      // 💡 on attend avant de passer à l’année suivante
      await sleep(SLEEP_MS);
    }

    if (perYear.length === 0) {
      finalResults.push({
        ticker,
        years: [],
        perYear: [],
        freqDays: { sorted: [] },
        bestDays: [],
        error:
          "Aucune année récupérée depuis query1.finance.yahoo.com (IP bloquée, ticker invalide ou marché indisponible).",
        yearErrors,
      });
      continue;
    }

    const counts = {};
    for (const day of allDays) {
      counts[day] = (counts[day] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(counts));
    const bestDays = Object.entries(counts)
      .filter(([, c]) => c === maxFreq)
      .map(([d]) => Number(d))
      .sort((a, b) => a - b);

    const freqDaysSorted = Object.entries(counts)
      .map(([day, count]) => ({
        day: Number(day),
        count,
        isBest: bestDays.includes(Number(day)),
      }))
      .sort((a, b) => a.day - b.day);

    finalResults.push({
      ticker,
      years: perYear.map((y) => y.year).sort((a, b) => b - a),
      perYear: perYear.sort((a, b) => b.year - a.year),
      freqDays: { sorted: freqDaysSorted },
      bestDays,
      error: yearErrors.length ? yearErrors : null,
    });
  }

  return res.status(200).json({
    month,
    monthNum,
    results: finalResults,
  });
}

