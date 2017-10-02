/**
 * Modules
 * @private
 * */
const SteamManager = require('../SteamManager');

/**
 * Loads bot inventory
 * @return {Promise}
 */
SteamManager.prototype.loadInventory = function createOffer () {
	return new Promise((resolve, reject) => {
		this._manager.getUserInventoryContents(this.steamID, this.appID, this.contextID, true, (err, items) => {
			if(err) {
				this._handleError(err);
				return reject(err);
			}
			
			items = items.map(item => {
				if(typeof item === 'object' && item.marketable){
					return Object.assign(item, { owner: this.steamID });
				}
			}).filter(n => n != undefined);
			
			resolve(items);
		});
	});
};