// utils/notify-dashboard.ts
import http from 'http';

export function notifyDashboard(type: string, payload: any): void {
    try {
        const data = JSON.stringify({ type, payload });
        const req = http.request({
            hostname: 'localhost',
            port: 3001,
            path: '/api/webhook/event',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        });
        
        req.on('error', () => {
            // Dashboard might not be running, safely ignore
        });
        
        req.write(data);
        req.end();
    } catch (e) {
        // Safe fail
    }
}
