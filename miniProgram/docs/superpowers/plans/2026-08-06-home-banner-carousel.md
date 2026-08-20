# Home Banner Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static home banner with a stable, swipeable, automatically looping three-image carousel without indicator dots.

**Architecture:** Keep banner paths in the home page data and render them with the native WeChat `swiper` component. WXML owns native playback settings while WXSS preserves the existing `700rpx` by `350rpx` footprint.

**Tech Stack:** WeChat Mini Program JavaScript, WXML, WXSS, Node.js assertion tests.

---

### Task 1: Native Home Banner Carousel

**Files:**
- Modify: `tests/standalone-pages.test.js`
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.wxss`

- [ ] **Step 1: Write the failing banner test**

Add a test named `home banner uses a three-image native carousel` that loads `pages/index/index.js` and asserts:

```js
assert.deepEqual(Array.from(page.data.bannerImages), [
  '/img/yinxiang.png',
  '/img/yinxiang1.png',
  '/img/yinxiang2.png'
])
assert.equal(markup.includes('<swiper'), true)
assert.equal(markup.includes('wx:for="{{bannerImages}}"'), true)
assert.equal(markup.includes('autoplay="{{true}}"'), true)
assert.equal(markup.includes('circular="{{true}}"'), true)
assert.equal(markup.includes('interval="3000"'), true)
assert.equal(markup.includes('duration="500"'), true)
assert.equal(markup.includes('indicator-dots'), false)
assert.equal(styles.includes('width: 700rpx'), true)
assert.equal(styles.includes('height: 350rpx'), true)
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cmd /c npm test -- "home banner"
```

Expected: FAIL because `bannerImages` and `<swiper>` do not exist.

- [ ] **Step 3: Add the banner data**

Add this array to `pages/index/index.js` page data:

```js
bannerImages: [
  '/img/yinxiang.png',
  '/img/yinxiang1.png',
  '/img/yinxiang2.png'
],
```

- [ ] **Step 4: Replace the static image with native swiper markup**

Use this structure in `pages/index/index.wxml`:

```xml
<view class="bannerView">
  <swiper class="bannerSwiper" autoplay="{{true}}" circular="{{true}}" interval="3000" duration="500">
    <swiper-item wx:for="{{bannerImages}}" wx:key="*this">
      <image class="bannerImg" src="{{item}}" mode="aspectFit"></image>
    </swiper-item>
  </swiper>
</view>
```

Do not add `indicator-dots`.

- [ ] **Step 5: Preserve the banner footprint**

Set `.bannerView` and `.bannerSwiper` to a stable `700rpx` by `350rpx` box, center the wrapper, and make `.bannerImg` fill that box:

```css
.bannerView {
  width: 700rpx;
  height: 350rpx;
  margin: 0 auto;
}
.bannerSwiper,
.bannerImg {
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 6: Run focused and regression verification**

Run:

```powershell
cmd /c npm test -- "home banner"
node --check pages/index/index.js
node --check tests/standalone-pages.test.js
git diff --check
cmd /c npm test
```

Expected: the focused banner test and syntax checks pass. The complete suite may retain the previously recorded unrelated navigation-bar assertion failure, but must add no new failure.

