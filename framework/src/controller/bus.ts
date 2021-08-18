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

import { LiskValidationError } from '@liskhq/lisk-validator';
import { EventEmitter2, ListenerFn } from 'eventemitter2';
import { RPC_MODES } from '../constants';
import { Logger } from '../logger';
import { ActionInfoForBus, RPCConfig, ChannelType } from '../types';
import { Action } from './action';
import { BaseChannel } from './channels/base_channel';
import { IPC_REGISTER_CHANNEL_EVENT, IPC_RPC_EVENT } from './constants';
import { Event, EventsDefinition } from './event';
import { IPCServer } from './ipc/ipc_server';
import * as JSONRPC from './jsonrpc';
import { WSServer } from './ws/ws_server';

interface BusConfiguration {
	rpc: RPCConfig;
}

interface RegisterChannelOptions {
	readonly type: string;
	readonly channel: BaseChannel;
}

interface ChannelInfo {
	readonly channel?: BaseChannel;
	readonly actions: {
		[key: string]: ActionInfoForBus;
	};
	readonly events: EventsDefinition;
	readonly type: ChannelType;
}

const parseError = (id: JSONRPC.ID, err: Error | JSONRPC.JSONRPCError): JSONRPC.JSONRPCError => {
	if (err instanceof JSONRPC.JSONRPCError) {
		return err;
	}
	return new JSONRPC.JSONRPCError(
		err.message,
		JSONRPC.errorResponse(id, JSONRPC.internalError(err.message)),
	);
};

export class Bus {
	public logger: Logger;

	private readonly config: BusConfiguration;
	private readonly actions: {
		[key: string]: ActionInfoForBus;
	};
	private readonly events: { [key: string]: boolean };
	private readonly channels: {
		[key: string]: ChannelInfo;
	};
	private readonly _ipcServer!: IPCServer;
	private readonly _rpcRequestIds: Set<string>;
	private readonly _emitter: EventEmitter2;

	private readonly _wsServer!: WSServer;

	public constructor(logger: Logger, config: BusConfiguration) {
		this.logger = logger;
		this.config = config;

		this._emitter = new EventEmitter2({
			wildcard: true,
			delimiter: ':',
			maxListeners: 1000,
		});

		// Hash map used instead of arrays for performance.
		this.actions = {};
		this.events = {};
		this.channels = {};
		this._rpcRequestIds = new Set();

		if (this.config.rpc.modes.includes(RPC_MODES.IPC)) {
			this._ipcServer = new IPCServer({
				socketsDir: this.config.rpc.ipc.path,
				name: 'bus',
			});
		}

		if (this.config.rpc.modes.includes(RPC_MODES.WS)) {
			this._wsServer = new WSServer({
				path: this.config.rpc.ws.path,
				port: this.config.rpc.ws.port,
				host: this.config.rpc.ws.host,
				logger: this.logger,
			});
		}
	}

	public async setup(): Promise<boolean> {
		if (this.config.rpc.modes.includes(RPC_MODES.IPC)) {
			await this._setupIPCServer();
		}
		if (this.config.rpc.modes.includes(RPC_MODES.WS)) {
			await this._setupWSServer();
		}

		return true;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public registerChannel(
		moduleAlias: string,
		// Events should also include the module alias
		events: EventsDefinition,
		actions: { [key: string]: Action },
		options: RegisterChannelOptions,
	): void {
		events.forEach(eventName => {
			if (this.events[`${moduleAlias}:${eventName}`] !== undefined) {
				throw new Error(`Event "${eventName}" already registered with bus.`);
			}
			this.events[`${moduleAlias}:${eventName}`] = true;
		});

		Object.keys(actions).forEach(actionName => {
			if (this.actions[`${moduleAlias}:${actionName}`] !== undefined) {
				throw new Error(`Action "${actionName}" already registered with bus.`);
			}

			this.actions[`${moduleAlias}:${actionName}`] = actions[actionName];
		});

		if (options.type === ChannelType.ChildProcess) {
			this.channels[moduleAlias] = {
				events,
				actions,
				type: ChannelType.ChildProcess,
			};
		} else {
			this.channels[moduleAlias] = {
				channel: options.channel,
				events,
				actions,
				type: ChannelType.InMemory,
			};
		}
	}

	public async invoke<T>(
		rawRequest: string | JSONRPC.RequestObject,
	): Promise<JSONRPC.ResponseObjectWithResult<T>> {
		let request!: JSONRPC.RequestObject;

		// As the request can be invoked from external source, so we should validate if it exists and valid JSON object
		if (!rawRequest) {
			this.logger.error('Empty invoke request.');
			throw new JSONRPC.JSONRPCError(
				'Invalid invoke request.',
				JSONRPC.errorResponse(null, JSONRPC.invalidRequest()),
			);
		}

		try {
			request =
				typeof rawRequest === 'string'
					? (JSON.parse(rawRequest) as JSONRPC.RequestObject)
					: rawRequest;
		} catch (error) {
			throw new JSONRPC.JSONRPCError(
				'Invalid invoke request.',
				JSONRPC.errorResponse(null, JSONRPC.invalidRequest()),
			);
		}

		try {
			JSONRPC.validateJSONRPCRequest(request as never);
		} catch (error) {
			this.logger.error({ err: error as LiskValidationError }, 'Invalid invoke request.');
			throw new JSONRPC.JSONRPCError(
				'Invalid invoke request.',
				JSONRPC.errorResponse(request.id, JSONRPC.invalidRequest()),
			);
		}

		const action = Action.fromJSONRPCRequest(request);

		const actionFullName = action.key();

		if (this.actions[actionFullName] === undefined) {
			throw new JSONRPC.JSONRPCError(
				`Action '${actionFullName}' is not registered to bus.`,
				JSONRPC.errorResponse(
					action.id,
					JSONRPC.internalError(`Action '${actionFullName}' is not registered to bus.`),
				),
			);
		}

		const actionParams = action.params;
		const channelInfo = this.channels[action.module];
		if (channelInfo.type === ChannelType.InMemory) {
			try {
				const result = await (channelInfo.channel as BaseChannel).invoke<T>(
					actionFullName,
					actionParams,
				);

				return action.buildJSONRPCResponse({
					result,
				}) as JSONRPC.ResponseObjectWithResult<T>;
			} catch (error) {
				throw parseError(action.id, error);
			}
		}

		return new Promise((resolve) => {
			this._rpcRequestIds.add(action.id as string);
			this._ipcServer.pubSocket.send([IPC_RPC_EVENT, JSON.stringify(action.toJSONRPCRequest())])
			.then(_ => {
				// Listen to this event once for serving the request
				this._emitter.once(action.id as string, (response: JSONRPC.ResponseObjectWithResult<T>) => {
					this._rpcRequestIds.delete(action.id as string);
					return resolve(response);
				});
			})
		})
	}

	public publish(rawRequest: string | JSONRPC.NotificationRequest): void {
		let request!: JSONRPC.NotificationRequest;
		// As the request can be invoked from external source, so we should validate if it exists and valid JSON object
		if (!rawRequest) {
			this.logger.error('Empty publish request.');
			throw new JSONRPC.JSONRPCError(
				'Invalid publish request.',
				JSONRPC.errorResponse(null, JSONRPC.invalidRequest()),
			);
		}

		try {
			request =
				typeof rawRequest === 'string'
					? (JSON.parse(rawRequest) as JSONRPC.RequestObject)
					: rawRequest;
		} catch (error) {
			throw new JSONRPC.JSONRPCError(
				'Invalid publish request.',
				JSONRPC.errorResponse(null, JSONRPC.invalidRequest()),
			);
		}

		try {
			JSONRPC.validateJSONRPCNotification(request as never);
		} catch (error) {
			this.logger.error({ err: error as LiskValidationError }, 'Invalid publish request.');
			throw new JSONRPC.JSONRPCError(
				'Invalid publish request.',
				JSONRPC.errorResponse(null, JSONRPC.invalidRequest()),
			);
		}

		const event = Event.fromJSONRPCNotification(rawRequest);
		const eventName = event.key();
		const notification = event.toJSONRPCNotification();

		if (!this.getEvents().includes(eventName)) {
			throw new JSONRPC.JSONRPCError(
				`Event ${eventName} is not registered to bus.`,
				JSONRPC.errorResponse(
					null,
					JSONRPC.internalError(`Event ${eventName} is not registered to bus.`),
				),
			);
		}

		// Communicate through event emitter
		this._emitter.emit(eventName, notification);

		// Communicate through unix socket
		if (this.config.rpc.modes.includes(RPC_MODES.IPC)) {
			this._ipcServer.pubSocket.send([eventName, JSON.stringify(notification)])
			.catch(error => {
				this.logger.debug(
					{ err: error as Error },
					`Failed to publish event: ${eventName} to ipc server.`,
				);
			});
		}

		if (this.config.rpc.modes.includes(RPC_MODES.WS)) {
			try {
				this._wsServer.broadcast(JSON.stringify(notification));
			} catch (error) {
				this.logger.debug(
					{ err: error as Error },
					`Failed to publish event: ${eventName} to ws server.`,
				);
			}
		}
	}

	public subscribe(eventName: string, cb: ListenerFn): void {
		if (!this.getEvents().includes(eventName)) {
			this.logger.info(`Event ${eventName} was subscribed but not registered to the bus yet.`);
		}

		// Communicate through event emitter
		this._emitter.on(eventName, cb);
	}

	public once(eventName: string, cb: ListenerFn): this {
		if (!this.getEvents().includes(eventName)) {
			this.logger.info(`Event ${eventName} was subscribed but not registered to the bus yet.`);
		}

		// Communicate through event emitter
		this._emitter.once(eventName, cb);

		return this;
	}

	public getActions(): ReadonlyArray<string> {
		return Object.keys(this.actions);
	}

	public getEvents(): ReadonlyArray<string> {
		return Object.keys(this.events);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async cleanup(): Promise<void> {
		this._emitter.removeAllListeners();

		if (this._ipcServer) {
			this._ipcServer.stop();
		}

		if (this._wsServer) {
			this._wsServer.stop();
		}
	}

	private async _setupIPCServer(): Promise<void> {
		await this._ipcServer.start();

		const listenToRPCOnSubSocket = async () => {
			for await (const [event, eventData] of this._ipcServer.subSocket) {
				if (event.toString() === IPC_REGISTER_CHANNEL_EVENT) {
					const { moduleAlias, eventsList, actionsInfo, options } = JSON.parse(eventData.toString());
					this.registerChannel(moduleAlias, eventsList, actionsInfo, options);
					continue;
				}
				if (event.toString() === IPC_RPC_EVENT) {
					const request = JSON.parse(eventData.toString()) as JSONRPC.RequestObject;
					this.invoke(request).then(result => {
						// Send the request result
						this._ipcServer.pubSocket.send([request.id as string, JSON.stringify(result)]);
					})
					continue;
				}
				if (this._rpcRequestIds.has(event.toString())) {
					// Emit locally the result for a request sent over ipc
					this._emitter.emit(event.toString(), JSON.parse(eventData.toString()));
					continue;
				}
				this.publish(eventData.toString());
			}
		}
		listenToRPCOnSubSocket();
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	private async _setupWSServer(): Promise<void> {
		this._wsServer.start((socket, message) => {
			this.invoke(message)
				.then(data => {
					socket.send(JSON.stringify(data as JSONRPC.ResponseObjectWithResult));
				})
				.catch((error: JSONRPC.JSONRPCError) => {
					socket.send(JSON.stringify(error.response));
				});
		});
	}
}
