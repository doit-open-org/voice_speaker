# Common Templates Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a common templates page that returns advertising copy to the home textarea and previews or sends generic audio into the generate workflow.

**Architecture:** The home page opens a standalone `commonTemplate` page and receives selected content through EventChannel. The new page owns paginated API loading, derived categories, row expansion, and one audio context; the existing generate page gains URL normalization for complete generic-audio URLs.

**Tech Stack:** WeChat Mini Program JavaScript, WXML, WXSS, Vant Weapp icons, Node.js assertion tests.

---

### Task 1: Page Registration And Home Content Return

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Modify: `app.json`
- Modify: `pages/index/index.js`

- [ ] **Step 1: Write the failing navigation test**

Add `common templates page registers and returns selected copy to home`. Assert `app.json` contains `pages/commonTemplate/commonTemplate`, call `page.openTemp()`, assert navigation to `../commonTemplate/commonTemplate`, invoke `navigationCall.options.events.templateSelected({ content: 'Selected copy' })`, and assert `page.data.inputText === 'Selected copy'`.

- [ ] **Step 2: Verify RED**

Run `cmd /c npm test -- "common templates page registers"`.

Expected: FAIL because the page is not registered and `openTemp` does not exist.

- [ ] **Step 3: Implement registration and EventChannel listener**

Register the new page in `app.json`. Add:

```js
openTemp() {
  wx.navigateTo({
    url: '../commonTemplate/commonTemplate',
    events: {
      templateSelected: ({ content = '' } = {}) => {
        this.setData({ inputText: content })
      }
    }
  })
}
```

- [ ] **Step 4: Verify GREEN**

Run `cmd /c npm test -- "common templates page registers"`.

Expected: PASS.

### Task 2: Advertising Templates Tab

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Create: `pages/commonTemplate/commonTemplate.js`
- Create: `pages/commonTemplate/commonTemplate.json`
- Create: `pages/commonTemplate/commonTemplate.wxml`
- Create: `pages/commonTemplate/commonTemplate.wxss`

- [ ] **Step 1: Write failing advertising-template tests**

Add focused tests that load the new page with request doubles and assert:

```js
assert.equal(requestCalls[0].url, '/ad-templates/')
assert.equal(requestCalls[0].data.page_size, 100)
assert.equal(requestCalls[0].needAuth, false)
assert.deepEqual(Array.from(page.data.templateCategories, item => item.name), [
  '添加模版', '我的模版', '美味小吃', '商场百货'
])
assert.equal(page.data.activeCategoryKey, 'category:美味小吃')
assert.equal(page.data.currentTemplates[0].content, 'Copy A')
```

Select the two synthetic categories and assert `currentTemplates` is empty and `templateEmptyText` is `暂无内容`. Select a real category, toggle one ID twice, and assert its `expanded` state changes `false -> true -> false`. Call `useTemplate`, assert the EventChannel emitted the exact content, and assert navigation back.

Add a pagination response with `total_pages: 2` and assert page 2 is requested and combined. Add a rejected request and assert the page retains the synthetic categories and sets `templateEmptyText` to `模板加载失败`.

- [ ] **Step 2: Verify RED**

Run `cmd /c npm test -- "advertising templates"`.

Expected: FAIL because `pages/commonTemplate/commonTemplate.js` does not exist.

- [ ] **Step 3: Implement page state and paginated loading**

Create page data for `activeTab`, template categories/items, independent loading and empty text, generic items, and `playingId`. Implement `requestAllPages(url)` using `GET`, `{ page, page_size: 100 }`, and `needAuth: false`; require business code `200`, then combine later pages in order.

On load, store the opener EventChannel, create audio, and return `loadAdTemplates()`. Derive categories with keys `add`, `mine`, and `category:<name>`, preserving the first occurrence of each category. Select the first real category after success.

Implement `selectCategory`, `updateCurrentTemplates`, `toggleTemplate`, and `useTemplate`. Store expansion IDs outside page data and decorate current rows with `expanded`.

- [ ] **Step 4: Implement advertising WXML and WXSS**

Create a two-tab header. In the advertising tab render a `180rpx` sidebar and scrollable list pane. Render every template as one row with a three-line collapsed content area, fixed `使用` command, and Vant `arrow-down` or `arrow-up` icon. Expanded rows remove the line clamp. Render loading and empty/error states without nested cards.

Configure `commonTemplate.json` with a white navigation bar titled `常用模板` and register `@vant/weapp/icon/index`.

- [ ] **Step 5: Verify GREEN**

Run `cmd /c npm test -- "advertising templates"`.

Expected: all advertising-template tests PASS.

### Task 3: Generic Voice Preview And Send

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Modify: `pages/commonTemplate/commonTemplate.js`
- Modify: `pages/commonTemplate/commonTemplate.wxml`
- Modify: `pages/commonTemplate/commonTemplate.wxss`
- Modify: `pages/generate/generate.js`

- [ ] **Step 1: Write failing generic-voice tests**

Add tests that switch to the generic tab and assert lazy request options for `/generic-voices`. Preview two items and assert the single audio context replaces `src`, the active item pauses on a second tap, pause/ended/error clear `playingId`, hide pauses, and unload destroys the context.

Call `sendGeneric` and assert:

```js
assert.equal(app.globalData.generate.audio_url, 'http://media.local/alarm.mp3')
assert.equal(app.globalData.generate.file_name, 'alarm.mp3')
assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
```

Add generate-page assertions that complete `http://` and `https://` URLs stay unchanged while `media.example.com/a.mp3` becomes `https://media.example.com/a.mp3`.

- [ ] **Step 2: Verify RED**

Run `cmd /c npm test -- "generic voice"`.

Expected: FAIL because generic loading, playback, send, and URL normalization do not exist.

- [ ] **Step 3: Implement generic loading and playback**

Make `switchTab` load `/generic-voices` only once. Implement `normalizeAudioUrl`, `playGeneric`, `resetPlaying`, `pauseAudio`, and lifecycle cleanup around one `InnerAudioContext`. Use Vant `play-circle` and `pause-circle` icons with stable hit areas.

- [ ] **Step 4: Implement send and generate URL compatibility**

Map `music_file` to `app.globalData.generate.audio_url`, preserve the voice object, derive `file_name` from the URL pathname or fall back to `<name>.mp3`, and navigate to `../generate/generate`.

In `pages/generate/generate.js`, add:

```js
normalizeAudioUrl(audioUrl) {
  if (!audioUrl) return ''
  return /^https?:\/\//.test(audioUrl) ? audioUrl : `https://${audioUrl}`
}
```

Clone global generate data in `onLoad` and normalize its URL without mutating `app.globalData.generate`.

- [ ] **Step 5: Verify GREEN and regressions**

Run:

```powershell
cmd /c npm test -- "generic voice"
node --check pages/commonTemplate/commonTemplate.js
node --check pages/index/index.js
node --check pages/generate/generate.js
node --check tests/standalone-pages.test.js
git diff --check
cmd /c npm test
```

Expected: all common-template focused tests pass. The complete suite must add no failure beyond the two recorded baseline failures: the existing safe-area navigation assertion and the existing favorite-star `88rpx` style assertion.

