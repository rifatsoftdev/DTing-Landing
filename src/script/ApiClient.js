const BASE_URL = "https://api.auth.dting.online";
const AUTH_URL = "https://api.auth.dting.online";
const REFRESH_TOKEN_MESSAGE = [
    "Invalid or Expired Token",
    "Missing Authentication Token"
];


function getCookie(name) {
    return document.cookie.split("; ").find(row => row.startsWith(name + "="))?.split("=")[1];
}

export class ApiClient {
    constructor() {
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.failedQueue = [];
    }

    processQueue(error) {
        this.failedQueue.forEach(prom => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve();
            }
        });
        this.failedQueue = [];
    }

    async request(method, url, body = null, retry = true) {
        const userId = getCookie("user_id");
        const deviceId = getCookie("device_id");
        const deviceUuid = getCookie("device_uuid");

        console.log(userId, deviceId, deviceUuid);

        const options = {
            method,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Client-Type": "web"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }
        
        let response;
        try {
            response = await fetch(BASE_URL + url, options);
        } catch (networkErr) {
            throw new Error("Network error. Please check your connection.");
        }

        let data = null;
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch {
                data = null;
            }
        }

        if (data == null) {
            throw new Error("Failed to parse response");
        }


        // 401 Unauthorized - token issue handle
        if (data.status_code === 401 && retry && !this.isAuthEndpoint(url)) {
            // যদি already refresh চলতেছে, queue তে wait করো
            if (this.isRefreshing) {
                return new Promise((resolve, reject) => {
                    this.failedQueue.push({ resolve, reject });
                }).then(() => {
                    return this.request(method, url, body, false);
                }).catch(err => {
                    throw err;
                });
            }

            // Refresh শুরু করো
            this.isRefreshing = true;

            try {
                await this.handleTokenRefresh();
                this.processQueue(null);
                // Refresh সফল - original request retry
                return this.request(method, url, body, false);
            } catch (refreshError) {
                this.processQueue(refreshError);
                this.forceLogout(); // এটা দরকার
                throw refreshError;
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        }

        // Success case
        if (response.ok) {
            return data;
        }

        // বাকি সব error - 403, 404, 400, 500 etc
        const errorMessage = data?.message || data?.detail || `HTTP Error ${response.status}`;
        const error = new Error(errorMessage);
        error.data = data;
        error.status = response.status;

        throw error;
    }

    isAuthEndpoint(url) {
        const authPaths = [
            "/auth/login",
            "/auth/signin", 
            "/auth/logout",
            "/auth/refresh-access-token",
            "/auth/new-access-token"
        ];

        return authPaths.some(path => url.includes(path));
    }

    async handleTokenRefresh() {
        if (this.refreshPromise) return this.refreshPromise;
        
        this.refreshPromise = (async () => {
            const response = await fetch(AUTH_URL + "/auth/refresh-access-token", {
                method: "POST",
                credentials: "include",
                headers: { 
                    "Content-Type": "application/json",
                    "X-Client-Type": "web" 
                }
                // Body লাগবে না যদি refresh_token কুকি তে থাকে
            });
            
            if (!response.ok) {
                throw new Error("Token refresh failed");
            }
            
            return await response.json();
        })();
        
        return this.refreshPromise;
    }

    forceLogout() {
        // একবারই redirect হবে
        if (window.location.pathname.includes("login")) return;
        
        const userId = getCookie("user_id");
        const deviceId = getCookie("device_id");
        const deviceUuid = getCookie("device_uuid");

        const logoutBody = {
            user_id: userId,
            device_id: deviceId,
            device_uuid: deviceUuid
        };


        // API call for logout
        fetch(AUTH_URL + "/auth/logout", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-Client-Type": "web"
            },
            body: JSON.stringify(logoutBody)
        }).finally(() => {
            window.location.href = "https://auth.dting.online/";
        });
    }

    get(url) { return this.request("GET", url); }
    post(url, body) { return this.request("POST", url, body); }
    put(url, body) { return this.request("PUT", url, body); }
    delete(url, body = null) { return this.request("DELETE", url, body); }
}


export const apiClient = new ApiClient();