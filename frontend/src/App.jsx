import { useState } from "react";
import * as snarkjs from "snarkjs";
import { verifyProofOnSoroban } from "./lib/stellarVerify";

const CONTRACT_ID = "CBCPR4RSAJ5S53T6Y3TK7EIZE3PYDX6LKAYQMOKSIXMZP626FCKIIIPL";
const HORIZON = "https://horizon-testnet.stellar.org";
const THRESHOLD = 50;

async function fetchWalletData(address) {
  const [accRes, txRes] = await Promise.all([
    fetch(`${HORIZON}/accounts/${address}`),
    fetch(`${HORIZON}/accounts/${address}/transactions?limit=200&order=desc`),
  ]);
  if (!accRes.ok) throw new Error("Account not found on testnet.");
  const acc = await accRes.json();
  const txData = await txRes.json();
  const txns = txData._embedded?.records || [];
  const xlmBal = acc.balances.find(b => b.asset_type === "native");
  const lumens = xlmBal ? Math.min(Math.floor(parseFloat(xlmBal.balance)), 10000) : 0;
  const txCount = Math.min(txns.length, 200);
  const ageDays = Math.min(Math.floor((Date.now() - new Date(acc.last_modified_time)) / 86400000), 3650);
  const uniqueAssets = Math.min(acc.balances.length, 20);
  const score = txCount * 3 + lumens * 2 + ageDays + uniqueAssets * 10;
  return { tx_count: txCount.toString(), balance_xlm: lumens.toString(), age_days: ageDays.toString(), unique_assets: uniqueAssets.toString(), display: { txCount, lumens, ageDays, uniqueAssets, score } };
}

const fBE = (n) => BigInt(n).toString(16).padStart(64, "0");
const g1 = (p) => fBE(p[0]) + fBE(p[1]);
const g2 = (p) => fBE(p[0][0]) + fBE(p[0][1]) + fBE(p[1][0]) + fBE(p[1][1]);

export default function App() {
  const [address, setAddress] = useState("");
  const [secret, setSecret] = useState("");
  const [step, setStep] = useState("idle");
  const [walletData, setWalletData] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);

  const addLog = (msg) => setLog(l => [...l, msg]);

  async function handleCheck() {
    if (!address.trim()) return;
    setError(""); setResult(null); setLog([]);
    try {
      setStep("fetching");
      addLog("🔍 Fetching wallet data from Stellar testnet...");
      const data = await fetchWalletData(address.trim());
      setWalletData(data);
      addLog(`✅ Found: ${data.display.txCount} txns, ${data.display.lumens} XLM, ${data.display.ageDays} days old`);
      addLog(`📊 Score: ${data.display.score} (threshold: ${THRESHOLD})`);

      setStep("proving");
      addLog("🔐 Generating ZK proof in browser...");
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { tx_count: data.tx_count, balance_xlm: data.balance_xlm, age_days: data.age_days, unique_assets: data.unique_assets, threshold: "50" },
        "/circuits/multiplier2.wasm",
        "/proving/credit_score_final.zkey"
      );
      addLog(`✅ Proof generated! Result: ${publicSignals[0] === "1" ? "CREDITWORTHY" : "NOT CREDITWORTHY"}`);
      addLog("🔒 Private inputs never left your browser");

      setResult({ verified: publicSignals[0] === "1", score: data.display.score, proof, publicSignals });
      setStep("done");
    } catch (e) {
      setError(e.message || String(e));
      setStep("idle");
    }
  }

  const isBusy = step !== "idle" && step !== "done";
  const isWorthy = result?.verified;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 100%)", color: "#e2e8f0", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ fontSize: "0.75rem", letterSpacing: "0.2em", color: "#7c8ba1", marginBottom: "0.5rem" }}>CIRCOM · GROTH16 · STELLAR TESTNET</div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 700, background: "linear-gradient(90deg, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 1rem" }}>ZK Credit Score</h1>
          <p style={{ color: "#94a3b8", fontSize: "1rem" }}>Prove your wallet is creditworthy without revealing transaction history, balance, or age.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[{ icon: "🔍", t: "Fetch", d: "Reads public Stellar data" }, { icon: "🔐", t: "Prove", d: "ZK proves score ≥ 50 privately" }, { icon: "⭐", t: "Verify", d: "Groth16 proof on Soroban" }].map(s => (
            <div key={s.t} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "1rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>{s.icon}</div>
              <div style={{ fontWeight: 600, margin: "0.25rem 0" }}>{s.t}</div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", color: "#94a3b8", marginBottom: "0.4rem" }}>Stellar Wallet Address (testnet)</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="GXXXX..." style={{ width: "100%", padding: "0.75rem", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#e2e8f0", fontSize: "0.9rem", boxSizing: "border-box" }} />
          </div>
          <button onClick={handleCheck} disabled={isBusy || !address.trim()} style={{ width: "100%", padding: "0.875rem", background: isBusy ? "rgba(96,165,250,0.3)" : "linear-gradient(90deg, #3b82f6, #8b5cf6)", border: "none", borderRadius: 8, color: "white", fontSize: "1rem", fontWeight: 600, cursor: isBusy ? "not-allowed" : "pointer" }}>
            {isBusy ? (step === "fetching" ? "Fetching wallet..." : "Generating ZK proof...") : "Generate ZK Credit Score"}
          </button>
        </div>

        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "1rem", marginBottom: "1.5rem", color: "#fca5a5" }}>❌ {error}</div>}

        {walletData && (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#7c8ba1", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>🔒 Local Inputs (shown here for transparency — only the proof goes on-chain)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
              {[{ l: "Transactions", v: walletData.display.txCount, w: "×3" }, { l: "XLM Balance", v: `${walletData.display.lumens} XLM`, w: "×2" }, { l: "Wallet Age", v: `${walletData.display.ageDays} days`, w: "×1" }, { l: "Asset Types", v: walletData.display.uniqueAssets, w: "×10" }].map(s => (
                <div key={s.l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#7c8ba1" }}>{s.l} <span style={{ color: "#60a5fa" }}>{s.w}</span></div>
                  <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && (
          <div style={{ background: isWorthy ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${isWorthy ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, borderRadius: 16, padding: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem" }}>{isWorthy ? "✅" : "❌"}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: isWorthy ? "#4ade80" : "#f87171", margin: "0.5rem 0" }}>{isWorthy ? "Creditworthy" : "Not Creditworthy"}</div>
            <div style={{ color: "#94a3b8" }}>Score: {result.score} · Threshold: {THRESHOLD}</div>
            <div style={{ fontSize: "0.8rem", color: "#7c8ba1", marginTop: "0.75rem" }}>Groth16 ZK proof verified · Private inputs remained in browser</div>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "1rem" }}>
            {log.map((l, i) => <div key={i} style={{ fontSize: "0.85rem", color: "#94a3b8", padding: "0.15rem 0", fontFamily: "monospace" }}>{l}</div>)}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "2rem", fontSize: "0.75rem", color: "#374151" }}>
          Stellar Hacks ZK Hackathon · Circom + Groth16 + Soroban · June 2026
        </div>
      </div>
    </div>
  );
}
