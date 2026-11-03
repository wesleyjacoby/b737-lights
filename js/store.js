// Keeps the user's own manual PDFs in this browser (IndexedDB). Nothing is uploaded anywhere.

export const DOCS = [
	{ id: "QRH", name: "QRH", full: "Quick Reference Handbook" },
	{ id: "MEL", name: "MEL", full: "Minimum Equipment List" },
	{ id: "FCOM", name: "FCOM", full: "Flight Crew Operations Manual" },
];

// id -> { name, size, blob, saved }
export const files = {};
let idb = null;

function openDb() {
	return new Promise(function (resolve) {
		try {
			var req = indexedDB.open("b737-lights", 1);
			req.onupgradeneeded = function () {
				req.result.createObjectStore("docs");
			};
			req.onsuccess = function () {
				idb = req.result;
				resolve();
			};
			req.onerror = function () {
				resolve();
			};
		} catch (e) {
			resolve();
		}
	});
}

function dbGet(key) {
	return new Promise(function (resolve) {
		if (!idb) return resolve(null);
		try {
			var q = idb.transaction("docs").objectStore("docs").get(key);
			q.onsuccess = function () {
				resolve(q.result || null);
			};
			q.onerror = function () {
				resolve(null);
			};
		} catch (e) {
			resolve(null);
		}
	});
}

function dbPut(key, value) {
	return new Promise(function (resolve) {
		if (!idb) return resolve(false);
		try {
			var t = idb.transaction("docs", "readwrite");
			t.objectStore("docs").put(value, key);
			t.oncomplete = function () {
				resolve(true);
			};
			t.onerror = function () {
				resolve(false);
			};
			t.onabort = function () {
				resolve(false);
			};
		} catch (e) {
			resolve(false);
		}
	});
}

export async function initStore() {
	await openDb();
	for (const d of DOCS) {
		const rec = await dbGet(d.id);
		if (rec && rec.blob)
			files[d.id] = {
				name: rec.name,
				size: rec.size,
				blob: rec.blob,
				saved: true,
			};
	}
}

export async function saveFile(id, file) {
	const ok = await dbPut(id, { name: file.name, size: file.size, blob: file });
	files[id] = { name: file.name, size: file.size, blob: file, saved: ok };
	requestPersistence();
	return ok;
}

// The light data (data/lights.json) is kept off GitHub, so it is loaded from a file and stored here too.
// Returns { name, size, text, saved } or null.
export async function loadDataRecord() {
	const rec = await dbGet("lights-data");
	return rec && rec.text
		? { name: rec.name, size: rec.size, text: rec.text, saved: true }
		: null;
}

export async function saveDataRecord(name, size, text) {
	const ok = await dbPut("lights-data", { name: name, size: size, text: text });
	requestPersistence();
	return ok;
}

// Ask the browser not to clear the stored PDFs when it is short of space.
export function requestPersistence() {
	try {
		if (navigator.storage && navigator.storage.persist)
			navigator.storage.persist();
	} catch (e) {
		/* optional */
	}
}
