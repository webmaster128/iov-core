import { Address, AtomicSwapQuery, BcpQueryTag } from "@iov/bcp";
export declare function bnsNonceTag(addr: Address): BcpQueryTag;
export declare function bnsSwapQueryTag(query: AtomicSwapQuery, set?: boolean): BcpQueryTag;
