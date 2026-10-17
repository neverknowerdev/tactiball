//! EVM helpers: address parsing, EIP-55 checksums and EIP-191 (personal_sign)
//! signature recovery for regular (EOA) wallets.

use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use sha3::{Digest, Keccak256};

pub fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut h = Keccak256::new();
    h.update(data);
    h.finalize().into()
}

/// Parses a 0x address and returns it lower-cased. Accepts any casing, but a
/// mixed-case address must carry a valid EIP-55 checksum.
pub fn normalize_address(address: &str) -> Result<String, String> {
    let hex_part = address.strip_prefix("0x").or_else(|| address.strip_prefix("0X")).ok_or("address must start with 0x")?;
    if hex_part.len() != 40 || !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("address must be 20 bytes of hex".into());
    }
    let lower = hex_part.to_ascii_lowercase();
    let is_mixed = hex_part != lower && hex_part != hex_part.to_ascii_uppercase();
    if is_mixed && to_checksum(&format!("0x{lower}")) != format!("0x{hex_part}") {
        return Err("address checksum is invalid".into());
    }
    Ok(format!("0x{lower}"))
}

/// EIP-55 mixed-case checksum of a lower-case 0x address.
pub fn to_checksum(lower: &str) -> String {
    let hex_part = lower.trim_start_matches("0x");
    let hash = keccak256(hex_part.as_bytes());
    let mut out = String::from("0x");
    for (i, c) in hex_part.chars().enumerate() {
        let nibble = (hash[i / 2] >> (if i % 2 == 0 { 4 } else { 0 })) & 0x0f;
        if c.is_ascii_alphabetic() && nibble >= 8 {
            out.push(c.to_ascii_uppercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// EIP-191 hash used by `personal_sign`.
pub fn personal_message_hash(message: &str) -> [u8; 32] {
    let mut data = format!("\x19Ethereum Signed Message:\n{}", message.len()).into_bytes();
    data.extend_from_slice(message.as_bytes());
    keccak256(&data)
}

fn address_of(key: &VerifyingKey) -> String {
    let point = key.to_sec1_point(false);
    let bytes = point.as_bytes();
    let hash = keccak256(&bytes[1..]);
    format!("0x{}", hex::encode(&hash[12..]))
}

/// Recovers the lower-case address that produced a 65-byte personal_sign signature.
pub fn recover_personal_sign(message: &str, signature_hex: &str) -> Result<String, String> {
    let raw = hex::decode(signature_hex.trim_start_matches("0x")).map_err(|_| "signature is not hex")?;
    if raw.len() != 65 {
        return Err(format!("signature must be 65 bytes, got {}", raw.len()));
    }
    let v = raw[64];
    let rec = match v {
        0 | 1 => v,
        27 | 28 => v - 27,
        _ => return Err("signature has an invalid v".into()),
    };
    let mut sig = Signature::from_slice(&raw[..64]).map_err(|_| "signature is malformed")?;
    let mut rec_id = RecoveryId::from_byte(rec).ok_or("signature has an invalid v")?;
    // Wallets produce low-s signatures, but accept high-s by flipping parity.
    let normalized = sig.normalize_s();
    if normalized != sig {
        sig = normalized;
        rec_id = RecoveryId::new(!rec_id.is_y_odd(), rec_id.is_x_reduced());
    }
    let hash = personal_message_hash(message);
    let key = VerifyingKey::recover_from_prehash(&hash, &sig, rec_id).map_err(|_| "signature does not match the message")?;
    Ok(address_of(&key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_matches_eip55_vectors() {
        for a in [
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
            "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
            "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
            "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
        ] {
            assert_eq!(to_checksum(&a.to_ascii_lowercase()), a);
            assert_eq!(normalize_address(a).unwrap(), a.to_ascii_lowercase());
        }
        assert!(normalize_address("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD").is_err());
        assert!(normalize_address("0x1234").is_err());
    }

    #[test]
    fn recovers_a_viem_personal_sign_signature() {
        // Produced by viem `privateKeyToAccount("0x07…07").signMessage({ message })`.
        let address = "0x4a62316623ad457F02cDC5D997deD67a383EC569";
        let message = format!("tactiball.app wants you to sign in with your Ethereum account:\n{address}\n\nhello");
        let sig = "0x8c354272a10175cf7d7be6a1d0e5248017ceac994cb5e9e6890e62c5e7ccd5d521e4c80edc82108c0bb1361098cf49e97a42bbb7d8d8a6d692db2bae82b304571b";
        assert_eq!(recover_personal_sign(&message, sig).unwrap(), address.to_ascii_lowercase());
        assert!(recover_personal_sign("other", sig).unwrap() != address.to_ascii_lowercase());
    }
}
