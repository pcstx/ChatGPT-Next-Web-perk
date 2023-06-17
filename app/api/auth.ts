import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import md5 from "spark-md5";
import { ACCESS_CODE_PREFIX } from "../constant";
import { LRUCache } from "lru-cache";

const cache = new LRUCache({
  max: 500, // 最多缓存500个条目
  ttl: 1000 * 60 * 60, // 每个条目最长缓存1个小时
});

function getIP(req: NextRequest) {
  let ip = req.ip ?? req.headers.get("x-real-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (!ip && forwardedFor) {
    ip = forwardedFor.split(",").at(0) ?? "";
  }

  return ip;
}

function parseApiKey(bearToken: string) {
  const token = bearToken.trim().replaceAll("Bearer ", "").trim();
  const isOpenAiKey = !token.startsWith(ACCESS_CODE_PREFIX);

  return {
    accessCode: isOpenAiKey ? "" : token.slice(ACCESS_CODE_PREFIX.length),
    apiKey: isOpenAiKey ? token : "",
  };
}

/**
 * 处理pushplus的token登录状态
 * 返回：0:未登录，1:免费会员不可用，2:免费会员可用，3:会员，
 */
async function handlerPerkAuth(perkToken: string) {
  if (perkToken && perkToken.length) {
    const isVip: boolean = !!cache.get(`pp-${perkToken}`);
    if (!isVip) {
      const res = await fetch(
        "https://www.pushplus.plus/api/customer/user/chatGPT",
        {
          headers: {
            pushToken: perkToken,
          },
        },
      );
      const response = await res.json();
      const isFreeUser = response?.data?.freeUse ?? false;
      const isVip = !!(response?.data?.isVip ?? 0);
      if (response.code == 302) {
        return 0; // 登录过期了
      }
      if (isVip) {
        cache.set(`pp-${perkToken}`, "1");
        return 3;
      }
      if (isFreeUser) {
        return 2;
      } else {
        return 1;
      }
    } else {
      //读取缓存
      return 3;
    }
  } else {
    console.log("[Auth] need sign in pushplus");
    return 0;
  }
}

export async function auth(req: NextRequest) {
  const authToken = req.headers.get("Authorization") ?? "";

  // check if it is openai api key or user token
  const { accessCode, apiKey: token } = parseApiKey(authToken);

  const hashedCode = md5.hash(accessCode ?? "").trim();

  const serverConfig = getServerSideConfig();
  console.log("[Auth] allowed hashed codes: ", [...serverConfig.codes]);
  console.log("[Auth] got access code:", accessCode);
  console.log("[Auth] hashed access code:", hashedCode);
  console.log("[User IP] ", getIP(req));
  console.log("[Time] ", new Date().toLocaleString());

  if (serverConfig.needCode && !serverConfig.codes.has(hashedCode) && !token) {
    return {
      error: true,
      msg: !accessCode ? "empty access code" : "wrong access code",
    };
  }

  // if user does not provide an api key, inject system api key
  if (!token) {
    const apiKey = serverConfig.apiKey;
    if (apiKey) {
      console.log("[Auth] use system api key");
      req.headers.set("Authorization", `Bearer ${apiKey}`);
    } else {
      console.log("[Auth] admin did not provide an api key");
    }
    if (req.url.indexOf("v1/chat/completions") > 0) {
      const perkAuthType = await handlerPerkAuth(
        req.cookies.get("pushToken")?.value ?? "",
      );
      if (perkAuthType != 3 && perkAuthType != 2) {
        if (perkAuthType == 0) {
          return {
            customError: true,
            msg: "请先登录[pushplus](//www.pushplus.plus/login.html?backUrl=https%3A%2F%2Fai.pushplus.plus)或在[设置](/#/settings)中输入API Key",
          };
        }
        if (perkAuthType == 1) {
          return {
            customError: true,
            msg: "免费额度使用完毕，点击[开通会员](//www.pushplus.plus/vip.html)或在[设置](/#/settings)中输入API Key",
          };
        }
      }
    } else {
      console.log("[Auth] Restrict Chat Only");
    }
  } else {
    console.log("[Auth] use user api key");
  }

  return {
    error: false,
  };
}
