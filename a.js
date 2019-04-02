const BOX_COMMISSION = 0.05;
const TOTAL_NUMBERS_COUNT = 10000;

const BoxItem = new Schema({
    steam_item: {
        type: String,
        required: true,
        ref: 'SteamItem'
    },
    weight: {
        type: Number,
        required: true,
        min: 1,
        max: TOTAL_NUMBERS_COUNT - 1,
        set: val => parseInt(val, 10)
    }
}, { runSettersOnQuery: true, _id : false } );

/**
 * Expectation
 * @return {Decimal|undefined}
 * */
BoxItem.virtual('expectation').get(function (){
		const probability = this.weight / TOTAL_NUMBERS_COUNT;
		return probability * this.steam_item.value;
});

const Box = new Schema({
    owner: {
        type: String,
        index: true,
        required: true,
        ref: 'User'
    },
    name: {
        type: String,
        trim: true,
        required: true,
        match: /^.{3,15}$/i,
        index: { text: true }
    },
    image: {
        type: String,
        trim: true,
        required: true,
        enum: Array.from(BoxImage)
    },
    slug: {
        type: String,
        index: { unique: true },
        required: true,
        match: /^[a-z-_\d]+$/i,
        set: val => slug(val)
    },
    type: {
        type: String,
        index: true,
        required: true,
    },
    items: {
        required: true,
        type: [BoxItem],
        validate: [
            {
                message: 'Items array must have at least 2 items',
                validator: function (v){
                    return v.length >= 2
                }
            },
            {
                message: 'All items must be unique',
                validator: function (v){
                    const compare = v.map(i => {
                        return i.steam_item
                    });

                    return _.uniq(compare).length === compare.length;
                }
            },
            {
                message: 'Weights sum must be ' + TOTAL_NUMBERS_COUNT,
                validator: function (v){
                    let counter = 0;

                    v.forEach(item => {
                        counter += item.weight;
                    });

                    return counter === TOTAL_NUMBERS_COUNT;
                }
            },
            {
                message: 'Some of items doesn\'t exists',
                isAsync: true,
                validator: function (v, cb){
                    const _ids = v.map(i => {
                        return i.steam_item;
                    });

                    this.model('SteamItem').count({
                            _id: {$in: _ids},
                            banned: false,
                            boxable: true
                        })
                        .exec()
                        .then((length) => {
                            cb(length === _ids.length)
                        })
                        .catch(() => cb(false));
                }
            },
            {
                message: 'Box min value is ' + MIN_BOX_VALUE,
                isAsync: true,
                validator: function (v, cb){
                    this.populate({
                        path: 'items.steam_item',
                        match: { banned: false, boxable: true }
                    }, (err, box = {}) => {
                        if(err || (+box.value || 0) < MIN_BOX_VALUE){
                            return cb(false);
                        }

                        return cb(true);
                    });
                }
            }
        ]

    },
    open_count: {
        default: { total: 0, daily: 0, weekly: 0 },
        type: new Schema({
            total: {
                index: true,
                select: false,
                type: Number,
                default: 0
            },
            daily: {
                index: true,
                select: false,
                type: Number,
                default: 0
            },
            weekly: {
                index: true,
                select: false,
                type: Number,
                default: 0
            }
        }, { runSettersOnQuery: true, _id : false } )
    },
    createdAt: {
        index: true,
        select: false,
        type: Date,
        default: Date.now
    }
}, { runSettersOnQuery: true, id: false });

/**
 * Calculate the price of the box
 * @return {Decimal|undefined}
 * */
Box.virtual('value').get(function (){
    const items = this.items;

    let value = 0;

    for(let i = 0; i < items.length; i++) {
        value = value + items[i].expectation;
    }
    
    /*Add commission and fixed to 2 numbers after comma with ceil*/
    value = value - value * BOX_COMMISSION;
    
    return value;
});
