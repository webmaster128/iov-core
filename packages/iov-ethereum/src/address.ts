import { Address, Algorithm, PublicKeyBundle } from "@iov/bcp-types";
import { Keccak256 } from "@iov/crypto";
import { Encoding } from "@iov/encoding";

const { toAscii, toHex } = Encoding;

export function isValidAddress(address: string): boolean {
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return false;
  }

  const isChecksummed = !address.match(/^0x[a-f0-9]{40}$/);
  if (isChecksummed) {
    // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
    const addressLower = address.toLowerCase().replace("0x", "");
    const addressHash = toHex(new Keccak256(toAscii(addressLower)).digest());
    for (let i = 0; i < 40; i++) {
      if (
        (parseInt(addressHash[i], 16) > 7 && addressLower[i].toUpperCase() !== address[i + 2]) ||
        (parseInt(addressHash[i], 16) <= 7 && addressLower[i] !== address[i + 2])
      ) {
        return false;
      }
    }
    return true;
  } else {
    return true;
  }
}

/**
 * Converts Ethereum address to checksummed address according to EIP-55.
 *
 * Input address must be valid, i.e. either all lower case or correctly checksummed.
 *
 * @link https://github.com/ethereum/EIPs/blob/master/EIPS/eip-55.md
 */
export function toChecksummedAddress(address: string): Address {
  if (!isValidAddress(address)) {
    throw new Error("Input is not a valid Ethereum address");
  }

  const addressLower = address.toLowerCase().replace("0x", "");
  const addressHash = toHex(new Keccak256(toAscii(addressLower)).digest());
  let checksumAddress = "0x";
  for (let i = 0; i < 40; i++) {
    checksumAddress += parseInt(addressHash[i], 16) > 7 ? addressLower[i].toUpperCase() : addressLower[i];
  }
  return checksumAddress as Address;
}

export function pubkeyToAddress(pubkey: PublicKeyBundle): Address {
  if (pubkey.algo !== Algorithm.Secp256k1 || pubkey.data.length !== 65 || pubkey.data[0] !== 0x04) {
    throw new Error(`Invalid pubkey data input: ${pubkey}`);
  }
  const hash = toHex(new Keccak256(pubkey.data.slice(1)).digest());
  const lastFortyChars = hash.slice(-40);
  const addressString = toChecksummedAddress("0x" + lastFortyChars);
  return addressString as Address;
}