//! In-browser FHE for Siphon.
//!
//! Compiled to WASM with wasm-bindgen. Generates the tfhe-rs radix keypair, encrypts
//! price bounds, and decrypts the trigger result — all client-side, so the client key
//! never leaves the browser.
//!
//! The scheme MUST stay byte-compatible with the Rust FHE engine (`fhe/`) and the
//! (now-deprecated) payload generator:
//!   - `tfhe` 0.5 integer radix
//!   - `PARAM_MESSAGE_2_CARRY_2_KS_PBS`, NUM_BLOCKS = 16
//!   - serialized with bincode 1.3, hex-encoded
//! Any drift here breaks cross-implementation interop.

use tfhe::integer::{gen_keys_radix, RadixCiphertext, RadixClientKey, ServerKey};
use tfhe::shortint::parameters::PARAM_MESSAGE_2_CARRY_2_KS_PBS;
use serde::Serialize;
use wasm_bindgen::prelude::*;

const NUM_BLOCKS: usize = 16;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[derive(Serialize)]
struct KeyPair {
    #[serde(rename = "clientKey")]
    client_key: String,
    #[serde(rename = "serverKey")]
    server_key: String,
}

fn to_hex<T: serde::Serialize>(value: &T) -> Result<String, JsError> {
    let bytes = bincode::serialize(value).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(hex::encode(bytes))
}

fn from_hex<T: for<'de> serde::Deserialize<'de>>(hex_str: &str) -> Result<T, JsError> {
    let bytes = hex::decode(hex_str).map_err(|e| JsError::new(&format!("hex decode: {e}")))?;
    bincode::deserialize(&bytes).map_err(|e| JsError::new(&format!("bincode: {e}")))
}

/// Generate a fresh FHE keypair. Returns `{ clientKey: hex, serverKey: hex }`.
/// Heavy: server-key generation is single-threaded on wasm.
#[wasm_bindgen]
pub fn generate_keys() -> Result<JsValue, JsError> {
    let (client_key, server_key): (RadixClientKey, ServerKey) =
        gen_keys_radix(PARAM_MESSAGE_2_CARRY_2_KS_PBS, NUM_BLOCKS);

    let pair = KeyPair {
        client_key: to_hex(&client_key)?,
        server_key: to_hex(&server_key)?,
    };
    serde_wasm_bindgen::to_value(&pair).map_err(|e| JsError::new(&e.to_string()))
}

/// Encrypt a price in cents (price * 100) with the given client key.
/// Returns the ciphertext as hex (bincode-serialized RadixCiphertext).
#[wasm_bindgen]
pub fn encrypt_price(price_cents: u64, client_key_hex: &str) -> Result<String, JsError> {
    let cks: RadixClientKey = from_hex(client_key_hex)?;
    let ct: RadixCiphertext = cks.encrypt(price_cents);
    to_hex(&ct)
}

/// Decrypt an engine-produced result ciphertext. The engine encodes the trigger as 1/0,
/// matching the original server-side `client_key.decrypt::<u64>(ct) == 1`.
#[wasm_bindgen]
pub fn decrypt_result(ciphertext_hex: &str, client_key_hex: &str) -> Result<bool, JsError> {
    let cks: RadixClientKey = from_hex(client_key_hex)?;
    let ct: RadixCiphertext = from_hex(ciphertext_hex)?;
    Ok(cks.decrypt::<u64>(&ct) == 1)
}
