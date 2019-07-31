import {
  Amount,
  ChainId,
  FullSignature,
  Nonce,
  PubkeyBundle,
  SignatureBytes,
  SignedTransaction,
  Token,
  UnsignedTransaction,
} from "@iov/bcp";
import * as Long from "long";
import * as codecImpl from "./generated/codecimpl";
import {
  BnsUsernameNft,
  CashConfiguration,
  ElectionRule,
  Electorate,
  Keyed,
  Participant,
  PrivkeyBundle,
  Proposal,
} from "./types";
/**
 * Decodes a protobuf int field (int32/uint32/int64/uint64) into a JavaScript
 * number.
 */
export declare function asIntegerNumber(maybeLong: Long | number | null | undefined): number;
export declare function ensure<T>(maybe: T | null | undefined, msg?: string): T;
export declare function decodeUsernameNft(
  nft: codecImpl.username.IToken & Keyed,
  registryChainId: ChainId,
): BnsUsernameNft;
export declare function decodeNonce(sequence: Long | number | null | undefined): Nonce;
export declare function decodeUserData(
  userData: codecImpl.sigs.IUserData,
): {
  readonly nonce: Nonce;
};
export declare function decodePubkey(publicKey: codecImpl.crypto.IPublicKey): PubkeyBundle;
export declare function decodePrivkey(privateKey: codecImpl.crypto.IPrivateKey): PrivkeyBundle;
export declare function decodeSignature(signature: codecImpl.crypto.ISignature): SignatureBytes;
export declare function decodeFullSig(sig: codecImpl.sigs.IStdSignature): FullSignature;
export declare function decodeToken(data: codecImpl.currency.ITokenInfo & Keyed): Token;
export declare function decodeAmount(coin: codecImpl.coin.ICoin): Amount;
export declare function decodeCashConfiguration(config: codecImpl.cash.Configuration): CashConfiguration;
export declare function decodeParticipants(
  prefix: "iov" | "tiov",
  maybeParticipants?: codecImpl.multisig.IParticipant[] | null,
): readonly Participant[];
export declare function decodeElectorate(
  prefix: "iov" | "tiov",
  electorate: codecImpl.gov.IElectorate & Keyed,
): Electorate;
export declare function decodeElectionRule(
  prefix: "iov" | "tiov",
  rule: codecImpl.gov.IElectionRule & Keyed,
): ElectionRule;
export declare function decodeProposal(
  prefix: "iov" | "tiov",
  proposal: codecImpl.gov.IProposal & Keyed,
): Proposal;
export declare function parseMsg(base: UnsignedTransaction, tx: codecImpl.bnsd.ITx): UnsignedTransaction;
export declare function parseTx(tx: codecImpl.bnsd.ITx, chainId: ChainId): SignedTransaction;
