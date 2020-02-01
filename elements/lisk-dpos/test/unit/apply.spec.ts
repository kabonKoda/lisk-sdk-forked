/*
 * Copyright © 2019 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { when } from 'jest-when';
import { Dpos, constants } from '../../src';
import { Slots } from '../../../lisk-blocks/src/slots';
import { Block, Account, ForgersList } from '../../src/types';
import {
	BLOCK_TIME,
	ACTIVE_DELEGATES,
	EPOCH_TIME,
	DELEGATE_LIST_ROUND_OFFSET,
} from '../fixtures/constants';
import { randomInt } from '../utils/random_int';
import {
	delegateAccounts,
	sortedDelegateAccounts,
	delegatesWhoForged,
	delegatesWhoForgedNone,
	uniqueDelegatesWhoForged,
	delegatesWhoForgedOnceMissedOnce,
	delegateWhoForgedLast,
	votedDelegates,
	// votedDelegates,
} from '../utils/round_delegates';
import { CHAIN_STATE_FORGERS_LIST_KEY } from '../../src/constants';
import { StateStoreMock } from '../utils/state_store_mock';
import { getAddressFromPublicKey } from '@liskhq/lisk-cryptography';

describe('dpos.apply()', () => {
	const stubs = {} as any;
	let dpos: Dpos;
	let stateStore: StateStoreMock;

	beforeEach(() => {
		// Arrange
		stubs.storage = {
			entities: {
				Account: {
					get: jest.fn().mockResolvedValue([]),
					update: jest.fn(),
				},
				Block: {
					get: jest.fn().mockResolvedValue([]),
				},
			},
		};

		stubs.logger = {
			debug: jest.fn(),
			log: jest.fn(),
			error: jest.fn(),
		};

		const slots = new Slots({ epochTime: EPOCH_TIME, interval: BLOCK_TIME });
		const blocks = {
			slots,
		};

		dpos = new Dpos({
			blocks,
			...stubs,
			activeDelegates: ACTIVE_DELEGATES,
			delegateListRoundOffset: DELEGATE_LIST_ROUND_OFFSET,
		});

		stateStore = new StateStoreMock([...sortedDelegateAccounts], {});
	});

	describe('Given block is the genesis block (height === 1)', () => {
		let genesisBlock: Block;
		let stateStore: StateStoreMock;
		let generator: Account;

		beforeEach(() => {
			generator = { ...delegateAccounts[0] };
			// Arrange
			genesisBlock = {
				height: 1,
				generatorPublicKey: generator.publicKey,
			} as Block;

			stateStore = new StateStoreMock(
				[generator, ...sortedDelegateAccounts],
				{},
			);

			when(stubs.storage.entities.Account.get)
				.calledWith(
					{
						isDelegate: true,
					},
					{
						limit: ACTIVE_DELEGATES,
						sort: ['voteWeight:desc', 'publicKey:asc'],
					},
				)
				.mockReturnValue([]);
		});

		it('should save round 1 + round offset active delegates list in chain state by using delegate accounts', async () => {
			// Act
			await dpos.apply(genesisBlock, stateStore);

			// Assert
			expect(stubs.storage.entities.Account.get).toHaveBeenCalledWith(
				{ isDelegate: true },
				{
					limit: ACTIVE_DELEGATES,
					sort: ['voteWeight:desc', 'publicKey:asc'],
				},
			);
			let forgerslList = [];
			for (let i = 0; i <= DELEGATE_LIST_ROUND_OFFSET; i++) {
				forgerslList.push({
					round: i + 1,
					delegates: sortedDelegateAccounts.map(d => d.publicKey),
				});
			}
			expect(stateStore.chainStateData).toEqual({
				[CHAIN_STATE_FORGERS_LIST_KEY]: JSON.stringify(forgerslList),
			});
		});

		it('should resolve with "false"', async () => {
			// Act
			const result = await dpos.apply(genesisBlock, stateStore);

			// Assert
			expect(result).toBe(false);
		});

		it('should update "producedBlocks" but NOT update "missedBlocks", "voteWeight", "rewards", "fees"', async () => {
			// Act
			await dpos.apply(genesisBlock, stateStore);

			const generatorAccount = await stateStore.account.get(generator.address);
			expect(generatorAccount).toEqual({
				...generator,
				producedBlocks: 1,
			});
		});
	});

	describe('Given block height is greater than "1" (NOT the genesis block)', () => {
		let generator: Account;
		let block: Block;

		beforeEach(() => {
			generator = { ...delegateAccounts[1] };
			// Arrange
			block = {
				height: 2,
				generatorPublicKey: generator.publicKey,
			} as Block;

			when(stubs.storage.entities.Account.get)
				.calledWith(
					{
						isDelegate: true,
					},
					{
						limit: ACTIVE_DELEGATES,
						sort: ['voteWeight:desc', 'publicKey:asc'],
					},
				)
				.mockReturnValue(sortedDelegateAccounts);
		});

		it('should increase "producedBlocks" field by "1" for the generator delegate', async () => {
			// Act
			await dpos.apply(block, stateStore);

			const generatorAccount = await stateStore.account.get(generator.address);
			expect(generatorAccount).toEqual({
				...generator,
				producedBlocks: 1,
			});
		});
	});

	describe('Given block is NOT the last block of the round', () => {
		let generator: Account;
		let block: Block;
		let forgersList: ForgersList;

		beforeEach(() => {
			generator = { ...delegateAccounts[1] };
			// Arrange
			block = {
				height: 2,
				generatorPublicKey: generator.publicKey,
			} as Block;

			forgersList = [
				{
					round: 1,
					delegates: sortedDelegateAccounts.map(d => d.publicKey),
				},
				{
					round: 2,
					delegates: sortedDelegateAccounts.map(d => d.publicKey),
				},
			];

			stateStore = new StateStoreMock([generator], {
				[CHAIN_STATE_FORGERS_LIST_KEY]: JSON.stringify(forgersList),
			});

			when(stubs.storage.entities.Account.get)
				.calledWith(
					{
						isDelegate: true,
					},
					{
						limit: ACTIVE_DELEGATES,
						sort: ['voteWeight:desc', 'publicKey:asc'],
					},
				)
				.mockReturnValue(sortedDelegateAccounts);
		});

		it('should NOT update "missedBlocks", "voteWeight", "rewards", "fees"', async () => {
			// Act
			await dpos.apply(block, stateStore);

			const generatorAccount = await stateStore.account.get(generator.address);
			// Assert
			expect(generatorAccount).toEqual({
				...generator,
				producedBlocks: 1,
			});
		});

		it('should NOT update forgers list', async () => {
			// Act
			await dpos.apply(block, stateStore);

			// Assert
			const chainState = await stateStore.chainState.get(
				CHAIN_STATE_FORGERS_LIST_KEY,
			);
			expect(chainState).toEqual(JSON.stringify(forgersList));
		});
	});

	describe('Given block is the last block of the round', () => {
		let lastBlockOfTheRoundNine: Block;
		let feePerDelegate: bigint;
		let rewardPerDelegate: bigint;
		let totalFee: bigint;
		let getTotalEarningsOfDelegate: (
			account: Account,
		) => { reward: bigint; fee: bigint; blockCount: number };

		beforeEach(() => {
			stateStore = new StateStoreMock(
				[...delegateAccounts, ...votedDelegates],
				{
					[CHAIN_STATE_FORGERS_LIST_KEY]: JSON.stringify([
						{
							round: 7,
							delegates: sortedDelegateAccounts.map(d => d.publicKey),
						},
						{
							round: 8,
							delegates: sortedDelegateAccounts.map(d => d.publicKey),
						},
						{
							round: 9,
							delegates: sortedDelegateAccounts.map(d => d.publicKey),
						},
						{
							round: 10,
							delegates: sortedDelegateAccounts.map(d => d.publicKey),
						},
					]),
				},
			);
			when(stubs.storage.entities.Account.get)
				.calledWith(
					{
						isDelegate: true,
					},
					{
						limit: ACTIVE_DELEGATES,
						sort: ['voteWeight:desc', 'publicKey:asc'],
					},
				)
				.mockReturnValue(sortedDelegateAccounts);

			feePerDelegate = BigInt(randomInt(10, 100));
			totalFee = feePerDelegate * BigInt(ACTIVE_DELEGATES);

			// Delegates who forged got their rewards
			rewardPerDelegate = BigInt(randomInt(1, 20));

			getTotalEarningsOfDelegate = account => {
				const blockCount = delegatesWhoForged.filter(
					d => d.publicKey === account.publicKey,
				).length;
				const reward = rewardPerDelegate * BigInt(blockCount);
				const fee = feePerDelegate * BigInt(blockCount);
				return {
					blockCount,
					reward,
					fee,
				};
			};

			const forgedBlocks = delegatesWhoForged.map((delegate, i) => ({
				generatorPublicKey: delegate.publicKey,
				totalFee: feePerDelegate,
				reward: rewardPerDelegate,
				height: 809 + i,
			}));
			forgedBlocks.splice(forgedBlocks.length - 1);

			lastBlockOfTheRoundNine = {
				height: 909,
				generatorPublicKey: delegateWhoForgedLast.publicKey,
				totalFee: feePerDelegate,
				reward: rewardPerDelegate,
			} as Block;

			stubs.storage.entities.Block.get.mockReturnValue(forgedBlocks);
		});

		it('should increase "missedBlocks" field by "1" for the delegates who did not forge in the round', async () => {
			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect.assertions(delegatesWhoForgedNone.length);
			for (const delegate of delegatesWhoForgedNone) {
				const { missedBlocks } = await stateStore.account.get(delegate.address);
				expect(missedBlocks).toEqual(1);
			}
		});

		it('should distribute rewards and fees ONLY to the delegates who forged', async () => {
			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect.assertions(ACTIVE_DELEGATES * 2);

			// Assert Group 1/2
			for (const delegate of uniqueDelegatesWhoForged) {
				const { reward, fee } = getTotalEarningsOfDelegate(delegate);
				const { rewards, fees } = await stateStore.account.get(
					delegate.address,
				);
				expect(rewards).toEqual((BigInt(delegate.rewards) + reward).toString());
				expect(fees).toEqual((BigInt(delegate.fees) + fee).toString());
			}

			// Assert Group 2/2
			for (const delegate of delegatesWhoForgedNone) {
				const { rewards, fees } = await stateStore.account.get(
					delegate.address,
				);
				expect(rewards).toEqual(delegate.rewards);
				expect(fees).toEqual(delegate.fees);
			}
		});

		it('should distribute reward and fee for delegate who forged once but missed once', async () => {
			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect.assertions(delegatesWhoForgedOnceMissedOnce.length * 2);
			for (const delegate of delegatesWhoForgedOnceMissedOnce) {
				const { rewards, fees } = await stateStore.account.get(
					delegate.address,
				);
				const { reward, fee } = getTotalEarningsOfDelegate(delegate);

				expect(rewards).toEqual((BigInt(delegate.rewards) + reward).toString());
				expect(fees).toEqual((BigInt(delegate.fees) + fee).toString());
			}
		});

		it('should distribute more rewards and fees (with correct balance) to delegates based on number of blocks they forged', async () => {
			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect.assertions(uniqueDelegatesWhoForged.length * 3);
			for (const delegate of uniqueDelegatesWhoForged) {
				const { fee, reward } = getTotalEarningsOfDelegate(delegate);
				const amount = fee + reward;
				const data = {
					balance: (BigInt(delegate.balance) + amount).toString(),
					fees: (BigInt(delegate.fees) + fee).toString(),
					rewards: (BigInt(delegate.rewards) + reward).toString(),
				};
				const account = await stateStore.account.get(delegate.address);

				expect(account.fees).toEqual(data.fees);
				expect(account.rewards).toEqual(data.rewards);
				expect(account.balance).toEqual(data.balance);
			}
		});

		it('should give the remainingFee ONLY to the last delegate of the round who forged', async () => {
			// Arrange
			const remainingFee = randomInt(5, 10);
			const forgedBlocks = delegatesWhoForged.map((delegate, i) => ({
				generatorPublicKey: delegate.publicKey,
				totalFee: feePerDelegate,
				reward: rewardPerDelegate,
				height: 809 + i,
			}));

			lastBlockOfTheRoundNine = {
				height: 909,
				generatorPublicKey: delegateWhoForgedLast.publicKey,
				totalFee: BigInt(feePerDelegate) + BigInt(remainingFee),
				reward: rewardPerDelegate,
			} as Block;
			forgedBlocks.splice(forgedBlocks.length - 1);

			stubs.storage.entities.Block.get.mockReturnValue(forgedBlocks);

			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect.assertions(uniqueDelegatesWhoForged.length);
			const lastDelegate = await stateStore.account.get(
				delegateWhoForgedLast.address,
			);
			expect(lastDelegate.fees).toEqual(
				(
					BigInt(delegateWhoForgedLast.fees) +
					feePerDelegate * BigInt(3) +
					BigInt(remainingFee)
				).toString(),
			);

			for (const delegate of uniqueDelegatesWhoForged) {
				if (delegate.address === delegateWhoForgedLast.address) {
					continue;
				}
				const account = await stateStore.account.get(delegate.address);
				const blockCount = delegatesWhoForged.filter(
					d => d.publicKey === account.publicKey,
				).length;
				expect(account.fees).toEqual(
					(
						BigInt(delegate.fees) +
						feePerDelegate * BigInt(blockCount)
					).toString(),
				);
			}
		});

		it('should update vote weight of accounts that delegates who forged voted for', async () => {
			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			const publicKeysToUpdate = uniqueDelegatesWhoForged.reduce(
				(accumulator: any, account) => {
					const { fee, reward } = getTotalEarningsOfDelegate(account);
					account.votedDelegatesPublicKeys.forEach(publicKey => {
						if (accumulator[publicKey]) {
							accumulator[publicKey] = accumulator[publicKey] + fee + reward;
						} else {
							accumulator[publicKey] = fee + reward;
						}
					});
					return accumulator;
				},
				{},
			);

			for (const publicKey of Object.keys(publicKeysToUpdate)) {
				const amount = publicKeysToUpdate[publicKey].toString();
				const account = await stateStore.account.get(
					getAddressFromPublicKey(publicKey),
				);
				// Assert
				expect(account.voteWeight).toEqual(amount);
			}
		});

		it('should save next round + roundOffset active delegates list in frogers list after applying last block of round', async () => {
			// Arrange
			const currentRound = dpos.rounds.calcRound(
				lastBlockOfTheRoundNine.height,
			);
			const nextRound = dpos.rounds.calcRound(
				lastBlockOfTheRoundNine.height + 1,
			);

			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			// make sure we calculate round number correctly
			expect(nextRound).toBe(currentRound + 1);
			// we must delete the delegate list before creating the new one
			const forgersListStr = await stateStore.chainState.get(
				CHAIN_STATE_FORGERS_LIST_KEY,
			);
			const forgersList: ForgersList = JSON.parse(forgersListStr as string);

			const forgers = forgersList.find(
				fl => fl.round === currentRound + DELEGATE_LIST_ROUND_OFFSET,
			);

			expect(forgers?.round).toEqual(currentRound + DELEGATE_LIST_ROUND_OFFSET);
		});

		it('should delete RoundDelegates entities older than (finalizedBlockRound - 2)', async () => {
			// Arrange
			const finalizedBlockHeight = 1213;
			const finalizedBlockRound = Math.ceil(
				finalizedBlockHeight / ACTIVE_DELEGATES,
			);
			const bftRoundOffset = 2; // TODO: get from BFT constants
			const delegateActiveRoundLimit = 3;
			const expectedRound =
				finalizedBlockRound - bftRoundOffset - delegateActiveRoundLimit;

			// Check before finalize exist for test
			const forgersListBeforeStr = await stateStore.chainState.get(
				CHAIN_STATE_FORGERS_LIST_KEY,
			);
			const forgersBeforeList: ForgersList = JSON.parse(
				forgersListBeforeStr as string,
			);
			const filteredForgersBefore = forgersBeforeList.filter(
				fl => fl.round < expectedRound,
			);
			expect(filteredForgersBefore).toHaveLength(1);

			// Act
			await dpos.onBlockFinalized(stateStore, finalizedBlockHeight);

			const forgersListStr = await stateStore.chainState.get(
				CHAIN_STATE_FORGERS_LIST_KEY,
			);
			const forgersList: ForgersList = JSON.parse(forgersListStr as string);

			const filteredForgers = forgersList.filter(
				fl => fl.round < expectedRound,
			);

			// Assert
			expect(filteredForgers).toHaveLength(0);
		});

		it('should should emit EVENT_ROUND_CHANGED', async () => {
			// Arrange
			const eventCallback = jest.fn();
			const oldRound = lastBlockOfTheRoundNine.height / ACTIVE_DELEGATES;
			(dpos as any).events.on(constants.EVENT_ROUND_CHANGED, eventCallback);

			// Act
			await dpos.apply(lastBlockOfTheRoundNine, stateStore);

			// Assert
			expect(eventCallback).toHaveBeenCalledWith({
				oldRound,
				newRound: oldRound + 1,
			});
		});

		describe('When all delegates successfully forges a block', () => {
			it('should NOT update "missedBlocks" for anyone', async () => {
				// Arrange
				const forgedBlocks = delegatesWhoForged.map((delegate, i) => ({
					generatorPublicKey: delegate.publicKey,
					totalFee: feePerDelegate,
					reward: rewardPerDelegate,
					height: 809 + i,
				}));
				forgedBlocks.splice(forgedBlocks.length - 1);

				stubs.storage.entities.Block.get.mockReturnValue(forgedBlocks);

				when(stubs.storage.entities.Account.get)
					.calledWith(
						{
							publicKey_in: delegateAccounts.map(({ publicKey }) => publicKey),
						},
						{},
						stubs.tx,
					)
					.mockResolvedValue(delegateAccounts as never);

				// Act
				await dpos.apply(lastBlockOfTheRoundNine, stateStore);
				expect.assertions(delegatesWhoForged.length);
				for (const delegate of delegatesWhoForged) {
					expect(delegate.missedBlocks).toEqual(0);
				}
			});
		});

		describe('When summarizing round fails', () => {
			it('should throw the error message coming from summedRound method and not perform any update', async () => {
				// Arrange
				const err = new Error('dummyError');
				stubs.storage.entities.Block.get.mockRejectedValue(err);

				// Act && Assert
				await expect(
					dpos.apply(lastBlockOfTheRoundNine, stateStore),
				).rejects.toBe(err);
			});
		});

		// Reference: https://github.com/LiskHQ/lisk-sdk/issues/2423
		describe('When summarizing round return value which is greater than Number.MAX_SAFE_INTEGER ', () => {
			beforeEach(async () => {
				feePerDelegate =
					BigInt(Number.MAX_SAFE_INTEGER.toString()) +
					BigInt(randomInt(10, 1000));
				totalFee = BigInt(feePerDelegate) * BigInt(ACTIVE_DELEGATES);

				rewardPerDelegate =
					BigInt(Number.MAX_SAFE_INTEGER.toString()) +
					BigInt(randomInt(10, 1000));

				const forgedBlocks = delegatesWhoForged.map((delegate, i) => ({
					generatorPublicKey: delegate.publicKey,
					totalFee: feePerDelegate,
					reward: rewardPerDelegate,
					height: 809 + i,
				}));
				forgedBlocks.splice(forgedBlocks.length - 1);

				lastBlockOfTheRoundNine = {
					height: 909,
					generatorPublicKey: delegateWhoForgedLast.publicKey,
					totalFee: feePerDelegate,
					reward: rewardPerDelegate,
				} as Block;

				stubs.storage.entities.Block.get.mockReturnValue(forgedBlocks);

				getTotalEarningsOfDelegate = account => {
					const blockCount = delegatesWhoForged.filter(
						d => d.publicKey === account.publicKey,
					).length;
					const reward = BigInt(rewardPerDelegate) * BigInt(blockCount);
					const fee = BigInt(feePerDelegate) * BigInt(blockCount);
					return {
						blockCount,
						reward,
						fee,
					};
				};
			});

			it('should update vote weight of accounts that delegates with correct balance', async () => {
				// Act
				await dpos.apply(lastBlockOfTheRoundNine, stateStore);

				const publicKeysToUpdate = uniqueDelegatesWhoForged.reduce(
					(accumulator: any, account) => {
						const { fee, reward } = getTotalEarningsOfDelegate(account);
						account.votedDelegatesPublicKeys.forEach(publicKey => {
							if (accumulator[publicKey]) {
								accumulator[publicKey] = accumulator[publicKey] + fee + reward;
							} else {
								accumulator[publicKey] = fee + reward;
							}
						});
						return accumulator;
					},
					{},
				);

				// Assert
				expect.assertions(publicKeysToUpdate.length);
				for (const publicKey of Object.keys(publicKeysToUpdate)) {
					const amount = publicKeysToUpdate[publicKey].toString();
					const account = await stateStore.account.get(
						getAddressFromPublicKey(publicKey),
					);
					expect(account.voteWeight).toEqual(amount);
				}
			});
		});

		describe('Given the provided block is in an exception round', () => {
			let exceptionFactors: { [key: string]: number };
			beforeEach(() => {
				// Arrange
				exceptionFactors = {
					rewards_factor: 2,
					fees_factor: 2,
					// setting bonus to a dividable amount
					fees_bonus: ACTIVE_DELEGATES * 123,
				};
				const exceptionRound = (dpos as any).rounds.calcRound(
					lastBlockOfTheRoundNine.height,
				);
				const exceptions = {
					rounds: {
						[exceptionRound]: exceptionFactors,
					},
				};

				const slots = new Slots({
					epochTime: EPOCH_TIME,
					interval: BLOCK_TIME,
				});
				const blocks = {
					slots,
				};

				dpos = new Dpos({
					blocks,
					...stubs,
					activeDelegates: ACTIVE_DELEGATES,
					delegateListRoundOffset: DELEGATE_LIST_ROUND_OFFSET,
					exceptions,
				});
			});

			it('should multiply delegate reward with "rewards_factor"', async () => {
				// Act
				await dpos.apply(lastBlockOfTheRoundNine, stateStore);

				// Assert
				expect.assertions(uniqueDelegatesWhoForged.length);
				for (const delegate of uniqueDelegatesWhoForged) {
					const { reward } = getTotalEarningsOfDelegate(delegate);
					const exceptionReward =
						reward * BigInt(exceptionFactors.rewards_factor);
					const expectedReward = (
						BigInt(delegate.rewards) + exceptionReward
					).toString();
					const account = await stateStore.account.get(delegate.address);
					expect(account.rewards).toEqual(expectedReward);
				}
			});

			it('should multiply "totalFee" with "fee_factor" and add "fee_bonus"', async () => {
				// Act
				await dpos.apply(lastBlockOfTheRoundNine, stateStore);
				expect.assertions(uniqueDelegatesWhoForged.length);
				for (const delegate of uniqueDelegatesWhoForged) {
					const blockCount = delegatesWhoForged.filter(
						d => d.publicKey === delegate.publicKey,
					).length;

					const exceptionTotalFee: bigint =
						totalFee * BigInt(exceptionFactors.fees_factor) +
						BigInt(exceptionFactors.fees_bonus);

					const earnedFee =
						(exceptionTotalFee / BigInt(ACTIVE_DELEGATES)) * BigInt(blockCount);
					const expectedFee = (BigInt(delegate.fees) + earnedFee).toString();
					const account = await stateStore.account.get(delegate.address);

					expect(account.fees).toEqual(expectedFee);
				}
			});
		});
	});
});
