TradeOfferManager.prototype.createOffer = function(tradeUrl, myItems, theirItems, callback) {
	var url = require('url').parse(partner, true);
	if (!url.query.partner) {
		throw new Error("Invalid trade URL");
	}

	var partner = SteamID.fromIndividualAccountID(url.query.partner);
	var token = url.query.token;

	var offer = new TradeOffer(this, partner, token);
	offer.isOurOffer = true;
	offer.addMyItems(myItems);
	offer.addMyItems(theirItems);
	offer.fromRealTimeTrade = false;
	offer.send(callback);
};
