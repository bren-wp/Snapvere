// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { safeProfile, profileSlots, presetProfile, PRO_PROFILE_KEY } from "../src/lib/proProfiles.ts";
import { proProfileCopy } from "../src/lib/proProfileCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";
test("Pro slots reject malformed data and never load untrusted format", () => {
  assert.equal(PRO_PROFILE_KEY, "proRecordingProfilesV1");
  assert.equal(profileSlots([{recordFormat:"avi"},null,{},{}]).length,3);
  assert.ok(profileSlots([{recordFormat:"avi"},null,{},{}]).every(x=>x===null));
});
test("Linux presets cannot enable MP4 or audio and Free profiles remain unchanged", () => {
  const w=presetProfile("tutorial",false);
  assert.equal(w.recordFormat,"mp4");assert.equal(w.recordMic,true);
  const l=presetProfile("tutorial",true);
  assert.equal(l.recordFormat,"gif");assert.equal(l.recordMic,false);assert.equal(l.recordCursor,false);
  assert.equal(w.recordFormat,"mp4");
  assert.equal(safeProfile({...w,recordFps:99}),null);
  assert.equal(safeProfile({...w,recordMic:"true"}),null);
  assert.equal(safeProfile({...w,recordQuality:Number.NaN}),null);
});
test("Pro messages are translated in all twelve locales", () => {
  assert.equal(LANGUAGES.length,12);
  const keys=Object.keys(proProfileCopy("en"));
  for(const locale of LANGUAGES){
    const copy=proProfileCopy(locale.code);
    assert.deepEqual(Object.keys(copy),keys);
    for(const key of keys)assert.ok(copy[key].trim(),locale.code+" "+key);
  }
});
