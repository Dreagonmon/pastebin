/**需要配置环境变量
 * export AWS_ACCESS_ID=<AWS_ACCESS_ID>
 * export AWS_ACCESS_KEY=<AWS_ACCESS_KEY>
 * export AWS_REGION=ap-east-1
 * export TABLE_NAME=object_name_service
 * export TABLE_KEY_FIELD=name
 * export TABLE_TTL_FIELD=expdate
 * export DENO_DEPLOY_TOKEN=<DENO_DEPLOY_TOKEN>
 */
import { serve, Server } from "https://deno.land/std@0.194.0/http/server.ts";
import { grantOrThrow } from "https://deno.land/std@0.194.0/permissions/mod.ts";
import { ItemDatabase } from "./backend/denokv/index.js";
import { newItem, updateItemTTL } from "./backend/item.js";

const PORT = 8000;
const FAVICON_WEBP_DATA = atob(
    "UklGRigBAABXRUJQVlA4WAoAAAAQAAAAPwAAPwAAQUxQSNMAAAABgFXbWt7oSkBCJOCgn4" +
    "Q4aBwUB60EnAQHwUEroQ6Ig/vwMeXjm5/HWRExAfirymXcVdhpugc34UnjZ/BSaL574UQn" +
    "MkNmxfvR+CWGOyTbcY9mt8ZP7Ui2m9HOz6eQu0miJyaD2Hy1OPagLkkkdY7hThJJRfExVl" +
    "UBgKVjvABAVXWsqaTwsntBJ9XGqKUT7WJHFKdATptT4AZhy3U4bwGOJv9rYfWxGVWVfWRV" +
    "x7Jq1zAvXKnz2Ko8r2MovgoMw+npDBZYqp+6wDi9fbwTZopD/DUBAFZQOCAuAAAAkAMAnQ" +
    "EqQABAAD6RSKBMJaQjIiIIALASCWkAABA3U1AFeIW5AAD++M71eAAAAA=="
);
const TIME_TO_LIFE = 60 * 60 * 24; // 1 day
const FIELD_MAX_LENGTH = 64;
const FIELD_CONTENT_MAX_LENGTH = 32768;

await grantOrThrow(
    { name: "net", host: `0.0.0.0:${PORT}` },
    { name: "read", path: "./index.html" },
);

const response = (code = 200, data = null) => {
    return new Response(
        JSON.stringify({ code, data }),
        {
            headers: {
                "Content-Type": "application/json",
            }
        }
    );
};

const db = new ItemDatabase();
await db.init();

/**handler 主函数
 * name, key, password, 其中readKey不会被记录，在客户端完成加密解密。
 * /update: name, password, content 对象存在且没过期的话要求密码相同，否则保存新的对象
 *     content限制长度为16384个字符。对象过期时间1天。
 * /query: name -> content
 * @type {import("https://deno.land/std@0.194.0/http/server.ts").Handler} 
 */
const handler = async (req, _) => {
    try {
        const url = new URL(req.url);
        const path = url.pathname;
        if (req.method.toUpperCase() === "POST") {
            const body = await req.json();
            if (path === "/update") {
                if (!body.name || !body.content || !body.password) {
                    return response(406);
                }
                if (
                    body.name.length > FIELD_MAX_LENGTH ||
                    body.content.length > FIELD_CONTENT_MAX_LENGTH ||
                    body.password.length > FIELD_MAX_LENGTH
                ) {
                    return response(406);
                }
                const oldItem = await db.getItemByKey(body.name);
                if (oldItem && oldItem.password && body.password !== oldItem.password) {
                    return response(403);
                }
                const item = newItem(body.name);
                item.content = body.content;
                item.password = body.password;
                updateItemTTL(item, TIME_TO_LIFE);
                await db.putItem(item);
                return response(200, "ok");
            } else if (path === "/query") {
                if (!body.name) {
                    return response(406);
                }
                const item = await db.getItemByKey(body.name);
                if (!item) {
                    return response(404);
                }
                return response(200, item.content);
            }
            return response(404);
        } else if (req.method.toUpperCase() === "GET") {
            if (path === "/" || path === "/index.html") {
                const f = await Deno.open("./index.html", { read: true });
                return new Response(f.readable, {
                    headers: {
                        "Content-Type": "text/html",
                    }
                });
            } else if (path === "/favicon.webp" || path === "/favicon.ico") {
                return new Response(
                    FAVICON_WEBP_DATA,
                    {
                        headers: {
                            "Content-Type": "image/webp",
                        }
                    }
                );
            }
            return response(404);
        }
    } finally {
        // db.close();
        db.cleanItemTask(); // clean database but don't wait
    }
};

export const getServer = (port) => {
    return new Server({ port, handler });
};

if (import.meta.main) {
    await serve(handler);
}
