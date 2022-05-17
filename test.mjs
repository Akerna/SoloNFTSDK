/**
 * The main entry point & module for the SoloNFT SDK.
 *
 * @returns None.
 */
import { soloNFT } from './package/module/index.js';
(async () => {
	/**
	 * Constructs a new SDK instance.
	 *
	 * @param {SDK} SDK - The SDK class to construct.
	 * @param {Array<Config>} configs - The configs to use when constructing the SDK.
	 * @returns {Promise<SDK>} A promise that resolves to the constructed SDK.
	 */
	const sdk = await soloNFT({
		host: 'wss://lnkit.com/ws',
		credentials: {
			email: 'steve@apple.com',
			password: 'test'
		},
		debug: true
	});
	console.log('authenticated', sdk.authenticated);
})();
