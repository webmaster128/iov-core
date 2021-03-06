import {
  Account,
  AccountQuery,
  AddressQuery,
  BlockchainConnection,
  BlockHeader,
  ChainId,
  ConfirmedAndSignedTransaction,
  ConfirmedTransaction,
  FailedTransaction,
  Fee,
  Nonce,
  PostableBytes,
  PostTxResponse,
  PubkeyQuery,
  Token,
  TokenTicker,
  TransactionId,
  TransactionQuery,
  TxCodec,
  UnsignedTransaction,
} from "@iov/bcp";
import { Stream } from "xstream";
/**
 * Encodes the current date and time as a nonce
 */
export declare function generateNonce(): Nonce;
export declare class LiskConnection implements BlockchainConnection {
  static establish(baseUrl: string): Promise<LiskConnection>;
  readonly chainId: ChainId;
  readonly codec: TxCodec;
  private readonly baseUrl;
  constructor(baseUrl: string, chainId: ChainId);
  disconnect(): void;
  height(): Promise<number>;
  postTx(bytes: PostableBytes): Promise<PostTxResponse>;
  getToken(searchTicker: TokenTicker): Promise<Token | undefined>;
  getAllTokens(): Promise<readonly Token[]>;
  getAccount(query: AccountQuery): Promise<Account | undefined>;
  getNonce(_: AddressQuery | PubkeyQuery): Promise<Nonce>;
  getNonces(_: AddressQuery | PubkeyQuery, count: number): Promise<readonly Nonce[]>;
  watchAccount(query: AccountQuery): Stream<Account | undefined>;
  getBlockHeader(height: number): Promise<BlockHeader>;
  watchBlockHeaders(): Stream<BlockHeader>;
  getTx(id: TransactionId): Promise<ConfirmedAndSignedTransaction<UnsignedTransaction>>;
  searchTx(query: TransactionQuery): Promise<readonly ConfirmedTransaction<UnsignedTransaction>[]>;
  listenTx(_: TransactionQuery): Stream<ConfirmedTransaction<UnsignedTransaction> | FailedTransaction>;
  liveTx(query: TransactionQuery): Stream<ConfirmedTransaction<UnsignedTransaction> | FailedTransaction>;
  getFeeQuote(tx: UnsignedTransaction): Promise<Fee>;
  withDefaultFee<T extends UnsignedTransaction>(transaction: T): Promise<T>;
  private waitForTransaction;
  private searchTransactions;
}
