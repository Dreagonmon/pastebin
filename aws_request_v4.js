const encoder = new TextEncoder();

const bufferToHex = (buffer) => {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("").toLowerCase();
};

const sha256 = async (text) => {
  return await window.crypto.subtle.digest("SHA-256", encoder.encode(text));
};

const hmacSha256 = async (hashKey, content) => {
  const key = await window.crypto.subtle.importKey(
    "raw",
    typeof hashKey === "string" ? encoder.encode(hashKey) : hashKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await window.crypto.subtle.sign("HMAC", key, encoder.encode(content));
};

const awsEncodeURIComponent = (str) => {
  // double encode "="
  return encodeURIComponent(str.replace(/[\=]/g, "%3D"))
    .replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
};

const awsEncodeHeader = (str) => {
  return str.trim().replace(/ +/g, " ");
};

const padAndStr = (num) => num < 10 ? "0" + num.toString() : num.toString();

const awsDateISOString = (date) => {
  return `${date.getUTCFullYear()}${padAndStr(date.getUTCMonth()+1)}${padAndStr(date.getUTCDate())}T${padAndStr(date.getUTCHours())}${padAndStr(date.getUTCMinutes())}${padAndStr(date.getUTCSeconds())}Z`;
}

const awsDateString = (date) => {
  return `${date.getUTCFullYear()}${padAndStr(date.getUTCMonth()+1)}${padAndStr(date.getUTCDate())}`;
}

const createCanonicalRequest = async (httpMethod, httpEncodedURL, httpHeader, httpBody, date=new Date(Date.UTC()), isHttp2=false) => {
  let cr = httpMethod.toUpperCase() + "\n";
  const url = new URL(httpEncodedURL)
  const search = url.searchParams;
  const searchKeys = [...search.keys()];
  searchKeys.sort();
  const queryString = searchKeys.map((sk) => {
    return awsEncodeURIComponent(sk) + "=" + awsEncodeURIComponent(search.get(sk));
  }).join("&");
  const header = new Map();
  for (const k in httpHeader) { header.set(k.toLowerCase(), httpHeader[k]); }
  const headerKeys = [...header.keys()];
  if (!isHttp2 && !headerKeys.includes("host")) {
    header.set("host", url.host);
    headerKeys.push("host");
  }
  if (isHttp2 && !headerKeys.includes(":authority")) {
    header.set(":authority", url.host);
    headerKeys.push(":authority");
  }
  if (!headerKeys.includes("x-amz-date")) {
    const dateISOString = awsDateISOString(date);
    httpHeader["X-Amz-Date"] = dateISOString;
    header.set("x-amz-date", dateISOString);
    headerKeys.push("x-amz-date");
  }
  headerKeys.sort();
  const headerString = headerKeys.map((hk) => {
    return hk + ":" + awsEncodeHeader(header.get(hk));
  }).join("\n") + "\n";
  const signedHeaders = headerKeys.join(";");
  cr += encodeURI(url.pathname) + "\n";
  cr += queryString + "\n";
  cr += headerString + "\n";
  cr += signedHeaders + "\n";
  cr += bufferToHex(await sha256(httpBody));
  return [bufferToHex(await sha256(cr)), signedHeaders];
};

const createStringToSign = (date, region, service, cr) => {
  const scope = `${awsDateString(date)}/${region}/${service}/aws4_request`;
  let sts = "AWS4-HMAC-SHA256\n";
  sts += awsDateISOString(date) + "\n";
  sts += scope + "\n";
  sts += cr;
  return [sts, scope];
};

const generateSigningKey = async (sk, date, region, service) => {
  let k = await hmacSha256("AWS4" + sk, awsDateString(date));
  k = await hmacSha256(k, region);
  k = await hmacSha256(k, service);
  k = await hmacSha256(k, "aws4_request");
  return k;
};

export const request = async (httpMethod, url, header, body, service, region, accessId, accessKey) => {
  body = body ? body : "";
  const dt = new Date();
  const [cr, signedHeaders] = await createCanonicalRequest(httpMethod, url, header, body, dt);
  const [sts, scope] = createStringToSign(dt, region, service, cr);
  const signingKey = await generateSigningKey(accessKey, dt, region, service);
  const signature = bufferToHex(await hmacSha256(signingKey, sts));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  header["Authorization"] = authorization;
  // console.log(signature)
  // console.log(authorization)
  if (httpMethod.toUpperCase() === "GET") {
    return await fetch(url, {
      method: httpMethod,
      headers: header,
    });
  } else {
    return await fetch(url, {
      method: httpMethod,
      headers: header,
      body
    });
  }
}
