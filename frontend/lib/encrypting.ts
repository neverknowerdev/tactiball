import * as path from 'path';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { encrypt, decrypt, PrivateKey, PublicKey } from 'eciesjs';
import * as elliptic from 'elliptic';

// Use elliptic for custom ECIES with compressed keys
const ec = new elliptic.ec('secp256k1');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ECIES key pair generation (more efficient for symmetric key encryption)
export function generateECIESKeyPair(): { publicKey: string; privateKey: string } {
    const privateKey = new PrivateKey();
    const publicKey = privateKey.publicKey;
    return {
        publicKey: publicKey.toHex(),
        privateKey: privateKey.toHex()
    };
}

/**
 * Generates a random symmetric key for AES-128 encryption.
 * @returns A base64-encoded string representing a 16-byte symmetric key.
 */
export function generateSymmetricKey(): string {
    return crypto.randomBytes(16).toString('base64'); // 16 bytes for AES-128
}

/**
 * Encodes a symmetric key using ECIES with a compressed ephemeral public key.
 * @param symmetricKey The symmetric key to encode (base64 encoded).
 * @param publicKey The recipient's public key (hex string).
 * @returns The encoded symmetric key as a base64 string.
 */
export function encodeSymmetricKey(symmetricKey: string, publicKey: string): string {
    const symmetricKeyBuffer = Buffer.from(symmetricKey, 'base64');
    // Generate ephemeral key pair
    const ephemeral = ec.genKeyPair();
    const ephemeralPublicKey = ephemeral.getPublic(true, 'hex'); // Compressed format (33 bytes)
    const recipientPublicKey = ec.keyFromPublic(publicKey, 'hex');
    // Derive shared secret
    const sharedSecret = ephemeral.derive(recipientPublicKey.getPublic()).toArrayLike(Buffer);
    // Use shared secret to generate encryption key (hash to ensure fixed length)
    const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();
    // Generate IV
    const iv = crypto.randomBytes(16);
    // Encrypt symmetric key with AES-128-CBC
    const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey.slice(0, 16), iv);
    const ciphertext = Buffer.concat([cipher.update(symmetricKeyBuffer), cipher.final()]);
    // Generate MAC using another part of the shared secret
    const macKey = encryptionKey.slice(16, 32);
    const macInput = Buffer.concat([Buffer.from(ephemeralPublicKey, 'hex'), iv, ciphertext]);
    const mac = crypto.createHmac('sha256', macKey).update(macInput).digest().slice(0, 15); // 15-byte MAC to fit in 96 bytes
    // Concatenate: compressed public key (33 bytes) + IV (16 bytes) + ciphertext (32 bytes) + MAC (15 bytes) = 96 bytes
    const result = Buffer.concat([Buffer.from(ephemeralPublicKey, 'hex'), iv, ciphertext, mac]);
    return result.toString('base64');
}

/**
 * Decodes a symmetric key using ECIES with a compressed ephemeral public key.
 * @param encodedKey The encoded symmetric key as a Buffer.
 * @param privateKey The recipient's private key (hex string).
 * @returns The decoded symmetric key as a base64 string.
 * @throws Error if decryption fails.
 */
export function decodeSymmetricKey(encodedKey: Buffer, privateKey: string): string {
    const dataBuffer = encodedKey;
    // Extract components: 33 bytes public key, 16 bytes IV, 32 bytes ciphertext (due to padding), 15 bytes MAC
    if (dataBuffer.length !== 96) {
        throw new Error('Invalid encoded symmetric key length');
    }
    const ephemeralPublicKey = dataBuffer.slice(0, 33);
    const iv = dataBuffer.slice(33, 49);
    const ciphertext = dataBuffer.slice(49, 81);
    const mac = dataBuffer.slice(81, 96);
    // Verify MAC
    const recipientPrivateKey = ec.keyFromPrivate(privateKey, 'hex');
    const sharedSecret = recipientPrivateKey.derive(ec.keyFromPublic(ephemeralPublicKey).getPublic()).toArrayLike(Buffer);
    const encryptionKey = crypto.createHash('sha256').update(sharedSecret).digest();
    const macKey = encryptionKey.slice(16, 32);
    const macInput = dataBuffer.slice(0, 81); // public key + IV + ciphertext
    const computedMac = crypto.createHmac('sha256', macKey).update(macInput).digest().slice(0, 15);
    if (!mac.equals(computedMac)) {
        throw new Error('MAC verification failed during symmetric key decryption');
    }
    // Decrypt symmetric key
    const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey.slice(0, 16), iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('base64');
}

/**
 * Encodes data using a symmetric key with movesMade as a nonce for AES-128-CTR encryption.
 * @param data The data as a Buffer to encode.
 * @param movesMade The number of moves made, used as a nonce.
 * @param symmetricKey The symmetric key for encryption (base64 encoded).
 * @returns The encoded data as a Buffer.
 */
export function encodeData(data: Buffer, movesMade: number, symmetricKey: string): Buffer {
    const symmetricKeyBuffer = Buffer.from(symmetricKey, 'base64');
    // Use movesMade as a nonce (convert to a 16-byte buffer for AES-CTR)
    const nonce = Buffer.alloc(16);
    nonce.writeUInt32BE(movesMade, 12); // Write movesMade to the last 4 bytes

    // Create cipher with AES-128-CTR mode (no auth tag needed)
    const cipher = crypto.createCipheriv('aes-128-ctr', symmetricKeyBuffer, nonce);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    // Only return encrypted data (no nonce or auth tag stored)
    return encrypted;
}

/**
 * Decodes data using a symmetric key with movesMade as a nonce for AES-128-CTR decryption.
 * @param encodedData The encoded data as a Buffer.
 * @param movesMade The number of moves made, used as a nonce.
 * @param symmetricKey The symmetric key for decryption (base64 encoded).
 * @returns The decoded data as a Buffer.
 * @throws Error if decryption fails (e.g., incorrect nonce or key).
 */
export function decodeData(encodedData: Buffer, movesMade: number, symmetricKey: string): Buffer {
    const symmetricKeyBuffer = Buffer.from(symmetricKey, 'base64');
    // Regenerate nonce from movesMade
    const nonce = Buffer.alloc(16);
    nonce.writeUInt32BE(movesMade, 12); // Write movesMade to the last 4 bytes
    // Create decipher with AES-128-CTR mode
    const decipher = crypto.createDecipheriv('aes-128-ctr', symmetricKeyBuffer, nonce);
    const decrypted = Buffer.concat([decipher.update(encodedData), decipher.final()]);
    // Return the decrypted buffer directly
    return decrypted;
}

// Basic compression function: Placeholder for packing numerical string data into bytes
// Adjust based on actual data format of game moves
function compressData(data: string): Buffer {
    // For demonstration, assume data is a string of digits, pack two digits per byte
    const buffer = Buffer.alloc(Math.ceil(data.length / 2));
    for (let i = 0; i < data.length; i += 2) {
        const firstDigit = parseInt(data[i], 10);
        const secondDigit = i + 1 < data.length ? parseInt(data[i + 1], 10) : 0;
        buffer[Math.floor(i / 2)] = (firstDigit << 4) | secondDigit;
    }
    return buffer;
}

// Decompression function: Reverse of compressData
function decompressData(buffer: Buffer): string {
    let result = '';
    for (const byte of buffer) {
        const firstDigit = (byte >> 4) & 0xF;
        const secondDigit = byte & 0xF;
        result += firstDigit.toString();
        if (secondDigit !== 0 || result.length < 61) { // Adjust based on expected length if needed
            result += secondDigit.toString();
        }
    }
    return result;
}

// Convert bigint to a 32-byte buffer (or less if possible)
export function bigintToBuffer(num: bigint): Buffer {
    // Convert bigint to hex string and remove '0x' prefix
    const hex = num.toString(16).padStart(64, '0'); // Pad to 64 characters (32 bytes)
    return Buffer.from(hex, 'hex');
}

// Convert buffer back to bigint
export function bufferToBigint(buffer: Buffer): bigint {
    const hex = buffer.toString('hex');
    if (hex === '') {
        return BigInt(0);
    }
    return BigInt('0x' + hex);
}

// Note: RSA Key Pair Management
// Keys should be generated once and stored securely, possibly in environment variables or a secure storage solution.
// The public key can be shared with clients, while the private key must remain server-side only.
// Consider using a script to generate keys and load them into the application at runtime.

// Remove or comment out references to non-existent functions
// generateAndSaveKeyPair();
// generateEphemeralKeyPair();
// deriveSharedKey();
// encryptUint256();
// decryptUint256();

// Example usage (for testing or CLI)
async function main() {
    // Use ECIES for more efficient symmetric key encryption
    const eciesKeyPair = generateECIESKeyPair();
    const { privateKey, publicKey } = eciesKeyPair;
    console.log('ECIES Private Key:', privateKey);
    console.log('ECIES Public Key:', publicKey);

    const symmetricKey = generateSymmetricKey();
    console.log('Symmetric Key:', symmetricKey);

    const encodedSymmetricKey = encodeSymmetricKey(symmetricKey, publicKey);
    console.log('Encoded Symmetric Key (ECIES):', encodedSymmetricKey);
    console.log('Encoded Symmetric Key Size:', Buffer.from(encodedSymmetricKey, 'base64').length, 'bytes');

    const encodedSymmetricKeyBuffer = Buffer.from(encodedSymmetricKey, 'base64');
    const decodedSymmetricKey = decodeSymmetricKey(encodedSymmetricKeyBuffer, privateKey);
    console.log('Decoded Symmetric Key:', decodedSymmetricKey);

    const data = Buffer.from('Sample game move data', 'utf8');
    const movesMade = 0; // First move
    const encodedData = encodeData(data, movesMade, symmetricKey);
    console.log('Encoded Data:', encodedData);

    const decodedData = decodeData(encodedData, movesMade, symmetricKey);
    console.log('Decoded Data:', decodedData);
}

if (require.main === module) {
    main().catch(console.error);
}