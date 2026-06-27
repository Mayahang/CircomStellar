#![no_std]
extern crate alloc;
use alloc::vec::Vec;

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_ec::pairing::Pairing;
use ark_ff::{BigInteger, PrimeField, Field};
use ark_serialize::CanonicalDeserialize;
use soroban_sdk::{contract, contractimpl, Bytes, Env};

#[contract]
pub struct ZkCreditVerifier;

fn read_fq(bytes: &[u8]) -> Option<Fq> {
    if bytes.len() < 32 { return None; }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    // snarkjs uses big-endian
    arr.reverse();
    Fq::deserialize_uncompressed(&arr[..]).ok()
}

fn read_fr(bytes: &[u8]) -> Option<Fr> {
    if bytes.len() < 32 { return None; }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes[..32]);
    arr.reverse();
    Fr::deserialize_uncompressed(&arr[..]).ok()
}

fn read_g1(bytes: &[u8]) -> Option<G1Affine> {
    if bytes.len() < 64 { return None; }
    let x = read_fq(&bytes[0..32])?;
    let y = read_fq(&bytes[32..64])?;
    Some(G1Affine::new(x, y))
}

fn read_g2(bytes: &[u8]) -> Option<G2Affine> {
    if bytes.len() < 128 { return None; }
    // G2 uses Fq2 (x = x0 + x1*u, y = y0 + y1*u)
    let x0 = read_fq(&bytes[0..32])?;
    let x1 = read_fq(&bytes[32..64])?;
    let y0 = read_fq(&bytes[64..96])?;
    let y1 = read_fq(&bytes[96..128])?;
    let x = Fq2::new(x0, x1);
    let y = Fq2::new(y0, y1);
    Some(G2Affine::new(x, y))
}

#[contractimpl]
impl ZkCreditVerifier {
    /// Verify a Groth16 ZK Credit Score proof
    /// proof_bytes: pi_a(64) + pi_b(128) + pi_c(64) = 256 bytes
    /// vk_bytes: alpha(64) + beta(128) + gamma(128) + delta(128) + IC[0](64) + IC[1](64) = 576 bytes
    /// pub_signals: one 32-byte field element (the output: 1=creditworthy)
    pub fn verify(
        env: Env,
        proof_bytes: Bytes,
        vk_bytes: Bytes,
        pub_signal: Bytes,
    ) -> bool {
        let proof_vec: Vec<u8> = proof_bytes.iter().collect();
        let vk_vec: Vec<u8> = vk_bytes.iter().collect();
        let sig_vec: Vec<u8> = pub_signal.iter().collect();

        if proof_vec.len() < 256 { return false; }
        if vk_vec.len() < 576 { return false; }
        if sig_vec.len() < 32 { return false; }

        // Parse proof
        let pi_a = match read_g1(&proof_vec[0..64]) { Some(p) => p, None => return false };
        let pi_b = match read_g2(&proof_vec[64..192]) { Some(p) => p, None => return false };
        let pi_c = match read_g1(&proof_vec[192..256]) { Some(p) => p, None => return false };

        // Parse VK
        let alpha = match read_g1(&vk_vec[0..64]) { Some(p) => p, None => return false };
        let beta  = match read_g2(&vk_vec[64..192]) { Some(p) => p, None => return false };
        let gamma = match read_g2(&vk_vec[192..320]) { Some(p) => p, None => return false };
        let delta = match read_g2(&vk_vec[320..448]) { Some(p) => p, None => return false };
        let ic0   = match read_g1(&vk_vec[448..512]) { Some(p) => p, None => return false };
        let ic1   = match read_g1(&vk_vec[512..576]) { Some(p) => p, None => return false };

        // Parse public signal
        let s = match read_fr(&sig_vec[0..32]) { Some(f) => f, None => return false };

        // Compute vk_x = IC[0] + s * IC[1]
        use ark_ec::AffineRepr;
        use ark_ec::CurveGroup;
        let ic1_proj = ic1.mul_bigint(s.into_bigint());
        let vk_x = (ic0.into_group() + ic1_proj).into_affine();

        // Groth16 check: e(pi_a, pi_b) == e(alpha, beta) * e(vk_x, gamma) * e(pi_c, delta)
        let lhs = Bn254::pairing(pi_a, pi_b);
        let rhs = Bn254::multi_pairing(
            [alpha, vk_x, pi_c],
            [beta,  gamma, delta],
        );

        lhs == rhs
    }
}
