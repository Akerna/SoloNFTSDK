import { jsonParse, hasValue, apply, promise, construct, stringify, isPlainObject, isString, uid, eachAsync, isRegExp, drop, assign } from 'Acid';
import { v4 } from 'uuid';
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
class ClientSocket {
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
			this.uuid = v4();
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

/**
 * Watcher class that watches for changes in the database.
 *
 * @param {string | RegExp} eventName - The name of the event to watch for.
 * @param {Function} eventAction - The function to run when the event is triggered.
 * @returns None.
 */
class Watcher {
	static containerRegex = [];
	static containerPrimary = {};
	static status = true;
	static start() {
		Watcher.status = true;
	}
	static stop() {
		Watcher.status = false;
	}
	static async update(pushUpdate) {
		if (Watcher.debug) {
			console.log(pushUpdate);
		}
		const { body } = pushUpdate;
		if (!Watcher.status || !body) {
			return;
		}
		const {
			type,
			path
		} = body;
		const levelObject = Watcher.containerPrimary[type] || Watcher.containerPrimary[path];
		await eachAsync(Watcher.containerRegex, async (watcher) => {
			if (watcher.eventName.test(type) || watcher.eventName.test(path)) {
				return watcher.eventAction(body);
			}
		});
		if (levelObject) {
			await eachAsync(levelObject, async (watcher) => {
				return watcher.eventAction(body);
			});
		}
	}
	constructor(eventName, eventAction) {
		if (isString(eventName)) {
			if (!Watcher.containerPrimary[eventName]) {
				Watcher.containerPrimary[eventName] = [];
			}
			this.eventType = 'string';
		} else if (isRegExp(eventName)) {
			this.eventType = 'regex';
		}
		this.eventName = eventName;
		this.eventAction = eventAction.bind(this);
		this.start();
	}
	container() {
		if (this.eventType === 'string') {
			return Watcher.containerPrimary[this.eventName];
		} else if (this.eventType === 'regex') {
			return Watcher.containerRegex;
		}
	}
	isWatcher = true;
	eventAction;
	id;
	active;
	start() {
		if (!hasValue(this.id)) {
			this.id = this.container().push(this) - 1;
			this.active = true;
		}
	}
	stop() {
		if (hasValue(this.id)) {
			drop(this.container(), this.id);
			this.id = null;
			this.active = false;
		}
	}
}
/**
 * Creates a new Watcher object which listens for updates.
 *
 * @param eventName - The name of the event to watch for.
 * @param callback - The callback to call when the event is fired.
 * @returns - A new Watcher object.
 * @example
 */
function watch(eventName, callback) {
	return new Watcher(eventName, callback);
}

/**
 * The SoloNFT class constructs a new SoloNFT instance.
 *
 * @returns {Promise<SoloNFT>} A promise that resolves to the constructed SoloNFT.
 */
class SoloNFT {
	/**
	 * The state of the SoloNFT instance.
	 */
	state = 0;
	/**
	 * The authentication status of the SoloNFT instance.
	 * True for signed-in & false for not signed-in.
	 */
	authenticated = false;
	config = {
		host: 'wss://solonft.akerna.com/ws',
	};
	updates = [];
	watch = watch;
	/**
	 * The constructor for the Inversion class.
	 *
	 * @param config - The filter configuration object.
	 * @returns None.
	 * @example
	 */
	constructor(config) {
		this.state = 1;
		console.log(config);
		assign(this.config, config);
		if (config.debug) {
			Watcher.debug = true;
		}
		return this.connect();
	}
	/**
	 * Connect to the server.
	 *
	 * @returns None.
	 * @example
	 */
	async connect() {
		console.log('STARTING');
		this.socket = await construct(ClientSocket, [this, this.config]);
		this.state = 2;
		if (this.config.credentials) {
			await this.login(this.config.credentials);
		}
		return this;
	}
	async update(liveUpdate) {
		return Watcher.update(liveUpdate);
	}
	/**
	 * Attempts to login to the site using the credentials provided.
	 *
	 * @param [credentials] - The credentials to use for login.
	 * @returns None.
	 * @example
	 */
	async login(credentials) {
		const getCredentials = credentials || this.config?.credentials;
		if (!getCredentials) {
			this.credit = undefined;
			this.authenticated = false;
			return this;
		}
		console.log('LOGIN', getCredentials);
		const results = this.request('login', {
			account: getCredentials
		});
		if (results.credit) {
			this.credit = results.credit;
			this.authenticated = true;
		} else {
			this.credit = undefined;
			this.authenticated = false;
		}
		return this;
	}
	async logout() {
		if (this.credit) {
			this.request('logout', {});
			return true;
		}
		return false;
	}
	/**
	 * Sends an API request to SoloNFT.
	 *
	 * @param task - The task to perform.
	 * @param body - The body of the request.
	 * @returns The response of the request.
	 * @example
	 */
	async requestRaw(task, body) {
		const payload = {
			task,
			body
		};
		const results = await this.socket.request(payload);
		return results;
	}
	/**
	 * Send a request to the given endpoint with the given payload.
	 *
	 * @param endPoint - The endpoint to send the request to.
	 * @param payload - The payload to send with the request.
	 * @param body
	 * @returns The response from the server.
	 * @example
	 */
	async request(endPoint, body) {
		const { role = 'open' } = this;
		const task = `${role}.${endPoint}`;
		const payload = {
			task,
			body,
		};
		const results = this.socket.request(payload);
		return results;
	}
}
/**
 * Constructs a new SoloNFT instance.
 *
 * @param config - The configs to use when constructing the SoloNFT.
 * @returns A promise that resolves to the constructed SoloNFT.
 * @example
 */
async function soloNFT(config) {
	const clientSDK = await construct(SoloNFT, [config]);
	const proxy = new Proxy(clientSDK, {
		get(target, propertyName, receiver) {
			return Reflect.get(target, propertyName, receiver);
		}
	});
	return proxy;
}

export { SoloNFT, Watcher, soloNFT as default, soloNFT, watch };
