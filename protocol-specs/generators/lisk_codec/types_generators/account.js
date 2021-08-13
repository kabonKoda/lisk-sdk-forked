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

const protobuf = require('protobufjs');

const prepareProtobuffersBlock = () =>
	protobuf.loadSync('./generators/lisk_codec/proto_files/account.proto');

const { Account } = prepareProtobuffersBlock();

const accountSchema = {
	$id: 'accountSchema',
	type: 'object',
	properties: {
		address: { dataType: 'bytes', fieldNumber: 1 },
		balance: { dataType: 'uint64', fieldNumber: 2 },
		publicKey: { dataType: 'bytes', fieldNumber: 3 },
		nonce: { dataType: 'uint64', fieldNumber: 4 },
		keys: {
			fieldNumber: 5,
			type: 'object',
			properties: {
				numberOfSignatures: { dataType: 'uint32', fieldNumber: 1 },
				mandatoryKeys: {
					type: 'array',
					items: { dataType: 'bytes' },
					fieldNumber: 2,
				},
				optionalKeys: {
					type: 'array',
					items: { dataType: 'bytes' },
					fieldNumber: 3,
				},
			},
			required: ['numberOfSignatures', 'mandatoryKeys', 'optionalKeys'],
		},
		asset: {
			type: 'object',
			fieldNumber: 6,
			properties: {
				delegate: {
					type: 'object',
					fieldNumber: 1,
					properties: {
						username: { dataType: 'string', fieldNumber: 1 },
						pomHeights: {
							type: 'array',
							items: { dataType: 'uint32' },
							fieldNumber: 2,
						},
						consecutiveMissedBlocks: { dataType: 'uint32', fieldNumber: 3 },
						lastForgedHeight: { dataType: 'uint32', fieldNumber: 4 },
						isBanned: { dataType: 'boolean', fieldNumber: 5 },
						totalVotesReceived: { dataType: 'uint64', fieldNumber: 6 },
					},
					required: [
						'username',
						'pomHeights',
						'consecutiveMissedBlocks',
						'lastForgedHeight',
						'isBanned',
						'totalVotesReceived',
					],
				},
				sentVotes: {
					type: 'array',
					fieldNumber: 2,
					items: {
						type: 'object',
						properties: {
							delegateAddress: { dataType: 'bytes', fieldNumber: 1 },
							amount: { dataType: 'uint64', fieldNumber: 2 },
						},
						required: ['delegateAddress', 'amount'],
					},
				},
				unlocking: {
					type: 'array',
					fieldNumber: 3,
					items: {
						type: 'object',
						properties: {
							delegateAddress: { dataType: 'bytes', fieldNumber: 1 },
							amount: { dataType: 'uint64', fieldNumber: 2 },
							unvoteHeight: { dataType: 'uint32', fieldNumber: 3 },
						},
						required: ['delegateAddress', 'amount', 'unvoteHeight'],
					},
				},
			},
		},
	},
	required: ['address', 'balance', 'publicKey', 'nonce', 'keys', 'asset'],
};

const generateValidAccountEncodings = () => {
	const input = {
		validAccount1: {
			object: {
				address: Buffer.from('e11a11364738225813f86ea85214400e5db08d6e', 'hex'),
				balance: 10,
				publicKey: Buffer.from(
					'0fd3c50a6d3bd17ea806c0566cf6cf10f6e3697d9bda1820b00cb14746bcccef',
					'hex',
				),
				nonce: 5,
				keys: {
					numberOfSignatures: 2,
					mandatoryKeys: [
						Buffer.from('c8b8fbe474a2b63ccb9744a409569b0a465ee1803f80435aec1c5e7fc2d4ee18', 'hex'),
						Buffer.from('6115424fec0ce9c3bac5a81b5c782827d1f956fb95f1ccfa36c566d04e4d7267', 'hex'),
					],
					optionalKeys: [],
				},
				asset: {
					delegate: {
						username: 'Catullo',
						pomHeights: [85],
						consecutiveMissedBlocks: 32,
						lastForgedHeight: 64,
						isBanned: false,
						totalVotesReceived: 300000000,
					},
					sentVotes: [
						{
							delegateAddress: Buffer.from(
								'cd32c73e9851c7137980063b8af64aa5a31651f8dcad258b682d2ddf091029e4',
								'hex',
							),
							amount: 100000000,
						},
						{
							delegateAddress: Buffer.from(
								'9d86ad24a3f030e5522b6598115bb4d70c1692c9d8995ddfccb377379a2d86c6',
								'hex',
							),
							amount: 250000000,
						},
					],
					unlocking: [
						{
							delegateAddress: Buffer.from(
								'655e665765e3c42712d9a425b5b720d10457a5e45de0d4420e7c53ad73b02ef5',
								'hex',
							),
							amount: 400000000,
							unvoteHeight: 128,
						},
					],
				},
			},
			schema: accountSchema,
		},
		validAccount2: {
			object: {
				address: Buffer.from('cd32c73e9851c7137980063b8af64aa5a31651f8', 'hex'),
				balance: 0,
				publicKey: Buffer.alloc(0),
				nonce: 0,
				keys: {
					numberOfSignatures: 0,
					mandatoryKeys: [],
					optionalKeys: [],
				},
				asset: {
					delegate: {
						username: '',
						pomHeights: [],
						consecutiveMissedBlocks: 0,
						lastForgedHeight: 0,
						isBanned: false,
						totalVotesReceived: 0,
					},
					sentVotes: [],
					unlocking: [],
				},
			},
			schema: accountSchema,
		},
	};

	const validAccount1Encoded = Account.encode(input.validAccount1.object).finish();
	const validAccount2Encoded = Account.encode(input.validAccount2.object).finish();

	return [
		{
			description: 'Encoding of valid account 1',
			input: input.validAccount1,
			output: { value: validAccount1Encoded },
		},
		{
			description: 'Encoding of valid default account',
			input: input.validAccount2,
			output: { value: validAccount2Encoded },
		},
	];
};

module.exports = generateValidAccountEncodings;
