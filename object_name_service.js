import { request } from "./aws_request_v4.js";
import { grantOrThrow } from "https://deno.land/std@0.145.0/permissions/mod.ts";
await grantOrThrow({ name: "env" });
const AWS_ACCESS_ID = Deno.env.get("AWS_ACCESS_ID");
const AWS_ACCESS_KEY = Deno.env.get("AWS_ACCESS_KEY");
const AWS_REGION = Deno.env.get("AWS_REGION");
const TABLE_NAME = Deno.env.get("TABLE_NAME");
export const TABLE_TTL_FIELD = Deno.env.get("TABLE_TTL_FIELD");
export const TABLE_KEY_FIELD = Deno.env.get("TABLE_KEY_FIELD");
const SERVICE = "dynamodb";
const VERSION = "20120810";
const DYNAMODB_URL = `https://${SERVICE}.${AWS_REGION}.amazonaws.com/`
await grantOrThrow({ name: "net", host: new URL(DYNAMODB_URL).host });

const dynamoDBRequest = async (target, body) => {
    const header = {
        "X-Amz-Target": `DynamoDB_${VERSION}.${target}`,
        "Content-Type": "application/x-amz-json-1.0",
    }
    const body_string = JSON.stringify(body);
    return await request("POST", DYNAMODB_URL, header, body_string, SERVICE, AWS_REGION, AWS_ACCESS_ID, AWS_ACCESS_KEY);
};

const convertFromDynamoValue = (dynValue) => {
    for (const key in dynValue) {
        if (Object.hasOwnProperty.call(dynValue, key)) {
            const value = dynValue[key];
            if (key == "S") return value;
            else if (key == "N") return Number.parseFloat(value);
            else if (key == "BOOL") return value;
            else if (key == "NULL") return null;
            else if (key == "L") return value.map(dv => convertFromDynamoValue(dv));
            else if (key == "M") return convertFromDynamoObject(value);
        }
    }
    return null;
};

const convertFromDynamoObject = (dynItem) => {
    const jsObj = {};
    for (const key in dynItem) {
        if (Object.hasOwnProperty.call(dynItem, key)) {
            const value = dynItem[key];
            jsObj[key] = convertFromDynamoValue(value);
        }
    }
    return jsObj;
};

const convertToDynamoValue = (value) => {
    if (typeof value === "number") return { "N": value.toString() };
    else if (typeof value === "string") return { "S": value };
    else if (typeof value === "boolean") return { "BOOL": value };
    else if (value === null) return { "NULL": true };
    else if (Array.isArray(value)) return value.map(v => convertToDynamoValue(v));
    else if (typeof value === "object") return convertToDynamoObject(value);
    throw new Error("Type not support.");
};

const convertToDynamoObject = (jsObj) => {
    const dynItem = {};
    for (const key in jsObj) {
        if (Object.hasOwnProperty.call(jsObj, key)) {
            const value = jsObj[key];
            try {
                dynItem[key] = convertToDynamoValue(value);
            } catch {
                console.error(`can not convert "${key}"`);
            }
        }
    }
    return { "M": dynItem };
};

export const getItemByKey = async (itemName) => {
    const body = { "TableName": TABLE_NAME, "Key": { [TABLE_KEY_FIELD]: convertToDynamoValue(itemName) } }
    const item = await (await dynamoDBRequest("GetItem", body)).json();
    const dynItem = item.Item;
    if (dynItem) {
        return convertFromDynamoObject(dynItem);
    } else {
        // not found
        return undefined;
    }
};

export const putItem = async (itemObject) => {
    const body = { "TableName": TABLE_NAME, "Item": convertToDynamoObject(itemObject).M };
    return await (await dynamoDBRequest("PutItem", body)).json();
}

export const updateObjectTTL = (itemObject, lifeSeconds) => {
    if (lifeSeconds < 0 && typeof itemObject[TABLE_TTL_FIELD] === "number") {
        delete itemObject[TABLE_TTL_FIELD];
    } else {
        itemObject[TABLE_TTL_FIELD] = Math.floor(Date.now() / 1000) + lifeSeconds;
    }
}
