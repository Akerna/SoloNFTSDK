import {
	assign,
	eachAsync,
	isString,
	hasValue,
	isRegExp,
	drop,
} from 'Acid';
/**
 * Watcher class that watches for changes in the database.
 *
 * @param {string | RegExp} eventName - The name of the event to watch for.
 * @param {Function} eventAction - The function to run when the event is triggered.
 * @returns None.
 */
export class Watcher {
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
export function watch(eventName, callback) {
	return new Watcher(eventName, callback);
}
