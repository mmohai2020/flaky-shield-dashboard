export interface ClientConfig {
    id: string;
    name: string;
    region?: string;
}

export class ClientFactory {
    static getClient(id: string): ClientConfig {
        return {
            id: id || 'default-client',
            name: id ? `Client ${id}` : 'Default Client',
            region: 'US-East'
        };
    }
}
