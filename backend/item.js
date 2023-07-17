export const ITEM_NAME_FIELD = "iname";
export const ITEM_KEY_TTL = "ttl";

/**
 * @typedef {Object} Pasteitem
 * @property {string} iname item name
 * @property {number} ttl item time to live
 * @property {string} content item content
 * @property {string} password item password
 */

/**
 * @param {string} name
 * @returns {Pasteitem}
 */
export const newItem = (name) => {
    return {
        [ ITEM_NAME_FIELD ]: name,
        [ ITEM_KEY_TTL ]: Math.floor(Date.now() / 1000),
        content: "",
        password: "",
    };
};

/**
 * @param {Pasteitem} item
 * @param {number} lifeSeconds
 * @returns {Pasteitem}
 */
export const updateItemTTL = (item, lifeSeconds) => {
    item[ ITEM_KEY_TTL ] = Math.floor(Date.now() / 1000) + Math.floor(lifeSeconds);
    return item;
};
