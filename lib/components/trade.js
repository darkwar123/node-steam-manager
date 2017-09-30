/**
 * Modules
 * @private
 * */
const SteamManager = require('../SteamManager');

/**
 * Creates an offer
 * @param {String} steamID - partner steamID64
 * @param {Array} itemsToReceive - array of items to receive
 * @param {Array} itemsToGive - array of items to give
 * @param {String} tradeUrl - trade url of our partner
 * @param {Boolean} escrow - check escrow or not
 * @param {String} [message] - message of trade offer
 * @return {Promise}
 */
SteamManager.prototype.createOffer = function createOffer ({ steamID, itemsToReceive = [], itemsToGive = [], tradeUrl = '',
                                                               escrow = false, message = '' }) {
    return new Promise((resolve, reject) => {
        const offer = this._manager.createOffer(steamID);

        let token = /.*token=(.+)$/i.exec(tradeUrl);
        token = token instanceof Array ? token[1] : null;

        offer.setToken(token);
        offer.setMessage(message);
        offer.addMyItems(itemsToGive);
        offer.addTheirItems(itemsToReceive);

        let getUserDetails = callback => callback();

        if(escrow){
            getUserDetails = callback => {
                offer.getUserDetails((err, me, them) => {
                    if(err){
                        this._handleError(err);
                        return callback(err);
                    }

                    if(them.escrowDays !== 0){
                        return callback(new Error('ESCROW'));
                    }

                    callback();
                });
            }
        }

        getUserDetails((err) => {
            if(err){
                return reject(err);
            }

            offer.send(err => {
                if(err){
                    this._handleError(err);
                    return reject(err);
                }

                if(!itemsToGive.length){
                    resolve(offer);
                }else{
                    this._community.acceptConfirmationForObject(this.identitySecret, offer.id, err => {
                        if(err){
                            this._handleError(err);
                            return reject(err);
                        }

                        resolve(offer);
                    });
                }
            });
        });
    });
};

const GETRECEIVEDITEMS_REPEAT_TIME = 10000;
const GETRECEIVEDITEMS_REPEAT_COUNT = 10;

/**
 * Get received items from offer and emit 'newItems' event
 * @param {TradeOffer} offer - steam trade offer
 * @param {Number} [count] - how much bot should try to get received items of the offer
 * @private
 */
SteamManager.prototype.getReceivedItems = function (offer, count) {
    count = typeof count === 'number' ? count : GETRECEIVEDITEMS_REPEAT_COUNT;

    if (offer.state !== 3) {
        return this.debug('the offer #%s is not accepted, can\'t get received items', offer.id);
    }

    if (offer.itemsToReceive.length === 0) {
        return this.debug('the offer #%s haven\'t received items', offer.id);
    }

    offer.getReceivedItems((err, items) => {
        if(err){
            this._handleError(err);
            setTimeout(() => this.getReceivedItems(offer, count - 1), GETRECEIVEDITEMS_REPEAT_TIME);
        }

        this.emit('newItems', ({ items, offer }));
        this.emit('newItems#' + offer.id, items);

        this.debug('get received items from the offer #%s ', offer.id);
    });
};

const CANCEL_REPEAT_TIME = 5000;
const CANCEL_REPEAT_COUNT = 5;

/**
 * Cancel an offer
 * @param {TradeOffer} offer - steam trade offer
 * @param {Number} [count] - how much bot should try to decline the offer
 * @private
 */
SteamManager.prototype.cancelOffer = function cancelOffer (offer, count) {
    count = typeof count === 'number' ? count : CANCEL_REPEAT_COUNT;

    if(offer.state !== 2 && offer.state !== 9){
        return this.debug('the offer #%s have already been canceled ', offer.id);
    }

    if(count < 0){
        return this.debug('can\'t decline unknown offer #%s', offer.id);
    }

    offer.cancel(err => {
        if(err){
            this._handleError(err);
            setTimeout(() => this.cancelOffer(offer, count - 1), CANCEL_REPEAT_TIME);
        }

        this.debug('the offer #%s is canceled ', offer.id);
    });
};

const ACCEPT_REPEAT_TIME = 5000;
const ACCEPT_REPEAT_COUNT = 5;

/**
 * Accept an offer, it accept only positive offers
 * @param {TradeOffer} offer - steam trade offer
 * @param {Number} [count] - how much bot should try to accept the offer
 * @private
 */
SteamManager.prototype.acceptOffer = function acceptOffer (offer, count) {
    count = typeof count === 'number' ? count : ACCEPT_REPEAT_COUNT;

    if (count < 0) {
        return this.debug('can\'t accept offer #%s', offer.id);
    }

    let hasInvalidItems = false;

    offer.itemsToReceive.forEach(item => {
        if(item.appid != this.appID){
            hasInvalidItems = true;
        }
    });

    if(
        offer.state !== 2
        || offer.itemsToGive.length !== 0
        || hasInvalidItems
    ){
        this.cancelOffer(offer);
        return this.debug('the offer #%s is invalid', offer.id);
    }

    offer.accept(true, err => {
        if(err){
            this._handleError(err);
            setTimeout(() => this.acceptOffer(offer, count - 1), ACCEPT_REPEAT_TIME);
        }

        this.debug('the offer #%s is accepted ', offer.id);
    });
};