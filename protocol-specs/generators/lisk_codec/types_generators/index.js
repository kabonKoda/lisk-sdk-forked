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
const generateValidBooleanEncodings = require('./booleans');
const generateValidNumberEncodings = require('./numbers');
const generateValidBytesEncodings = require('./bytes');
const generateValidObjectEncodings = require('./objects');
const generateValidArrayEncodings = require('./arrays');
const generateValidBlock = require('./block');
const generateValidGenesisBlock = require('./genesis_block_asset');
const generateValidBlockHeader = require('./block_header');
const generateValidBlockAsset = require('./block_asset');
const generateValidAccount = require('./account');
const generateValidTransaction = require('./transaction');
const generateCartEncodings = require('./cart_sample');
const generatePeerInfoEncodings = require('./peer_sample');
const generateNestedArrayEncodings = require('./nestest_array');
const string = require('./strings');

module.exports = {
	...string,
	generateValidBooleanEncodings,
	generateValidNumberEncodings,
	generateValidBytesEncodings,
	generateValidObjectEncodings,
	generateValidArrayEncodings,
	generateValidBlock,
	generateValidGenesisBlock,
	generateValidBlockHeader,
	generateValidBlockAsset,
	generateValidAccount,
	generateValidTransaction,
	generateCartEncodings,
	generatePeerInfoEncodings,
	generateNestedArrayEncodings,
};
