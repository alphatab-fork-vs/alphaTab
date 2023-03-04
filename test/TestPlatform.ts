import { IOHelper } from '@src/io/IOHelper';
import * as fs from 'fs';

/**
 * @partial
 */
export class TestPlatform {
    /**
     * @target web
     * @partial
     */
    public static saveFile(name: string, data: Uint8Array): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let x: XMLHttpRequest = new XMLHttpRequest();
            x.open('POST', 'http://localhost:8090/save-file/', true);
            x.onload = () => {
                resolve();
            };
            x.onerror = () => {
                reject();
            };
            const form = new FormData();
            form.append('file', new Blob([data]), name);
            x.send(form);
        });
    }

    /**
     * @target web
     * @partial
     */
    public static loadFile(path: string): Promise<Uint8Array> {
        return fs.promises.readFile(path);
    }

    /**
     * @target web
     * @partial
     */
    public static async listDirectory(path: string): Promise<string[]> {
        const dir = await fs.promises.opendir(path);
        try {
            const entries = [];
            while (true) {
                const entry = await dir.read();
                if (entry) {
                    entries.push(entry.name);
                } else {
                    break;
                }
            }
            return entries;
        } finally {
            await dir.close();
        }
    }

    public static async loadFileAsString(path: string): Promise<string> {
        const data = await TestPlatform.loadFile(path);
        return IOHelper.toString(data, 'UTF-8');
    }

    public static changeExtension(file: string, extension: string): string {
        let lastDot: number = file.lastIndexOf('.');
        if (lastDot === -1) {
            return file + extension;
        } else {
            return file.substr(0, lastDot) + extension;
        }
    }
}
