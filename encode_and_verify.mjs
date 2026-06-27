import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const proof = JSON.parse(readFileSync('proof.json', 'utf8'));
const pubs  = JSON.parse(readFileSync('public.json', 'utf8'));
const vkey  = JSON.parse(readFileSync('verification_key.json', 'utf8'));

// Big-endian 32 bytes (parse_u256_be)
const fBE = (n) => BigInt(n).toString(16).padStart(64, '0');

// Public signals: 4-byte BE length prefix + each signal as 32-byte BE
const lenHex = pubs.length.toString(16).padStart(8, '0');
const PUB_HEX = lenHex + pubs.map(fBE).join('');

// Need to see full vk/proof encoding - use BE for now
const g1 = (p) => fBE(p[0]) + fBE(p[1]);
const g2 = (p) => fBE(p[0][0]) + fBE(p[0][1]) + fBE(p[1][0]) + fBE(p[1][1]);

const PROOF_HEX = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);

let VK_HEX = g1(vkey.vk_alpha_1) + g2(vkey.vk_beta_2) + g2(vkey.vk_gamma_2) + g2(vkey.vk_delta_2);
for (const ic of vkey.IC) VK_HEX += g1(ic);

console.log('VK:', VK_HEX.length/2, 'bytes');
console.log('Proof:', PROOF_HEX.length/2, 'bytes');
console.log('Pub:', PUB_HEX.length/2, 'bytes (incl 4-byte length prefix)');

const C = 'CBJCSUPFQNYBJMFXBA5ZBIJS2ZRNJ3PRKMOUQLS4KLPKIOPEKI3M4DI5';

console.log('\nSetting VK...');
try {
  const r = execSync(`stellar contract invoke --id ${C} --source testnet-deployer --network testnet -- set_vk --vk_bytes "${VK_HEX}"`, {encoding:'utf8', stdio:'pipe'});
  console.log('set_vk result:', r.trim());
} catch(e) { console.log('set_vk error:', e.stderr?.slice(0,200)); }

console.log('\nVerifying...');
try {
  const r = execSync(`stellar contract invoke --id ${C} --source testnet-deployer --network testnet -- verify --proof_bytes "${PROOF_HEX}" --pub_signals_bytes "${PUB_HEX}"`, {encoding:'utf8', stdio:'pipe'});
  console.log('✅ verify result:', r.trim());
} catch(e) { console.log('verify error:', e.stderr?.slice(0,400)); }
