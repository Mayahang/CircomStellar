import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const proof = JSON.parse(readFileSync('proof.json', 'utf8'));
const pubs  = JSON.parse(readFileSync('public.json', 'utf8'));
const vkey  = JSON.parse(readFileSync('verification_key.json', 'utf8'));

const fBE = (n) => BigInt(n).toString(16).padStart(64, '0');
const g1  = (p) => fBE(p[0]) + fBE(p[1]);
const g2  = (p) => fBE(p[0][0]) + fBE(p[0][1]) + fBE(p[1][0]) + fBE(p[1][1]);

let VK = g1(vkey.vk_alpha_1) + g2(vkey.vk_beta_2) + g2(vkey.vk_gamma_2) + g2(vkey.vk_delta_2);
for (const ic of vkey.IC) VK += g1(ic);

const PROOF = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
const PUB   = fBE(pubs[0]);

console.log('VK:', VK.length/2, 'bytes');
console.log('PROOF:', PROOF.length/2, 'bytes');
console.log('PUB:', PUB.length/2, 'bytes');

const C = 'CBCPR4RSAJ5S53T6Y3TK7EIZE3PYDX6LKAYQMOKSIXMZP626FCKIIIPL';

try {
  const r = execSync(
    `stellar contract invoke --id ${C} --source testnet-deployer --network testnet -- verify --proof_bytes "${PROOF}" --vk_bytes "${VK}" --pub_signal "${PUB}"`,
    {encoding:'utf8', stdio:'pipe'}
  );
  console.log('✅ On-chain result:', r.trim());
} catch(e) {
  console.log('error:', e.stderr?.slice(0,300));
}
