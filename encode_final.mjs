import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const proof = JSON.parse(readFileSync('proof.json', 'utf8'));
const pubs  = JSON.parse(readFileSync('public.json', 'utf8'));
const vkey  = JSON.parse(readFileSync('verification_key.json', 'utf8'));

// parse_u256_be: big-endian 32 bytes
const fBE = (n) => BigInt(n).toString(16).padStart(64, '0');

// g1_bytes(x, y): 64 bytes BE
const g1 = (p) => fBE(p[0]) + fBE(p[1]);

// g2_bytes(x1, x2, y1, y2): 128 bytes BE  
const g2 = (p) => fBE(p[0][0]) + fBE(p[0][1]) + fBE(p[1][0]) + fBE(p[1][1]);

// VK: alpha_g1 + beta_g2 + gamma_g2 + delta_g2 + IC points
let VK = g1(vkey.vk_alpha_1) + g2(vkey.vk_beta_2) + g2(vkey.vk_gamma_2) + g2(vkey.vk_delta_2);
for (const ic of vkey.IC) VK += g1(ic);

// PROOF: pi_a(g1) + pi_b(g2) + pi_c(g1) + public_signals(u256_be each)
let PROOF = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
for (const s of pubs) PROOF += fBE(s);

// PUB_SIGNALS: 4-byte BE count + each signal BE
const PUB = pubs.length.toString(16).padStart(8,'0') + pubs.map(fBE).join('');

console.log('VK:', VK.length/2, 'bytes');
console.log('PROOF:', PROOF.length/2, 'bytes');
console.log('PUB:', PUB.length/2, 'bytes');

const C = 'CBJCSUPFQNYBJMFXBA5ZBIJS2ZRNJ3PRKMOUQLS4KLPKIOPEKI3M4DI5';

console.log('\nset_vk...');
try {
  const r = execSync(`stellar contract invoke --id ${C} --source testnet-deployer --network testnet -- set_vk --vk_bytes "${VK}"`, {encoding:'utf8', stdio:'pipe'});
  console.log('✅ set_vk:', r.trim() || 'ok');
} catch(e) { console.log('set_vk error:', e.stderr?.slice(0,300)); }

console.log('\nverify...');
try {
  const r = execSync(`stellar contract invoke --id ${C} --source testnet-deployer --network testnet -- verify --proof_bytes "${PROOF}" --pub_signals_bytes "${PUB}"`, {encoding:'utf8', stdio:'pipe'});
  console.log('✅ verify:', r.trim());
} catch(e) { console.log('verify error:', e.stderr?.slice(0,300)); }
