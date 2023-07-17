import { ITEM_NAME_FIELD, ITEM_KEY_TTL } from "./item.js";
import { newItem, updateItemTTL } from "./item.js";
import { assertEquals, assert } from "https://deno.land/std@0.194.0/testing/asserts.ts";
import { FakeTime } from "https://deno.land/std@0.194.0/testing/time.ts";

Deno.test({
    name: "item-new",
    fn: () => {
        const NAME = "test-item";
        const item = newItem(NAME);
        assertEquals(item[ ITEM_NAME_FIELD ], NAME);
        assert(typeof item[ ITEM_KEY_TTL ] === "number");
        assert(typeof item.content === "string");
        assert(typeof item.password === "string");
    },
});

Deno.test({
    name: "item-update-ttl",
    fn: () => {
        const LIFE_TIME = 300;
        const time = new FakeTime();
        try {
            const item = newItem("test-item");
            updateItemTTL(item, LIFE_TIME);
            assert(typeof item[ ITEM_KEY_TTL ] === "number");
            const expectTime = Math.floor(time.now / 1000) + LIFE_TIME;
            assertEquals(item[ ITEM_KEY_TTL ], expectTime);
        } finally {
            time.restore();
        }
    },
});
