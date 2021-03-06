import { Address, Amount, BlockHeightTimeout, Hash, TokenTicker } from "@iov/bcp";

export enum SmartContractType {
  EscrowSmartContract,
}

export enum SmartContractTokenType {
  ERC20 = "erc20",
  ETHER = "ether",
}

export interface SmartContractConfig {
  readonly address: Address;
  readonly type: SmartContractType;
  readonly fractionalDigits: number;
  readonly tokenTicker: TokenTicker;
  readonly tokenType: SmartContractTokenType;
}

export enum EscrowState {
  NON_EXISTENT,
  OPEN,
  CLAIMED,
  ABORTED,
}

export interface Escrow {
  readonly sender: Address;
  readonly recipient: Address;
  readonly arbiter: Address;
  readonly hash: Hash;
  readonly timeout: BlockHeightTimeout;
  readonly amount: Amount;
  readonly state: EscrowState;
}
