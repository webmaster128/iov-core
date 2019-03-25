import BN = require("bn.js");

import { Address } from "@iov/bcp";
import { Keccak256 } from "@iov/crypto";
import { Encoding } from "@iov/encoding";

import { Abi } from "./abi";

export interface EthereumRpcClient {
  readonly ethCall: (to: Address, data: Uint8Array) => Promise<Uint8Array>;
}

function calcMethodId(signature: string): Uint8Array {
  const firstFourBytes = new Keccak256(Encoding.toAscii(signature)).digest().slice(0, 4);
  return firstFourBytes;
}

function encodeAddress(address: Address): Uint8Array {
  const padding = new Array(12).fill(0);
  const addressBytes = Encoding.fromHex(address.slice(2)); // 20 bytes
  return new Uint8Array([...padding, ...addressBytes]);
}

export class Erc20 {
  private readonly client: EthereumRpcClient;
  private readonly contractAddress: Address;

  constructor(client: EthereumRpcClient, contractAddress: Address) {
    this.client = client;
    this.contractAddress = contractAddress;
  }

  public async totalSupply(): Promise<BN> {
    const data = calcMethodId("totalSupply()");
    const result = await this.client.ethCall(this.contractAddress, data);
    return new BN(result);
  }

  public async balanceOf(address: Address): Promise<BN> {
    const methodId = calcMethodId("balanceOf(address)");

    const data = new Uint8Array([...methodId, ...encodeAddress(address)]);
    const result = await this.client.ethCall(this.contractAddress, data);
    return new BN(result);
  }

  /** optional, returns undefined if call does not exist */
  public async name(): Promise<string | undefined> {
    const data = calcMethodId("name()");
    const result = await this.client.ethCall(this.contractAddress, data);

    const [nameBinary] = Abi.decodeHeadTail(result).tail;
    return Encoding.fromUtf8(Abi.decodeVariableLength(nameBinary));
  }

  /** optional, returns undefined if call does not exist */
  public async symbol(): Promise<string | undefined> {
    const data = calcMethodId("symbol()");
    const result = await this.client.ethCall(this.contractAddress, data);
    const [symbolBinary] = Abi.decodeHeadTail(result).tail;
    return Encoding.fromUtf8(Abi.decodeVariableLength(symbolBinary));
  }

  /** optional, returns undefined if call does not exist */
  public async decimals(): Promise<BN | undefined> {
    const data = calcMethodId("decimals()");
    const result = await this.client.ethCall(this.contractAddress, data);
    return new BN(result);
  }
}
