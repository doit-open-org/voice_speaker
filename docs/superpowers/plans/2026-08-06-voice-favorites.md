# Voice Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-backed favorites to the standalone voice selection page with a first-position favorites category and confirmed-only star updates.

**Architecture:** `pages/voiceSelect/voiceSelect.js` owns API calls, canonical favorite voices, pending IDs, and the derived voice-list view model. `components/voiceList` renders that model and emits an ID-only toggle event, keeping the component independent from authentication and request handling.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS, Vant Weapp icons, Node.js assertion tests.

---

### Task 1: Page Favorite State And API Flow

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Modify: `pages/voiceSelect/voiceSelect.js`

- [ ] **Step 1: Write failing page tests**

Add tests that initialize a regular voice list, load a favorite list from `GET /user/voices/favorites/list`, and assert that `我的收藏` is inserted at index `0`, the original first category remains at index `1`, and matching voices receive `isFavorite: true`.

Add a deferred toggle test using a request promise. Before resolving the promise, assert that the star state and favorites array are unchanged and that a second toggle for the same ID does not create another request. Resolve with `{ code: 200 }`, then assert that the voice is added. Repeat with `DELETE` and assert removal only after success.

Add a failure test that rejects the initial favorites request and asserts that regular categories remain present, all voices remain non-favorite, and the toast title is `收藏列表加载失败`.

- [ ] **Step 2: Run page tests and verify RED**

Run:

```powershell
node tests/standalone-pages.test.js "voice favorites"
```

Expected: FAIL because favorite loading, view-model decoration, and toggle methods do not exist.

- [ ] **Step 3: Implement the page view model**

Add page-instance fields for the base voice list and favorite voices. Build a derived list using this shape:

```js
{
  categories: [{ key: 'favorites', name: '我的收藏' }, ...baseCategories],
  voices: {
    favorites: decoratedFavoriteVoices,
    ...decoratedCategoryVoices
  }
}
```

Decorate copies of voice objects with `isFavorite` and `favoritePending`; compare IDs as strings so numeric API IDs and WXML event IDs match safely. Call `getFavoriteList()` from `onReady()` independently of the regular-list fallback.

- [ ] **Step 4: Implement confirmed-only API mutations**

Use these exact request contracts:

```js
request({
  url: '/user/voices/favorites/list',
  method: 'GET',
  needAuth: true
})

request({
  url: '/user/voices/favorite',
  method: isFavorite ? 'DELETE' : 'POST',
  data: { id: Number(id) },
  needAuth: true
})
```

Mark only `favoritePending` before awaiting. Mutate the favorite collection only when `Number(res.code) === 200`; otherwise keep the previous collection and show an add/remove failure toast. Clear pending state in `finally`.

- [ ] **Step 5: Run page tests and verify GREEN**

Run:

```powershell
node tests/standalone-pages.test.js "voice favorites"
```

Expected: all filtered favorite tests PASS.

### Task 2: Favorite Sidebar And Star Interaction

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Modify: `components/voiceList/voiceList.js`
- Modify: `components/voiceList/voiceList.wxml`
- Modify: `components/voiceList/voiceList.wxss`
- Modify: `pages/voiceSelect/voiceSelect.wxml`

- [ ] **Step 1: Write failing component and markup tests**

Assert that the component emits `favoriteVoice` with the numeric voice ID, ignores an item whose `favoritePending` flag is true, and keeps `activeKey: 1` so the first original category is selected after favorites are prepended.

Assert that markup binds `favoriteVoice` to the page, uses Vant's `star` icon, and contains the exact colors `#E20E0E` and `#D8D8D8`.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```powershell
node tests/standalone-pages.test.js "favorite star"
```

Expected: FAIL because the star control and `favoriteVoice` event do not exist.

- [ ] **Step 3: Implement the component event and markup**

Add a `toggleFavorite` method that locates the current item by `data-id`, returns when `favoritePending` is true, and otherwise calls:

```js
this.triggerEvent('favoriteVoice', { id: voice.id })
```

Append a fixed-size star button after the existing selection control. Render it with:

```xml
<van-icon
  name="star"
  size="24px"
  color="{{item.isFavorite ? '#E20E0E' : '#D8D8D8'}}"
/>
```

Bind the page component event with `bind:favoriteVoice="toggleFavorite"`. Expand `.voiceOp` to a stable width and add a fixed square hit area without changing the current play/select behavior.

- [ ] **Step 4: Run component tests and verify GREEN**

Run:

```powershell
node tests/standalone-pages.test.js "favorite star"
```

Expected: all filtered star tests PASS.

### Task 3: Regression And Static Verification

**Files:**
- Verify: `pages/voiceSelect/voiceSelect.js`
- Verify: `components/voiceList/voiceList.js`
- Verify: `tests/standalone-pages.test.js`

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm test
```

Expected: all tests PASS with no failures.

- [ ] **Step 2: Run syntax checks**

Run:

```powershell
node --check pages/voiceSelect/voiceSelect.js
node --check components/voiceList/voiceList.js
node --check tests/standalone-pages.test.js
```

Expected: every command exits with code `0` and prints no syntax errors.

- [ ] **Step 3: Review the scoped diff**

Run:

```powershell
git diff --check
git diff -- pages/voiceSelect components/voiceList tests/standalone-pages.test.js
```

Expected: no whitespace errors; existing user changes to the voice page navigation configuration and navigation markup remain intact.

