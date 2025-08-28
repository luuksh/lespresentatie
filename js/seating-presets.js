// seating-presets.js — v1.0
// Drop-in opslag & beheer van klassenopstellingen via localStorage + export/import


const STORAGE_KEY = 'lespresentatie.presets.v1';
const VERSION = 1;


/**
* Data model in localStorage
* {
* version: 1,
* classes: {
* [classId]: {
* presets: {
* [presetName]: { createdAt, updatedAt, arrangement }
* },
* lastUsedPreset: ""
* }
* }
* }
*/


class PresetStore {
constructor(storageKey = STORAGE_KEY) {
this.key = storageKey;
this.state = this.#load();
}
#blank() { return { version: VERSION, classes: {} }; }
#load() {
try {
const raw = localStorage.getItem(this.key);
if (!raw) return this.#blank();
const parsed = JSON.parse(raw);
if (!parsed.version) parsed.version = 1; // simple forward compat
if (!parsed.classes) parsed.classes = {};
return parsed;
} catch (e) {
console.warn('PresetStore load error, resetting', e);
return this.#blank();
}
}
#save() { localStorage.setItem(this.key, JSON.stringify(this.state)); }


list(classId) {
const cls = this.state.classes[classId];
if (!cls) return [];
return Object.keys(cls.presets || {}).sort((a,b)=>a.localeCompare(b,'nl'));
}
get(classId, name) {
return this.state.classes?.[classId]?.presets?.[name] || null;
}
upsert(classId, name, arrangement) {
if (!this.state.classes[classId]) this.state.classes[classId] = { presets:{}, lastUsedPreset:"" };
const now = new Date().toISOString();
}
