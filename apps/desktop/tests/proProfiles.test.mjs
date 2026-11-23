// Snapvere by Brendigo
import test from "node:test";
import assert from "node:assert/strict";
import { safeProfile, profileSlots, presetProfile, PRO_PRESET_NAMES, PRO_PROFILE_KEY } from "../src/lib/proProfiles.ts";
import { proProfileCopy } from "../src/lib/proProfileCopy.ts";
import { LANGUAGES } from "../src/lib/i18n.ts";
test("Pro slots reject malformed data and never load untrusted format", () => {
  assert.equal(PRO_PROFILE_KEY, "proRecordingProfilesV1");
  assert.equal(profileSlots([{recordFormat:"avi"},null,{},{}]).length,6);
  assert.ok(profileSlots([{recordFormat:"avi"},null,{},{}]).every(x=>x===null));
});
test("Linux presets cannot enable MP4 or audio and Free profiles remain unchanged", () => {
  const w=presetProfile("tutorial",false);
  assert.equal(PRO_PRESET_NAMES.length, 8);
  for (const preset of PRO_PRESET_NAMES) {
    const windows = presetProfile(preset, false);
    const linux = presetProfile(preset, true);
    assert.ok(windows);
    assert.equal(linux.recordFormat, "gif");
    assert.equal(linux.recordMic, false);
    assert.equal(linux.recordSystemAudio, false);
    assert.equal(linux.recordCursor, false);
  }
  const migrated = profileSlots([presetProfile("compact"), presetProfile("archive")]);
  assert.equal(migrated.length, 6);
  assert.equal(migrated[0].recordFormat, "gif");
  assert.equal(migrated[1].recordQuality, 100);
  assert.ok(migrated.slice(2).every(slot => slot === null));
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
