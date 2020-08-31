/*
 * Copyright © 2020 Lisk Foundation
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

import { codec } from '@liskhq/lisk-codec';
import { RegisterTransactionAsset } from '../../../../../src/modules/dpos/transaction_assets/register_transaction_asset';
import { ValidationError } from '../../../../../src/errors';
import { ApplyAssetContext } from '../../../../../src/types';
import { createAccount, createFakeDefaultAccount } from '../../../../utils/node';
import { StateStoreMock } from '../../../../utils/node/state_store_mock';
import { RegisterTransactionAssetContext } from '../../../../../src/modules/dpos';
import { CHAIN_STATE_DELEGATE_USERNAMES } from '../../../../../src/modules/dpos/constants';

describe('RegisterTransactionAsset', () => {
	const lastBlockHeight = 200;
	let transactionAsset: RegisterTransactionAsset;
	let context: ApplyAssetContext<RegisterTransactionAssetContext>;
	let sender: any;
	let stateStoreMock: StateStoreMock;

	beforeEach(() => {
		sender = createFakeDefaultAccount(createAccount());
		stateStoreMock = new StateStoreMock([sender], {
			lastBlockHeaders: [{ height: lastBlockHeight }] as any,
		});
		transactionAsset = new RegisterTransactionAsset();
		context = {
			senderID: sender.address,
			asset: {
				username: 'delegate',
			},
			stateStore: stateStoreMock,
		} as any;

		jest.spyOn(stateStoreMock.account, 'get');
		jest.spyOn(stateStoreMock.account, 'set');
		jest.spyOn(stateStoreMock.chain, 'get');
		jest.spyOn(stateStoreMock.chain, 'set');
	});

	describe('constructor', () => {
		it('should have valid id', () => {
			expect(transactionAsset.id).toEqual(0);
		});

		it('should have valid name', () => {
			expect(transactionAsset.name).toEqual('register');
		});

		it('should have valid schema', () => {
			expect(transactionAsset.schema).toMatchSnapshot();
		});

		it('should have valid baseFee', () => {
			expect(transactionAsset.baseFee).toEqual(BigInt(1000000000));
		});
	});

	describe('#validate', () => {
		it('should not throw error if valid username is provided', () => {
			// Arrange
			const asset: RegisterTransactionAssetContext = { username: 'obelisk' };
			const error = new ValidationError('The username is in unsupported format', 'obelisk');

			// Act & Assert
			expect(() => transactionAsset.validate({ asset } as any)).not.toThrow(error);
		});

		it('should throw error when username includes capital letter', () => {
			// Arrange
			const asset: RegisterTransactionAssetContext = { username: 'Obelisk' };
			const error = new ValidationError('The username is in unsupported format', 'Obelisk');

			// Act & Assert
			expect(() => transactionAsset.validate({ asset } as any)).toThrow(error);
		});

		it('should throw error when username includes forbidden character', () => {
			// Arrange
			const asset: RegisterTransactionAssetContext = { username: 'obe^lis' };

			// Act & Assert
			expect(() => transactionAsset.validate({ asset } as any)).toThrowErrorMatchingSnapshot();
		});

		it('should throw error when username includes forbidden null character', () => {
			// Arrange
			const asset: RegisterTransactionAssetContext = { username: 'obe\0lisk' };
			const error = new ValidationError('The username is in unsupported format', 'obe\0lisk');

			// Act & Assert
			expect(() => transactionAsset.validate({ asset } as any)).toThrow(error);
		});
	});

	describe('#apply', () => {
		it('should call state store', async () => {
			// Act
			await transactionAsset.apply(context);

			// Assert
			expect(stateStoreMock.account.get).toHaveBeenCalledWith(context.senderID);
			expect(stateStoreMock.account.set).toHaveBeenCalledWith(sender.address, {
				...sender,
				dpos: {
					...sender.dpos,
					delegate: {
						...sender.dpos.delegate,
						username: context.asset.username,
					},
				},
			});
		});

		it('should not throw errors', async () => {
			// Act
			stateStoreMock.account.set(
				sender.address,
				createFakeDefaultAccount({ address: sender.address }),
			);

			// Act & Assert
			await expect(transactionAsset.apply(context)).resolves.toBeUndefined();
		});

		it('should throw error when username is taken', async () => {
			const delegatesUserNamesSchema = {
				$id: '/dpos/userNames',
				type: 'object',
				properties: {
					registeredDelegates: {
						type: 'array',
						fieldNumber: 1,
						items: {
							type: 'object',
							properties: {
								username: {
									dataType: 'string',
									fieldNumber: 1,
								},
								address: {
									dataType: 'bytes',
									fieldNumber: 2,
								},
							},
						},
					},
				},
				required: ['registeredDelegates'],
			};

			const secondAccount = createFakeDefaultAccount({ asset: { delegate: 'myuser' } });
			stateStoreMock.account.set(secondAccount.address, secondAccount);
			context.asset = { username: 'myuser' };

			stateStoreMock.chain.set(
				CHAIN_STATE_DELEGATE_USERNAMES,
				codec.encode(delegatesUserNamesSchema, {
					registeredDelegates: [
						{
							username: context.asset.username,
							address: Buffer.from('random'),
						},
					],
				}),
			);

			await expect(transactionAsset.apply(context)).rejects.toThrow('Username is not unique');
		});

		it('should throw error when account is already delegate', async () => {
			const defaultVal = createFakeDefaultAccount({});
			stateStoreMock.account.set(
				sender.address,
				createFakeDefaultAccount({
					address: sender.address,
					dpos: {
						delegate: {
							...defaultVal.dpos.delegate,
							username: 'alreadydelegate',
						},
					},
				}),
			);

			await expect(transactionAsset.apply(context)).rejects.toThrow(
				'Account is already a delegate',
			);
		});

		it('should set lastForgedHeight to the lastBlock height + 1', async () => {
			// Arrange
			stateStoreMock.account.set(
				sender.address,
				createFakeDefaultAccount({ address: sender.address }),
			);

			// Act
			await transactionAsset.apply(context);

			// Assert
			const updatedSender = (await stateStoreMock.account.get(sender.address)) as any;
			expect(updatedSender.dpos.delegate.lastForgedHeight).toEqual(lastBlockHeight + 1);
		});
	});
});
