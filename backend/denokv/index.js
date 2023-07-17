import { ITEM_NAME_FIELD, ITEM_KEY_TTL } from "../item.js";
export const ITEM_GROUPS = [ "items" ];
const DB_CLEAN_CURSOR_KEY = [ "idb", "clean_cursor" ];
const DB_CLEAN_INSTANCE_KEY = [ "idb", "clean_instance" ];
const DB_CLEAN_TIME_KEY = [ "idb", "clean_time" ];
const DB_CLEAN_BATCH_SIZE = 5;
const DB_CLEAN_INTERVAL = 10 * 60; // sec

const getDenoDeployInstanceId = async () => {
    if ((await Deno.permissions.query({ name: "env", variable: "DENO_REGION" })).state == "granted") {
        const instanceId = Deno.env.get("DENO_REGION");
        if (instanceId) {
            return instanceId;
        }
    }
    return "single-instance";
};

const getTimeSeconds = () => {
    return Math.floor(Date.now() / 1000);
};

export class ItemDatabase {
    /**
     * @param {string} [dbpath] 
     * @param {string} [instanceId] 
     */
    constructor (dbpath = undefined, instanceId = undefined) {
        /** @type {Deno.Kv} */
        this._kvPath = dbpath;
        this.kv = null;
        this.instanceId = instanceId;
        this._test_delay = 0;
    }

    _set_test_delay (delay) {
        this._test_delay = delay;
    }

    async init () {
        console.log("init database");
        if (!this.instanceId) {
            this.instanceId = await getDenoDeployInstanceId();
        }
        if (this._kvPath) {
            this.kv = await Deno.openKv(this._kvPath);
        } else {
            this.kv = await Deno.openKv();
        }
    }

    close () {
        this.kv.close();
    }

    /**
     * @param {string} name
     * @returns {Promise<import("../item.js").Pasteitem | null>}
     */
    async getItemByKey (name) {
        const now = getTimeSeconds();
        const { versionstamp, value } = await this.kv.get([ ...ITEM_GROUPS, name ], { consistency: "eventual" });
        if (versionstamp && value[ ITEM_KEY_TTL ] > now) {
            // is avaliable
            return value;
        }
        return null;
    }

    /**
     * @param {import("../item.js").Pasteitem} item
     * @returns {Promise<boolean>}
     */
    async putItem (item) {
        const rst = await this.kv.set([ ...ITEM_GROUPS, item[ ITEM_NAME_FIELD ] ], item);
        return rst.ok;
    }

    /**
     * @param {number} [repeat_times=-1]
     * @returns {Promise<boolean>}
     */
    async cleanItemTask (repeat_times = -1) {
        const now = getTimeSeconds();
        while (true) {
            const [
                recordCursor,
                recordInstance,
                recordTime,
            ] = await this.kv.getMany([
                DB_CLEAN_CURSOR_KEY,
                DB_CLEAN_INSTANCE_KEY,
                DB_CLEAN_TIME_KEY,
            ], { consistency: "eventual" });
            const atom = this.kv.atomic();
            atom.check(recordCursor, recordInstance, recordTime);
            // check if we should run clean task
            if (now < recordTime.value + DB_CLEAN_INTERVAL) {
                // not enough time, check if we should continue clean task
                if (this.instanceId !== recordInstance.value) {
                    // not this instance.
                    return false;
                }
                if (recordCursor.versionstamp === null || recordCursor.value === null || recordCursor.value === "") {
                    // not in the middle of clean task
                    return false;
                }
            }
            // list and clean
            const listOptions = { limit: DB_CLEAN_BATCH_SIZE, consistency: "eventual" };
            if (recordCursor.versionstamp !== null && recordCursor.value !== null && recordCursor.value !== "") {
                listOptions.cursor = recordCursor.value;
            }
            let listCursor = "";
            const recordItems = this.kv.list({ prefix: ITEM_GROUPS }, listOptions);
            for await (const record of recordItems) {
                const itemKey = record.key;
                /** @type {import("../item.js").Pasteitem} */
                const item = record.value;
                if (item[ ITEM_KEY_TTL ] <= now) {
                    atom.delete(itemKey);
                }
            }
            listCursor = recordItems.cursor;
            // update clean task information
            atom.set(DB_CLEAN_CURSOR_KEY, listCursor);
            atom.set(DB_CLEAN_INSTANCE_KEY, this.instanceId);
            atom.set(DB_CLEAN_TIME_KEY, now);
            // commit
            if (this._test_delay > 0) {
                // sleep for a while
                console.log(this.instanceId, "waiting", this._test_delay);
                await new Promise(rs => setTimeout(rs, this._test_delay));
                console.log(this.instanceId, "waiting", this._test_delay, "finished.");
            }
            const commitResult = await atom.commit();
            if (!commitResult.ok) {
                // failed to clean
                return false;
            }
            // once break
            repeat_times--;
            // finish break
            if (listCursor === null || listCursor === "") {
                break;
            }
            if (repeat_times === 0) {
                break;
            }
        }
        return true;
    }
}
