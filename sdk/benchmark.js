const { Application } = require('lisk-framework');
const {
	transfer,
	TransferTransaction,
	castVotes,
	VoteTransaction,
} = require('@liskhq/lisk-transactions');
const {
	getAddressAndPublicKeyFromPassphrase,
} = require('@liskhq/lisk-cryptography');
const { Mnemonic } = require('@liskhq/lisk-passphrase');
const genesisBlock = require('./src/samples/genesis_block_devnet.json');
const config = require('./src/samples/config_devnet.json');
const {
	getDelegateKeypairForCurrentSlot,
} = require('lisk-framework/src/modules/chain/forger');
const { PerformanceObserver, performance } = require('perf_hooks');

const passphrase =
	'wagon stock borrow episode laundry kitten salute link globe zero feed marble';

let measurement = [];

const obs = new PerformanceObserver(items => {
	// console.log(items.getEntries()[0].duration);
	measurement.push(items.getEntries()[0].duration);
	performance.clearMarks();
});
obs.observe({ entryTypes: ['measure'] });

const showResultAndClear = title => {
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

const tryCount = 500;
const numberOfAccounts = 118;

const accounts = new Array(numberOfAccounts).fill().map(() => {
	const pass = Mnemonic.generateMnemonic();
	const addressAndPK = getAddressAndPublicKeyFromPassphrase(pass);
	return {
		...addressAndPK,
		passphrase: pass,
	};
});

const prepare = async () => {
	config.app.genesisConfig.MAX_TRANSACTIONS_PER_BLOCK = 120;
	const app = new Application(genesisBlock, config);
	const node = await new Promise((resolve, reject) => {
		app.run().catch(err => reject(err));
		const id = setInterval(() => {
			if (app.controller.modules && app.controller.modules.chain) {
				clearInterval(id);
				resolve(app.controller.modules.chain);
			}
		}, 10);
	});
	await node.chain.forger.loadDelegates();
	return node;
};

const createBlock = async (node, transactions = []) => {
	const currentSlot =
		node.chain.slots.getSlotNumber(node.chain.blocks.lastBlock.timestamp) + 1;
	const timestamp = node.chain.slots.getSlotTime(currentSlot);
	const round = node.chain.slots.calcRound(
		node.chain.blocks.lastBlock.height + 1
	);
	const delegateKeypair = await getDelegateKeypairForCurrentSlot(
		node.chain.rounds,
		node.chain.forger.keypairs,
		currentSlot,
		round,
		101
	);
	return node.chain.blocks.blocksProcess.generateBlock(
		node.chain.blocks.lastBlock,
		delegateKeypair,
		timestamp,
		transactions
	);
};

const measureProcessing = async (title, node, txCreate) => {
	for (let i = 0; i < tryCount; i += 1) {
		const block = await createBlock(node, txCreate(i));
		performance.mark('Start');
		node.chain.blocks._lastBlock = await node.chain.blocks.blocksProcess.processBlock(
			block,
			node.chain.blocks.lastBlock
		);
		performance.mark('End');
		performance.measure('Start to End', 'Start', 'End');
		console.log(title, { trial: i });
	}
	showResultAndClear(title);
};

// Forge 100 empty blocks
const measureEmptyBlock = async node => {
	await measureProcessing('Empty blocks', node, () => []);
};

// Forge 100 blocks with 120 transfer txs
const measureTransferBlock = async node => {
	const transactionCreate = () => {
		const txs = [];
		for (let i = 0; i < numberOfAccounts; i += 1) {
			const tx = transfer({
				amount: String(100000000000 + i),
				passphrase,
				recipientId: accounts[i].address,
			});
			txs.push(new TransferTransaction(tx));
		}
		return txs;
	};
	await measureProcessing('120 transfer txs', node, transactionCreate);
};

// Forge 100 blocks with vote 100
const measureVoteBlock = async node => {
	const transactionCreate = count => {
		const txs = [];
		const key = count % 2 === 0 ? 'votes' : 'unvotes';
		for (let i = 0; i < numberOfAccounts; i += 1) {
			const tx = castVotes({
				passphrase: accounts[i].passphrase,
				[key]: config.modules.chain.forging.delegates
					.slice(0, 33)
					.map(d => d.publicKey),
			});
			txs.push(new VoteTransaction(tx));
		}
		return txs;
	};
	await measureProcessing('118 vote txs', node, transactionCreate);
};

const exec = async () => {
	const node = await prepare();
	await measureEmptyBlock(node);
	await measureTransferBlock(node);
	await measureVoteBlock(node);
};

exec().catch(console.error);
