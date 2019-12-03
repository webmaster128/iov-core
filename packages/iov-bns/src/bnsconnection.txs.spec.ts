import {
  Account,
  Address,
  BlockInfoFailed,
  BlockInfoSucceeded,
  ChainId,
  isBlockInfoPending,
  isConfirmedTransaction,
  isFailedTransaction,
  isSendTransaction,
  SendTransaction,
  TransactionId,
  TransactionState,
  WithCreator,
} from "@iov/bcp";
import { Ed25519, Sha512 } from "@iov/crypto";
import { HdPaths } from "@iov/keycontrol";
import { firstEvent, lastValue } from "@iov/stream";
import Long from "long";

import { bnsCodec } from "./bnscodec";
import { BnsConnection } from "./bnsconnection";
import {
  bnsdTendermintUrl,
  cash,
  defaultAmount,
  pendingWithoutBnsd,
  randomBnsAddress,
  sendCash,
  sendTokensFromFaucet,
  sleep,
  tendermintSearchIndexUpdated,
  userProfileWithFaucet,
} from "./testutils.spec";
import { ChainAddressPair, RegisterUsernameTx, TransferUsernameTx, UpdateTargetsOfUsernameTx } from "./types";
import { identityToAddress } from "./util";

describe("BnsConnection (txs)", () => {
  describe("getTx", () => {
    it("can get a transaction by ID", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);

      // by non-existing ID
      {
        const nonExistentId = "abcd" as TransactionId;
        await connection
          .getTx(nonExistentId)
          .then(fail.bind(null, "should not resolve"), error =>
            expect(error).toMatch(/transaction does not exist/i),
          );
      }

      {
        const chainId = connection.chainId();
        const { profile, faucet } = await userProfileWithFaucet(chainId);

        const memo = `Payment ${Math.random()}`;
        const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
          kind: "bcp/send",
          creator: faucet,
          sender: bnsCodec.identityToAddress(faucet),
          recipient: await randomBnsAddress(),
          memo: memo,
          amount: defaultAmount,
        });

        const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
        const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
        const response = await connection.postTx(bnsCodec.bytesToPost(signed));
        await response.blockInfo.waitFor(info => !isBlockInfoPending(info));
        const transactionId = response.transactionId;

        await tendermintSearchIndexUpdated();

        const result = await connection.getTx(transactionId);
        expect(result.height).toBeGreaterThanOrEqual(2);
        expect(result.transactionId).toEqual(transactionId);
        if (isFailedTransaction(result)) {
          throw new Error("Expected ConfirmedTransaction, received FailedTransaction");
        }
        const transaction = result.transaction;
        if (!isSendTransaction(transaction)) {
          throw new Error("Unexpected transaction type");
        }
        expect(transaction.recipient).toEqual(sendTx.recipient);
        expect(transaction.amount).toEqual(defaultAmount);
      }

      connection.disconnect();
    });

    it("can get a transaction by ID and verify its signature", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();
      const { profile, faucet } = await userProfileWithFaucet(chainId);

      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: await randomBnsAddress(),
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));
      const transactionId = response.transactionId;

      await tendermintSearchIndexUpdated();

      const result = await connection.getTx(transactionId);
      if (isFailedTransaction(result)) {
        throw new Error("Expected ConfirmedTransaction, received FailedTransaction");
      }
      const { transaction, primarySignature: signature } = result;
      const publicKey = transaction.creator.pubkey.data;
      const signingJob = bnsCodec.bytesToSign(transaction, signature.nonce);
      const txBytes = new Sha512(signingJob.bytes).digest();

      const valid = await Ed25519.verifySignature(signature.signature, txBytes, publicKey);
      expect(valid).toBe(true);

      connection.disconnect();
    });
  });

  describe("searchTx", () => {
    it("can search for transactions by tags", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, faucet } = await userProfileWithFaucet(chainId);
      const rcptAddress = await randomBnsAddress();

      // construct a sendtx, this is normally used in the MultiChainSigner api
      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: rcptAddress,
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const blockInfo = await response.blockInfo.waitFor(info => !isBlockInfoPending(info));
      expect(blockInfo.state).toEqual(TransactionState.Succeeded);

      await tendermintSearchIndexUpdated();

      // finds transaction using tag
      const results = (await connection.searchTx({ sentFromOrTo: rcptAddress })).filter(
        isConfirmedTransaction,
      );
      expect(results.length).toBeGreaterThanOrEqual(1);
      const mostRecentResultTransaction = results[results.length - 1].transaction;
      if (!isSendTransaction(mostRecentResultTransaction)) {
        throw new Error("Expected send transaction");
      }
      expect(mostRecentResultTransaction.memo).toEqual(memo);

      connection.disconnect();
    });

    it("can search for transactions by height", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, faucet } = await userProfileWithFaucet(chainId);
      const rcptAddress = await randomBnsAddress();

      // construct a sendtx, this is normally used in the MultiChainSigner api
      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: rcptAddress,
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const blockInfo = await response.blockInfo.waitFor(info => !isBlockInfoPending(info));
      expect(blockInfo.state).toBe(TransactionState.Succeeded);
      const txHeight = (blockInfo as BlockInfoSucceeded | BlockInfoFailed).height;

      await tendermintSearchIndexUpdated();

      // finds transaction using height
      const results = (await connection.searchTx({ height: txHeight })).filter(isConfirmedTransaction);
      expect(results.length).toBeGreaterThanOrEqual(1);
      const mostRecentResultTransaction = results[results.length - 1].transaction;
      if (!isSendTransaction(mostRecentResultTransaction)) {
        throw new Error("Expected send transaction");
      }
      expect(mostRecentResultTransaction.memo).toEqual(memo);

      connection.disconnect();
    });

    it("can search for transactions by ID", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, faucet } = await userProfileWithFaucet(chainId);

      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: await randomBnsAddress(),
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));
      const transactionIdToSearch = response.transactionId;

      await tendermintSearchIndexUpdated();

      // finds transaction using id
      const searchResults = (await connection.searchTx({ id: transactionIdToSearch })).filter(
        isConfirmedTransaction,
      );
      expect(searchResults.length).toEqual(1);
      expect(searchResults[0].transactionId).toEqual(transactionIdToSearch);
      const searchResultTransaction = searchResults[0].transaction;
      if (!isSendTransaction(searchResultTransaction)) {
        throw new Error("Expected send transaction");
      }
      expect(searchResultTransaction.memo).toEqual(memo);

      connection.disconnect();
    });

    // Fixed since tendermint v0.26.4
    // see issue https://github.com/tendermint/tendermint/issues/2759
    it("can search for transactions by minHeight/maxHeight", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();
      const initialHeight = await connection.height();

      const { profile, faucet } = await userProfileWithFaucet(chainId);
      const recipientAddress = await randomBnsAddress();

      // construct a sendtx, this is normally used in the MultiChainSigner api
      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: recipientAddress,
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));

      await tendermintSearchIndexUpdated();

      {
        // finds transaction using sentFromOrTo and minHeight = 1
        const results = (await connection.searchTx({ sentFromOrTo: recipientAddress, minHeight: 1 })).filter(
          isConfirmedTransaction,
        );
        expect(results.length).toBeGreaterThanOrEqual(1);
        const mostRecentResultTransaction = results[results.length - 1].transaction;
        if (!isSendTransaction(mostRecentResultTransaction)) {
          throw new Error("Expected send transaction");
        }
        expect(mostRecentResultTransaction.memo).toEqual(memo);
      }

      {
        // finds transaction using sentFromOrTo and minHeight = initialHeight
        const results = (await connection.searchTx({
          sentFromOrTo: recipientAddress,
          minHeight: initialHeight,
        })).filter(isConfirmedTransaction);
        expect(results.length).toBeGreaterThanOrEqual(1);
        const mostRecentResultTransaction = results[results.length - 1].transaction;
        if (!isSendTransaction(mostRecentResultTransaction)) {
          throw new Error("Expected send transaction");
        }
        expect(mostRecentResultTransaction.memo).toEqual(memo);
      }

      {
        // finds transaction using sentFromOrTo and maxHeight = 500 million
        const results = (await connection.searchTx({
          sentFromOrTo: recipientAddress,
          maxHeight: 500_000_000,
        })).filter(isConfirmedTransaction);
        expect(results.length).toBeGreaterThanOrEqual(1);
        const mostRecentResultTransaction = results[results.length - 1].transaction;
        if (!isSendTransaction(mostRecentResultTransaction)) {
          throw new Error("Expected send transaction");
        }
        expect(mostRecentResultTransaction.memo).toEqual(memo);
      }

      {
        // finds transaction using sentFromOrTo and maxHeight = initialHeight + 10
        const results = (await connection.searchTx({
          sentFromOrTo: recipientAddress,
          maxHeight: initialHeight + 10,
        })).filter(isConfirmedTransaction);
        expect(results.length).toBeGreaterThanOrEqual(1);
        const mostRecentResultTransaction = results[results.length - 1].transaction;
        if (!isSendTransaction(mostRecentResultTransaction)) {
          throw new Error("Expected send transaction");
        }
        expect(mostRecentResultTransaction.memo).toEqual(memo);
      }

      connection.disconnect();
    });

    it("reports DeliverTx errors for search by ID", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();
      const initialHeight = await connection.height();

      const { profile, walletId } = await userProfileWithFaucet(chainId);
      // this will never have tokens, but can try to sign
      const brokeIdentity = await profile.createIdentity(walletId, chainId, HdPaths.iov(1234));

      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: brokeIdentity,
        sender: bnsCodec.identityToAddress(brokeIdentity),
        recipient: await randomBnsAddress(),
        memo: "Sending from empty",
        amount: defaultAmount,
      });

      // give the broke Identity just enough to pay the fee
      await sendTokensFromFaucet(connection, identityToAddress(brokeIdentity), sendTx.fee!.tokens);

      const nonce = await connection.getNonce({ pubkey: brokeIdentity.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const transactionIdToSearch = response.transactionId;
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));

      await tendermintSearchIndexUpdated();

      const results = await connection.searchTx({ id: transactionIdToSearch });

      expect(results.length).toEqual(1);
      const result = results[0];
      if (!isFailedTransaction(result)) {
        throw new Error("Expected failed transaction");
      }
      expect(result.height).toBeGreaterThan(initialHeight);
      // https://github.com/iov-one/weave/blob/v0.15.0/errors/errors.go#L52
      expect(result.code).toEqual(13);
      expect(result.message).toMatch(/invalid amount/i);

      connection.disconnect();
    });
  });

  describe("listenTx", () => {
    it("can listen to transactions by hash", done => {
      pendingWithoutBnsd();

      (async () => {
        const connection = await BnsConnection.establish(bnsdTendermintUrl);
        const chainId = connection.chainId();

        const { profile, faucet } = await userProfileWithFaucet(chainId);

        const memo = `Payment ${Math.random()}`;
        const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
          kind: "bcp/send",
          creator: faucet,
          sender: bnsCodec.identityToAddress(faucet),
          recipient: await randomBnsAddress(),
          memo: memo,
          amount: defaultAmount,
        });

        const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
        const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
        const transactionId = bnsCodec.identifier(signed);
        const heightBeforeTransaction = await connection.height();

        // start listening
        const subscription = connection.listenTx({ id: transactionId }).subscribe({
          next: event => {
            if (!isConfirmedTransaction(event)) {
              done.fail("Confirmed transaction expected");
              return;
            }

            expect(event.transactionId).toEqual(transactionId);
            expect(event.height).toEqual(heightBeforeTransaction + 1);

            subscription.unsubscribe();
            connection.disconnect();
            done();
          },
          complete: () => done.fail("Stream completed before we are done"),
          error: done.fail,
        });

        // post transaction
        await connection.postTx(bnsCodec.bytesToPost(signed));
      })().catch(done.fail);
    });
  });

  describe("liveTx", () => {
    it("finds an existing transaction", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, faucet } = await userProfileWithFaucet(chainId);

      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: await randomBnsAddress(),
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const transactionIdToSearch = response.transactionId;
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));

      await tendermintSearchIndexUpdated();

      // finds transaction using id
      const result = await firstEvent(connection.liveTx({ id: transactionIdToSearch }));

      if (!isConfirmedTransaction(result)) {
        throw new Error("Expected confirmed transaction");
      }
      const searchResultTransaction = result.transaction;
      expect(result.transactionId).toEqual(transactionIdToSearch);
      if (!isSendTransaction(searchResultTransaction)) {
        throw new Error("Expected send transaction");
      }
      expect(searchResultTransaction.memo).toEqual(memo);

      connection.disconnect();
    });

    it("can wait for a future transaction", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, faucet } = await userProfileWithFaucet(chainId);

      const memo = `Payment ${Math.random()}`;
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: faucet,
        sender: bnsCodec.identityToAddress(faucet),
        recipient: await randomBnsAddress(),
        memo: memo,
        amount: defaultAmount,
      });

      const nonce = await connection.getNonce({ pubkey: faucet.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const transactionIdToSearch = response.transactionId;

      const result = await firstEvent(connection.liveTx({ id: transactionIdToSearch }));

      if (!isConfirmedTransaction(result)) {
        throw new Error("Expected confirmed transaction");
      }
      const searchResultTransaction = result.transaction;
      expect(result.transactionId).toEqual(transactionIdToSearch);
      if (!isSendTransaction(searchResultTransaction)) {
        throw new Error("Expected send transaction");
      }
      expect(searchResultTransaction.memo).toEqual(memo);

      connection.disconnect();
    });

    it("reports DeliverTx error for an existing transaction", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();
      const initialHeight = await connection.height();

      const { profile, walletId } = await userProfileWithFaucet(chainId);
      // this will never have tokens, but can try to sign
      const brokeIdentity = await profile.createIdentity(walletId, chainId, HdPaths.iov(1234));

      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: brokeIdentity,
        sender: bnsCodec.identityToAddress(brokeIdentity),
        recipient: await randomBnsAddress(),
        memo: "Sending from empty",
        amount: defaultAmount,
      });

      // give the broke Identity just enough to pay the fee
      await sendTokensFromFaucet(connection, identityToAddress(brokeIdentity), sendTx.fee!.tokens);

      const nonce = await connection.getNonce({ pubkey: brokeIdentity.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const transactionIdToSearch = response.transactionId;
      await response.blockInfo.waitFor(info => !isBlockInfoPending(info));

      await tendermintSearchIndexUpdated();

      const result = await firstEvent(connection.liveTx({ id: transactionIdToSearch }));

      if (!isFailedTransaction(result)) {
        throw new Error("Expected failed transaction");
      }
      expect(result.height).toBeGreaterThan(initialHeight);
      // https://github.com/iov-one/weave/blob/v0.15.0/errors/errors.go#L52
      expect(result.code).toEqual(13);
      expect(result.message).toMatch(/invalid amount/i);

      connection.disconnect();
    });

    it("reports DeliverTx error for a future transaction", async () => {
      pendingWithoutBnsd();
      const connection = await BnsConnection.establish(bnsdTendermintUrl);
      const chainId = connection.chainId();

      const { profile, walletId } = await userProfileWithFaucet(chainId);
      // this will never have tokens, but can try to sign
      const brokeIdentity = await profile.createIdentity(walletId, chainId, HdPaths.iov(1234));

      // Sending tokens from an empty account will trigger a failure in DeliverTx
      const sendTx = await connection.withDefaultFee<SendTransaction & WithCreator>({
        kind: "bcp/send",
        creator: brokeIdentity,
        sender: bnsCodec.identityToAddress(brokeIdentity),
        recipient: await randomBnsAddress(),
        memo: "Sending from empty",
        amount: defaultAmount,
      });

      // give the broke Identity just enough to pay the fee
      await sendTokensFromFaucet(connection, identityToAddress(brokeIdentity), sendTx.fee!.tokens);

      const nonce = await connection.getNonce({ pubkey: brokeIdentity.pubkey });
      const signed = await profile.signTransaction(sendTx, bnsCodec, nonce);
      const response = await connection.postTx(bnsCodec.bytesToPost(signed));
      const transactionIdToSearch = response.transactionId;

      const result = await firstEvent(connection.liveTx({ id: transactionIdToSearch }));

      if (!isFailedTransaction(result)) {
        throw new Error("Expected failed transaction");
      }
      // https://github.com/iov-one/weave/blob/v0.15.0/errors/errors.go#L52
      expect(result.code).toEqual(13);
      expect(result.message).toMatch(/invalid amount/i);

      connection.disconnect();
    });
  });

  // make sure we can get a reactive account balance (as well as nonce)
  it("can watch accounts", async () => {
    pendingWithoutBnsd();
    const connection = await BnsConnection.establish(bnsdTendermintUrl);
    const { profile, faucet } = await userProfileWithFaucet(connection.chainId());
    const recipientAddr = await randomBnsAddress();

    // watch account by pubkey and by address
    const faucetAccountStream = connection.watchAccount({ pubkey: faucet.pubkey });
    const recipientAccountStream = connection.watchAccount({ address: recipientAddr });

    // let's watch for all changes, capture them in a value sink
    const faucetAcct = lastValue<Account | undefined>(faucetAccountStream);
    const rcptAcct = lastValue<Account | undefined>(recipientAccountStream);

    // give it a chance to get initial feed before checking and proceeding
    await sleep(200);

    // make sure there are original values sent on the wire
    expect(rcptAcct.value()).toBeUndefined();
    expect(faucetAcct.value()).toBeDefined();
    expect(faucetAcct.value()!.balance.length).toEqual(2);
    const faucetStartBalance = faucetAcct.value()!.balance.find(({ tokenTicker }) => tokenTicker === cash)!;

    // send some cash
    const post = await sendCash(connection, profile, faucet, recipientAddr);
    await post.blockInfo.waitFor(info => !isBlockInfoPending(info));

    // give it a chance to get updates before checking and proceeding
    await sleep(100);

    // rcptAcct should now have a value
    expect(rcptAcct.value()).toBeDefined();
    expect(rcptAcct.value()!.balance.length).toEqual(1);
    expect(rcptAcct.value()!.balance.find(({ tokenTicker }) => tokenTicker === cash)!.quantity).toEqual(
      "68000000000",
    );

    // facuetAcct should have gone down a bit
    expect(faucetAcct.value()).toBeDefined();
    expect(faucetAcct.value()!.balance.length).toEqual(2);
    const faucetEndBalance = faucetAcct.value()!.balance.find(({ tokenTicker }) => tokenTicker === cash)!;
    expect(faucetEndBalance).not.toEqual(faucetStartBalance);
    expect(faucetEndBalance.quantity).toEqual(
      Long.fromString(faucetStartBalance.quantity)
        .subtract(68_000000000)
        .subtract(0_010000000) // the fee (0.01 CASH)
        .toString(),
    );

    connection.disconnect();
  });

  it("can register/transfer and update a username for an empty account", async () => {
    pendingWithoutBnsd();
    const connection = await BnsConnection.establish(bnsdTendermintUrl);
    const chainId = connection.chainId();

    const { profile, faucet, walletId } = await userProfileWithFaucet(chainId);
    const brokeAccountPath = HdPaths.iov(666);
    const user = await profile.createIdentity(walletId, chainId, brokeAccountPath);
    const userAddress = identityToAddress(user);
    const username = `user${Math.random()}*iov`;

    const userAccount = await connection.getAccount({ address: userAddress });
    if (userAccount && userAccount.balance.length) {
      throw new Error("Test should be run using empty account");
    }

    const initialTargets: readonly ChainAddressPair[] = [
      {
        chainId: "some-initial-chain" as ChainId,
        address: "some-initial-address" as Address,
      },
    ];
    const registerUsernameTx = await connection.withDefaultFee<RegisterUsernameTx & WithCreator>({
      kind: "bns/register_username",
      creator: faucet,
      username: username,
      targets: initialTargets,
    });
    const nonce1 = await connection.getNonce({ pubkey: faucet.pubkey });
    const signed1 = await profile.signTransaction(registerUsernameTx, bnsCodec, nonce1);
    const txBytes1 = bnsCodec.bytesToPost(signed1);
    const response1 = await connection.postTx(txBytes1);
    const blockInfo1 = await response1.blockInfo.waitFor(info => !isBlockInfoPending(info));
    expect(blockInfo1.state).toEqual(TransactionState.Succeeded);

    const transferUsernameTx = await connection.withDefaultFee<TransferUsernameTx & WithCreator>({
      kind: "bns/transfer_username",
      creator: faucet,
      username: username,
      newOwner: userAddress,
    });
    const nonce2 = await connection.getNonce({ pubkey: faucet.pubkey });
    const signed2 = await profile.signTransaction(transferUsernameTx, bnsCodec, nonce2);
    const txBytes2 = bnsCodec.bytesToPost(signed2);
    const response2 = await connection.postTx(txBytes2);
    const blockInfo2 = await response2.blockInfo.waitFor(info => !isBlockInfoPending(info));
    expect(blockInfo2.state).toEqual(TransactionState.Succeeded);

    const retrieved1 = await connection.getUsernames({ username: username });
    expect(retrieved1.length).toEqual(1);
    expect(retrieved1[0].owner).toEqual(userAddress);
    expect(retrieved1[0].targets).toEqual(initialTargets);

    const updatedTargets: readonly ChainAddressPair[] = [
      {
        chainId: "some-updated-chain" as ChainId,
        address: "some-updated-address" as Address,
      },
    ];
    const updateTargetsTx = await connection.withDefaultFee<UpdateTargetsOfUsernameTx & WithCreator>({
      kind: "bns/update_targets_of_username",
      creator: faucet,
      username: username,
      targets: updatedTargets,
    });
    const nonce3 = await connection.getNonce({ pubkey: faucet.pubkey });
    const signed3 = await profile.signTransaction(updateTargetsTx, bnsCodec, nonce3);
    const nonce4 = await connection.getNonce({ pubkey: user.pubkey });
    const doubleSigned = await profile.appendSignature(user, signed3, bnsCodec, nonce4);
    const txBytes3 = bnsCodec.bytesToPost(doubleSigned);
    const response3 = await connection.postTx(txBytes3);
    const blockInfo3 = await response3.blockInfo.waitFor(info => !isBlockInfoPending(info));
    expect(blockInfo3.state).toEqual(TransactionState.Succeeded);

    const retrieved2 = await connection.getUsernames({ username: username });
    expect(retrieved2.length).toEqual(1);
    expect(retrieved2[0].owner).toEqual(userAddress);
    expect(retrieved2[0].targets).toEqual(updatedTargets);

    connection.disconnect();
  });
});