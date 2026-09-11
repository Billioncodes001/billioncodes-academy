import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyProgress, WORKSPACE_KEY, CATALOG_KEY } from '@billioncodes/learning';
import { StorageCell } from './storage';
import { decodeDownload, decodeProgress, type Download } from './catalog';

// A separate native namespace also isolates the Expo web preview from the website.
export const progressStore = new StorageCell(AsyncStorage, `native:${WORKSPACE_KEY}`, emptyProgress(), decodeProgress);
export const downloadStore = new StorageCell<Download | null>(AsyncStorage, `native:${CATALOG_KEY}`, null, decodeDownload);
