# RSSHub_hub

## A unified entry for RSSHub routes

After this program is run, you can access [RSSHub](https://docs.rsshub.app/) routes through http://localhost:1300/rsshub/ROUTES , e.g. http://localhost:1300/rsshub/cctv/xwlb
This program will try to get feed content from a series of RSSHub instances, until one of them returns a valid feed, or all RSSHub instances fail.
Then you can subscribe this fixed url in your RSS reader, without worrying about switching RSSHub instances (i.e. change feed url).

## 统一不变的 RSSHub 订阅入口

（如果不知道 [RSSHub](https://docs.rsshub.app/)，可以先到 https://docs.rsshub.app/routes/popular 看看 RSSHub 支持的 RSS 订阅路由）

运行程序后，即可通过访问本地地址来获取 RSSHub 订阅内容。地址形如 http://localhost:1300/rsshub/具体路由 ，例如 http://localhost:1300/rsshub/cctv/xwlb  （如果运行在自己的服务器 192.168.x.y, 那地址就是 http://192.168.x.y:1300/rsshub/cctv/xwlb ）

程序会从多个 RSSHub 实例尝试获取实际内容。这样在你的 RSS 阅读器里只需要订阅上面这个地址就行了，不需要操心实例失效、修改订阅地址的问题。

# Deploy 运行

## Prepare environment 准备运行环境

(First you need to install nodejs and npm, You can use [nvm ](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)to do so. 安装 nodejs 和 nvm，可借助 nvm)

```
npm i
```

## Run 运行

```
node rss-proxy-server.js
```

# Configuration 配置

Configuration file is rss-proxy-config.yaml

配置文件为 rss-proxy-config.yaml

## RSSHub instances 实例地址

RSSHub instances are configured in rss-proxy-config.yaml

配置文件里可配置多个 RSSHub 实例，包括实例 URL 地址、是否启用、是否需要通过代理访问。

```yaml
providers:
  - url: https://rsshub.app
    useProxy: true # If this instance needs proxy, set to true
    enabled: true # If want to use this instance, set to true

  - url: https://server2
    useProxy: false
    enabled: true

```

## Proxy 代理服务器

Some RSSHub instances may need to be accessed via proxy, and you can configure your proxy in this section (http proxy is supported)

对于需要通过代理服务器访问的 RSSHub 实例，可以在这里配置你的代理服务器地址（为 http 代理）

```yaml
proxy:
  enabled: true
  host: 127.0.0.1
  port: 7777
  timeout: 30000
```

## Listening Port 监听端口

```yaml
port: 1300
```

You can change the listening port here.
监听端口可以按需自行修改

# Credits 鸣谢

The RSSHub instances in config file are from https://docs.rsshub.app/guide/instances

Thanks to all the RSSHub contributors.

感谢 RSSHub 网站上列出的实例贡献者
