/**
 * Opt out of stats-reporter
 * */
global._mckay_statistics_opt_out = true;

/**
 * Modules
 * @private
 * */
const fs = require('fs');
const path = require('path');
const util = require('util');
const FileStorage = require('./FileStorage');
const AppDirectory = require('appdirectory');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');
const SteamID = SteamCommunity.SteamID;
const TradeOfferManager = require('steam-tradeoffer-manager');
const EventEmitter = require('events').EventEmitter;

/**
 * Constructor(options)
 * @param {String} accountName - your Steam account name.
 * @param {String} password - your Steam password.
 * @param {String} sharedSecret - this is your secret that's used for two-factor authentication.
 * @param {String} identitySecret - this is your secret that's used for confirming trades.
 * @param {String} apiKey - key for Steam Web API, you can find it here https://steamcommunity.com/dev/apikey.
 * @param {String} steamID - your steamID (any), go here https://steamid.io/, enter your steam account link and copy steamID64 value.
 * @param {Number} [appID] - game appID you want to handle.
 * @param {Boolean} [autoOfferAccept] - accept all offers with itemsToGive.length = 0.
 * @param {Number} [contextID] - game contextID you want to handle.
 * @param {Number} [pollInterval ] - the time, in milliseconds, between polls. If -1, timed polling is disabled. Minimum 1000, default 30000 (30 seconds).
 * @param {Number} [cancelTime] - the time, in milliseconds, that a sent offer can remain Active until it's automatically canceled by the manager.
 * @param {Number} [pendingCancelTime] - the time, in milliseconds, that a sent offer can remain CreatedNeedsConfirmation until it's automatically canceled by the manager.
 * @constructor
 * */
let SteamManager = function SteamManager ({  accountName, password, sharedSecret, identitySecret, apiKey, steamID,
                                              autoOfferAccept = false, appID = 730, contextID = 2,
                                              pollInterval = 15*1000, cancelTime = 3*60*1000, pendingCancelTime = 20*1000 } = { }) {
    if (!(this instanceof SteamManager)) {
        return new SteamManager(...arguments);
    }

    if (!accountName) {
        throw new Error('accountName is required');
    }

    if (!password) {
        throw new Error('password is required');
    }

    if (!sharedSecret) {
        throw new Error('sharedSecret) is required');
    }

    if (!identitySecret) {
        throw new Error('identitySecret is required');
    }

    if (!apiKey) {
        throw new Error('apiKey is required');
    }

    if (!steamID) {
        throw new Error('steamID is required');
    }

    this._community = new SteamCommunity();
    this._manager = new TradeOfferManager({
        cancelTime,
        pendingCancelTime,
        community: this._community,
        pollInterval: pollInterval,
        savePollData : true,
        globalAssetCache: true
    });


    this.debug = require('debug')('node-steam-manager:' + accountName);

    /*Boolean flag for check is steam down or not*/
    this.steamIsDown = false;
    this.appID = appID;
    this.contextID = contextID;
    this.autoOfferAccept = autoOfferAccept;

    this.accountName = accountName;
    this.password = password;
    this.sharedSecret = sharedSecret;
    this.identitySecret = identitySecret;
    this.apiKey = this._manager.apiKey = apiKey;
    this.steamID = this._manager.steamID = this._community.steamID = new SteamID(steamID);

    this._dataDir = (new AppDirectory({
        "appName": "node-steam-manager",
        "appAuthor": "darkwar123"
    })).userData();

    this._oAuthStorage = new FileStorage(path.join(this._dataDir, 'oauth'));
    this._cookiesStorage = new FileStorage(path.join(this._dataDir, 'cookies'));

    /*Boolean flag for non-multiple login, when you are logging in it's true, when you call setCookies it's false*/
    this._loginBusy = false;
    this.setCookies();
    this.setEvents();
};

/**
 * Login in steam-community with steamCommunityLoginData
 * @private
 * */
SteamManager.prototype.steamCommunityLogin = function steamCommunityLogin () {
    this.debug('logging in steam-community with usual method');

    if(this._loginBusy){
        return null;
    }

    this._loginBusy = true;

    const steamCommunityLoginData = {
        accountName: this.accountName,
        password: this.password,
        twoFactorCode: SteamTotp.generateAuthCode(this.sharedSecret)
    };

    this._community.login(steamCommunityLoginData, (err, sessionID, cookies, steamGuard, oAuthToken) => {
        if(err) {
            this.debug('there is an error while steamCommunityLogin, %s', err.message);

            return this.setCookies();
        }

        const oAuthFile = 'oauth_' + this.steamID.getSteamID64() + '_' + this.appID + '_' + this.contextID + '.json';
        this._oAuthStorage.save(oAuthFile, { oAuthToken, steamGuard });

        this.setCookies(cookies);
    });
};

/**
 * Login in steam-community with oAuthData
 * @param {Object} [oAuthData] - { oAuthToken, steamGuard }
 * @private
 * */
SteamManager.prototype.oAuthLogin = function oAuthLogin (oAuthData) {
    this.debug('logging in steam-community with oauth-login method');

    if(this._loginBusy){
        return null;
    }

    const oAuthFile = 'oauth_' + this.steamID.getSteamID64() + '.json';
    oAuthData = oAuthData || this._oAuthStorage.read(oAuthFile);

    if(!oAuthData){
        return this.steamCommunityLogin();
    }

    this._loginBusy = true;

    this._community.oAuthLogin(oAuthData.steamGuard, oAuthData.oAuthToken, (err, sessionID, cookies) => {
        if(err){
            this.debug('there is an error while oAuthLogin, %s', err.message);

            this._loginBusy = false;
            return this.steamCommunityLogin();
        }

        this.setCookies(cookies);
    });
};

/**
 * Set _manager and _community event listeners
 * @private
 * */
SteamManager.prototype.setEvents = function setEvents () {
    this._community.on('sessionExpired', () => {
        this.debug('steam-community session expired');

        this.oAuthLogin();
    });

    this._manager.on('unknownOfferSent', offer => {
        this.debug('detect unknown offer #%s', offer.id);

        this.cancelOffer(offer);
    });

    this._manager.on('pollSuccess', () => {
        this.steamIsDown = false;
    });

    this._manager.on('pollFailure', err => {
        this.debug('steam is down: %s', err.message);

        this.steamIsDown = true;
    });

    this._manager.on('newOffer', offer => {
        if (this.autoOfferAccept) {
            this.acceptOffer(offer);
        }
    });

    const changedOfferHandler = (offer, oldState) => {
        this.debug('the offer #%s changed state from %s to %s', offer.id, oldState, offer.state);

        /*will emit newItems and newItems# + offer.id events with new items in your steam inventory*/
        this.getReceivedItems(offer);
    };

    this._manager.on('receivedOfferChanged', (offer, oldState) => {
        this.emit('receivedOfferChanged', offer, oldState);
        changedOfferHandler(offer, oldState);
    });

    this._manager.on('sentOfferChanged', (offer, oldState) => {
        this.emit('sentOfferChanged', offer, oldState);
        changedOfferHandler(offer, oldState);
    });
};

/**
 * Set _manager cookies if there is no cookies take it's from file
 * @param {Object} [cookies] - cookies you take after login
 * @private
 * */
SteamManager.prototype.setCookies = function setCookies (cookies) {
    this.debug('setting up cookies');

    const cookiesFile = 'cookies_' + this.steamID.getSteamID64() + '_' + this.appID + '_' + this.contextID + '.json';
    cookies = cookies || this._cookiesStorage.read(cookiesFile);

    if(!cookies){
        return this.oAuthLogin();
    }

    this.debug('set up new cookies');

    this._loginBusy = false;
    this._manager.setCookies(cookies);
    this._cookiesStorage.save(cookiesFile, cookies);
};

/**
 * Handle an error, each function not in this file should use this function
 * @param {Error} err
 * @private
 * */
SteamManager.prototype._handleError = function _handleError (err) {
    if(
        err.message.indexOf('Malformed response') !== -1
        || err.message.indexOf('Not Logged In') !== -1
    ) {
        this._community.emit('sessionExpired');
    }
};

/**
 * Inherits
 * */
util.inherits(SteamManager, EventEmitter);

module.exports = SteamManager;
require('./components/trade');
require('./components/community');