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

import {
	getRandomBytes,
	hash,
	getPrivateAndPublicKeyFromPassphrase,
	getAddressFromPublicKey,
} from '@liskhq/lisk-cryptography';
import { Mnemonic } from '@liskhq/lisk-passphrase';
import { MerkleTree } from '@liskhq/lisk-tree';
import { Block, BlockHeader, BlockHeaderAttrs, Transaction } from '@liskhq/lisk-chain';

export const defaultNetworkIdentifier = Buffer.from(
	'93d00fe5be70d90e7ae247936a2e7d83b50809c79b73fa14285f02c842348b3e',
	'hex',
);

export const genesisBlock = (): Block => {
	const header = new BlockHeader({
		generatorAddress: Buffer.alloc(0),
		assets: [],
		height: 0,
		version: 0,
		previousBlockID: Buffer.alloc(0),
		timestamp: Math.floor(Date.now() / 1000 - 24 * 60 * 60),
		stateRoot: hash(Buffer.alloc(0)),
		transactionRoot: hash(Buffer.alloc(0)),
		signature: Buffer.alloc(0),
	});

	return new Block(header, []);
};

const getKeyPair = (): { publicKey: Buffer; privateKey: Buffer } => {
	const passphrase = Mnemonic.generateMnemonic();
	return getPrivateAndPublicKeyFromPassphrase(passphrase);
};

export const createFakeBlockHeader = (header?: Partial<BlockHeaderAttrs>): BlockHeader =>
	new BlockHeader({
		version: 2,
		timestamp: header?.timestamp ?? 0,
		height: header?.height ?? 0,
		previousBlockID: header?.previousBlockID ?? hash(getRandomBytes(4)),
		transactionRoot: header?.transactionRoot ?? hash(getRandomBytes(4)),
		stateRoot: header?.stateRoot ?? hash(getRandomBytes(4)),
		generatorAddress: header?.generatorAddress ?? getRandomBytes(32),
		assets: [],
		signature: header?.signature ?? getRandomBytes(64),
	});

/**
 * Utility function to create a block object with valid computed properties while any property can be overridden
 * Calculates the signature, transactionRoot etc. internally. Facilitating the creation of block with valid signature and other properties
 */
export const createValidDefaultBlock = async (
	block?: { header?: Partial<BlockHeaderAttrs>; payload?: Transaction[] },
	networkIdentifier: Buffer = defaultNetworkIdentifier,
): Promise<Block> => {
	const keypair = getKeyPair();
	const payload = block?.payload ?? [];
	const txTree = new MerkleTree();
	await txTree.init(payload.map(tx => tx.id));

	const blockHeader = new BlockHeader({
		version: 2,
		height: 1,
		previousBlockID: genesisBlock().header.id,
		timestamp: 1000,
		transactionRoot: txTree.root,
		stateRoot: getRandomBytes(32),
		generatorAddress: getAddressFromPublicKey(keypair.publicKey),
		assets: [],
		...block?.header,
	});

	blockHeader.sign(networkIdentifier, keypair.privateKey);

	// Assigning the id ahead
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	blockHeader.id;
	return new Block(blockHeader, payload);
};
