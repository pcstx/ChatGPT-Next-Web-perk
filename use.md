# 使用说明

## docker构建命令
1. 登录镜像仓库
docker login --username=苏州破壳网络 registry.cn-hangzhou.aliyuncs.com

2. 构建镜像
docker build -f Dockerfile -t registry.cn-hangzhou.aliyuncs.com/perk-ai/perkai:perkai01 .

3. 推送镜像
docker pull registry.cn-hangzhou.aliyuncs.com/perk-ai/perkai:perkai01

## 运行容器命令
```
docker run -d -p 3000:3000 \
   --name=perkAI \
   -e OPENAI_API_KEY="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" \
   --net=host \
   -e PROXY_URL="http://127.0.0.1:7890" \
   registry.cn-hangzhou.aliyuncs.com/perk-ai/perkai:perkai01
```

## 访问方式
1. nginx反代了3000端口到ai2.pushplus.plus域名。
2. ai2.pushplus.plus域名dns解析到120.27.219.66服务器上。

## 其他说明
1、服务部署在国内服务器上，通过代理方式访问openAI接口。

