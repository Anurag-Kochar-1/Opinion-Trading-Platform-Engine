import fs from 'fs';
import path from 'path';
import { Engine } from '../trade/engine';

export class SnapshotManager {
    private snapshotDir: string;
    private snapshotFile: string;
    private intervalId: NodeJS.Timer | null;

    constructor(
        private engine: Engine,
        snapshotDir = 'snapshots'
    ) {
        this.snapshotDir = snapshotDir;
        this.snapshotFile = path.join(this.snapshotDir, 'data.json');
        this.intervalId = null;
        this.initializeSnapshotDirectory();
    }

    private initializeSnapshotDirectory(): void {
        if (!fs.existsSync(this.snapshotDir)) {
            fs.mkdirSync(this.snapshotDir, { recursive: true });
        }

        if (!fs.existsSync(this.snapshotFile)) {
            console.log('Creating new snapshot file as none exists');
            this.saveDataToFile({
                lastUpdated: new Date().toISOString(),
                data: {
                    orderbook: {},
                    stockBalances: {},
                    inrBalances: {}
                }
            });
        } else {
            console.log('Existing snapshot file found');
        }
    }

    public startSnapshots(intervalMinutes: number): void {
        const interval = intervalMinutes * 60 * 1000;

        if (!fs.existsSync(this.snapshotFile)) {
            this.takeSnapshot();
        }

        this.intervalId = setInterval(() => {
            this.takeSnapshot();
        }, interval);

        console.log(`Snapshot system started. Taking snapshots every ${intervalMinutes} minutes`);
    }

    public stopSnapshots(): void {
        if (this.intervalId) {
            // @ts-ignore
            clearInterval(this?.intervalId);
            this.intervalId = null;
            console.log('Snapshot system stopped');
        }
    }

    public takeSnapshot(): void {
        try {
            const engineData = this.engine.getSnapshotData();
            const snapshotData = {
                lastUpdated: new Date().toISOString(),
                data: engineData
            };
            this.saveDataToFile(snapshotData);
            console.log(`Snapshot taken successfully at ${snapshotData.lastUpdated}`);
        } catch (error) {
            console.error(`Error taking snapshot: ${error}`);
        }
    }

    private saveDataToFile(data: any): void {
        try {
            const tempFile = `${this.snapshotFile}.temp`;
            fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
            fs.renameSync(tempFile, this.snapshotFile);
        } catch (error) {
            console.error(`Failed to save snapshot: ${JSON.stringify(error)}`);
            if (fs.existsSync(`${this.snapshotFile}.temp`)) {
                fs.unlinkSync(`${this.snapshotFile}.temp`);
            }
            throw error;
        }
    }

    public loadLatestSnapshot(): boolean {
        try {
            if (!fs.existsSync(this.snapshotFile)) {
                console.log('No snapshot file found');
                return false;
            }

            const fileContent = fs.readFileSync(this.snapshotFile, 'utf-8');
            const snapshotData = JSON.parse(fileContent);
            if (!this.isValidSnapshotData(snapshotData)) {
                console.error('Invalid snapshot data structure');
                return false;
            }
            this.engine.restoreFromSnapshot(snapshotData.data);
            console.log(`Loaded snapshot from ${snapshotData.lastUpdated}`);
            return true;
        } catch (error) {
            console.error('Error loading snapshot:', error);
            return false;
        }
    }

    private isValidSnapshotData(data: any): boolean {
        return (
            data &&
            data.lastUpdated &&
            data.data &&
            typeof data.data === 'object' &&
            'orderbook' in data.data &&
            'stockBalances' in data.data &&
            'inrBalances' in data.data
        );
    }


}