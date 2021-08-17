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

const prepareProtobuffersBytes = () =>
	protobuf.loadSync('./generators/lisk_codec/proto_files/bytes.proto');

const { Bytes } = prepareProtobuffersBytes();

const generateValidBytesEncodings = () => {
	const input = {
		bytes: {
			object: {
				address: Buffer.from('e11a11364738225813f86ea85214400e5db08d6e', 'hex'),
			},
			schema: {
				$id: 'object9',
				type: 'object',
				properties: {
					address: {
						dataType: 'bytes',
						fieldNumber: 1,
					},
				},
			},
		},
		emptyBytes: {
			object: {
				address: Buffer.from(''),
			},
			schema: {
				$id: 'object10',
				type: 'object',
				properties: {
					address: {
						dataType: 'bytes',
						fieldNumber: 1,
					},
				},
			},
		},
	};

	const bytesEncoded = Bytes.encode(input.bytes.object).finish();
	const emptyBytesEncoded = Bytes.encode(input.emptyBytes.object).finish();

	return [
		{
			description: 'Encoding of chunk of bytes',
			input: input.bytes,
			output: { value: bytesEncoded },
		},
		{
			description: 'Encoding of empty bytes',
			input: input.emptyBytes,
			output: { value: emptyBytesEncoded },
		},
	];
};

module.exports = generateValidBytesEncodings;
