/* eslint-disable */
const { Application, Transaction } = require('lisk-framework');
const {
	getAddressAndPublicKeyFromPassphrase,
	getAddressFromPassphrase,
	getRandomBytes,
} = require('@liskhq/lisk-cryptography');
const { createIPCClient } = require('@liskhq/lisk-api-client');
const { codec } = require('@liskhq/lisk-codec');
const { Mnemonic } = require('@liskhq/lisk-passphrase');
const genesisBlock = require('./src/samples/genesis_block_devnet.json');
const config = require('./src/samples/config_devnet.json');
const { PerformanceObserver, performance } = require('perf_hooks');

const passphrase =
	'peanut hundred pen hawk invite exclude brain chunk gadget wait wrong ready';

let measurement = [];

const obs = new PerformanceObserver((items) => {
	// console.log(items.getEntries()[0].duration);
	measurement.push(items.getEntries()[0].duration);
	performance.clearMarks();
});
obs.observe({ entryTypes: ['measure'] });

const showResultAndClear = (title) => {
	const sum = measurement.reduce((prev, curr) => {
		return prev + curr;
	}, 0);
	const average = sum / measurement.length;
	const trial = measurement.length;
	const max = Math.max(...measurement);
	const min = Math.min(...measurement);
	console.info({
		title,
		average,
		trial,
		max,
		min,
	});
	measurement = [];
};

const tryCount = 10;
const numberOfAccounts = 118;

const accounts = new Array(numberOfAccounts).fill().map(() => {
	const pass = Mnemonic.generateMnemonic();
	const addressAndPK = getAddressAndPublicKeyFromPassphrase(pass);
	return {
		...addressAndPK,
		passphrase: pass,
	};
});

let app;

const prepare = async () => {
	config.rootPath = __dirname;
	config.label = 'benchmark';
	config.logger.consoleLogLevel = 'error';
	config.genesisConfig.maxPayloadLength = 1024 * 300;
	app = Application.defaultApplication(genesisBlock, config);
	await app.run();
	app._node._forgingJob.stop();
	return app._node;
};

const createBlock = async (node, transactions = []) => {
	const currentSlot =
		node._chain.slots.getSlotNumber(node._chain.lastBlock.header.timestamp) + 1;
	const timestamp = node._chain.slots.getSlotTime(currentSlot);
	const validator = await node._chain.getValidator(timestamp);
	const validatorKeypair = node._forger._keypairs.get(validator.address);

	return node._forger._create({
		transactions,
		keypair: validatorKeypair,
		timestamp,
		seedReveal: getRandomBytes(16),
		previousBlock: node._chain.lastBlock,
	});
};

const measureProcessing = async (title, node, txCreate) => {
	for (let i = 0; i < tryCount; i += 1) {
		const transactions = await txCreate(i);
		const block = await createBlock(node, transactions);
		performance.mark('Start');
		await node._processor.process(block);
		performance.mark('End');
		performance.measure('Start to End', 'Start', 'End');
		console.log(title, { trial: i });
	}
	showResultAndClear(title);
};

// Forge 100 empty blocks
const measureEmptyBlock = async (node) => {
	await measureProcessing('Empty blocks', node, () => []);
};

// Forge 100 blocks with 120 transfer txs
const measureTransferBlock = async (node) => {
	const client = await createIPCClient(`${__dirname}/benchmark`);
	const genesisAddress = getAddressFromPassphrase(passphrase);
	const transactionCreate = async () => {
		const genesisAccount = await client.account.get(genesisAddress);
		const txs = [];
		for (let i = 0; i < numberOfAccounts; i += 1) {
			const tx = await client.transaction.create(
				{
					moduleID: 2,
					assetID: 0,
					asset: {
						amount: 10000000000n,
						recipientAddress: accounts[i].address,
						data: '',
					},
					fee: 10000000n,
					nonce: genesisAccount.sequence.nonce + BigInt(i),
				},
				passphrase
			);
			const assetSchema = client.schemas.transactionsAssets.find(
				(as) => as.moduleID === 2 && as.assetID === 0
			);
			txs.push(
				new Transaction({
					...tx,
					asset: codec.encode(assetSchema.schema, tx.asset),
				})
			);
		}
		return txs;
	};
	await measureProcessing('120 transfer txs', node, transactionCreate);
};

// Forge 100 blocks with vote 100
const measureVoteBlock = async (node) => {
	const client = await createIPCClient(`${__dirname}/benchmark`);
	const transactionCreate = async (count) => {
		const txs = [];
		for (let i = 0; i < numberOfAccounts; i += 1) {
			const tx = await client.transaction.create(
				{
					moduleID: 5,
					assetID: 1,
					asset: {
						votes: [
							{
								amount: 1000000000n,
								delegateAddress: Buffer.from(
									'9cabee3d27426676b852ce6b804cb2fdff7cd0b5',
									'hex'
								),
							},
						],
					},
					fee: 10000000n,
					nonce: BigInt(count),
				},
				accounts[i].passphrase
			);
			const assetSchema = client.schemas.transactionsAssets.find(
				(as) => as.moduleID === 5 && as.assetID === 1
			);
			txs.push(
				new Transaction({
					...tx,
					asset: codec.encode(assetSchema.schema, tx.asset),
				})
			);
		}
		return txs;
	};
	await measureProcessing('120 vote txs', node, transactionCreate);
};

const exec = async () => {
	const node = await prepare();
	await measureEmptyBlock(node);
	await measureTransferBlock(node);
	await measureVoteBlock(node);

	await app.shutdown(0);
};

exec().catch(console.error);
