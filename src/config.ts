/** When true the dashboard reads from the REST API instead of the in-browser simulator. */
export const USE_API: boolean = import.meta.env.VITE_USE_API === 'true';

/** Base URL of the API. In Docker, nginx proxies /api to the api service. */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api';
