// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_KEY, EXPORT_PROFILE_KEY, SAVED_LIMIT, readCollections, readExportProfiles, saveCollection, saveExportProfile, deleteCollection, deleteExportProfile } from "../src/lib/proSavedWorkspaces.ts";

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test("collections preserve independent query and category, without storing capture data", () => {
  const store = memory();
  const selection = { query: "work", filter: "images" };
  saveCollection("Work", selection, store);
  selection.query = "changed";
  assert.deepEqual(readCollections(store), [{ name: "Work", query: "work", filter: "images" }]);
  assert.throws(() => saveCollection("Work", selection, store));
  assert.deepEqual(deleteCollection("Work", store), []);
});
test("profiles use the native preset allowlist, reject corrupt data and enforce limits", () => {
  const store = memory();
  store.setItem(EXPORT_PROFILE_KEY, JSON.stringify([{ name: "Bad", preset: "../bad" }, { name: "Good", preset: "png3840" }]));
  assert.deepEqual(readExportProfiles(store), [{ name: "Good", preset: "png3840" }]);
  assert.throws(() => saveExportProfile("Good", "original", store));
  assert.throws(() => saveExportProfile("bad", "../bad", store));
  for (let i = 1; i < SAVED_LIMIT; i++) saveExportProfile("Profile " + i, "webp", store);
  assert.throws(() => saveExportProfile("Over limit", "png", store));
  assert.equal(deleteExportProfile("Good", store).length, SAVED_LIMIT - 1);
  store.setItem(COLLECTION_KEY, JSON.stringify([{ name: "invalid", query: "a", filter: "other" }]));
  assert.deepEqual(readCollections(store), []);
});
test("storage failure is explicit rather than reporting an unsaved profile as saved", () => {
  const store = { getItem: () => null, setItem: () => { throw Error("quota"); } };
  assert.throws(() => saveExportProfile("Work", "png", store), /quota/);
});
