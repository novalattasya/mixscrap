const axios = require("axios");

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.proxyUrl =
            "https://raw.githubusercontent.com/proxifly/free-proxy-list/refs/heads/main/proxies/countries/ID/data.json";
        this.lastFetch = 0;
        this.CACHE_DURATION = 1000 * 60 * 60; // 1 hour
    }

    async fetchProxies() {
        const now = Date.now();
        if (this.proxies.length > 0 && now - this.lastFetch < this.CACHE_DURATION) {
            return;
        }

        try {
            console.log("Fetching new proxies...");
            const response = await axios.get(this.proxyUrl);
            if (Array.isArray(response.data)) {
                this.proxies = response.data;
                this.lastFetch = now;
                console.log(`Fetched ${this.proxies.length} proxies.`);
            }
        } catch (error) {
            console.error("Failed to fetch proxies:", error.message);
        }
    }

    async getRandomProxy() {
        await this.fetchProxies();

        if (this.proxies.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * this.proxies.length);
        const proxyData = this.proxies[randomIndex];

        // Construct proxy configuration for axios
        // The list contains objects like:
        // { "proxy": "socks5://...", "protocol": "socks5", "ip": "...", "port": ... }

        return {
            protocol: proxyData.protocol,
            host: proxyData.ip,
            port: proxyData.port,
        };
    }
}

module.exports = new ProxyManager();
