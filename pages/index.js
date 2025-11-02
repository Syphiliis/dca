import { useState } from "react";

const MONTHS_FR = [
  { label: "Janvier", value: "janvier" },
  { label: "Février", value: "février" },
  { label: "Mars", value: "mars" },
  { label: "Avril", value: "avril" },
  { label: "Mai", value: "mai" },
  { label: "Juin", value: "juin" },
  { label: "Juillet", value: "juillet" },
  { label: "Août", value: "août" },
  { label: "Septembre", value: "septembre" },
  { label: "Octobre", value: "octobre" },
  { label: "Novembre", value: "novembre" },
  { label: "Décembre", value: "décembre" }
];

export default function Home() {
  const [tickers, setTickers] = useState("UST.PA, AAPL");
  const [month, setMonth] = useState("novembre");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers,
          month
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Erreur API");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const handleExportCSV = () => {
    if (!result) return;
    const rows = [];

    result.results.forEach((t) => {
      t.perYear.forEach((yearEntry) => {
        yearEntry.lows.forEach((low) => {
          rows.push({
            ticker: t.ticker,
            year: yearEntry.year,
            date: low.date,
            price: low.price
          });
        });
      });
    });

    const header = "ticker,year,date,price\n";
    const csv =
      header +
      rows
        .map((r) => `${r.ticker},${r.year},${r.date},${r.price}`)
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dca-analysis.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-bg">
      <div className="page-container">
        <div className="panel panel-light">
          <div className="panel-header">
            <div>
              <h1 className="title">Analyse DCA mensuelle</h1>
              <p className="subtitle">
                10 ans · plusieurs tickers · meilleurs jours du mois
              </p>
            </div>
            {result && (
              <button onClick={handleExportCSV} className="ghost-btn">
                Export CSV
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="form-row">
            <div className="field">
              <label className="label">Tickers</label>
              <input
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                className="input"
                placeholder="UST.PA, AAPL, QQQ..."
              />
              <p className="help">Séparer par des virgules</p>
            </div>

            <div className="field field-month">
              <label className="label">Mois</label>
              <div className="select-wrapper">
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="select"
                >
                  {MONTHS_FR.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="select-caret">▼</span>
              </div>
            </div>

            <div className="field-btn">
              <button type="submit" disabled={loading} className="primary-btn">
                {loading ? (
                  <span className="btn-with-spinner">
                    <span className="spinner" /> Analyse...
                  </span>
                ) : (
                  "Analyser"
                )}
              </button>
            </div>
          </form>

          {error && <div className="error-box">{error}</div>}

          {loading && !result && (
            <div className="loading-box">
              <div className="spinner-big" />
            </div>
          )}

          {result && (
            <div className="results">
              {result.results.map((tickerResult) => (
                <div key={tickerResult.ticker} className="result-card">
                  <div className="result-head">
                    <div>
                      <h2 className="result-title">{tickerResult.ticker}</h2>
                      <p className="result-meta">
                        Mois : {result.month} · Années :{" "}
                        {tickerResult.years && tickerResult.years.length
                          ? tickerResult.years.join(", ")
                          : "—"}
                      </p>
                    </div>
                    {tickerResult.bestDays?.length ? (
                      <p className="badge-success">
                        ✅ Meilleur moment :{" "}
                        {tickerResult.bestDays.join(", ")} du mois
                      </p>
                    ) : null}
                  </div>

                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Année</th>
                          <th>4 plus bas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickerResult.perYear.map((y) => (
                          <tr key={y.year}>
                            <td>{y.year}</td>
                            <td>
                              {y.lows.length === 0 ? (
                                <span className="muted">(pas de données)</span>
                              ) : (
                                <ul className="low-list">
                                  {y.lows.map((l) => (
                                    <li key={l.date}>
                                      <span className="low-date">
                                        {l.date}
                                      </span>
                                      <span className="low-price">
                                        → {l.price.toFixed(2)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {tickerResult.freqDays?.sorted?.length ? (
                    <div className="freq-block">
                      <p className="freq-title">
                        Jours les plus fréquemment bas
                      </p>
                      <div className="freq-tags">
                        {tickerResult.freqDays.sorted.map((d) => (
                          <span
                            key={d.day}
                            className={
                              d.isBest ? "tag tag-best" : "tag tag-default"
                            }
                          >
                            Jour {d.day} · {d.count}×
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {!loading && !result && !error && (
            <p className="empty-hint">
              Saisis tes tickers, choisis un mois et lance une analyse.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
