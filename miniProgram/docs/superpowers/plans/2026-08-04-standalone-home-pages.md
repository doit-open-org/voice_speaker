# Standalone Home Feature Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the home page's additional voice selection, recording workflow, and background-music selection into three standalone WeChat Mini Program pages without losing state or behavior.

**Architecture:** The home page remains the owner of synthesis state. Each new page receives initial data and returns selections through `EventChannel`; selection pages own and release their preview player, while the recorder page owns upload and redirects to the existing result page.

**Tech Stack:** Native WeChat Mini Program JavaScript/WXML/WXSS, Vant Weapp, Node.js built-in `assert` and `vm` for tests.

---

## File Map

- Modify `app.json`: register the three pages.
- Modify `pages/index/index.js`: replace popup toggles with page navigation and event handlers.
- Modify `pages/index/index.wxml`: remove the voice, BGM-list, and recorder popups.
- Modify `pages/index/index.json`: remove components no longer rendered by the home page.
- Create `pages/voiceSelect/*`: voice-list page and its preview lifecycle.
- Create `pages/bgmSelect/*`: reusable BGM-list page and its preview lifecycle.
- Create `pages/recorder/*`: recorder page, BGM settings, state synchronization, and upload.
- Modify `components/voiceList/*`: accept the current selected ID and handle empty input safely.
- Modify `components/bgmList/*`: accept the current selected ID and handle empty input safely.
- Modify `components/recorder/recorder.js`: release recorder listeners and suppress detached callbacks.
- Modify `components/recorder/recorder.wxml`: correct the existing misspelled `view` elements.
- Create `tests/standalone-pages.test.js`: executable behavior and structure regression suite.
- Modify `package.json`: expose the suite as `npm test`.

### Task 1: Establish the page contract tests

**Files:**
- Create: `tests/standalone-pages.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add a small test runner and page loader**

The runner reads project files, loads page scripts through `vm`, supplies `Page`, `getApp`, `wx`, `require`, and an `EventChannel` double, and prints one `PASS` line per test. The page factory must attach this real `setData` behavior:

```js
function createPage(config, extra = {}) {
  return {
    ...config,
    ...extra,
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData(values) {
      Object.assign(this.data, values)
    }
  }
}
```

- [ ] **Step 2: Add failing route and registration assertions**

Assert that `app.json` contains:

```js
[
  'pages/voiceSelect/voiceSelect',
  'pages/recorder/recorder',
  'pages/bgmSelect/bgmSelect'
]
```

Load `pages/index/index.js`, call `moreVoice`, `showRecorderPop`, and `showBgmList`, and assert their `wx.navigateTo` URLs. Assert that each success callback emits its initialization payload and each `events` handler updates the corresponding home-page state.

- [ ] **Step 3: Run the contract suite and verify RED**

Run: `node tests/standalone-pages.test.js`

Expected: FAIL because the three pages are not registered and the home handlers still toggle popup booleans.

- [ ] **Step 4: Add the test command**

Add to `package.json`:

```json
"scripts": {
  "test": "node tests/standalone-pages.test.js"
}
```

- [ ] **Step 5: Commit the red tests**

```powershell
git add tests/standalone-pages.test.js package.json
git commit -m "test: define standalone page contracts"
```

### Task 2: Implement the voice selection page

**Files:**
- Modify: `app.json`
- Create: `pages/voiceSelect/voiceSelect.js`
- Create: `pages/voiceSelect/voiceSelect.json`
- Create: `pages/voiceSelect/voiceSelect.wxml`
- Create: `pages/voiceSelect/voiceSelect.wxss`
- Modify: `components/voiceList/voiceList.js`
- Modify: `components/voiceList/voiceList.wxml`
- Test: `tests/standalone-pages.test.js`

- [ ] **Step 1: Add failing voice-page behavior tests**

Test that `initVoiceSelect` populates `voiceList`, `activeVoiceId`, and `hasVoiceList`; `chooseVoice` emits the full selected voice and calls `wx.navigateBack`; `playVoice` prefixes `https://` only when needed; `onHide` pauses; and `onUnload` destroys the preview player.

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `node tests/standalone-pages.test.js voice`

Expected: FAIL because `pages/voiceSelect/voiceSelect.js` does not exist.

- [ ] **Step 3: Implement the page**

The page registers `initVoiceSelect` in `onLoad`, falls back to `GET /user/voices/categories` from `onReady` when no list arrived, and uses these event contracts:

```js
this.eventChannel.on('initVoiceSelect', ({ voiceList = {}, activeVoiceId = 0 }) => {
  this.applyVoiceList(voiceList, activeVoiceId)
})

this.eventChannel.emit('voiceSelected', voice)
wx.navigateBack()
```

Render the existing component only while category data is available:

```xml
<voicelist wx:if="{{hasVoiceList}}" id="voiceListCom"
  voiceList="{{voiceList}}" activeId="{{activeVoiceId}}"
  bind:moreVoice="goBack" bind:chooseVoice="chooseVoice"
  bind:playVoice="playVoice" bind:pauseMusic="pauseMusic" />
<view wx:else class="empty-state">暂无主播</view>
```

- [ ] **Step 4: Make `voiceList` input-safe**

Add an `activeId` property and derive `currentVoices` whenever `voiceList` or `activeKey` changes. Render `currentVoices` instead of indexing nested values directly.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node tests/standalone-pages.test.js voice`

Expected: all voice tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add app.json pages/voiceSelect components/voiceList tests/standalone-pages.test.js
git commit -m "feat: add standalone voice selection page"
```

### Task 3: Implement the reusable BGM selection page

**Files:**
- Modify: `app.json`
- Create: `pages/bgmSelect/bgmSelect.js`
- Create: `pages/bgmSelect/bgmSelect.json`
- Create: `pages/bgmSelect/bgmSelect.wxml`
- Create: `pages/bgmSelect/bgmSelect.wxss`
- Modify: `components/bgmList/bgmList.js`
- Modify: `components/bgmList/bgmList.wxml`
- Test: `tests/standalone-pages.test.js`

- [ ] **Step 1: Add failing BGM-page behavior tests**

Mirror the voice tests for `initBgmSelect`, `bgmSelected`, preview pause/end/error state, URL normalization, and player destruction. Verify the page can use any opener channel rather than assuming the opener is the home page.

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `node tests/standalone-pages.test.js bgm`

Expected: FAIL because `pages/bgmSelect/bgmSelect.js` does not exist.

- [ ] **Step 3: Implement the page and component safety**

Use `GET /user/bgms/categories` as the `onReady` fallback. The selection path is:

```js
const bgm = this.findItemById(id)
if (!bgm) return
this.eventChannel.emit('bgmSelected', bgm)
wx.navigateBack()
```

Add `activeId` and derived `currentBgms` to the existing BGM list component, then render the derived array.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/standalone-pages.test.js bgm`

Expected: all BGM tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add app.json pages/bgmSelect components/bgmList tests/standalone-pages.test.js
git commit -m "feat: add reusable background music page"
```

### Task 4: Implement the recorder page and synchronized BGM settings

**Files:**
- Modify: `app.json`
- Create: `pages/recorder/recorder.js`
- Create: `pages/recorder/recorder.json`
- Create: `pages/recorder/recorder.wxml`
- Create: `pages/recorder/recorder.wxss`
- Modify: `components/recorder/recorder.js`
- Modify: `components/recorder/recorder.wxml`
- Test: `tests/standalone-pages.test.js`

- [ ] **Step 1: Add failing recorder-page tests**

Test initialization, opening the BGM picker, receiving `bgmSelected`, confirming settings, resetting both selection and confirmed parameters, emitting `bgmStateChanged`, upload form data, upload failure cleanup, and successful `wx.redirectTo('../generate/generate')`.

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `node tests/standalone-pages.test.js recorder`

Expected: FAIL because `pages/recorder/recorder.js` does not exist.

- [ ] **Step 3: Implement recorder state and nested BGM navigation**

Use the opener channel for synchronization:

```js
syncBgmState() {
  this.eventChannel.emit('bgmStateChanged', {
    activeBgmInfo: this.data.activeBgmInfo,
    bgmSetDetail: this.data.bgmSetDetail
  })
}
```

Use another `EventChannel` when navigating from the recorder page to `bgmSelect`.

- [ ] **Step 4: Move upload ownership to the recorder page**

Build `formData` from the current confirmed settings, always call `wx.hideLoading()` on success, API failure, JSON parse failure, and transport failure, and on success execute:

```js
app.globalData.generate = result.data
wx.redirectTo({ url: '../generate/generate' })
```

- [ ] **Step 5: Release recorder listeners**

Store recorder callbacks on the component instance, ignore callbacks after `detached`, stop an active recording during detach, and call available `offStart`, `offStop`, and `offError` methods.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node tests/standalone-pages.test.js recorder`

Expected: all recorder tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add app.json pages/recorder components/recorder tests/standalone-pages.test.js
git commit -m "feat: add standalone recording page"
```

### Task 5: Connect the home page and remove old popups

**Files:**
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.json`
- Modify: `components/bgmSet/bgmSet.js`
- Test: `tests/standalone-pages.test.js`

- [ ] **Step 1: Extend the failing home integration tests**

Assert that selection events update home state, reset clears both BGM fields, recorder synchronization updates both BGM fields, and the removed components no longer appear in `index.wxml` or `index.json`.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/standalone-pages.test.js home`

Expected: FAIL while the home page still contains old popup markup and component registrations.

- [ ] **Step 3: Implement navigation handlers**

Use `wx.navigateTo({ events, success })` for all three routes. Remove home preview-player creation and the old preview/upload handlers. Keep `bgmSetPop` and `bgmset` on the home page.

- [ ] **Step 4: Make reset state consistent**

Set both fields when resetting:

```js
this.setData({
  activeBgmInfo: {},
  bgmSetDetail: {}
})
```

Update the BGM settings component so its reset operation emits `resetBgm` and then opens the standalone picker as before.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`

Expected: all standalone-page tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add pages/index components/bgmSet tests/standalone-pages.test.js package.json
git commit -m "refactor: route home tools to standalone pages"
```

### Task 6: Verify and package

**Files:**
- Create: output ZIP outside the repository working tree.

- [ ] **Step 1: Run all tests freshly**

Run: `npm test`

Expected: every test prints PASS and the process exits 0.

- [ ] **Step 2: Run syntax checks**

Run `node --check` for `pages/voiceSelect/voiceSelect.js`, `pages/bgmSelect/bgmSelect.js`, `pages/recorder/recorder.js`, and modified component scripts.

Expected: all commands exit 0 with no syntax errors.

- [ ] **Step 3: Validate project JSON and Git state**

Parse every modified `.json` file with PowerShell `ConvertFrom-Json`, run `git diff --check`, and inspect `git status --short` plus the commits created during implementation.

- [ ] **Step 4: Create the deliverable**

Create `outputs/voiceSpeaker-standalone-pages.zip` from the completed `voiceSpeaker` directory without modifying the original desktop ZIP.

- [ ] **Step 5: Inspect the ZIP**

Open the archive read-only and verify it contains the three page quartets, tests, design, plan, and repository metadata.
