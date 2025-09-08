const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const yaml = require('js-yaml');

class RSSProxyServer {
  constructor() {
    this.config = this.loadConfig();
    this.server = null;
  }

  loadConfig() {
    try {
      const yamlContent = fs.readFileSync('./rss-proxy-config.yaml', 'utf8');
      console.log('Loaded configuration from rss-proxy-config.yaml');
      return yaml.load(yamlContent);
    } catch (error) {
      console.error('Failed to load config:', error.message);
      process.exit(1);
    }
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (!pathname.startsWith('/rsshub/')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found - Only /rsshub/* paths are supported');
      return;
    }

    const rssPath = pathname.substring(8);
    console.log(`[${new Date().toISOString()}] Requesting: ${rssPath}`);

    // Filter enabled providers only
    const enabledProviders = this.config.providers.filter(provider => {
      if (typeof provider === 'string') return true; // String providers are always enabled
      return provider.enabled !== false; // Object providers default to enabled
    });

    if (enabledProviders.length === 0) {
      console.error('No enabled providers available');
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable - No enabled providers');
      return;
    }

    for (const provider of enabledProviders) {
      try {
        const providerUrl = typeof provider === 'string' ? provider : provider.url;
        const useProxy = typeof provider === 'object' ? provider.useProxy : this.config.proxy.enabled;
        const providerName = typeof provider === 'string' ? provider : `${provider.url} (enabled: ${provider.enabled !== false})`;
        
        console.log(`Trying provider: ${providerName} (proxy: ${useProxy})`);
        
        const feedUrl = `${providerUrl}/${rssPath}`;
        const feedData = await this.fetchFeed(feedUrl, useProxy);
        
        if (feedData) {
          console.log(`Successfully fetched from ${providerUrl}`);
          
          res.writeHead(200, {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'max-age=300'
          });
          
          res.end(feedData);
          return;
        }
      } catch (error) {
        console.error(`Failed to fetch from ${typeof provider === 'string' ? provider : provider.url}:`, error.message);
        continue;
      }
    }

    console.error('All enabled providers failed for:', rssPath);
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Service Unavailable - All enabled providers failed');
  }

  fetchFeed(feedUrl, useProxy) {
    return new Promise((resolve, reject) => {
      const parsedUrl = url.parse(feedUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      
      if (useProxy && isHttps) {
        this.fetchThroughProxy(parsedUrl, feedUrl, useProxy).then(resolve).catch(reject);
        return;
      }
      
      // Direct connection (no proxy or HTTP)
      this.fetchDirect(parsedUrl, feedUrl, useProxy).then(resolve).catch(reject);
    });
  }

  fetchThroughProxy(parsedUrl, feedUrl, useProxy) {
    return new Promise((resolve, reject) => {
      const targetHost = parsedUrl.hostname;
      const targetPort = parsedUrl.port || 443;
      const proxyHost = this.config.proxy.host;
      const proxyPort = this.config.proxy.port;
      
      console.log(`Establishing CONNECT tunnel to ${targetHost}:${targetPort} via proxy ${proxyHost}:${proxyPort}`);
      
      const connectOptions = {
        hostname: proxyHost,
        port: proxyPort,
        path: `${targetHost}:${targetPort}`,
        method: 'CONNECT',
        headers: {
          'Host': `${targetHost}:${targetPort}`,
          'Proxy-Connection': 'Keep-Alive'
        }
      };
      
      const connectReq = http.request(connectOptions);
      
      connectReq.on('connect', (res, socket, head) => {
        console.log('CONNECT response status:', res.statusCode);
        
        if (res.statusCode === 200) {
          console.log('Tunnel established, making HTTPS request...');
          
          const httpsOptions = {
            hostname: targetHost,
            port: targetPort,
            path: parsedUrl.path,
            method: 'GET',
            headers: {
              'User-Agent': 'RSS-Proxy-Server/1.0',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            socket: socket
          };
          
          const httpsReq = https.request(httpsOptions, (httpsRes) => {
            console.log('HTTPS Status Code:', httpsRes.statusCode);
            
            if (httpsRes.statusCode >= 300 && httpsRes.statusCode < 400) {
              const redirectUrl = httpsRes.headers.location;
              if (redirectUrl) {
                console.log(`Redirecting to: ${redirectUrl}`);
                this.fetchFeed(feedUrl, useProxy).then(resolve).catch(reject);
                return;
              }
            }

            if (httpsRes.statusCode !== 200) {
              reject(new Error(`HTTP ${httpsRes.statusCode}: ${httpsRes.statusMessage}`));
              return;
            }

            let data = '';
            httpsRes.on('data', chunk => {
              data += chunk;
            });

            httpsRes.on('end', () => {
              console.log(`Received ${data.length} bytes`);
              resolve(data);
            });
          });
          
          httpsReq.on('error', (error) => {
            reject(new Error(`HTTPS request error: ${error.message}`));
          });
          
          httpsReq.end();
        } else {
          reject(new Error(`CONNECT failed with status: ${res.statusCode}`));
        }
      });
      
      connectReq.on('error', (error) => {
        reject(new Error(`CONNECT request error: ${error.message}`));
      });
      
      connectReq.on('timeout', () => {
        connectReq.destroy();
        reject(new Error('CONNECT request timeout'));
      });
      
      connectReq.setTimeout(this.config.proxy.timeout || this.config.timeout);
      connectReq.end();
    });
  }

  fetchDirect(parsedUrl, feedUrl, useProxy) {
    return new Promise((resolve, reject) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: 'GET',
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'RSS-Proxy-Server/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      };
      
      const request = httpModule.request(options, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log(`Redirecting to: ${redirectUrl}`);
            this.fetchFeed(feedUrl, useProxy).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      });
      
      request.on('error', (error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      
      request.setTimeout(this.config.timeout);
      request.end();
    });
  }

  start() {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        console.error('Request handling error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      });
    });

    this.server.listen(this.config.port, () => {
      const enabledProviders = this.config.providers.filter(p => 
        typeof p === 'string' || p.enabled !== false
      );
      
      console.log(`RSS Proxy Server running on http://localhost:${this.config.port}`);
      console.log(`Enabled providers:`, enabledProviders.map(p => {
        if (typeof p === 'string') return `${p} (enabled: true, proxy: ${this.config.proxy.enabled})`;
        return `${p.url} (enabled: ${p.enabled !== false}, proxy: ${p.useProxy})`;
      }).join(', '));
      console.log(`Global proxy: ${this.config.proxy.enabled ? `enabled (${this.config.proxy.host}:${this.config.proxy.port})` : 'disabled'}`);
      console.log('\nUsage: Subscribe to http://localhost:' + this.config.port + '/rsshub/PATH in your RSS reader');
      console.log('Example: http://localhost:' + this.config.port + '/rsshub/cctv/xwlb');
    });

    process.on('SIGINT', () => {
      console.log('\nShutting down server...');
      this.server.close(() => {
        console.log('Server stopped');
        process.exit(0);
      });
    });
  }
}

const proxyServer = new RSSProxyServer();
proxyServer.start();
