import { putImage, dataUrlToBlob, isImageRef } from './imageStore.js';
import { readJson, writeJson, KEYS } from './storage.js';

/* ----------------------------------------------------------------
   One-time move of base64 images out of localStorage.

   Anyone who used the admin panel before the IndexedDB change has
   data URLs sitting inside `shopstream_admin_created` and
   `shopstream_admin_overrides`. Those are the single biggest consumers
   of the ~5 MB budget, so they are converted to Blobs and replaced
   with short `idb:` references.

   Runs once, guarded by a flag, and is deliberately forgiving: a
   failure here must never stop the app from loading.
   ---------------------------------------------------------------- */

const FLAG = 'shopstream_img_migrated_v1';

const isDataUrl = (value) => typeof value === 'string' && value.startsWith('data:image');

/* Convert every data URL in a list, leaving other entries untouched. */
const convertList = async (list) => {
    if (!Array.isArray(list)) return { list, moved: 0, freed: 0 };

    let moved = 0;
    let freed = 0;
    const output = [];

    for (const entry of list) {
        if (!isDataUrl(entry)) {
            output.push(entry);
            continue;
        }

        try {
            const blob = dataUrlToBlob(entry);
            // eslint-disable-next-line no-await-in-loop
            const ref = await putImage(blob);

            /* UTF-16: the string cost twice its character count. */
            freed += entry.length * 2;
            moved += 1;
            output.push(ref);
        } catch (error) {
            console.error('Could not migrate an image, keeping the original:', error);
            output.push(entry);
        }
    }

    return { list: output, moved, freed };
};

const convertRecord = async (record) => {
    let moved = 0;
    let freed = 0;
    const next = { ...record };

    if (Array.isArray(record.images)) {
        const result = await convertList(record.images);
        next.images = result.list;
        moved += result.moved;
        freed += result.freed;
    }

    if (isDataUrl(record.thumbnail)) {
        /* The cover is normally images[0]; reuse the reference we just
           made instead of storing the same bytes twice. */
        const first = next.images?.[0];

        if (isImageRef(first)) {
            freed += record.thumbnail.length * 2;
            next.thumbnail = first;
        } else {
            try {
                const ref = await putImage(dataUrlToBlob(record.thumbnail));
                freed += record.thumbnail.length * 2;
                moved += 1;
                next.thumbnail = ref;
            } catch (error) {
                console.error('Could not migrate a thumbnail:', error);
            }
        }
    }

    return { record: next, moved, freed };
};

export const migrateImagesToIdb = async () => {
    if (localStorage.getItem(FLAG)) return null;

    let moved = 0;
    let freed = 0;

    try {
        /* --- products created locally --- */
        const created = readJson(KEYS.adminCreated, []);

        if (Array.isArray(created) && created.length) {
            const out = [];
            for (const product of created) {
                // eslint-disable-next-line no-await-in-loop
                const result = await convertRecord(product);
                out.push(result.record);
                moved += result.moved;
                freed += result.freed;
            }
            if (moved) writeJson(KEYS.adminCreated, out);
        }

        /* --- edits applied to API products --- */
        const overrides = readJson(KEYS.adminOverrides, {});
        const patched = {};
        let overrideMoved = 0;

        for (const [id, patch] of Object.entries(overrides || {})) {
            // eslint-disable-next-line no-await-in-loop
            const result = await convertRecord(patch);
            patched[id] = result.record;
            overrideMoved += result.moved;
            freed += result.freed;
        }

        if (overrideMoved) {
            writeJson(KEYS.adminOverrides, patched);
            moved += overrideMoved;
        }

        writeText(FLAG, new Date().toISOString());

        if (moved) {
            console.info(
                `Migrated ${moved} image(s) to IndexedDB, freeing ~${(freed / 1024 / 1024).toFixed(2)} MB of localStorage.`
            );
        }

        return { moved, freed };
    } catch (error) {
        /* Leave the flag unset so it can be retried next load. */
        console.error('Image migration failed:', error);
        return null;
    }
};

export default migrateImagesToIdb;
