import { ITEM_NAME_FIELD, ITEM_KEY_TTL } from "../item.js";
import { newItem, updateItemTTL } from "../item.js";
import { ITEM_GROUPS, ItemDatabase } from "./index.js";
import { assertEquals, assertFalse, assert } from "https://deno.land/std@0.194.0/testing/asserts.ts";
import { FakeTime } from "https://deno.land/std@0.194.0/testing/time.ts";

const TEST_DB_PATH = "./test.db";
const TEST_ITEM_NAME = "item-test";
const TEST_ITEM_CONTENT = "item-test2";
const TEST_ITEM_PASSWORD = "item-test3";

Deno.test({
    name: "item-database-init",
    fn: async () => {
        // check permissions
        assertEquals((await Deno.permissions.request({ name: "read", path: TEST_DB_PATH })).state, "granted");
        assertEquals((await Deno.permissions.request({ name: "write", path: TEST_DB_PATH })).state, "granted");
        assertEquals((await Deno.permissions.request({ name: "env", variable: "DENO_REGION" })).state, "granted");
        // tests
        const db = new ItemDatabase(TEST_DB_PATH);
        await db.init();
        db.close();
        // clean up
    },
});

Deno.test({
    name: "item-database-put-get",
    fn: async () => {
        const time = new FakeTime();
        const db = new ItemDatabase(TEST_DB_PATH);
        const item = newItem(TEST_ITEM_NAME);
        updateItemTTL(item, 300);
        item.content = TEST_ITEM_CONTENT;
        item.password = TEST_ITEM_PASSWORD;
        const itemTTL = item[ ITEM_KEY_TTL ];
        try {
            await db.init();
            // put item
            assert(await db.putItem(item));
            // get item
            const nitem = await db.getItemByKey(TEST_ITEM_NAME);
            assertEquals(nitem[ ITEM_NAME_FIELD ], TEST_ITEM_NAME);
            assertEquals(nitem[ ITEM_KEY_TTL ], itemTTL);
            assertEquals(nitem.content, TEST_ITEM_CONTENT);
            assertEquals(nitem.password, TEST_ITEM_PASSWORD);
            // advance time
            time.tick(11 * 60 * 1000);
            const nitem2 = await db.getItemByKey(TEST_ITEM_NAME);
            assertFalse(nitem2);
        } finally {
            time.restore();
            db.close();
        }
    },
});

Deno.test({
    name: "item-database-clean",
    fn: async () => {
        const time = new FakeTime();
        const db = new ItemDatabase(TEST_DB_PATH);
        try {
            await db.init();
            // put item
            for (let i = 0; i < 52; i++) {
                const item = newItem(TEST_ITEM_NAME + i.toString());
                updateItemTTL(item, 300);
                assert(await db.putItem(item));
            }
            // advance time
            time.tick(11 * 60 * 1000);
            // clean
            let cleaned = await db.cleanItemTask();
            assert(cleaned);
            cleaned = await db.cleanItemTask();
            assertFalse(cleaned);
            // check
            const records = db.kv.list({ prefix: ITEM_GROUPS }, { consistency: "strong" });
            for await (const record of records) {
                console.log(record.key);
                assert(false);
                // should not leave any records.
            }
        } finally {
            time.restore();
            db.close();
        }
    },
});

Deno.test({
    name: "item-database-clean-conflict-region",
    fn: async () => {
        const time = new FakeTime();
        let db = new ItemDatabase(TEST_DB_PATH, "region1");
        try {
            await db.init();
            // put item
            for (let i = 0; i < 7; i++) {
                const item = newItem(TEST_ITEM_NAME + i.toString());
                updateItemTTL(item, 300);
                assert(await db.putItem(item));
            }
            // advance time
            time.tick(22 * 60 * 1000);
            // clean 1
            let cleaned = await db.cleanItemTask(1); // clean 1 page (5)
            assert(cleaned);
            db.close();
            // clean 2
            db = new ItemDatabase(TEST_DB_PATH, "region2");
            await db.init();
            cleaned = await db.cleanItemTask(1); // clean 1 page (5)
            assertFalse(cleaned);
            db.close();
            // clean 3
            db = new ItemDatabase(TEST_DB_PATH, "region1");
            await db.init();
            cleaned = await db.cleanItemTask(1); // clean 1 page (5)
            assert(cleaned);
            // check
            const records = db.kv.list({ prefix: ITEM_GROUPS }, { consistency: "strong" });
            for await (const record of records) {
                console.log(record.key);
                assert(false);
                // should not leave any records.
            }
        } finally {
            time.restore();
            db.close();
        }
    },
});

Deno.test({
    name: "item-database-test-clean-up",
    fn: async () => {
        try {
            await Deno.remove(TEST_DB_PATH);
            await Deno.remove(TEST_DB_PATH + "-shm");
            await Deno.remove(TEST_DB_PATH + "-wal");
        } catch (err) {
            if (err instanceof Deno.errors.NotFound) {
                return;
            } else {
                throw err;
            }
        }
    },
});
