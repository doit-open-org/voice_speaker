# Home Banner Carousel Design

## Goal

Replace the static home banner with a three-image carousel using `/img/yinxiang.png`, `/img/yinxiang1.png`, and `/img/yinxiang2.png`.

## Design

Use the WeChat Mini Program native `swiper` component. Store the three image paths in `pages/index/index.js` and render them with `wx:for` so the banner content remains easy to update.

The carousel will:

- rotate automatically every 3000 milliseconds;
- animate each transition over 500 milliseconds;
- loop continuously;
- support native swipe gestures;
- omit indicator dots as requested.

Keep the current `700rpx` by `350rpx` banner dimensions and `aspectFit` image mode. The carousel must not resize or shift the content below it.

## Testing

Add a focused markup/data test that verifies the three paths, native `swiper`, automatic circular playback settings, absent indicator dots, and stable banner dimensions. Run the existing page test suite and JavaScript syntax checks after implementation.

