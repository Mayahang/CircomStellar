# ZK Credit Score

A zero-knowledge credit scoring system built on Stellar. Prove your wallet is creditworthy without revealing your balance, transaction history, or wallet age.

## What it does

Most on-chain reputation systems force a tradeoff: either you reveal everything about your wallet, or you reveal nothing and get no credit for your history. This project removes that tradeoff using zero-knowledge proofs.

The app reads your Stellar wallet's public data (transaction count, XLM balance, wallet age, number of asset types), combines it into a credit score using a weighted formula, and then generates a Groth16 zero-knowledge proof that the score clears a threshold — all inside your browser. The actual numbers never get sent anywhere. The only thing that leaves your device is a cryptographic proof that says, essentially, "yes, this wallet qualifies," without exposing why.

Try it: [live demo link]
Contract on Stellar testnet: `CBCPR4RSAJ5S53T6Y3TK7EIZE3PYDX6LKAYQMOKSIXMZP626FCKIIIPL`

## How it works

1. **Fetch** — the app reads public wallet data from Stellar's Horizon API (transaction count, balance, account age, asset diversity)
2. **Score** — a weighted formula combines those four values into a single credit score
3. **Prove** — a Circom circuit takes the four values as private inputs and proves `score >= 50` using a Groth16 zk-SNARK, generated entirely client-side with snarkjs
4. **Verify** — the resulting proof can be checked by a Soroban smart contract deployed on Stellar testnet, without the contract ever seeing the underlying wallet data

You can expand "View raw proof bytes" in the app to see exactly what would be submitted on-chain — it's 256 bytes of elliptic curve points. There's no way to recover the original balance or transaction count from it.

## What's working

- Custom Circom circuit (`circuits/multiplier2.circom`) computing a weighted credit score and proving it against a threshold using `GreaterEqThan`
- Groth16 proof generation and verification running fully client-side in the browser via snarkjs — confirmed working with `snarkjs groth16 verify` returning `OK!`
- A Soroban (Stellar smart contract) Groth16 verifier written in Rust using `ark-bn254`, compiled to `wasm32v1-none`, and deployed live on Stellar testnet
- A React frontend that pulls real wallet data from Stellar's Horizon API and runs the whole prove flow live, with no backend server involved

## Known limitation

Stellar's existing Groth16 verifier examples (including the official `soroban-examples` repo) use the BLS12-381 curve, since that's what Stellar's native crypto host functions are optimized for. snarkjs, however, only generates proofs on the BN254 curve. These two are not interchangeable — a BN254 proof cannot be checked by a BLS12-381 verifier and vice versa.

To work around this, we wrote a custom verifier contract using `ark-bn254` (matching snarkjs's curve) instead of Stellar's native BLS12-381 functions. It compiles and deploys successfully, and the proof encoding is correct. However, running the full BN254 pairing check inside a single Soroban transaction exceeds Stellar's compute budget (`HostError: Budget, ExceededLimit`), since BN254 pairings aren't backed by a native host function the way BLS12-381 is.

This is a genuine constraint of the current Stellar ZK toolchain, not a bug in our code — it's the actual reason most Stellar ZK projects standardize on BLS12-381. Proof generation, local verification, and the full prove-and-display flow all work end-to-end; only the final on-chain pairing check is blocked by this curve/budget mismatch. The most direct fix would be regenerating proofs using a BLS12-381-compatible proving system instead of snarkjs, which is the next step for this project.

## Stack

- **Circom** — circuit definition
- **snarkjs** — Groth16 proof generation and local verification, run client-side
- **Rust + Soroban SDK + ark-bn254** — on-chain verifier contract
- **React + Vite** — frontend
- **Stellar Horizon API** — wallet data source
- **Stellar testnet** — deployment target

## Running locally

```bash
cd frontend
npm install
npm run dev
```

The circuit artifacts (`.wasm`, `.zkey`, verification key) are already built and included in `frontend/public/`.

## Why this matters

Lending, reputation, and access-gating on public blockchains usually means choosing between full transparency or full opacity. This project is a small proof of concept for a middle path: wallets can prove they meet a bar — creditworthy, established, active — without broadcasting their entire financial history to anyone who looks them up. It's a pattern that could extend to KYC-lite checks, private airdrops, undercollateralized lending, or reputation-gated DAOs.

Built solo for the Stellar Hacks: Real-World ZK hackathon.
