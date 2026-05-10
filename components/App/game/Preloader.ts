import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';

export class Preloader {
    static models: Map<string, Gfx3MeshJSM> = new Map();
    static progress: number = 0;
    static isLoaded: boolean = false;
    static isLoading: boolean = false;

    static async loadAll(models: string[], onProgress: (p: number) => void) {
        if (this.isLoaded) {
            onProgress(100);
            return;
        }

        if (this.isLoading) {
            console.warn('Preloader::loadAll: Already loading, waiting...');
            while (this.isLoading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            onProgress(100);
            return;
        }
        
        console.log('Preloader::loadAll: Starting load for', models);
        this.isLoading = true;
        this.progress = 0;
        this.isLoaded = false;
        
        const total = models.length;
        let loadedCount = 0;

        const updateProgress = () => {
            loadedCount++;
            this.progress = (loadedCount / total) * 100;
            onProgress(this.progress);
        };

        const modelPromises = models.map(async (path) => {
            console.log(`Preloader::loading: ${path}`);
            const mesh = new Gfx3MeshJSM();
            await mesh.loadFromFile(path);
            this.models.set(path, mesh);
            updateProgress();
            console.log(`Preloader::loaded: ${path} (${this.progress}%)`);
        });

        try {
            await Promise.all([...modelPromises]);
            this.isLoaded = true;
            this.progress = 100;
        } finally {
            this.isLoading = false;
        }
        
        console.log('Preloader::complete: All models loaded');
        onProgress(100);
    }

    static getModel(path: string): Gfx3MeshJSM {
        const m = this.models.get(path);
        if (!m) throw new Error(`Model not found: ${path}`);
        return m;
    }
}
