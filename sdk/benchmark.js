const { Application } = require('lisk-framework');
const genesisBlock = require('./src/samples/genesis_block_devnet.json');
const config = require('./src/samples/config_devnet.json');
const {
	getDelegateKeypairForCurrentSlot,
} = require('lisk-framework/src/modules/chain/forger');
const { PerformanceObserver, performance } = require('perf_hooks');

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

// Forge 100 empty blocks

// Forge 100 blocks with 120 transfer txs

// Forge 100 blocks with 120 transfer txs where sender is a delegate

// Forge 100 blocks with vote 100

// Forge 100 blocks with 1000 transfer txs

const prepare = async () => {
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

const exec = async () => {
	const node = await prepare();
	for (let i = 0; i < 500; i += 1) {
		const block = await createBlock(node, []);
		performance.mark('Start');
		node.chain.blocks._lastBlock = await node.chain.blocks.blocksProcess.processBlock(
			block,
			node.chain.blocks.lastBlock
		);
		performance.mark('End');
		performance.measure('Start to End', 'Start', 'End');
	}
	showResultAndClear('Empty blocks');
};

exec().catch(console.error);
