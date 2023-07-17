import { getServer } from "./index.js";
import { assertEquals, assert } from "https://deno.land/std@0.194.0/testing/asserts.ts";

const SERVER_PORT = 8000;
const API_ENTRY = `http://127.0.0.1:${SERVER_PORT}`;

const apiGet = async (apiPath) => {
    const url = `${API_ENTRY}${apiPath}`;
    return await fetch(url, {
        method: "GET",
        keepalive: false,
        headers: {
            "Connection": "close",
        },
    });
}

const apiPost = async (apiPath, params) => {
    const url = `${API_ENTRY}${apiPath}`;
    return await fetch(url, {
        body: JSON.stringify(params),
        method: "POST",
        keepalive: false,
        headers: {
            "Connection": "close",
            "Content-Type": "application/json",
        },
    });
}

Deno.test({
    name: "server",
    fn: async (t) => {
        const server = getServer(SERVER_PORT);
        const servePromise = server.listenAndServe();
        await new Promise(rs => setTimeout(rs, 200));
        await t.step({
            name: "fetch-index-html",
            fn: async (_t) => {
                const resp = await apiGet("");
                assertEquals(resp.status, 200);
                assertEquals(resp.headers.get("Content-Type"), "text/html");
                const htmlContent = await resp.text();
                assert(htmlContent.length > 0);
            },
        });
        await t.step({
            name: "update-item",
            fn: async (_t) => {
                const resp = await apiPost("/update", {
                    "name": "test",
                    "content": "Hello Dragon",
                    "password": "123456"
                });
                assertEquals(resp.status, 200);
                assertEquals(resp.headers.get("Content-Type"), "application/json");
                const respContent = await resp.json();
                assertEquals(respContent.code, 200);
            },
        });
        await t.step({
            name: "update-item-wrong-password",
            fn: async (_t) => {
                const resp = await apiPost("/update", {
                    "name": "test",
                    "content": "Hello Dragon",
                    "password": "1234567"
                });
                assertEquals(resp.status, 200);
                assertEquals(resp.headers.get("Content-Type"), "application/json");
                const respContent = await resp.json();
                assertEquals(respContent.code, 403);
            },
        });
        await t.step({
            name: "query-item",
            fn: async (_t) => {
                const resp = await apiPost("/query", {
                    "name": "test",
                });
                assertEquals(resp.status, 200);
                assertEquals(resp.headers.get("Content-Type"), "application/json");
                const respContent = await resp.json();
                assertEquals(respContent.code, 200);
                assertEquals(respContent.data, "Hello Dragon");
            },
        });
        await t.step({
            name: "query-item-wrong-name",
            fn: async (_t) => {
                const resp = await apiPost("/query", {
                    "name": "testx",
                });
                assertEquals(resp.status, 200);
                assertEquals(resp.headers.get("Content-Type"), "application/json");
                const respContent = await resp.json();
                assertEquals(respContent.code, 404);
            },
        });
        server.close();
        await servePromise;
        await new Promise(rs => setTimeout(rs, 500));
    },
});
