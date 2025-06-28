// Error Types
export class JiraApiError extends Error {
    status;
    statusText;
    constructor(message, status, statusText) {
        super(message);
        this.status = status;
        this.statusText = statusText;
        this.name = 'JiraApiError';
    }
}
export class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
    }
}
//# sourceMappingURL=index.js.map