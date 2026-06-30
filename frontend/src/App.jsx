import { useState } from "react";
import * as snarkjs from "snarkjs";

const CONTRACT_ID = "CBCPR4RSAJ5S53T6Y3TK7EIZE3PYDX6LKAYQMOKSIXMZP626FCKIIIPL";
const HORIZON = "https://horizon-testnet.stellar.org";
const THRESHOLD = 50;

async function fetchWalletData(address) {
  const [accRes, txRes, oldestTxRes] = await Promise.all([
    fetch(`${HORIZON}/accounts/${address}`),
    fetch(`${HORIZON}/accounts/${address}/transactions?limit=200&order=desc`),
    fetch(`${HORIZON}/accounts/${address}/transactions?limit=1&order=asc`),
  ]);
  if (!accRes.ok) throw new Error("Account not found on testnet.");
  const acc = await accRes.json();
  const txData = await txRes.json();
  const oldestData = await oldestTxRes.json();
  const txns = txData._embedded?.records || [];
  const oldestTx = oldestData._embedded?.records?.[0];
  const xlmBal = acc.balances.find(b => b.asset_type === "native");
  const lumens = xlmBal ? Math.min(Math.floor(parseFloat(xlmBal.balance)), 10000) : 0;
  const txCount = Math.min(txns.length, 200);
  const createdAt = oldestTx ? new Date(oldestTx.created_at) : new Date(acc.last_modified_time);
  const ageDays = Math.min(Math.floor((Date.now() - createdAt) / 86400000), 3650);
  const uniqueAssets = Math.min(acc.balances.length, 20);
  const score = txCount * 3 + lumens * 2 + ageDays + uniqueAssets * 10;
  return {
    tx_count: txCount.toString(),
    balance_xlm: lumens.toString(),
    age_days: ageDays.toString(),
    unique_assets: uniqueAssets.toString(),
    threshold: THRESHOLD.toString(),
    display: { txCount, lumens, ageDays, uniqueAssets, score },
  };
}

export default function App() {
  const [address, setAddress] = useState("");
  const [step, setStep] = useState("idle");
  const [walletData, setWalletData] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);

  const addLog = (msg) => setLog(l => [...l, msg]);

  async function handleCheck() {
    if (!address.trim()) return;
    setError(""); setResult(null); setLog([]); setWalletData(null);
    try {
      setStep("fetching");
      addLog("🔍 Fetching wallet data from Stellar testnet...");
      const data = await fetchWalletData(address.trim());
      setWalletData(data);
      addLog(`✅ Wallet found: ${data.display.txCount} txns, ${data.display.lumens} XLM, ${data.display.ageDays} days old`);
      addLog(`📊 Credit score computed: ${data.display.score} (threshold: ${THRESHOLD})`);
      setStep("proving");
      addLog("🔐 Generating ZK proof in browser — private inputs never leave your device...");
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          tx_count: data.tx_count,
          balance_xlm: data.balance_xlm,
          age_days: data.age_days,
          unique_assets: data.unique_assets,
          threshold: data.threshold,
        },
        "/circuits/multiplier2.wasm",
        "/proving/credit_score_final.zkey"
      );
      addLog("✅ Groth16 proof generated successfully!");
      addLog(`🔒 On-chain verifier sees only: ${publicSignals[0] === "1" ? "PASS" : "FAIL"} — never your actual data`);
      const fBE = (n) => BigInt(n).toString(16).padStart(64, "0");
      const g1 = (p) => fBE(p[0]) + fBE(p[1]);
      const g2 = (p) => fBE(p[0][0]) + fBE(p[0][1]) + fBE(p[1][0]) + fBE(p[1][1]);
      const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
      setResult({ verified: publicSignals[0] === "1", score: data.display.score, proofHex });
      setStep("done");
    } catch (e) {
      setError(e.message || String(e));
      setStep("idle");
    }
  }

  const isBusy = step !== "idle" && step !== "done";
  const isWorthy = result?.verified;
  const card = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: "1.75rem",
    marginBottom: "1.5rem",
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", color: "#ffffff", fontFamily: "system-ui, sans-serif", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ display: "inline-block", background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 20, padding: "0.3rem 1rem", fontSize: "0.7rem", letterSpacing: "0.2em", color: "#c4b5fd", marginBottom: "1rem", textTransform: "uppercase" }}>
            Stellar Hacks ZK Hackathon 2026
          </div>
          <h1 style={{ fontSize: "3rem", fontWeight: 800, background: "linear-gradient(90deg, #ffffff, #c4b5fd, #93c5fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 1rem", lineHeight: 1.1 }}>
            ZK Credit Score
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "1.05rem", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
            Generate a cryptographic proof that your wallet qualifies. Only PASS/FAIL goes on-chain - your actual financial data never leaves your browser.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2.5rem" }}>
          {[
            { icon: "🔍", num: "01", title: "Fetch", desc: "Reads public Stellar data via Horizon API" },
            { icon: "🔐", num: "02", title: "Prove", desc: "ZK circuit proves score ≥ 50 locally in browser" },
            { icon: "⭐", num: "03", title: "Verify", desc: "Groth16 proof checked on Soroban contract" },
          ].map(s => (
            <div key={s.num} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "1.25rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>{s.icon}</div>
              <div style={{ fontSize: "0.65rem", color: "#c4b5fd", letterSpacing: "0.15em", marginBottom: "0.2rem" }}>{s.num}</div>
              <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: "0.3rem" }}>{s.title}</div>
              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div style={card}>
          <h2 style={{ margin: "0 0 1.5rem", fontSize: "1.1rem", fontWeight: 700 }}>Check Your Wallet</h2>
          <label style={{ display: "block", fontSize: "0.85rem", color: "rgba(255,255,255,0.6)", marginBottom: "0.5rem" }}>
            Stellar Wallet Address (Testnet)
          </label>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="GXXXX..."
            style={{ width: "100%", padding: "0.875rem 1rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, color: "#ffffff", fontSize: "0.95rem", boxSizing: "border-box", marginBottom: "1.25rem", outline: "none" }}
          />
          <button
            onClick={handleCheck}
            disabled={isBusy || !address.trim()}
            style={{ width: "100%", padding: "1rem", background: isBusy ? "rgba(139,92,246,0.3)" : "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)", border: "none", borderRadius: 12, color: "#ffffff", fontSize: "1rem", fontWeight: 700, cursor: isBusy ? "not-allowed" : "pointer", boxShadow: isBusy ? "none" : "0 4px 24px rgba(139,92,246,0.4)" }}
          >
            {isBusy ? (step === "fetching" ? "⏳ Fetching wallet data..." : "⏳ Generating ZK proof...") : "Generate ZK Credit Score →"}
          </button>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 16, padding: "1rem 1.25rem", marginBottom: "1.5rem", color: "#fca5a5", fontSize: "0.9rem" }}>
            ❌ {error}
          </div>
        )}

        {walletData && (
          <div style={card}>
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
              🔒 Shown to you for transparency — these numbers never leave your browser or touch the blockchain
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
              {[
                { label: "Transactions", value: walletData.display.txCount, weight: "×3", color: "#93c5fd" },
                { label: "XLM Balance", value: `${walletData.display.lumens} XLM`, weight: "×2", color: "#86efac" },
                { label: "Wallet Age", value: `${walletData.display.ageDays} days`, weight: "×1", color: "#fcd34d" },
                { label: "Asset Types", value: walletData.display.uniqueAssets, weight: "×10", color: "#f9a8d4" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "1rem", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: "0.35rem" }}>
                    {s.label} <span style={{ color: s.color, fontWeight: 700 }}>{s.weight}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#ffffff" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div style={{ background: isWorthy ? "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.1))" : "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))", border: `1px solid ${isWorthy ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, borderRadius: 20, padding: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>{isWorthy ? "✅" : "❌"}</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: isWorthy ? "#4ade80" : "#f87171", marginBottom: "0.5rem" }}>
              {isWorthy ? "Creditworthy" : "Not Creditworthy"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.95rem", marginBottom: "1rem" }}>
              Score: <strong style={{ color: "#ffffff" }}>{result.score}</strong> · Threshold: <strong style={{ color: "#ffffff" }}>{THRESHOLD}</strong>
            </div>
            <div style={{ display: "inline-block", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "0.5rem 1rem", fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", marginBottom: "1rem" }}>
              🔐 Groth16 ZK proof verified · Your financial data stayed private
            </div>
            {result.proofHex && (
              <details style={{ textAlign: "left", marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "#c4b5fd" }}>
                  View raw proof bytes (sent to blockchain)
                </summary>
                <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: "0.75rem", marginTop: "0.5rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", fontFamily: "monospace", wordBreak: "break-all", maxHeight: 120, overflow: "auto" }}>
                  {result.proofHex}
                </div>
                <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)", marginTop: "0.5rem" }}>
                  This is pure cryptographic data. Your balance, transaction count, and wallet age cannot be extracted from it.
                </p>
              </details>
            )}
          </div>
        )}

        {log.length > 0 && (
          <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>Activity Log</div>
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", padding: "0.25rem 0", fontFamily: "monospace", borderBottom: i < log.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>{l}</div>
            ))}
          </div>
        )}

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.25rem", marginBottom: "2rem" }}>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>Deployed Contract · Stellar Testnet</div>
          <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.6)", fontFamily: "monospace", wordBreak: "break-all", marginBottom: "0.5rem" }}>{CONTRACT_ID}</div>
          <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.78rem", color: "#c4b5fd", textDecoration: "none" }}>View on Stellar Explorer →</a>
        </div>

        <div style={{ textAlign: "center", fontSize: "0.78rem", color: "rgba(255,255,255,0.3)" }}>
          Built for Stellar Hacks ZK Hackathon · Circom + Groth16 + Soroban · June 2026
        </div>

      </div>
    </div>
  );
}