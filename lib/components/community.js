/**
 * Modules
 * @private
 * */
const SteamManager = require('../SteamManager');

/**
 * Loads inventories by steamID
 * @param {String} [steamID] - user SteamID64
 * @param {Number} [appID] - game appID
 * @param {Number} [contextID] - game contextID
 * @return {Promise}
 */
function loadUserInventory({ steamID, appID, contextID }) {
	return new Promise((resolve, reject) => {
		this._manager.getUserInventoryContents(steamID, appID, contextID, true, (err, items) => {
			if (err) {
				return reject(err);
			}

			items = items.map(item => {
				if (
					typeof item === 'object'
					&& item.marketable
				) {
					return Object.assign(item, { owner: steamID });
				}
			}).filter(n => n !== undefined);

			resolve(items);
		});
	});
}

/**
 * Loads inventories by steamID
 * @param {String} [steamID] - user SteamID64
 * @param {Number} [appID] - game appID
 * @param {Number} [contextID] - game contextID
 * @return {Promise}
 */
SteamManager.prototype.loadInventory = function loadInventory({ steamID, appID, contextID } = { }) {
	return new Promise((resolve, reject) => {
		appID = [ appID ] || this.appID;
		contextID = contextID || this.contextID;
		steamID = steamID || this.steamID['getSteamID64']();

		let stack = appID['map']((value) => {
			return loadUserInventory({
				steamID,
				contextID,
				appID: value,
			})
		});

		Promise.all(stack).then((data) => {
			let items = data.reduce((value, current) => {
				return value.concat(current);
			}, []);

			resolve(items);
		}).catch((err) => {
			this._handleError(err);

			reject(err);
		});
	});
};