import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import md5 from "spark-md5";
import { ACCESS_CODE_PREFIX } from "../constant";
import { OPENAI_URL } from "./common";

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
  console.log("token:" + token);
  if (!token) {
    const apiKey = serverConfig.apiKey;
    if (apiKey) {
      console.log("[Auth] use system api key");
      req.headers.set("Authorization", `Bearer ${apiKey}`);
    } else {
      console.log("[Auth] admin did not provide an api key");
    }

    if (req.cookies.get("pushToken")?.value) {
      //请求判断是否会员
      const res = await fetch(
        "http://www.pushplus.plus/api/customer/user/myInfo",
        {
          headers: {
            pushToken: req.cookies.get("pushToken")?.value || "",
          },
        },
      );
      const response = await res.json();
      if (response.code === 302) {
        return {
          customError: true,
          msg: "请先登录[pushplus](//www.pushplus.plus/login.html?backUrl=https://ai.pushplus.plus)或在[设置](/#/settings)中输入API Key",
        };
      }
      if (response?.data?.vipUserResponseDto?.isVip != 1) {
        return {
          customError: true,
          msg: "此功能仅供会员使用，点击[开通会员](//www.pushplus.plus/vip.html)或在[设置](/#/settings)中输入API Key",
        };
      }
    } else {
      console.log("没有pushToken");
      return {
        customError: true,
        msg: "请先登录[pushplus](//www.pushplus.plus/login.html?backUrl=https://ai.pushplus.plus)或在[设置](/#/settings)中输入API Key",
      };
    }
  } else {
    console.log("[Auth] use user api key");
  }

  return {
    error: false,
  };
}
