import {
	uid,
	promise,
	construct,
	isPlainObject,
	isString,
	stringify,
	jsonParse,
	hasValue,
	apply
} from 'Acid';
import { v4 as uuidv4 } from 'uuid';
import WebSocketClass from 'ws';
/**
 * Constructs a new request.
 *
 * @param client - The client that the request is associated with.
 * @param payload - The payload of the request.
 * @param callback - The callback to call when the request is completed.
 * @returns A new ClientRequest instance.
 * @example
 */
class ClientRequest {
	constructor(client, payload, callback) {
		const context = this;
		const id = uid().toString();
		payload.id = id;
		this.id = id;
		this.payload = payload;
		this.callback = callback;
		client.requests[id] = context;
		Object.defineProperty(context, 'client', {
			get() {
				return client;
			}
		});
		return this;
	}
	send() {
		const context = this;
		console.log(this.client);
		const asyncRequest = promise((accept) => {
			context.accept = accept;
			context.client.send(context.payload);
		});
		return asyncRequest;
	}
	/**
	 * A function that is called when the request is finished.
	 *
	 * @param response - The response object.
	 * @returns None.
	 * @example
	 */
	async received(response) {
		if (this.callback) {
			await this.callback(response, this);
		} else {
			this.resolve(response);
		}
	}
	/**
	 * Cleans up the task after it has been completed.  This is called by the task when it is done.
	 *
	 * @param id - The id of the task that has been completed.
	 * @param response
	 * @returns None.
	 * @example
	 */
	resolve(response) {
		const { id } = this;
		this.client.requests[id] = null;
		uid.free(id);
		if (this.client.app.config.debug) {
			console.log('Resolve', response?.id);
		}
		this.accept(response);
	}
}
/**
 * A class that represents a socket connection to the client.
 *
 * @param {Socket} socket - The socket connection to the client.
 */
export class ClientSocket {
	connectionStatus = 'closed';
	/**
	 *Creates a new Socket instance.
	 *
	 * @param app - The application instance.
	 * @param configData - The configuration data.
	 * @returns None.
	 * @example
	 */
	constructor(app) {
		const {
			config: {
				host,
				uuid
			},
		} = app;
		this.app = app;
		console.log('Socket Module');
		this.host = host;
		this.uuid = uuid;
		if (!uuid) {
			this.uuid = uuidv4();
		}
		this.hostname = `${host}?uuid=${this.uuid}`;
		console.log('Connecting', this.hostname);
		return this.connect();
	}
	requests = {};
	status = 0;
	/**
	 * Processes the response from the server.
	 *
	 * @param response - The response from the server.
	 * @returns None.
	 * @example
	 */
	process(response) {
		const compiledResponse = jsonParse(response);
		console.log(compiledResponse);
		if (!compiledResponse.id) {
			return this.app.update(compiledResponse);
		}
		if (this.app.config.debug) {
			console.log('PROCESSING REQUEST ID:', compiledResponse.id);
		}
		const request = this.requests[compiledResponse.id];
		if (request) {
			request.received(compiledResponse);
		}
	}
	/**
	 *Reconnects the socket.
	 *
	 * @returns None.
	 * @example
	 */
	reconnect() {
		console.log('RECONNECT CALLED');
		const context = this;
		const { socket } = this;
		if (!hasValue(context.connectInterval)) {
			socket.onopen = null;
			socket.onmessage = null;
			socket.onclose = null;
			socket.onerror = null;
			socket.close();
			context.connectInterval = setInterval(() => {
				console.log('RECONNECT INTERVAL CALLED');
				return context.connect();
			}, 5000);
			console.log('RECONNECT INTERVAL STARTED');
		}
	}
	/**
	 * The onopen function for the socket.
	 *
	 * @param context - The context of the socket.
	 * @param accept - The accept function for the socket.
	 * @example
	 */
	onopen(context, accept) {
		console.log('CONNECTED');
		if (hasValue(context.connectInterval)) {
			console.log('Reconnect Cleared', context.connectInterval);
			clearInterval(context.connectInterval);
			context.connectInterval = null;
		}
		context.socket.onmessage = (socketEvent) => {
			console.log('Message from server ', socketEvent.data);
			apply(context.process, context, [socketEvent.data]);
		};
		context.socket.onclose = () => {
			console.log('close', context.connectInterval, !hasValue(context.connectInterval));
			if (!hasValue(context.connectInterval)) {
				context.connectionStatus = 'closed';
				context.status = 0;
				context.reconnect();
			}
		};
		context.connectionStatus = 'open';
		context.status = 1;
		accept(context);
	}
	/**
	 * A function that is called when the connection is closed.
	 *
	 * @param context - The context object.
	 * @returns None.
	 * @example
	 */
	onclose(context) {
		console.log('Connection Closed');
		if (!hasValue(context.connectInterval)) {
			context.connectionStatus = 'closed';
			context.status = 0;
			context.reconnect();
		}
	}
	/**
	 * Connect to the server.
	 *
	 * @returns None.
	 * @example
	 */
	connect() {
		const context = this;
		return promise((accept) => {
			context.socket = construct(WebSocketClass, [context.hostname]);
			context.socket.onopen = () => {
				context.onopen(context, accept);
			};
			context.socket.onerror = () => {
				context.onclose(context);
			};
		});
	}
	/**
	 * Sends data to the server.
	 *
	 * @param data - The data to send to the server.
	 * @returns None.
	 * @example
	 */
	send(data) {
		if (this.app.config.debug) {
			console.log(stringify(data, null, ' '));
		}
		if (this.socket.readyState === 1) {
			if (isPlainObject(data)) {
				this.socket.send(stringify(data));
			} else if (isString(data)) {
				this.socket.send(data);
			} else {
				this.socket.send(data);
			}
			return true;
		} else {
			this.reconnect();
			return false;
		}
	}
	/**
	 * Creates a new ClientRequest object.
	 *
	 * @param payload - The payload of the request.
	 * @param callback - The callback to be called when the request is complete.
	 * @returns - The new ClientRequest object.
	 * @example
	 */
	async request(payload, callback) {
		const requested = new ClientRequest(this, payload, callback);
		if (this.app.config.debug) {
			console.log(requested);
		}
		return requested.send();
	}
}
