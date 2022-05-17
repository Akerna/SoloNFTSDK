import {
	assign,
	construct,
	get,
	map,
	apply
} from 'Acid';
import { ClientSocket } from './ClientSocket.js';
import { Watcher, watch } from './watcher.js';
/**
 * The SoloNFT class constructs a new SoloNFT instance.
 *
 * @returns {Promise<SoloNFT>} A promise that resolves to the constructed SoloNFT.
 */
export class SoloNFT {
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
			const results = this.request('logout', {});
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
export async function soloNFT(config) {
	const clientSDK = await construct(SoloNFT, [config]);
	const proxy = new Proxy(clientSDK, {
		get(target, propertyName, receiver) {
			return Reflect.get(target, propertyName, receiver);
		}
	});
	return proxy;
}
export { soloNFT as default, Watcher, watch };
